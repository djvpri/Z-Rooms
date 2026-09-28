// app/(dashboard)/keuangan/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { formatRupiah, namaPenyewa } from '@/lib/utils'
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns'
import { piutangBarang } from '@/lib/piutang'
import TagihanTable from './TagihanTable'
import { FilterPeriode } from '@/components/keuangan/FilterPeriode'
import { defaultRentang } from '@/lib/rentang'

export const dynamic = 'force-dynamic'

const kategoriLabel: Record<string, string> = {
  LISTRIK: 'Listrik', AIR: 'Air', INTERNET: 'Internet', KEBERSIHAN: 'Kebersihan',
  PERAWATAN: 'Perawatan', PAJAK: 'Pajak', GAJI: 'Gaji', LAINNYA: 'Lainnya',
}

function parseTanggal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export default async function KeuanganPage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string }>
}) {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const sp = await searchParams
  const rentang = defaultRentang()
  const dariStr = sp.dari && /^\d{4}-\d{2}-\d{2}$/.test(sp.dari) ? sp.dari : rentang.dari
  const sampaiStr = sp.sampai && /^\d{4}-\d{2}-\d{2}$/.test(sp.sampai) ? sp.sampai : rentang.sampai

  // WIB = UTC+7: awal hari WIB = 17:00 UTC hari sebelumnya.
  const rentangDb = {
    gte: new Date(parseTanggal(dariStr).getTime() - 7 * 3600_000),
    lte: new Date(parseTanggal(sampaiStr).getTime() + 17 * 3600_000),
  }

  const now = new Date()
  const hariIniDb = { gte: startOfDay(now), lte: endOfDay(now) }
  const bulanIni = { gte: startOfMonth(now), lte: endOfMonth(now) }

  const [tagihan, pengeluaran, penjualan, trend6bulan, tagihanHariIni, jualHariIni] = await Promise.all([
    prisma.tagihan.findMany({
      where: {
        jatuhTempo: rentangDb,
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
      where: { propertiId: properti.id, tanggal: rentangDb },
      orderBy: { tanggal: 'desc' },
    }),

    // Penjualan barang yang uangnya sudah masuk (LUNAS) dalam rentang. BELUM_BAYAR
    // masuk `belumLunas`, BATAL dibuang.
    prisma.penjualan.findMany({
      where: { propertiId: properti.id, createdAt: rentangDb, status: 'LUNAS' },
      select: { total: true },
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
          prisma.penjualan.aggregate({
            where: { propertiId: properti.id, status: 'LUNAS', createdAt: range },
            _sum: { total: true },
          }),
        ]).then(([pend, penge, jual]) => ({
          bulan: bulan.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
          // Pendapatan = sewa + barang. Digabung di sini karena grafiknya satu
          // batang; porsi sewa vs barang dirinci di kartu ringkasan.
          pendapatan: Number(pend._sum.nominal ?? 0) + Number(jual._sum.total ?? 0),
          pengeluaran: Number(penge._sum.nominal ?? 0),
        }))
      })
    ),

    // Pendapatan HARI INI — kartu ini tak ikut filter rentang: pemilik yang
    // baru membuka aplikasi mau tahu "hari ini dapat berapa", bukan harus
    // menggeser rentang dulu.
    prisma.tagihan.aggregate({
      where: { status: 'LUNAS', jatuhTempo: hariIniDb, sewa: { kamar: { propertiId: properti.id } } },
      _sum: { nominal: true },
    }),
    prisma.penjualan.aggregate({
      where: { propertiId: properti.id, status: 'LUNAS', createdAt: hariIniDb },
      _sum: { total: true },
    }),
  ])

  const pendapatanHariIni = Number(tagihanHariIni._sum.nominal ?? 0) + Number(jualHariIni._sum.total ?? 0)

  const pendapatanSewa = tagihan.filter(t => t.status === 'LUNAS').reduce((s, t) => s + Number(t.nominal), 0)
  const pendapatanBarang = penjualan.reduce((s, p) => s + Number(p.total), 0)
  const totalPendapatan = pendapatanSewa + pendapatanBarang
  const totalPengeluaran = pengeluaran.reduce((s, p) => s + Number(p.nominal), 0)
  // Piutang barang (titipan kamar yang belum dilunasi) — tanpa ini "Belum
  // terkumpul" terlihat lebih kecil dari yang sebenarnya harus ditagih.
  const belumLunasSewa = tagihan.filter(t => ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'].includes(t.status)).reduce((s, t) => s + Number(t.nominal), 0)
  const belumLunas = belumLunasSewa + await piutangBarang(properti.id)
  const maxBar = Math.max(...trend6bulan.map(t => Math.max(t.pendapatan, t.pengeluaran)), 1)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Keuangan</h1>
        <p className="text-sm text-gray-400">
          {dariStr === sampaiStr
            ? `Ringkasan ${dariStr}`
            : `Pendapatan, tagihan, dan pengeluaran ${dariStr} — ${sampaiStr}`}
        </p>
      </div>

      <FilterPeriode dari={dariStr} sampai={sampaiStr} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pendapatan hari ini</p>
          <p className="text-base md:text-xl font-semibold text-teal-600">{formatRupiah(pendapatanHariIni)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pendapatan rentang</p>
          <p className="text-base md:text-xl font-semibold text-teal-600">{formatRupiah(totalPendapatan)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pengeluaran rentang</p>
          <p className="text-base md:text-xl font-semibold text-coral-600">{formatRupiah(totalPengeluaran)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Laba bersih</p>
          <p className="text-base md:text-xl font-semibold text-gray-900">{formatRupiah(totalPendapatan - totalPengeluaran)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Belum terkumpul</p>
          <p className="text-base md:text-xl font-semibold text-amber-400">{formatRupiah(belumLunas)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {/* Chart 6 bulan */}
        <div className="card md:col-span-2">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Trend 6 bulan terakhir</h2>
          <div className="flex items-end gap-2 h-28 md:h-36">
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
          <h2 className="text-sm font-medium text-gray-700 mb-3">Pengeluaran ({dariStr === sampaiStr ? dariStr : `${dariStr}—${sampaiStr}`})</h2>
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
      <TagihanTable
        bulanLabel={dariStr === sampaiStr ? dariStr : `${dariStr} — ${sampaiStr}`}
        // Identitas properti untuk kepala & kaki nota cetak. Dikirim dari sini
        // karena halaman ini server component yang sudah memegang `properti`.
        properti={{
          nama: properti.nama,
          alamat: properti.alamat,
          kota: properti.kota,
          provinsi: properti.provinsi,
          noHp: properti.noHp,
          teksNota: properti.teksNota,
        }}
        tagihan={tagihan.map(t => ({
          id: t.id,
          nominal: Number(t.nominal),
          jatuhTempo: t.jatuhTempo.toISOString(),
          status: t.status,
          sewa: {
            kamar: { nomor: t.sewa.kamar.nomor },
            penyewa: { nama: namaPenyewa(t.sewa.penyewa.nama) },
          },
          pembayaran: t.pembayaran.map(p => ({ metodeBayar: p.metodeBayar ?? null })),
        }))}
      />
    </div>
  )
}
