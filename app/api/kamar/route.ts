// app/api/kamar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createKamarSchema = z.object({
  nomor: z.string().min(1),
  lantai: z.number().default(1),
  tipe: z.enum(['STANDAR', 'DELUXE', 'VIP', 'SUITE', 'STUDIO']),
  luas: z.number().optional(),
  fasilitas: z.array(z.string()).default([]),
  // Ketiga harga opsional — kamar boleh didaftarkan dulu tanpa harga
  // (mis. kos baru yang tarifnya belum ditetapkan).
  hargaBulanan: z.number().positive().optional(),
  hargaHarian: z.number().positive().optional(),
  hargaTahunan: z.number().positive().optional(),
  depositBulanan: z.number().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const properti = await prisma.properti.findFirst({ where: { ownerId: userId } })
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const kamar = await prisma.kamar.findMany({
    where: {
      propertiId: properti.id,
      ...(status ? { status: status as any } : {}),
    },
    include: {
      harga: { where: { aktif: true } },
      sewa: {
        where: { statusSewa: 'AKTIF' },
        include: { penyewa: { select: { nama: true, noHp: true } } },
        take: 1,
      },
    },
    orderBy: { nomor: 'asc' },
  })

  return NextResponse.json(kamar)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json()
  const parsed = createKamarSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const properti = await prisma.properti.findFirst({ where: { ownerId: userId } })
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { hargaBulanan, hargaHarian, hargaTahunan, depositBulanan, ...kamarData } = parsed.data

  // Nomor kamar unik per properti (@@unique([propertiId, nomor])). Cek dulu supaya
  // klien dapat pesan 409 yang terbaca, bukan 500 mentah dari Prisma.
  const duplikat = await prisma.kamar.findFirst({
    where: { propertiId: properti.id, nomor: kamarData.nomor },
    select: { nomor: true },
  })
  if (duplikat) {
    return NextResponse.json(
      { error: { message: `Kamar ${kamarData.nomor} sudah terdaftar di properti ini.` } },
      { status: 409 },
    )
  }

  // Ketiga periode opsional. Hanya periode yang harganya diisi yang dibuat —
  // kamar tanpa harga sama sekali tetap valid (HargaKamar[] kosong), dan
  // halaman kamar/booking sudah menangani kasus itu ('-' / "Pilih kamar &
  // periode dulu"). Deposit default 2x hanya untuk BULANAN.
  const hargaRows = [
    ...(hargaBulanan
      ? [{ periodeSewa: 'BULANAN' as const, harga: hargaBulanan, deposit: depositBulanan ?? hargaBulanan * 2 }]
      : []),
    ...(hargaHarian ? [{ periodeSewa: 'HARIAN' as const, harga: hargaHarian, deposit: hargaHarian }] : []),
    ...(hargaTahunan ? [{ periodeSewa: 'TAHUNAN' as const, harga: hargaTahunan, deposit: hargaTahunan }] : []),
  ]

  const kamar = await prisma.kamar.create({
    data: {
      ...kamarData,
      propertiId: properti.id,
      ...(hargaRows.length ? { harga: { create: hargaRows } } : {}),
    },
  })

  return NextResponse.json(kamar, { status: 201 })
}
