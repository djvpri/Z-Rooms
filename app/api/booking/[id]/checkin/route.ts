// POST /api/booking/[id]/checkin
//
// Tamu yang memesan lalu datang — naikkan PENDING → AKTIF. Dua hal yang
// di-reset: `tanggalMasuk` ke sekarang (tanggal kontrak lama sudah lewat,
// memakainya membuat laporan "kamar terisi sejak kapan" berbohong) dan status
// kamar tetap TERISI.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { id } = await params
  const sewa = await prisma.sewa.findFirst({
    where: { id, kamar: { propertiId: properti.id } },
    include: { kamar: { select: { id: true, nomor: true, status: true } } },
  })
  if (!sewa) return NextResponse.json({ error: 'Booking tidak ditemukan.' }, { status: 404 })
  if (sewa.statusSewa !== 'PENDING') {
    return NextResponse.json({ error: 'Hanya booking menunggu yang bisa check-in.' }, { status: 409 })
  }

  const sekarang = new Date()
  const hasil = await prisma.$transaction(async (tx) => {
    // Kamar boleh sudah TERISI (booking dibuat saat penghuni lama masih di
    // dalam) — tapi kalau ada sewa AKTIF LAIN di kamar ini, check-in dua kali
    // untuk satu kamar adalah kesalahan.
    const lain = await tx.sewa.findFirst({
      where: { kamarId: sewa.kamarId, statusSewa: 'AKTIF', id: { not: sewa.id } },
      select: { id: true },
    })
    if (lain) throw new Error('Kamar masih dihuni sewa aktif lain — selesaikan dulu.')

    return tx.sewa.update({
      where: { id },
      data: { statusSewa: 'AKTIF', tanggalMasuk: sekarang },
      include: { kamar: { select: { nomor: true } }, penyewa: { select: { nama: true } } },
    })
  })

  return NextResponse.json({
    sewa: hasil,
    pesan: `Kamar ${hasil.kamar.nomor} check-in: ${hasil.penyewa?.nama ?? 'tanpa nama'}.`,
  })
}
