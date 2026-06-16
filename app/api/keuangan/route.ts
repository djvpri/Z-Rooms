// app/api/keuangan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, subMonths } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const bulan = parseInt(searchParams.get('bulan') ?? '0') // 0 = bulan ini, 1 = bulan lalu, dst

  const properti = await prisma.properti.findFirst({ where: { ownerId: session.user.id } })
  if (!properti) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  const targetBulan = subMonths(new Date(), bulan)
  const range = { gte: startOfMonth(targetBulan), lte: endOfMonth(targetBulan) }

  const [tagihan, pengeluaran, pendapatanPerBulan] = await Promise.all([
    // Semua tagihan bulan ini
    prisma.tagihan.findMany({
      where: {
        jatuhTempo: range,
        sewa: { kamar: { propertiId: properti.id } },
      },
      include: {
        sewa: {
          include: {
            kamar: { select: { nomor: true, tipe: true } },
            penyewa: { select: { nama: true } },
          },
        },
        pembayaran: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    }),

    // Pengeluaran bulan ini
    prisma.pengeluaran.findMany({
      where: { propertiId: properti.id, tanggal: range },
      orderBy: { tanggal: 'desc' },
    }),

    // Trend 6 bulan terakhir
    prisma.$queryRaw<{ bulan: string; pendapatan: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', t."jatuhTempo"), 'YYYY-MM') as bulan,
        SUM(t."nominal")::float as pendapatan
      FROM "Tagihan" t
      JOIN "Sewa" s ON t."sewaId" = s.id
      JOIN "Kamar" k ON s."kamarId" = k.id
      WHERE k."propertiId" = ${properti.id}
        AND t.status = 'LUNAS'
        AND t."jatuhTempo" >= ${subMonths(new Date(), 6)}
      GROUP BY DATE_TRUNC('month', t."jatuhTempo")
      ORDER BY bulan ASC
    `,
  ])

  const totalPendapatan = tagihan
    .filter(t => t.status === 'LUNAS')
    .reduce((sum, t) => sum + Number(t.nominal), 0)

  const totalPengeluaran = pengeluaran
    .reduce((sum, p) => sum + Number(p.nominal), 0)

  const belumTerkumpul = tagihan
    .filter(t => ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'].includes(t.status))
    .reduce((sum, t) => sum + Number(t.nominal), 0)

  return NextResponse.json({
    tagihan,
    pengeluaran,
    pendapatanPerBulan,
    ringkasan: {
      totalPendapatan,
      totalPengeluaran,
      labaBersih: totalPendapatan - totalPengeluaran,
      belumTerkumpul,
    },
  })
}
