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
  hargaBulanan: z.number(),
  hargaHarian: z.number().optional(),
  hargaTahunan: z.number().optional(),
  depositBulanan: z.number().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const properti = await prisma.properti.findFirst({ where: { ownerId: session.user.id } })
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

  const body = await req.json()
  const parsed = createKamarSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const properti = await prisma.properti.findFirst({ where: { ownerId: session.user.id } })
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { hargaBulanan, hargaHarian, hargaTahunan, depositBulanan, ...kamarData } = parsed.data

  const kamar = await prisma.kamar.create({
    data: {
      ...kamarData,
      propertiId: properti.id,
      harga: {
        create: [
          { periodeSewa: 'BULANAN', harga: hargaBulanan, deposit: depositBulanan ?? hargaBulanan * 2 },
          ...(hargaHarian ? [{ periodeSewa: 'HARIAN' as const, harga: hargaHarian, deposit: hargaHarian }] : []),
          ...(hargaTahunan ? [{ periodeSewa: 'TAHUNAN' as const, harga: hargaTahunan, deposit: hargaTahunan }] : []),
        ],
      },
    },
  })

  return NextResponse.json(kamar, { status: 201 })
}
