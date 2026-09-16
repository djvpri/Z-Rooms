// app/api/kamar/route.ts
//
// Daftar & tambah kamar. Harga sewa TIDAK lagi disimpan per kamar — melekat
// pada tipe (lihat model HargaTipe), jadi endpoint ini cuma menautkan kamar ke
// tipe dan pemanggil membaca tarifnya lewat `hargaRingkas(kamar)`.
//
// `tipeId` wajib: kamar tanpa tipe tak punya tarif, jadi tak bisa disewakan.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { z } from 'zod'

const createKamarSchema = z.object({
  nomor: z.string().min(1),
  lantai: z.number().default(1),
  // Tipe kini master data (model TipeKamar) dan WAJIB. Dulu di sini ada enum
  // dengan 'STUDIO' yang tak dikenal Prisma, sehingga menambah kamar Studio
  // selalu gagal 500.
  tipeId: z.string().min(1, 'Tipe kamar wajib dipilih.'),
  luas: z.number().optional(),
  fasilitas: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const kamar = await prisma.kamar.findMany({
    where: {
      propertiId: properti.id,
      ...(status ? { status: status as any } : {}),
    },
    include: {
      // Harga tidak lagi milik kamar — diambil lewat tipe. Pemanggil (booking,
      // /kamar) memakai `hargaRingkas` untuk membacanya.
      tipe: { include: { harga: { where: { aktif: true } } } },
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Data kamar tidak valid.' } },
      { status: 400 },
    )
  }

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { tipeId, ...kamarData } = parsed.data

  // TipeId milik properti aktif, bukan properti lain — id karangan atau tipe
  // properti lain ditolak, bukan diam-diam tersimpan.
  const tipe = await prisma.tipeKamar.findFirst({
    where: { id: tipeId, propertiId: properti.id },
    select: { id: true },
  })
  if (!tipe) {
    return NextResponse.json(
      { error: { message: 'Tipe kamar tidak ditemukan di properti ini.' } },
      { status: 400 },
    )
  }

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

  // Harga TIDAK diisi di sini — tarifnya ikut tipe kamar yang dipilih.
  const kamar = await prisma.kamar.create({
    data: {
      ...kamarData,
      propertiId: properti.id,
      tipeId,
    },
    include: { tipe: { select: { id: true, nama: true } } },
  })

  return NextResponse.json(kamar, { status: 201 })
}
