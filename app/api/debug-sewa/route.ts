// GET /api/debug-sewa — sementara, untuk diagnosa tombol check-in tak muncul.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sewa = await prisma.sewa.findMany({
    where: { statusSewa: 'PENDING' },
    include: { kamar: { select: { nomor: true, properti: { select: { nama: true, jamCheckout: true, toleransiCheckout: true } } } }, penyewa: { select: { nama: true } } },
  })
  return NextResponse.json({
    serverTime: new Date().toISOString(),
    totalPending: sewa.length,
    items: sewa.map(s => ({
      properti: s.kamar.properti.nama,
      kamar: s.kamar.nomor,
      tanggalMasuk: s.tanggalMasuk,
      penyewa: s.penyewa?.nama ?? null,
      lewat: new Date(s.tanggalMasuk) <= new Date(),
    })),
  })
}