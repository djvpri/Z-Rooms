// app/api/karaoke/sesi/[id]/route.ts
//
// Tutup sesi (selesai) dan bayar. Juga hapus sesi BATAL.
//
// ATURAN UANG: total TIDAK PERNAH diambil dari klien. Dihitung ulang di server
// dari `mulaiPada` + tarif yang tersimpan, jadi layar yang berdetak tak pernah
// jadi sumber kebenaran. Kalau durasi aktual beda dari rencana (pelanggan nambah
// lagu), rincian per jam DIHITUNG ULANG dan baris lama diganti — supaya struk
// cocok dengan yang ditagih.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { hitungSewa, tutupSesiSchema } from '@/lib/karaoke'

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (k.error) return k.error

  const { id } = await params
  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: {
      ruang: { select: { id: true, nama: true } },
      item: { orderBy: { jamKe: 'asc' } },
      minuman: true,
      properti: { select: { nama: true, alamat: true, kota: true, noHp: true, teksNota: true } },
    },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })
  return NextResponse.json({ sesi })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (k.error) return k.error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = tutupSesiSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { ruang: { include: { tarif: { orderBy: { jamMulai: 'asc' } } } } },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })
  if (sesi.status === 'BATAL') {
    return NextResponse.json({ error: { message: 'Sesi sudah dibatalkan.' } }, { status: 409 })
  }
  if (sesi.status === 'SELESAI') {
    return NextResponse.json({ error: { message: 'Sesi sudah selesai.' } }, { status: 409 })
  }

  const sekarang = new Date()

  // BOOKING → BERJALAN: waktu mulai di-reset ke sekarang. Tanpa ini, pelanggan
  // yang memesan jam 19:00 lalu datang 20:30 akan ditagih 1,5 jam waktu tunggu.
  // Hanya berlaku untuk BOOKING; sesi BERJALAN yang ditutup menagih dari
  // `mulaiPada` aslinya, bukan dari waktu klik.
  if (d.mulaiSekarang) {
    if (sesi.status !== 'BOOKING') {
      return NextResponse.json(
        { error: { message: 'Hanya sesi booking yang bisa dimulai sekarang.' } },
        { status: 409 },
      )
    }
    const diperbarui = await prisma.sesiKaraoke.update({
      where: { id },
      data: { status: 'BERJALAN', mulaiPada: sekarang, rencanaSelesai: new Date(sekarang.getTime() + Number(sesi.jumlahJam) * 3600000) },
      include: { ruang: { select: { id: true, nama: true } }, item: true, minuman: true },
    })
    return NextResponse.json({ sesi: diperbarui, ringkas: null })
  }

  // Durasi aktual: dari parameter, atau dihitung dari `mulaiPada` ke sekarang.
  // Selalu minimal 1 jam (aturan minimum sewa) — dihitung di `hitungSewa`.
  const durasiMenit =
    d.durasiMenit ?? Math.max(1, Math.round((sekarang.getTime() - new Date(sesi.mulaiPada).getTime()) / 60000))

  const tarif = sesi.ruang.tarif.map((t) => ({
    jamMulai: t.jamMulai,
    jamSelesai: t.jamSelesai,
    hargaPerJam: Number(t.hargaPerJam),
  }))

  let sewa
  try {
    sewa = hitungSewa(tarif, new Date(sesi.mulaiPada), durasiMenit)
  } catch (e) {
    return NextResponse.json(
      { error: { message: `Tarif ruang "${sesi.ruang.nama}" tak menutup jam sesi ini: ${(e as Error).message}` } },
      { status: 409 },
    )
  }

  const minuman = await prisma.itemMinumanKaraoke.findMany({ where: { sesiId: id } })
  const totalMinuman = minuman.reduce((a, m) => a + Number(m.subtotal), 0)

  const hasil = await prisma.$transaction(async (tx) => {
    // Rincian per jam diganti, bukan ditambah: durasi bisa berubah dan baris
    // lama akan bertentangan dengan yang ditagih kalau dibiarkan.
    await tx.itemSesiKaraoke.deleteMany({ where: { sesiId: id } })
    await tx.itemSesiKaraoke.createMany({
      data: sewa.item.map((it) => ({
        sesiId: id,
        jamKe: it.jamKe,
        mulai: it.mulai,
        selesai: it.selesai,
        hargaPerJam: it.hargaPerJam,
        subtotal: it.subtotal,
      })),
    })
    return tx.sesiKaraoke.update({
      where: { id },
      data: {
        status: 'SELESAI',
        selesaiAktual: sekarang,
        jumlahJam: sewa.jumlahJam,
        totalSewa: sewa.total,
        ...(d.catatan !== undefined ? { catatan: d.catatan?.trim() || null } : {}),
      },
      include: {
        ruang: { select: { id: true, nama: true } },
        item: { orderBy: { jamKe: 'asc' } },
        minuman: true,
      },
    })
  })

  return NextResponse.json({
    sesi: hasil,
    ringkas: {
      sewa: sewa.total,
      minuman: totalMinuman,
      jaminan: Number(hasil.jaminan),
      // Jaminan mengurangi yang dibayar sekarang. Total tetap jumlah sewa +
      // minuman — jaminan bukan diskon, cuma uang muka.
      total: sewa.total + totalMinuman,
      dibayar: Math.max(0, sewa.total + totalMinuman - Number(hasil.jaminan)),
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (k.error) return k.error

  const { id } = await params
  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { _count: { select: { minuman: true } } },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })

  // Hanya sesi BATAL yang boleh dihapus betulan. Sesi yang pernah jalan adalah
  // riwayat uang — dibatalkan (status BATAL), bukan dihapus.
  if (sesi.status !== 'BATAL') {
    return NextResponse.json(
      { error: { message: 'Hanya sesi berstatus BATAL yang bisa dihapus. Batalkan dulu sesi ini.' } },
      { status: 409 },
    )
  }

  await prisma.sesiKaraoke.delete({ where: { id } })
  return NextResponse.json({ ok: true, dihapus: true })
}
