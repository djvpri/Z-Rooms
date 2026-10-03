// app/api/kamar/[id]/arsip/route.ts
//
// Arsipkan / kembalikan kamar. Arsip = kamar pensiun: hilang dari daftar,
// dashboard, booking, pindah-kamar; riwayat & laporan tetap utuh.
// Kamar TERISI / PEMELIHARAAN / punya sewa PENDING ditolak — tamu aktif dan
// antrean booking tak boleh menghilang bersama kamarnya.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.arsip !== 'boolean') {
    return NextResponse.json({ error: { message: 'Nilai arsip tidak valid.' } }, { status: 400 })
  }
  const arsip = body.arsip as boolean

  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const kamar = await prisma.kamar.findFirst({
    where: { id, propertiId: properti.id },
    select: {
      id: true, nomor: true, status: true,
      _count: { select: { sewa: { where: { statusSewa: { in: ['AKTIF', 'PENDING'] } } } } },
    },
  })
  if (!kamar) {
    return NextResponse.json({ error: { message: 'Kamar tidak ditemukan.' } }, { status: 404 })
  }

  // Kembalikan dari arsip selalu boleh; arsipkan hanya kalau kosong total.
  if (arsip && (kamar.status !== 'TERSEDIA' || kamar._count.sewa > 0)) {
    return NextResponse.json(
      { error: { message: `Kamar ${kamar.nomor} sedang terisi/dipesan — selesaikan dulu sebelum diarsipkan.` } },
      { status: 409 },
    )
  }

  const hasil = await prisma.kamar.update({
    where: { id: kamar.id },
    data: { arsip },
    select: { id: true, nomor: true, arsip: true },
  })
  return NextResponse.json(hasil)
}
