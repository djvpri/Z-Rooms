// app/(dashboard)/penyewa/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatRupiah, formatTanggal, inisial, statusTagihanColor, statusTagihanLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function PenyewaPage() {
  const session = await auth()
  const properti = await prisma.properti.findFirst({ where: { ownerId: session!.user!.id } })
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const sewa = await prisma.sewa.findMany({
    where: {
      kamar: { propertiId: properti.id },
      statusSewa: 'AKTIF',
    },
    include: {
      kamar: { select: { nomor: true, tipe: true } },
      penyewa: true,
      tagihan: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { tanggalMasuk: 'desc' },
  })

  const avatarColors = [
    'bg-teal-50 text-teal-700',
    'bg-purple-50 text-purple-600',
    'bg-amber-50 text-amber-400',
    'bg-coral-50 text-coral-600',
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Penyewa Aktif</h1>
          <p className="text-sm text-gray-400">{sewa.length} penyewa saat ini</p>
        </div>
      </div>

      {/* Kartu penyewa */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {sewa.map((s, i) => {
          const tagihan = s.tagihan[0]
          const color = avatarColors[i % avatarColors.length]
          return (
            <div key={s.id} className="card flex gap-3 hover:border-gray-200 transition-colors">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${color}`}>
                {inisial(s.penyewa.nama)}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{s.penyewa.nama}</p>
                    <p className="text-xs text-gray-400">{s.penyewa.noHp} · {s.penyewa.pekerjaan ?? '-'}</p>
                  </div>
                  {tagihan && (
                    <span className={`badge shrink-0 ${statusTagihanColor(tagihan.status)}`}>
                      {statusTagihanLabel(tagihan.status)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-3 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{s.kamar.nomor}</span>
                  <span>{s.kamar.tipe.charAt(0) + s.kamar.tipe.slice(1).toLowerCase()}</span>
                  <span>{s.periodeSewa.toLowerCase()}</span>
                  <span>{formatRupiah(s.hargaSewa)}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {formatTanggal(s.tanggalMasuk, { day: 'numeric', month: 'short' })} →{' '}
                  {formatTanggal(s.tanggalKeluar, { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabel lengkap */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Semua penyewa aktif</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Nama', 'Kamar', 'Tipe Sewa', 'Masuk', 'Keluar', 'Harga', 'Sumber', 'Bayar'].map(h => (
                  <th key={h} className="text-left py-2 text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sewa.map((s, i) => {
                const tagihan = s.tagihan[0]
                const sumberBadge: Record<string, string> = {
                  LANGSUNG: 'bg-gray-100 text-gray-500',
                  MAMIKOS: 'bg-teal-50 text-teal-700',
                  TRAVELOKA: 'bg-purple-50 text-purple-600',
                  BOOKING_COM: 'bg-blue-50 text-blue-600',
                }
                return (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${avatarColors[i % avatarColors.length]}`}>
                          {inisial(s.penyewa.nama)}
                        </div>
                        <span className="text-gray-800 font-medium">{s.penyewa.nama}</span>
                      </div>
                    </td>
                    <td className="py-2.5 font-medium text-gray-700">{s.kamar.nomor}</td>
                    <td className="py-2.5 text-gray-500 capitalize">{s.periodeSewa.toLowerCase()}</td>
                    <td className="py-2.5 text-gray-500 text-xs">{formatTanggal(s.tanggalMasuk, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="py-2.5 text-gray-500 text-xs">{formatTanggal(s.tanggalKeluar, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="py-2.5 text-gray-700">{formatRupiah(s.hargaSewa)}</td>
                    <td className="py-2.5">
                      <span className={`badge text-xs ${sumberBadge[s.sumber] ?? 'bg-gray-100 text-gray-500'}`}>
                        {s.sumber === 'LANGSUNG' ? 'Langsung' : s.sumber.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {tagihan && (
                        <span className={`badge ${statusTagihanColor(tagihan.status)}`}>
                          {statusTagihanLabel(tagihan.status)}
                        </span>
                      )}
                    </td>
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
