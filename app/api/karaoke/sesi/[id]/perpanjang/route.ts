// POST /api/karaoke/sesi/[id]/perpanjang
//
// Tambah durasi sesi BERJALAN — dipicu alarm "lewat durasi" di dashboard
// (pelanggan masih bernyanyi) atau tombol manual. Harga jam tambahan
// dihitung dari tarif blok per jam, item jam baru ditambahkan ke sesi,
// rencanaSelesai digeser, dan bentrok booking ruangan diperiksa.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { bentrok, hitungSewa, periksaBlok, perpanjangSchema } from '@/lib/karaoke'

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

const MS_JAM = 3_600_000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (k.error) return k.error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = perpanjangSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { ruang: { include: { tarif: { orderBy: { jamMulai: 'asc' } } } }, item: { orderBy: { jamKe: 'asc' } } },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })
  if (sesi.status !== 'BERJALAN') {
    return NextResponse.json({ error: { message: 'Hanya sesi berjalan yang bisa diperpanjang.' } }, { status: 409 })
  }

  const periksa = periksaBlok(sesi.ruang.tarif.map((t) => ({ jamMulai: t.jamMulai, jamSelesai: t.jamSelesai, hargaPerJam: Number(t.hargaPerJam) })))
  if (!periksa.ok) {
    return NextResponse.json({ error: { message: `Tarif ruang "${sesi.ruang.nama}" belum lengkap: ${periksa.pesan}` } }, { status: 409 })
  }

  // Jam tambahan dihitung dari SEKARANG, bukan dari rencanaSelesai — kalau
  // sesi sudah lewat 20 menit, menagih 1 jam dari rencana lama berarti
  // menagih waktu lampau dua kali.
  const mulaiBaru = new Date(Math.max(Date.now(), new Date(sesi.rencanaSelesai).getTime()))
  let tambahan
  try {
    tambahan = hitungSewa(
      sesi.ruang.tarif.map((t) => ({ jamMulai: t.jamMulai, jamSelesai: t.jamSelesai, hargaPerJam: Number(t.hargaPerJam) })),
      mulaiBaru,
      d.tambahanMenit,
    )
  } catch (e) {
    return NextResponse.json(
      { error: { message: `Tarif ruang "${sesi.ruang.nama}" tak menutup jam itu: ${(e as Error).message}` } },
      { status: 409 },
    )
  }

  const rencanaBaru = new Date(mulaiBaru.getTime() + tambahan.jumlahJam * MS_JAM)
  const sekarang = new Date()

  try {
    const hasil = await prisma.$transaction(async (tx) => {
      // Bentrok dengan booking/berjalan lain di ruang yang sama? Sesi ini
      // sendiri dikecualikan — ia pemilik rentang barunya.
      const lain = await tx.sesiKaraoke.findMany({
        where: { ruangId: sesi.ruangId, status: { in: ['BOOKING', 'BERJALAN'] }, id: { not: sesi.id } },
        select: { id: true, status: true, mulaiPada: true, rencanaSelesai: true },
      })
      const cek = bentrok(lain, mulaiBaru, rencanaBaru, sekarang)
      if (cek.bentrok) {
        return { error: cek.penghalang ? `Ruang sudah dibooking sampai ${new Date(cek.penghalang.rencanaSelesai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.` : 'Jadwal bentrok.' }
      }

      // Item jam baru: lanjutkan penomoran dari jam terakhir yang ada, dan
      // geser harga dari rencana lama — totalSewa ditambah, bukan ditimpa.
      const jamKeAwal = sesi.item.length
      await tx.itemSesiKaraoke.createMany({
        data: tambahan.item.map((it, i) => ({
          sesiId: sesi.id,
          jamKe: jamKeAwal + i + 1,
          mulai: it.mulai,
          selesai: it.selesai,
          hargaPerJam: it.hargaPerJam,
          subtotal: it.subtotal,
        })),
      })

      return tx.sesiKaraoke.update({
        where: { id },
        data: {
          rencanaSelesai: rencanaBaru,
          jumlahJam: sesi.jumlahJam + tambahan.jumlahJam,
          totalSewa: Number(sesi.totalSewa) + tambahan.total,
        },
        include: { ruang: { select: { id: true, nama: true } }, item: { orderBy: { jamKe: 'asc' } }, minuman: true },
      })
    })

    if ('error' in hasil) return NextResponse.json({ error: { message: (hasil as { error: string }).error } }, { status: 409 })

    return NextResponse.json({
      sesi: hasil,
      ringkas: { tambahan: tambahan.total, totalSewa: Number(hasil.totalSewa) },
    })
  } catch (e) {
    return NextResponse.json({ error: { message: 'Gagal memperpanjang sesi.' } }, { status: 500 })
  }
}
