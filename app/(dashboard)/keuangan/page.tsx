// app/(dashboard)/keuangan/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRupiah, formatTanggal, statusTagihanColor, statusTagihanLabel } from '@/lib/utils'
import { startOfMonth, endOfMonth, subMonths } from 'date-fns'

export const dynamic = 'force-dynamic'

const kategoriLabel: Record<string, string> = {
  LISTRIK: 'Listrik', AIR: 'Air', INTERNET: 'Internet', KEBERSIHAN: 'Kebersihan',
  PERAWATAN: 'Perawatan', PAJAK: 'Pajak', GAJI: 'Gaji', LAINNYA: 'Lainnya',
}

export default async function KeuanganPage() {
  const session = await auth()
  const properti = await prisma.properti.findFirst({ where: { ownerId: session!.user!.id } })
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const now = new Date()
  const bulanIni = { gte: startOfMonth(now), lte: endOfMonth(now) }

  const [tagihan, pengeluaran, trend6bulan] = await Promise.all([
    prisma.tagihan.findMany({
      where: {
        jatuhTempo: bulanIni,
        sewa: { kamar: { propertiId: properti.id } },
      },
      include: {
        sewa: {
          include: {
            kamar: { select: { nomor: true } },
            penyewa: { select: { nama: true } },
          },
        },
        pembayaran: true,
      },
      orderBy: { jatuhTempo: 'asc' },
    }),

    prisma.pengeluaran.findMany({
      where: { propertiId: properti.id, tanggal: bulanIni },
      orderBy: { tanggal: 'desc' },
    }),

    // Rekap 6 bulan
    Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const bulan = subMonths(now, 5 - i)
        const range = { gte: startOfMonth(bulan), lte: endOfMonth(bulan) }
        return Promise.all([
          prisma.tagihan.aggregate({
            where: { status: 'LUNAS', jatuhTempo: range, sewa: { kamar: { propertiId: properti.id } } },
            _sum: { nominal: true },
          }),
          prisma.pengeluaran.aggregate({
            where: { propertiId: properti.id, tanggal: range },
            _sum: { nominal: true },
          }),
        ]).then(([pend, penge]) => ({
          bulan: bulan.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
          pendapatan: Number(pend._sum.nominal ?? 0),
          pengeluaran: Number(penge._sum.nominal ?? 0),
        }))
      })
    ),
  ])

  const totalPendapatan = tagihan.filter(t => t.status === 'LUNAS').reduce((s, t) => s + Number(t.nominal), 0)
  const totalPengeluaran = pengeluaran.reduce((s, p) => s + Number(p.nominal), 0)
  const belumLunas = tagihan.filter(t => ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'].includes(t.status)).reduce((s, t) => s + Number(t.nominal), 0)
  const maxBar = Math.max(...trend6bulan.map(t => Math.max(t.pendapatan, t.pengeluaran)), 1)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Keuangan</h1>
        <p className="text-sm text-gray-400">Pendapatan, tagihan, dan pengeluaran bulan ini</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pendapatan bulan ini</p>
          <p className="text-xl font-semibold text-teal-600">{formatRupiah(totalPendapatan)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pengeluaran bulan ini</p>
          <p className="text-xl font-semibold text-coral-600">{formatRupiah(totalPengeluaran)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Laba bersih</p>
          <p className="text-xl font-semibold text-gray-900">{formatRupiah(totalPendapatan - totalPengeluaran)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Belum terkumpul</p>
          <p className="text-xl font-semibold text-amber-400">{formatRupiah(belumLunas)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Chart 6 bulan */}
        <div className="card col-span-2">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Trend 6 bulan terakhir</h2>
          <div className="flex items-end gap-2 h-36">
            {trend6bulan.map((t, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-0.5 items-end" style={{ height: '100px' }}>
                  <div
                    className="flex-1 bg-teal-400 rounded-t-sm transition-all"
                    style={{ height: `${(t.pendapatan / maxBar) * 100}%`, minHeight: t.pendapatan > 0 ? '2px' : 0 }}
                    title={`Pendapatan: ${formatRupiah(t.pendapatan)}`}
                  />
                  <div
                    className="flex-1 bg-coral-400 rounded-t-sm transition-all"
                    style={{ height: `${(t.pengeluaran / maxBar) * 100}%`, minHeight: t.pengeluaran > 0 ? '2px' : 0 }}
                    title={`Pengeluaran: ${formatRupiah(t.pengeluaran)}`}
                  />
                </div>
                <p className="text-xs text-gray-400">{t.bulan}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-teal-400 inline-block" /> Pendapatan
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-coral-400 inline-block" /> Pengeluaran
            </div>
          </div>
        </div>

        {/* Pengeluaran per kategori */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Pengeluaran bulan ini</h2>
          <div className="space-y-2">
            {pengeluaran.map(p => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-gray-500 truncate">{kategoriLabel[p.kategori]} — {p.deskripsi.slice(0, 18)}{p.deskripsi.length > 18 ? '…' : ''}</span>
                <span className="text-coral-600 ml-2 shrink-0">{formatRupiah(p.nominal)}</span>
              </div>
            ))}
            {pengeluaran.length === 0 && <p className="text-xs text-gray-400">Belum ada pengeluaran.</p>}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-medium text-sm">
              <span className="text-gray-700">Total</span>
              <span className="text-coral-600">{formatRupiah(totalPengeluaran)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabel tagihan bulan ini */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Tagihan bulan {now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Kamar', 'Penyewa', 'Nominal', 'Jatuh Tempo', 'Status', 'Metode'].map(h => (
                  <th key={h} className="text-left py-2 text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tagihan.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{t.sewa.kamar.nomor}</td>
                  <td className="py-2.5 text-gray-600">{t.sewa.penyewa.nama}</td>
                  <td className="py-2.5 text-gray-700 font-medium">{formatRupiah(t.nominal)}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'short' })}</td>
                  <td className="py-2.5">
                    <span className={`badge ${statusTagihanColor(t.status)}`}>{statusTagihanLabel(t.status)}</span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">
                    {t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
