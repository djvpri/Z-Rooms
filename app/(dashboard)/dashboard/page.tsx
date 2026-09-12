// app/(dashboard)/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import {
  formatRupiah, formatTanggal, statusKamarLabel,
  hunianWarna, hunianBarWarna, waktuRelatif, namaPenyewa,
} from '@/lib/utils'
import { startOfMonth, endOfMonth } from 'date-fns'
import Link from 'next/link'
import DemoBanner from '@/components/demo/DemoBanner'
import {
  DoorClosedFill, PersonCheckFill, CashCoin, Receipt, Speedometer2,
  KeyFill, ClockFill, WrenchAdjustable, DoorOpen, GraphUpArrow, GraphDownArrow,
  Wallet2, JournalText, ArrowRight,
} from 'react-bootstrap-icons'
import type { Icon as BiIcon } from 'react-bootstrap-icons'

export const dynamic = 'force-dynamic'

// Status kamar → ikon + warna. Ikon menemani warna supaya status tetap terbaca
// tanpa bergantung pada warna saja.
const statusKamar: { status: string; color: string; Icon: BiIcon }[] = [
  { status: 'TERSEDIA',     color: 'bg-teal-50 text-teal-700',      Icon: DoorOpen },
  { status: 'TERISI',       color: 'bg-coral-50 text-coral-600',    Icon: KeyFill },
  { status: 'DIPESAN',      color: 'bg-purple-50 text-purple-600',  Icon: ClockFill },
  { status: 'PEMELIHARAAN', color: 'bg-amber-50 text-amber-400',    Icon: WrenchAdjustable },
]

export default async function DashboardPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)

  // Empty state ber-aksi: properti baru butuh arahan, bukan teks abu tanpa jalan keluar.
  if (!properti) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="card text-center py-16">
          <DoorClosedFill className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Belum ada properti</h2>
          <p className="text-sm text-gray-500 mt-1 mb-5">
            Tambahkan properti (kos, kontrakan, atau hotel) untuk mulai mengelola kamar dan penyewa.
          </p>
          <Link href="/kamar" className="btn btn-primary inline-flex">
            <DoorOpen aria-hidden="true" /> Tambah kamar
          </Link>
        </div>
      </div>
    )
  }

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
        kamar: { select: { nomor: true, status: true } },
        penyewa: { select: { nama: true } },
        tagihan: { select: { status: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.notifikasi.count({ where: { propertiId: properti.id, dibaca: false } }),
  ])

  const statusMap = kamarByStatus.reduce((acc, s) => { acc[s.status] = s._count; return acc }, {} as Record<string, number>)
  const pendapatan = Number(pendapatanBulanIni._sum.nominal ?? 0)
  const pengeluaran = Number(pengeluaranBulanIni._sum.nominal ?? 0)
  const laba = pendapatan - pengeluaran
  const hunian = totalKamar ? Math.round((statusMap['TERISI'] ?? 0) / totalKamar * 100) : 0

  const kpi: { label: string; nilai: string; sub: React.ReactNode; aksen: string; Icon: BiIcon }[] = [
    {
      label: 'Total kamar', nilai: String(totalKamar), aksen: 'text-gray-900', Icon: DoorClosedFill,
      sub: <span className={hunianWarna(hunian)}>Hunian {hunian}%</span>,
    },
    {
      label: 'Kamar terisi', nilai: String(statusMap['TERISI'] ?? 0), aksen: 'text-gray-900', Icon: PersonCheckFill,
      sub: <span className="text-gray-400">Tersedia: {statusMap['TERSEDIA'] ?? 0}</span>,
    },
    {
      label: 'Pendapatan bulan ini', nilai: formatRupiah(pendapatan), aksen: 'text-gray-900', Icon: CashCoin,
      // Pengeluaran 0 → "Laba" sama persis dgn pendapatan & terlihat seperti bug.
      sub: (
        <span className={laba >= 0 ? 'text-teal-600' : 'text-coral-600'}>
          {pengeluaran > 0 ? `Laba ${formatRupiah(laba)}` : 'Belum ada pengeluaran'}
        </span>
      ),
    },
    {
      label: 'Tagihan belum lunas', nilai: String(tagihanBelumBayar),
      aksen: tagihanBelumBayar > 0 ? 'text-coral-600' : 'text-gray-900', Icon: Receipt,
      sub: <span className="text-gray-400">{notifCount} notifikasi baru</span>,
    },
  ]

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {properti.isDemo && <DemoBanner />}

      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">{properti.nama}</h1>
        <p className="text-sm text-gray-400">
          {(() => {
            // 'alamat, kota' sering kosong / '-' jangan tampilkan placeholder
            const lokasi = [properti.alamat, properti.kota]
              .map((v) => (v || '').trim())
              .filter((v) => v && v !== '-')
              .join(', ')
            return [lokasi, formatTanggal(now)].filter(Boolean).join(' · ')
          })()}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {kpi.map(({ label, nilai, sub, aksen, Icon }) => (
          <div key={label} className="stat-card">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-gray-500">{label}</p>
              <Icon className="text-base text-gray-300 shrink-0" aria-hidden="true" />
            </div>
            <p className={`text-xl md:text-2xl font-semibold ${aksen}`}>{nilai}</p>
            <p className="text-xs mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {/* Status kamar */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Speedometer2 className="text-gray-400" aria-hidden="true" /> Status kamar
          </h2>
          <div className="space-y-2">
            {statusKamar.map(({ status, color, Icon }) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-2">
                  <Icon className="text-gray-400 shrink-0" aria-hidden="true" />
                  {statusKamarLabel(status)}
                </span>
                <span className={`badge ${color}`}>{statusMap[status] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ringkasan keuangan */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Wallet2 className="text-gray-400" aria-hidden="true" /> Keuangan bulan ini
          </h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 flex items-center gap-2">
                <GraphUpArrow className="text-teal-600" aria-hidden="true" /> Pendapatan
              </span>
              <span className="font-medium text-teal-700">{formatRupiah(pendapatan)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 flex items-center gap-2">
                <GraphDownArrow className="text-coral-600" aria-hidden="true" /> Pengeluaran
              </span>
              <span className="font-medium text-coral-600">- {formatRupiah(pengeluaran)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
              <span className="font-medium text-gray-700">Laba bersih</span>
              <span className={`font-semibold ${laba >= 0 ? 'text-gray-900' : 'text-coral-600'}`}>
                {formatRupiah(laba)}
              </span>
            </div>
          </div>
        </div>

        {/* Tingkat hunian */}
        <div className="card">
          <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <KeyFill className="text-gray-400" aria-hidden="true" /> Tingkat hunian
          </h2>
          <div className="flex items-center justify-center h-20">
            <div className="text-center">
              <p className={`text-4xl font-semibold ${hunianWarna(hunian)}`}>{hunian}%</p>
              <p className="text-xs text-gray-400 mt-1">{statusMap['TERISI'] ?? 0} dari {totalKamar} kamar</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2" role="progressbar" aria-valuenow={hunian} aria-valuemin={0} aria-valuemax={100}>
            <div className={`${hunianBarWarna(hunian)} h-2 rounded-full transition-all`} style={{ width: `${hunian}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {hunian >= 70 ? 'Hunian sehat' : hunian >= 40 ? 'Hunian sedang' : 'Banyak kamar kosong — pertimbangkan promosi'}
          </p>
        </div>
      </div>

      {/* Aktivitas terbaru */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <JournalText className="text-gray-400" aria-hidden="true" /> Aktivitas terbaru
        </h2>

        {aktivitas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <JournalText className="text-3xl mx-auto mb-2 opacity-40" aria-hidden="true" />
            <p className="text-sm">Belum ada aktivitas.</p>
            <Link href="/booking" className="btn btn-ghost text-xs mt-3 inline-flex">
              <ArrowRight aria-hidden="true" /> Catat penyewa baru
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 font-medium text-gray-500 text-xs">Kamar</th>
                    <th className="text-left py-2 font-medium text-gray-500 text-xs">Penyewa</th>
                    <th className="text-left py-2 font-medium text-gray-500 text-xs">Periode sewa</th>
                    <th className="text-left py-2 font-medium text-gray-500 text-xs">Kapan</th>
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
                    const TagIcon = tagStatus === 'LUNAS' ? KeyFill : tagStatus === 'TERLAMBAT' ? ClockFill : Receipt
                    return (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 font-medium text-gray-700">{s.kamar.nomor}</td>
                        <td className="py-2.5 text-gray-600">{namaPenyewa(s.penyewa.nama)}</td>
                        <td className="py-2.5 text-gray-500 capitalize">{s.periodeSewa.toLowerCase()}</td>
                        <td className="py-2.5 text-gray-400 text-xs" title={formatTanggal(s.createdAt)}>{waktuRelatif(s.createdAt)}</td>
                        <td className="py-2.5">
                          <span className={`badge ${tagColor} gap-1`}>
                            <TagIcon size={11} aria-hidden="true" /> {tagLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {aktivitas.map(s => {
                const tagStatus = s.tagihan[0]?.status ?? 'BELUM_BAYAR'
                const tagColor = tagStatus === 'LUNAS' ? 'bg-teal-50 text-teal-700'
                  : tagStatus === 'TERLAMBAT' ? 'bg-coral-50 text-coral-600'
                  : 'bg-gray-100 text-gray-500'
                const tagLabel = tagStatus === 'LUNAS' ? 'Lunas' : tagStatus === 'TERLAMBAT' ? 'Terlambat' : 'Belum bayar'
                return (
                  <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">{s.kamar.nomor}</span>
                        <span className="text-gray-600 text-sm">{namaPenyewa(s.penyewa.nama)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {s.periodeSewa.toLowerCase()} · {waktuRelatif(s.createdAt)}
                      </div>
                    </div>
                    <span className={`badge shrink-0 ml-2 ${tagColor}`}>{tagLabel}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
