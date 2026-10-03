// app/api/shift/route.ts
//
// GET  — shift aktif user ini + rekap uang berjalan + N riwayat terakhir.
// POST — buka shift { modalAwal }. Satu shift AKTIF per user per properti;
//        shift kasir lain yang masih AKTIF tidak dilarang (keputusan desain:
//        kasir bergantian di satu kasir fisik, bukan kasir paralel).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { rekapShift } from '@/lib/shift'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  const aktif = await prisma.shift.findFirst({
    where: { propertiId: properti.id, userId, status: 'AKTIF' },
    orderBy: { mulaiPada: 'desc' },
  })

  // Rekap berjalan hanya berarti kalau ada shift aktif.
  const rekap = aktif
    ? await rekapShift(properti.id, { gte: aktif.mulaiPada, lte: new Date() })
    : null

  const riwayat = await prisma.shift.findMany({
    where: { propertiId: properti.id, status: 'TUTUP' },
    orderBy: { mulaiPada: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  })

  return NextResponse.json({ aktif, rekap, riwayat })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const modalAwal = Math.max(0, Math.round(Number(body?.modalAwal) || 0))

  const sudahAda = await prisma.shift.findFirst({
    where: { propertiId: properti.id, userId, status: 'AKTIF' },
    select: { id: true },
  })
  if (sudahAda) {
    return NextResponse.json({ error: 'Masih ada shift aktif — tutup dulu sebelum buka baru.' }, { status: 409 })
  }

  const shift = await prisma.shift.create({
    data: { propertiId: properti.id, userId, modalAwal },
  })
  return NextResponse.json({ shift }, { status: 201 })
}
