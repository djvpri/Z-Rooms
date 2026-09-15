// app/(dashboard)/kamar/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { formatRupiah, statusKamarColor, statusKamarLabel, namaPenyewa } from '@/lib/utils'
import { cekLewat, labelLewat } from '@/lib/checkout'
import Link from 'next/link'
import KamarTambahModal from '@/components/kamar/KamarTambahModal'
import CheckoutModal from '@/components/kamar/CheckoutModal'
import { DoorClosedFill } from 'react-bootstrap-icons'

export const dynamic = 'force-dynamic'

const tipeKamarLabel: Record<string, string> = {
  STANDAR: 'Standar', DELUXE: 'Deluxe', VIP: 'VIP', SUITE: 'Suite', STUDIO: 'Studio',
}

export default async function KamarPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const kamar = await prisma.kamar.findMany({
    where: { propertiId: properti.id },
    include: {
      harga: { where: { aktif: true } },
      sewa: {
        where: { statusSewa: 'AKTIF' },
        include: {
          penyewa: { select: { nama: true, noHp: true } },
          // Sisa tagihan dipakai modal check-out untuk memperingatkan kasir
          // sebelum kamar dikosongkan dengan tunggakan masih berjalan.
          tagihan: {
            where: { status: { in: ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'] } },
            select: { nominal: true },
          },
        },
        take: 1,
      },
    },
    orderBy: { nomor: 'asc' },
  })

  const statusGroups = {
    TERSEDIA: kamar.filter(k => k.status === 'TERSEDIA'),
    TERISI: kamar.filter(k => k.status === 'TERISI'),
    DIPESAN: kamar.filter(k => k.status === 'DIPESAN'),
    PEMELIHARAAN: kamar.filter(k => k.status === 'PEMELIHARAAN'),
  }

  // Bentuk data untuk CheckoutModal. Diekstrak karena dipakai di tiga tempat
  // (grid, tabel desktop, kartu mobile) — sebelumnya disalin-tempel.
  type KamarBaris = (typeof kamar)[number]
  type SewaBaris = NonNullable<KamarBaris['sewa'][number]>
  // Opsi A: dihitung saat halaman dibuka, tanpa cron. `sekarang` diambil sekali
  // supaya semua kamar dinilai pada titik waktu yang sama.
  const sekarang = new Date()
  const aturan = { jamCheckout: properti.jamCheckout, toleransiCheckout: properti.toleransiCheckout }
  const jumlahLewat = kamar.filter(k => {
    const s = k.sewa[0]
    return s ? cekLewat(s.tanggalKeluar, aturan, sekarang).lewat : false
  }).length

  const ringkasSewa = (k: KamarBaris, s: SewaBaris) => ({
    id: s.id,
    kamarNomor: k.nomor,
    penyewaNama: s.penyewa?.nama ?? null,
    tanggalKeluar: s.tanggalKeluar.toISOString(),
    deposit: Number(s.deposit),
    sisaTagihan: s.tagihan.reduce((a, t) => a + Number(t.nominal), 0),
    jumlahTagihan: s.tagihan.length,
    periodeSewa: s.periodeSewa as string,
    menitLebih: cekLewat(s.tanggalKeluar, aturan, sekarang).menitLebih,
  })
  // Kandidat kamar tujuan pindah: kamar TERSEDIA selain kamar asal.
  const kamarTersediaUntuk = (asalId: string) =>
    kamar
      .filter(x => x.status === 'TERSEDIA' && x.id !== asalId)
      .map(x => {
        const hb = x.harga.find(h => h.periodeSewa === 'BULANAN')
        return {
          id: x.id,
          nomor: x.nomor,
          tipe: tipeKamarLabel[x.tipe],
          hargaBulanan: hb ? Number(hb.harga) : null,
          deposit: hb?.deposit != null ? Number(hb.deposit) : null,
        }
      })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Kamar</h1>
          <p className="text-sm text-gray-400">{kamar.length} kamar terdaftar</p>
        </div>
        <div className="flex items-center gap-2">
          <KamarTambahModal />
          <Link href="/booking" className="btn btn-ghost">Booking baru</Link>
        </div>
      </div>

      {/* Peringatan lewat check-out. Dihitung saat halaman dibuka (tanpa cron),
          jadi angkanya sebanding dengan keadaan saat ini — bukan sisa kemarin. */}
      {jumlahLewat > 0 && (
        <div className="rounded-lg border-l-4 border-l-coral-400 bg-coral-50 text-coral-600 p-4 mb-5">
          <p className="text-sm font-medium">
            {jumlahLewat} kamar lewat jam check-out
          </p>
          <p className="text-xs mt-0.5">
            Sewa sudah melewati jam {properti.jamCheckout} + toleransi {properti.toleransiCheckout} menit.
            Kamar tidak dikosongkan otomatis — periksa lalu check-out seperti biasa.
          </p>
        </div>
      )}

      {/* Legenda */}
      <div className="flex gap-4 mb-5 flex-wrap">
        {[
          { s: 'TERSEDIA', label: 'Tersedia', c: 'bg-teal-50 text-teal-700' },
          { s: 'TERISI', label: 'Terisi', c: 'bg-coral-50 text-coral-600' },
          { s: 'DIPESAN', label: 'Dipesan', c: 'bg-purple-50 text-purple-600' },
          { s: 'PEMELIHARAAN', label: 'Pemeliharaan', c: 'bg-amber-50 text-amber-400' },
        ].map(({ s, label, c }) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${c.split(' ')[0]}`} />
            {label} ({statusGroups[s as keyof typeof statusGroups]?.length ?? 0})
          </div>
        ))}
      </div>

      {/* Grid kamar */}
      {kamar.length === 0 ? (
        <div className="card text-center py-14 mb-8">
          <DoorClosedFill className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada kamar</h2>
          <p className="text-sm text-gray-500 mt-1">Tambahkan kamar pertama untuk mulai mencatat penyewa dan tagihan.</p>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 mb-8">
        {kamar.map(k => {
          const hargaBulanan = k.harga.find(h => h.periodeSewa === 'BULANAN')
          const sewaAktif = k.sewa[0]
          const penyewa = sewaAktif?.penyewa
          return (
            <div
              key={k.id}
              className={`rounded-xl border p-3 text-center ${statusKamarColor(k.status)}`}
            >
              <p className="font-semibold text-sm">{k.nomor}</p>
              <p className="text-xs mt-0.5 opacity-75">{tipeKamarLabel[k.tipe]}</p>
              {hargaBulanan && (
                <p className="text-xs mt-1 font-medium">
                  {formatRupiah(hargaBulanan.harga)}<span className="opacity-60">/bln</span>
                </p>
              )}
              <p className="text-xs mt-1 opacity-60 truncate">
                {penyewa ? namaPenyewa(penyewa.nama) : 'Kosong'}
              </p>
              {(() => {
                const lebih = sewaAktif ? cekLewat(sewaAktif.tanggalKeluar, aturan, sekarang).menitLebih : 0
                return lebih > 0 ? (
                  <p className="text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-coral-100 text-coral-700 inline-block">
                    Lewat {labelLewat(lebih)}
                  </p>
                ) : null
              })()}
              {sewaAktif && (
                <CheckoutModal
                  sewa={ringkasSewa(k, sewaAktif)}
                  kamarTersedia={kamarTersediaUntuk(k.id)}
                />
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* Tabel detail */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Detail kamar</h2>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs font-medium text-gray-400">Nomor</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Tipe</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Luas</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Harga/bln</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Status</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Penyewa</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400">Fasilitas</th>
                <th className="text-left py-2 text-xs font-medium text-gray-400"></th>
              </tr>
            </thead>
            <tbody>
              {kamar.map(k => {
                const hargaBulanan = k.harga.find(h => h.periodeSewa === 'BULANAN')
                const sewaAktif = k.sewa[0]
                const penyewa = sewaAktif?.penyewa
                return (
                  <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-800">{k.nomor}</td>
                    <td className="py-2.5 text-gray-600">{tipeKamarLabel[k.tipe]}</td>
                    <td className="py-2.5 text-gray-500">{k.luas ? `${k.luas} m²` : '-'}</td>
                    <td className="py-2.5 text-gray-700">{hargaBulanan ? formatRupiah(hargaBulanan.harga) : '-'}</td>
                    <td className="py-2.5">
                      <span className={`badge ${statusKamarColor(k.status)}`}>{statusKamarLabel(k.status)}</span>
                    </td>
                    <td className="py-2.5 text-gray-600">{penyewa ? namaPenyewa(penyewa.nama) : '-'}</td>
                    <td className="py-2.5 text-gray-400 text-xs">{k.fasilitas.slice(0, 3).join(', ')}{k.fasilitas.length > 3 ? '…' : ''}</td>
                    <td className="py-2.5 w-px">
                      {sewaAktif && (
                        <div className="w-28">
                          <CheckoutModal
                            sewa={ringkasSewa(k, sewaAktif)}
                            kamarTersedia={kamarTersediaUntuk(k.id)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {kamar.map(k => {
            const hargaBulanan = k.harga.find(h => h.periodeSewa === 'BULANAN')
            const sewaAktif = k.sewa[0]
            const penyewa = sewaAktif?.penyewa
            return (
              <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{k.nomor}</span>
                    <span className={`badge text-[10px] ${statusKamarColor(k.status)}`}>{statusKamarLabel(k.status)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {tipeKamarLabel[k.tipe]}{k.luas ? ` · ${k.luas}m²` : ''}
                    {hargaBulanan ? ` · ${formatRupiah(hargaBulanan.harga)}/bln` : ''}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {penyewa ? namaPenyewa(penyewa.nama) : '-'} · {k.fasilitas.slice(0, 2).join(', ')}{k.fasilitas.length > 2 ? '…' : ''}
                  </div>
                </div>
                {sewaAktif && (
                  <div className="w-24 shrink-0 ml-2">
                    <CheckoutModal
                      sewa={ringkasSewa(k, sewaAktif)}
                      kamarTersedia={kamarTersediaUntuk(k.id)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
