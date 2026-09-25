// GET /api/debug-sewa — sementara, untuk diagnosa notifikasi dashboard KD.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [pending, kd, notif] = await Promise.all([
    prisma.sewa.findMany({
      where: { statusSewa: 'PENDING' },
      include: { kamar: { select: { nomor: true, properti: { select: { nama: true } } } }, penyewa: { select: { nama: true } } },
    }),
    prisma.properti.findMany({
      where: { nama: { contains: 'KD' } },
      select: {
        id: true, nama: true,
        _count: { select: { sewa: true, kamar: true, notifikasi: true } },
      },
    }),
    prisma.notifikasi.findMany({
      where: { dibaca: false },
      select: { id: true, judul: true, isi: true, tipe: true, propertiId: true, createdAt: true },
      take: 30,
    }),
  ])
  return NextResponse.json({
    serverTime: new Date().toISOString(),
    totalPending: pending.length,
    pending: pending.map(s => ({ properti: s.kamar.properti.nama, kamar: s.kamar.nomor, masuk: s.tanggalMasuk, penyewa: s.penyewa?.nama ?? null })),
    propertiKD: kd,
    notifBelumDibaca: notif.length,
    notifikasi: notif,
  })
}