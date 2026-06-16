// app/api/dashboard/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth } from 'date-fns'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const properti = await prisma.properti.findFirst({
    where: { ownerId: userId },
    select: { id: true, nama: true, kota: true },
  })
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const now = new Date()
  const bulanIni = { gte: startOfMonth(now), lte: endOfMonth(now) }

  const [totalKamar, kamarByStatus, pendapatanBulanIni, tagihanBelumBayar,
    pengeluaranBulanIni, aktivitasTerbaru, notifBelumDibaca] = await Promise.all([
    // Total kamar
    prisma.kamar.count({ where: { propertiId: properti.id } }),

    // Kamar per status
    prisma.kamar.groupBy({
      by: ['status'],
      where: { propertiId: properti.id },
      _count: { status: true },
    }),

    // Pendapatan bulan ini (tagihan lunas)
    prisma.tagihan.aggregate({
      where: {
        status: 'LUNAS',
        createdAt: bulanIni,
        sewa: { kamar: { propertiId: properti.id } },
      },
      _sum: { nominal: true },
    }),

    // Tagihan belum bayar / terlambat
    prisma.tagihan.count({
      where: {
        status: { in: ['BELUM_BAYAR', 'TERLAMBAT'] },
        sewa: { kamar: { propertiId: properti.id } },
      },
    }),

    // Pengeluaran bulan ini
    prisma.pengeluaran.aggregate({
      where: { propertiId: properti.id, tanggal: bulanIni },
      _sum: { nominal: true },
    }),

    // Aktivitas terbaru (sewa terbaru)
    prisma.sewa.findMany({
      where: { kamar: { propertiId: properti.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        kamar: { select: { nomor: true } },
        penyewa: { select: { nama: true } },
        tagihan: { select: { status: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    }),

    // Notifikasi belum dibaca
    prisma.notifikasi.count({
      where: { propertiId: properti.id, dibaca: false },
    }),
  ])

  const statusMap = kamarByStatus.reduce((acc, s) => {
    acc[s.status] = s._count.status
    return acc
  }, {} as Record<string, number>)

  return NextResponse.json({
    properti,
    totalKamar,
    kamarByStatus: statusMap,
    pendapatanBulanIni: pendapatanBulanIni._sum.nominal ?? 0,
    pengeluaranBulanIni: pengeluaranBulanIni._sum.nominal ?? 0,
    tagihanBelumBayar,
    aktivitasTerbaru,
    notifBelumDibaca,
  })
}
