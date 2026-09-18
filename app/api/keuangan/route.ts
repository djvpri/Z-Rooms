// app/api/keuangan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { piutangBarang } from '@/lib/piutang'
import { startOfMonth, endOfMonth, subMonths } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { searchParams } = new URL(req.url)
  const bulan = parseInt(searchParams.get('bulan') ?? '0') // 0 = bulan ini, 1 = bulan lalu, dst

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })

  const targetBulan = subMonths(new Date(), bulan)
  const range = { gte: startOfMonth(targetBulan), lte: endOfMonth(targetBulan) }

  const [tagihan, pengeluaran, penjualan, pendapatanPerBulan] = await Promise.all([
    // Semua tagihan bulan ini
    prisma.tagihan.findMany({
      where: {
        jatuhTempo: range,
        sewa: { kamar: { propertiId: properti.id } },
      },
      include: {
        sewa: {
          include: {
            kamar: { select: { nomor: true, tipe: { select: { nama: true } } } },
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

    // Penjualan barang (minuman/makanan) bulan ini yang uangnya SUDAH masuk:
    // LUNAS — baik jual lepas maupun titipan kamar yang dilunasi saat check-out.
    // BELUM_BAYAR sengaja tidak masuk sini; ia masuk `belumTerkumpul` seperti
    // tagihan yang belum lunas. BATAL dibuang.
    prisma.penjualan.findMany({
      where: { propertiId: properti.id, createdAt: range, status: 'LUNAS' },
      include: { item: true },
      orderBy: { createdAt: 'asc' },
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

  const pendapatanSewa = tagihan
    .filter(t => t.status === 'LUNAS')
    .reduce((sum, t) => sum + Number(t.nominal), 0)

  const pendapatanBarang = penjualan
    .reduce((sum, p) => sum + Number(p.total), 0)

  // Laba barang = harga jual − modal, bukan seluruh omzetnya. Baris tanpa modal
  // dihitung modal 0 (pemilik memang belum mengisi HPP-nya).
  const labaBarang = penjualan
    .reduce((s, p) => s + p.item.reduce((t, it) => {
      const beli = it.hargaBeli === null ? 0 : Number(it.hargaBeli)
      return t + (Number(it.hargaSatuan) - beli) * it.jumlah
    }, 0), 0)

  const totalPendapatan = pendapatanSewa + pendapatanBarang

  const totalPengeluaran = pengeluaran
    .reduce((sum, p) => sum + Number(p.nominal), 0)

  const belumTerkumpulSewa = tagihan
    .filter(t => ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'].includes(t.status))
    .reduce((sum, t) => sum + Number(t.nominal), 0)

  // Titipan barang ke kamar yang belum dilunasi ikut dihitung sebagai piutang —
  // kalau tidak, nilai ini terlihat lebih kecil dari uang yang sebenarnya
  // masih harus ditagih.
  const belumTerkumpulBarang = await piutangBarang(properti.id)

  return NextResponse.json({
    tagihan,
    pengeluaran,
    penjualan,
    pendapatanPerBulan,
    ringkasan: {
      totalPendapatan,
      // Dipisah supaya pemilik tetap bisa melihat porsi sewa vs barang; totalnya
      // adalah jumlah keduanya.
      pendapatanSewa,
      pendapatanBarang,
      labaBarang,
      totalPengeluaran,
      labaBersih: totalPendapatan - totalPengeluaran,
      belumTerkumpul: belumTerkumpulSewa + belumTerkumpulBarang,
      belumTerkumpulSewa,
      belumTerkumpulBarang,
    },
  })
}
