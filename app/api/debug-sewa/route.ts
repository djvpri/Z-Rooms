// GET /api/debug-sewa — sementara, untuk diagnosa tombol check-in tak muncul.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const sewa = await prisma.sewa.findMany({
    where: { statusSewa: { in: ['AKTIF', 'PENDING'] }, kamar: { propertiId: properti.id } },
    include: { kamar: { select: { nomor: true, status: true } }, penyewa: { select: { nama: true } } },
  })

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    properti: properti.nama,
    count: sewa.length,
    items: sewa.map(s => ({
      id: s.id,
      statusSewa: s.statusSewa,
      tanggalMasuk: s.tanggalMasuk,
      tanggalKeluar: s.tanggalKeluar,
      kamarNomor: s.kamar.nomor,
      kamarStatus: s.kamar.status,
      penyewaNama: s.penyewa?.nama ?? null,
      lewat: new Date(s.tanggalMasuk) <= new Date(),
    })),
  })
}