// app/api/karaoke/sesi/route.ts
//
// Buka sesi karaoke. Inti jalur uang ketiga.
//
// TIGA hal yang dikunci di sini, dan ketiganya di dalam SATU transaksi:
//   1. Ruang tak sedang dipakai sesi lain (penjaga bentrok §4.4).
//   2. Tarif dibaca dari DB lalu DISALIN ke sesi + rincian per jam.
//   3. Nomor sesi baru dibuat dari nomor TERTINGGI numerik.
//
// Penjaga bentrok sengaja di dalam transaksi: dua kasir yang mengklik "Mulai"
// pada detik yang sama untuk ruang yang sama tak boleh dua-duanya lolos. Tak ada
// @@unique yang bisa menyatakan aturan ini (yang dilarang adalah rentang waktu
// yang beririsan, bukan baris yang sama), jadi pengecekan aplikasi + transaksi
// adalah satu-satunya penjaga. Konsekuensinya: transaksi ini lebih rapat dari
// biasanya, jangan tambahkan pekerjaan berat di dalamnya.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { batasLepasBooking, bentrok, bukaSesiSchema, hitungSewa, nomorBerikut, periksaBlok, waktuMulaiDari } from '@/lib/karaoke'

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

export async function GET(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const sp = new URL(req.url).searchParams
  const ruangId = sp.get('ruangId') ?? undefined
  const status = sp.get('status')

  const sesi = await prisma.sesiKaraoke.findMany({
    where: {
      propertiId: k.properti.id,
      ...(ruangId ? { ruangId } : {}),
      ...(status === 'jalan' ? { status: { in: ['BOOKING', 'BERJALAN'] } } : {}),
    },
    orderBy: { mulaiPada: 'desc' },
    take: 100,
    include: { ruang: { select: { id: true, nama: true } } },
  })
  return NextResponse.json({ sesi })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const parsed = bukaSesiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  const ruang = await prisma.ruangKaraoke.findFirst({
    where: { id: d.ruangId, propertiId: k.properti.id },
    include: { tarif: { orderBy: { jamMulai: 'asc' } } },
  })
  if (!ruang) return NextResponse.json({ error: { message: 'Ruang tidak ditemukan.' } }, { status: 404 })
  if (!ruang.aktif) return NextResponse.json({ error: { message: `Ruang "${ruang.nama}" sedang nonaktif.` } }, { status: 409 })

  // Tarif wajib utuh — kalau berlubang, hitungSewa akan melempar di tengah
  // transaksi. Dicek di depan supaya pesannya jelas, bukan error 500.
  const periksa = periksaBlok(ruang.tarif.map((t) => ({ jamMulai: t.jamMulai, jamSelesai: t.jamSelesai, hargaPerJam: Number(t.hargaPerJam) })))
  if (!periksa.ok) {
    return NextResponse.json({ error: { message: `Tarif ruang "${ruang.nama}" belum lengkap: ${periksa.pesan}` } }, { status: 409 })
  }

  const sekarang = new Date()

  // Kasir boleh memesan jam mulai (booking) atau membuka sekarang. `pada` yang
  // sudah lewat ditolak — lihat `waktuMulaiDari`.
  const waktu = waktuMulaiDari(d.pada, sekarang)
  if (!waktu.ok) return NextResponse.json({ error: { message: waktu.pesan } }, { status: 400 })

  const mulai = waktu.mulai
  const jumlahJam = Math.max(1, Math.ceil(d.durasiMenit / 60))
  const rencanaSelesai = new Date(mulai.getTime() + jumlahJam * 60 * 60 * 1000)

  // Sewa dihitung dari JAM MULAI yang dipilih, bukan jam sekarang: booking jam
  // 19:00 harus dihargai tarif malam walau kasir mencatatnya pagi.
  let sewa
  try {
    sewa = hitungSewa(
      ruang.tarif.map((t) => ({ jamMulai: t.jamMulai, jamSelesai: t.jamSelesai, hargaPerJam: Number(t.hargaPerJam) })),
      mulai,
      d.durasiMenit,
    )
  } catch (e) {
    return NextResponse.json(
      { error: { message: `Tarif ruang "${ruang.nama}" tak menutup jam itu: ${(e as Error).message}` } },
      { status: 409 },
    )
  }

  const batasLepas = batasLepasBooking(sekarang) // dipakai untuk menyapu booking basi

  try {
    const hasil = await prisma.$transaction(async (tx) => {
      // Baca ulang sesi ruang INI di dalam transaksi — bukan di luar — supaya
      // tak ada celah antara "periksa" dan "tulis".
      const ada = await tx.sesiKaraoke.findMany({
        where: { ruangId: d.ruangId, status: { in: ['BOOKING', 'BERJALAN'] } },
        select: { id: true, status: true, mulaiPada: true, rencanaSelesai: true, selesaiAktual: true },
      })

      const cek = bentrok(ada, mulai, rencanaSelesai, sekarang)
      if (cek.bentrok) {
        const p = cek.penghalang!
        throw new BentrokError(p.status, p.mulaiPada as Date, p.rencanaSelesai as Date)
      }

      // Booking yang pelanggannya tak datang dibiarkan menggantung BOOKING oleh
      // `memegangRuang` (ruangnya sudah bebas), tapi barisnya harus ditutup di
      // sini — kalau tidak ia menggantung selamanya dan mengotori laporan.
      // Disapu hanya untuk ruang ini: menyapu seluruh properti tiap kali ada
      // yang membuka sesi membuat transaksi yang seharusnya rapat jadi berat.
      await tx.sesiKaraoke.updateMany({
        where: {
          ruangId: d.ruangId,
          status: 'BOOKING',
          mulaiPada: { lt: batasLepas },
        },
        data: { status: 'BATAL', catatan: 'BATAL OTOMATIS: pelanggan tak datang (lewat 15 menit)' },
      })

      const nomorAda = await tx.sesiKaraoke.findMany({
        where: { propertiId: k.properti.id },
        select: { nomor: true },
      })

      return tx.sesiKaraoke.create({
        data: {
          propertiId: k.properti.id,
          ruangId: d.ruangId,
          nomor: nomorBerikut(nomorAda.map((s) => s.nomor)),
          namaPelanggan: d.namaPelanggan?.trim() || null,
          telepon: d.telepon?.trim() || null,
          mulaiPada: mulai,
          rencanaSelesai,
          jumlahJam: sewa.jumlahJam,
          totalSewa: sewa.total,
          jaminan: d.jaminan ?? 0,
          // modeBayar 'sekarang' → sewa dibayar di muka = total sewa awal.
          // Dihitung server dari tarif yang tersimpan, bukan dari klien.
          bayarDiMuka: d.modeBayar === 'sekarang' ? sewa.total : 0,
          status: waktu.booking ? 'BOOKING' : 'BERJALAN',
          catatan: d.catatan?.trim() || null,
          item: {
            create: sewa.item.map((it) => ({
              jamKe: it.jamKe,
              mulai: it.mulai,
              selesai: it.selesai,
              hargaPerJam: it.hargaPerJam,
              subtotal: it.subtotal,
            })),
          },
        },
        include: { ruang: { select: { id: true, nama: true } }, item: { orderBy: { jamKe: 'asc' } } },
      })
    })

    return NextResponse.json({ sesi: hasil }, { status: 201 })
  } catch (e) {
    if (e instanceof BentrokError) {
      const jam = (dt: Date) =>
        `${String(new Date(dt).getHours()).padStart(2, '0')}:${String(new Date(dt).getMinutes()).padStart(2, '0')}`
      const pesan =
        e.status === 'BERJALAN'
          ? `Ruang sedang dipakai sesi yang mulai ${jam(e.mulaiPada)} dan masih berjalan. Tutup dulu sesi itu.`
          : `Ruang sudah dibooking ${jam(e.mulaiPada)}-${jam(e.rencanaSelesai)}. Pilih jam lain atau batalkan booking itu.`
      return NextResponse.json({ error: { message: pesan, kode: 'RUANG_TERPAKAI' } }, { status: 409 })
    }
    throw e
  }
}

/** Dilempar di dalam transaksi supaya transaksi batal; ditangkap di luar. */
class BentrokError extends Error {
  constructor(
    public status: string,
    public mulaiPada: Date,
    public rencanaSelesai: Date,
  ) {
    super('RUANG_TERPAKAI')
  }
}
