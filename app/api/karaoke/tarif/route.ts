// app/api/karaoke/tarif/route.ts
//
// Blok tarif per ruang. SELURUH blok dikirim sekaligus dan menggantikan yang
// lama — bukan satu per satu.
//
// Alasan: aturan "blok wajib menutup 24 jam" hanya bisa ditegakkan pada
// keadaan UTUH. Kalau satu blok disimpan sendiri-sendiri, setiap penyimpanan
// melewati keadaan antara yang berlubang, dan aturan itu mustahil diperiksa.
// Ganti-semua juga membuat admin bisa menggeser batas blok tanpa urutan klik
// yang aneh (mis. geser 17:00 jadi 18:00 → kalau tak atomik, sesi antara
// tak punya tarif).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { periksaBlok, tarifRuangSchema } from '@/lib/karaoke'

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

  const ruangId = new URL(req.url).searchParams.get('ruangId') ?? ''
  if (!ruangId) return NextResponse.json({ error: { message: 'ruangId wajib diisi.' } }, { status: 400 })

  const ruang = await prisma.ruangKaraoke.findFirst({ where: { id: ruangId, propertiId: k.properti.id } })
  if (!ruang) return NextResponse.json({ error: { message: 'Ruang tidak ditemukan.' } }, { status: 404 })

  const tarif = await prisma.tarifKaraoke.findMany({ where: { ruangId }, orderBy: { jamMulai: 'asc' } })
  return NextResponse.json({ tarif })
}

export async function PUT(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const parsed = tarifRuangSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const { ruangId, blok } = parsed.data

  const ruang = await prisma.ruangKaraoke.findFirst({ where: { id: ruangId, propertiId: k.properti.id } })
  if (!ruang) return NextResponse.json({ error: { message: 'Ruang tidak ditemukan.' } }, { status: 404 })

  // Penjaga utama: 24 jam tertutup, tanpa lubang, tanpa tumpang tindih.
  // Ditolak di sini — bukan cuma diperingatkan di UI — karena sesi yang jatuh di
  // jam berlubang tak bisa dihargai, dan kasir baru tahu saat pelanggan di depan.
  const periksa = periksaBlok(blok)
  if (!periksa.ok) {
    return NextResponse.json({ error: { message: periksa.pesan ?? 'Blok tarif tidak valid.' } }, { status: 400 })
  }

  const urut = [...blok].sort((a, b) => a.jamMulai - b.jamMulai)

  // Ganti-semua dalam satu transaksi: hapus lalu buat. Tanpa transaksi, gagal di
  // tengah meninggalkan ruang TANPA tarif sama sekali.
  const tarif = await prisma.$transaction(async (tx) => {
    await tx.tarifKaraoke.deleteMany({ where: { ruangId } })
    await tx.tarifKaraoke.createMany({
      data: urut.map((b) => ({
        ruangId,
        jamMulai: b.jamMulai,
        jamSelesai: b.jamSelesai,
        hargaPerJam: b.hargaPerJam,
      })),
    })
    return tx.tarifKaraoke.findMany({ where: { ruangId }, orderBy: { jamMulai: 'asc' } })
  })

  return NextResponse.json({ tarif })
}
