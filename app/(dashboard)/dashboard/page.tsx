// app/(dashboard)/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRupiah, formatTanggal, statusKamarColor, statusKamarLabel } from '@/lib/utils'
import { startOfMonth, endOfMonth } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  const properti = await prisma.properti.findFirst({ where: { ownerId: session!.user!.id } })
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti terdaftar.</div>

  const now = new Date()
  const bulanIni = { gte: startOfMonth(now), lte: endOfMonth(now) }

  const [totalKamar, kamarByStatus, pendapatanBulanIni, pengeluaranBulanIni,
    tagihanBelumBayar, aktivitas, notifCount] = await Promise.all([
    prisma.kamar.count({ where: { propertiId: properti.id } }),
    prisma.kamar.groupBy({ by: ['status'], where: { propertiId: properti.id }, _count: true }),
    prisma.tagihan.aggregate({
      where: { status: 'LUNAS', createdAt: bulanIni, sewa: { kamar: { propertiId: properti.id } } },
      _sum: { nominal: true },
    }),
    prisma.pengeluaran.aggregate({
      where: { propertiId: properti.id, tanggal: bulanIni },
      _sum: { nominal: true },
    }),
    prisma.tagihan.count({
      where: { status: { in: ['BELUM_BAYAR', 'TERLAMBAT'] }, sewa: { kamar: { propertiId: properti.id } } },
    }),
    prisma.sewa.findMany({
      where: { kamar: { propertiId: properti.id } },
      orderBy: { createdAt: 'desc' }, take: 6,
      include: {
        kamar: { select: { nomor: true } },
        penyewa: { select: { nama: true } },
        tagihan: { select: { status: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.notifikasi.count({ where: { propertiId: properti.id, dibaca: false } }),
  ])

  const statusMap = kamarByStatus.reduce((acc, s) => { acc[s.status] = s._count; return acc }, {} as Record<string, number>)
  const pendapatan = Number(pendapatanBulanIni._sum.nominal ?? 0)
  const pengeluaran = Number(pengeluaranBulanIni._sum.nominal ?? 0)
  const hunian = Math.round((statusMap['TERISI'] ?? 0) / totalKamar * 100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">{properti.nama}</h1>
        <p className="text-sm text-gray-400">{properti.alamat}, {properti.kota} · {formatTanggal(now)}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total kamar</p>
          <p className="text-2xl font-semibold text-gray-900">{totalKamar}</p>
          <p className="text-xs text-teal-600 mt-1">Hunian {hunian}%</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Kamar terisi</p>
          <p className="text-2xl font-semibold text-gray-900">{statusMap['TERISI'] ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Tersedia: {statusMap['TERSEDIA'] ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pendapatan bulan ini</p>
          <p className="text-xl font-semibold text-gray-900">{formatRupiah(pendapatan)}</p>
          <p className="text-xs text-teal-600 mt-1">Laba: {formatRupiah(pendapatan - pengeluaran)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Tagihan belum lunas</p>
          <p className="text-2xl font-semibold text-coral-600">{tagihanBelumBayar}</p>
          <p className="text-xs text-gray-400 mt-1">{notifCount} notifikasi baru</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Status kamar */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Status kamar</h2>
          <div className="space-y-2">
            {[
              { status: 'TERSEDIA', color: 'bg-teal-50 text-teal-700' },
              { status: 'TERISI', color: 'bg-coral-50 text-coral-600' },
              { status: 'DIPESAN', color: 'bg-purple-50 text-purple-600' },
              { status: 'PEMELIHARAAN', color: 'bg-amber-50 text-amber-400' },
            ].map(({ status, color }) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{statusKamarLabel(status)}</span>
                <span className={`badge ${color}`}>{statusMap[status] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ringkasan keuangan */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Keuangan bulan ini</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pendapatan</span>
              <span className="font-medium text-teal-700">{formatRupiah(pendapatan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pengeluaran</span>
              <span className="font-medium text-coral-600">- {formatRupiah(pengeluaran)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
              <span className="font-medium text-gray-700">Laba bersih</span>
              <span className="font-semibold text-gray-900">{formatRupiah(pendapatan - pengeluaran)}</span>
            </div>
          </div>
        </div>

        {/* Tingkat hunian */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Tingkat hunian</h2>
          <div className="flex items-center justify-center h-20">
            <div className="text-center">
              <p className="text-4xl font-semibold text-teal-600">{hunian}%</p>
              <p className="text-xs text-gray-400 mt-1">{statusMap['TERISI'] ?? 0} dari {totalKamar} kamar</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${hunian}%` }} />
          </div>
        </div>
      </div>

      {/* Aktivitas terbaru */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Aktivitas terbaru</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 font-medium text-gray-500 text-xs">Kamar</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs">Penyewa</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs">Periode sewa</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs">Tanggal</th>
                <th className="text-left py-2 font-medium text-gray-500 text-xs">Status tagihan</th>
              </tr>
            </thead>
            <tbody>
              {aktivitas.map(s => {
                const tagStatus = s.tagihan[0]?.status ?? 'BELUM_BAYAR'
                const tagColor = tagStatus === 'LUNAS' ? 'bg-teal-50 text-teal-700'
                  : tagStatus === 'TERLAMBAT' ? 'bg-coral-50 text-coral-600'
                  : 'bg-gray-100 text-gray-500'
                const tagLabel = tagStatus === 'LUNAS' ? 'Lunas' : tagStatus === 'TERLAMBAT' ? 'Terlambat' : 'Belum bayar'
                return (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-700">{s.kamar.nomor}</td>
                    <td className="py-2.5 text-gray-600">{s.penyewa.nama}</td>
                    <td className="py-2.5 text-gray-500 capitalize">{s.periodeSewa.toLowerCase()}</td>
                    <td className="py-2.5 text-gray-400 text-xs">{formatTanggal(s.createdAt, { day: 'numeric', month: 'short' })}</td>
                    <td className="py-2.5"><span className={`badge ${tagColor}`}>{tagLabel}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
