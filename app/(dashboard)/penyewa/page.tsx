// app/(dashboard)/penyewa/page.tsx
//
// Daftar penyewa yang tersimpan. Sumbernya tabel Penyewa, bukan Sewa —
// sebelumnya halaman ini hanya menampilkan sewa berstatus AKTIF, sehingga
// orang yang baru dibooking (PENDING) atau sudah check-out (SELESAI) hilang
// dari daftar walau barisnya ada di DB. Satu orang = satu baris; riwayat sewa
// diringkas jadi hitungan.
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { formatRupiah, formatTanggal, inisial, statusTagihanColor, statusTagihanLabel, namaPenyewa } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function PenyewaPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  // Hanya penyewa yang pernah menyewa di properti ini. Tanpa saringan ini,
  // properti kedua akan menampilkan penyewa milik properti pertama.
  const penyewa = await prisma.penyewa.findMany({
    where: { sewa: { some: { kamar: { propertiId: properti.id } } } },
    include: {
      sewa: {
        where: { kamar: { propertiId: properti.id } },
        orderBy: { tanggalMasuk: 'desc' },
        include: {
          kamar: { select: { nomor: true } },
          tagihan: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Sewa aktif = yang masih berjalan. Dipakai untuk menyorot di daftar atas;
  // penyewa tanpa sewa aktif tetap tampil di tabel bawah.
  const aktif = penyewa.flatMap(p => {
    const s = p.sewa.find(x => x.statusSewa === 'AKTIF')
    return s ? [{ p, s }] : []
  })

  const avatarColors = [
    'bg-teal-50 text-teal-700',
    'bg-purple-50 text-purple-600',
    'bg-amber-50 text-amber-400',
    'bg-coral-50 text-coral-600',
  ]

  // Nomor WA dinormalkan: 0/62/+62 semuanya jadi 62xxxx supaya link wa.me
  // tidak membuka nomor kosong.
  const waHref = (noHp: string | null) => {
    const digit = (noHp ?? '').replace(/\D/g, '')
    if (!digit) return null
    const n = digit.startsWith('62') ? digit : digit.startsWith('0') ? '62' + digit.slice(1) : '62' + digit
    return `https://wa.me/${n}`
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Penyewa</h1>
          <p className="text-sm text-gray-400">
            {penyewa.length} penyewa tersimpan · {aktif.length} sedang aktif
          </p>
        </div>
      </div>

      {/* Sorotan penyewa yang sedang aktif */}
      {aktif.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-8">
          {aktif.map(({ p, s }, i) => {
            const tagihan = s.tagihan[0]
            return (
              <div key={p.id} className="card flex gap-3 hover:border-gray-200 transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${avatarColors[i % avatarColors.length]}`}>
                  {inisial(p.nama)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{namaPenyewa(p.nama)}</p>
                      <p className="text-xs text-gray-400">
                        {waHref(p.noHp)
                          ? <a href={waHref(p.noHp)!} target="_blank" rel="noreferrer" className="hover:text-teal-600">{p.noHp}</a>
                          : '-'}
                        {' · '}Kamar {s.kamar.nomor}
                      </p>
                    </div>
                    {tagihan && (
                      <span className={`badge shrink-0 ${statusTagihanColor(tagihan.status)}`}>
                        {statusTagihanLabel(tagihan.status)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-gray-500">
                    <span>{s.periodeSewa.toLowerCase()}</span>
                    <span>{formatRupiah(s.hargaSewa)}</span>
                    <span>
                      {formatTanggal(s.tanggalMasuk, { day: 'numeric', month: 'short' })} –{' '}
                      {formatTanggal(s.tanggalKeluar, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Seluruh penyewa tersimpan, termasuk yang sudah check-out */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Semua penyewa tersimpan</h2>

        {penyewa.length === 0 && (
          <p className="text-sm text-gray-400 py-4">Belum ada penyewa. Buat lewat tab Booking.</p>
        )}

        {/* Desktop table */}
        {penyewa.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Nama', 'Kontak', 'NIK', 'Alamat', 'Sewa', 'Terakhir', 'Status terakhir'].map(h => (
                    <th key={h} className="text-left py-2 text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {penyewa.map((p, i) => {
                  const terakhir = p.sewa[0]
                  const tagihan = terakhir?.tagihan[0]
                  const wa = waHref(p.noHp)
                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${avatarColors[i % avatarColors.length]}`}>
                            {inisial(p.nama)}
                          </div>
                          <span className="text-gray-800 font-medium">{namaPenyewa(p.nama)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-gray-500 text-xs">
                        {wa ? <a href={wa} target="_blank" rel="noreferrer" className="hover:text-teal-600">{p.noHp}</a> : '-'}
                      </td>
                      <td className="py-2.5 text-gray-400 text-xs">{p.nik || '-'}</td>
                      <td className="py-2.5 text-gray-500 text-xs max-w-[14rem] truncate" title={p.alamatAsal ?? ''}>
                        {p.alamatAsal || '-'}
                      </td>
                      <td className="py-2.5 text-gray-500 text-xs">
                        {p.sewa.length > 0 ? `${p.sewa.length}x` : '-'}
                      </td>
                      <td className="py-2.5 text-gray-500 text-xs">
                        {terakhir
                          ? `${terakhir.kamar.nomor} · ${formatTanggal(terakhir.tanggalMasuk, { day: 'numeric', month: 'short', year: '2-digit' })}`
                          : '-'}
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
        )}

        {/* Mobile cards */}
        {penyewa.length > 0 && (
          <div className="md:hidden space-y-2">
            {penyewa.map((p, i) => {
              const terakhir = p.sewa[0]
              const tagihan = terakhir?.tagihan[0]
              const wa = waHref(p.noHp)
              return (
                <div key={p.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${avatarColors[i % avatarColors.length]}`}>
                        {inisial(p.nama)}
                      </div>
                      <span className="font-medium text-gray-800 text-sm">{namaPenyewa(p.nama)}</span>
                    </div>
                    {tagihan && (
                      <span className={`badge text-[10px] shrink-0 ${statusTagihanColor(tagihan.status)}`}>
                        {statusTagihanLabel(tagihan.status)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 ml-8">
                    {wa ? <a href={wa} target="_blank" rel="noreferrer" className="hover:text-teal-600">{p.noHp}</a> : '-'}
                    {p.sewa.length > 0 && ` · ${p.sewa.length}x sewa`}
                  </div>
                  {terakhir && (
                    <div className="text-xs text-gray-400 ml-8 mt-0.5">
                      Terakhir kamar <span className="font-medium text-gray-700">{terakhir.kamar.nomor}</span> ·{' '}
                      {formatTanggal(terakhir.tanggalMasuk, { day: 'numeric', month: 'short', year: '2-digit' })}
                    </div>
                  )}
                  {p.alamatAsal && (
                    <div className="text-xs text-gray-400 ml-8 mt-0.5 truncate">{p.alamatAsal}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
