'use client'

import { useState } from 'react'
import { Printer, CheckLg, CashCoin } from 'react-bootstrap-icons'
import { formatRupiah, namaPenyewa, formatTanggal, statusTagihanColor, statusTagihanLabel } from '@/lib/utils'
import {
  barisDuaKolom, barisKiriKanan, barisTengah, cetakNotaKasir,
  garisKertas, kertasPrefAktif,
} from '@/lib/cetak'

export type TagihanRow = {
  id: string
  nominal: number
  jatuhTempo: string
  status: string
  sewa: {
    kamar: { nomor: string }
    penyewa: { nama: string | null }
  }
  pembayaran: { metodeBayar: string | null }[]
}

// Identitas properti untuk kepala & kaki nota cetak. Opsional supaya komponen
// ini tetap bisa dipakai tanpa konteks properti (mis. di halaman lain nanti).
export type PropertiNota = {
  nama: string
  alamat: string
  kota: string
  provinsi: string
  noHp: string | null
  teksNota: string | null
}

export default function TagihanTable({ tagihan, bulanLabel, properti }: {
  tagihan: TagihanRow[]
  bulanLabel: string
  properti?: PropertiNota
}) {
  const [printTagihan, setPrintTagihan] = useState<TagihanRow | null>(null)
  const [bayarTagihan, setBayarTagihan] = useState<TagihanRow | null>(null)
  const [metodePilih, setMetodePilih] = useState<'TUNAI' | 'TRANSFER' | 'QRIS' | 'LAINNYA'>('TUNAI')
  const [pesanBayar, setPesanBayar] = useState('')
  const [mengirimBayar, setMengirimBayar] = useState(false)

  /**
   * Catat pembayaran satu tagihan: status LUNAS + baris Pembayaran.
   * Ini satu-satunya jalan keluar untuk tagihan BELUM_BAYAR pada sewa yang
   * sudah SELESAI — checkout hanya menawarkan "lunasi semua" SEBELUM tutup.
   */
  async function konfirmasiBayar() {
    if (!bayarTagihan || mengirimBayar) return
    setMengirimBayar(true)
    setPesanBayar('')
    try {
      const res = await fetch(`/api/tagihan/${bayarTagihan.id}/bayar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodeBayar: metodePilih }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPesanBayar(data?.error?.message ?? data?.error ?? 'Gagal mencatat pembayaran.')
        return
      }
      setBayarTagihan(null)
      setPesanBayar('')
      // Muat ulang data: baris tagihan & laporan pemasukan harus ikut berubah.
      window.location.reload()
    } catch {
      setPesanBayar('Gagal menghubungi server.')
    } finally {
      setMengirimBayar(false)
    }
  }
  const [pesanCetak, setPesanCetak] = useState('')
  const [mengirim, setMengirim] = useState(false)

  /**
   * Cetak nota tagihan ke printer Bluetooth lewat aplikasi Android.
   *
   * DULU tombol ini memanggil `window.print()`. Di WebView APK tak ada printer
   * sistem — nota tak pernah keluar dan modal hanya diam, terbaca kasir sebagai
   * "cetak rusak".
   */
  async function cetak(t: TagihanRow) {
    setMengirim(true)
    setPesanCetak('')
    try {
      const kertas = await kertasPrefAktif()
      const baris: string[] = [
        barisTengah(properti?.nama || 'ZXRoom', kertas),
        barisTengah('NOTA TAGIHAN SEWA', kertas),
        // Alamat '-' di DB mencetak "-, -" di nota (sama seperti bug booking),
        // jadi anggap '-' kosong.
        ...(properti?.alamat && properti.alamat !== '-' || properti?.kota && properti.kota !== '-'
          ? [barisTengah([properti?.alamat, properti?.kota].filter(v => v && v !== '-').join(', '), kertas)]
          : []),
        ...(properti?.noHp ? [barisTengah(`HP ${properti.noHp}`, kertas)] : []),
        garisKertas(kertas),
        barisDuaKolom('Kamar', t.sewa.kamar.nomor, kertas),
        barisDuaKolom('Penyewa', namaPenyewa(t.sewa.penyewa.nama), kertas),
        barisDuaKolom('Jatuh Tempo', formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'long', year: 'numeric' }), kertas),
        barisDuaKolom('Metode', t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-', kertas),
        barisDuaKolom('Status', statusTagihanLabel(t.status), kertas),
        garisKertas(kertas),
        barisKiriKanan('TOTAL', formatRupiah(t.nominal), kertas),
        ...(t.status === 'LUNAS' ? [barisTengah('LUNAS', kertas)] : []),
        garisKertas(kertas),
        barisTengah(properti?.teksNota || 'Terima kasih atas kepercayaan Anda.', kertas),
        garisKertas(kertas),
        barisTengah('Powered by ZXRoom', kertas),
      ]
      await cetakNotaKasir(baris)
      setPesanCetak('Nota terkirim ke printer.')
    } catch (e) {
      setPesanCetak(`Cetak gagal: ${(e as Error).message}`)
    } finally {
      setMengirim(false)
    }
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #nota-tagihan, #nota-tagihan * { visibility: visible !important; }
          #nota-tagihan {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100% !important; padding: 24px !important; background: white !important;
          }
        }
      `}</style>

      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Tagihan bulan {bulanLabel}</h2>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Kamar', 'Penyewa', 'Nominal', 'Jatuh Tempo', 'Status', 'Metode', ''].map(h => (
                  <th key={h} className="text-left py-2 text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tagihan.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{t.sewa.kamar.nomor}</td>
                  <td className="py-2.5 text-gray-600">{namaPenyewa(t.sewa.penyewa.nama)}</td>
                  <td className="py-2.5 text-gray-700 font-medium">{formatRupiah(t.nominal)}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'short' })}</td>
                  <td className="py-2.5">
                    <span className={`badge ${statusTagihanColor(t.status)}`}>{statusTagihanLabel(t.status)}</span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">{t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      {t.status !== 'LUNAS' && t.status !== 'DIBATALKAN' && (
                        <button
                          onClick={() => { setBayarTagihan(t); setPesanBayar('') }}
                          className="text-gray-400 hover:text-teal-600 transition-colors"
                          title="Catat pembayaran"
                        >
                          <CashCoin size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => setPrintTagihan(t)}
                        className="text-gray-400 hover:text-teal-600 transition-colors"
                        title="Cetak nota"
                      >
                        <Printer size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tagihan.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400 text-xs">Tidak ada tagihan bulan ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {tagihan.map(t => (
            <div key={t.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="font-medium text-gray-800 text-sm">Kamar {t.sewa.kamar.nomor}</span>
                  <span className="text-gray-600 text-sm ml-2">{namaPenyewa(t.sewa.penyewa.nama)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {t.status !== 'LUNAS' && t.status !== 'DIBATALKAN' && (
                    <button
                      onClick={() => { setBayarTagihan(t); setPesanBayar('') }}
                      className="text-gray-400 hover:text-teal-600"
                      title="Catat pembayaran"
                    >
                      <CashCoin size={14} />
                    </button>
                  )}
                  <button onClick={() => setPrintTagihan(t)} className="text-gray-400 hover:text-teal-600">
                    <Printer size={14} />
                  </button>
                  <span className={`badge text-[10px] shrink-0 ${statusTagihanColor(t.status)}`}>{statusTagihanLabel(t.status)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatRupiah(t.nominal)} · {formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'short' })}</span>
                <span>{t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</span>
              </div>
            </div>
          ))}
          {tagihan.length === 0 && (
            <p className="text-center text-gray-400 text-xs py-4">Tidak ada tagihan bulan ini.</p>
          )}
        </div>
      </div>

      {/* Modal Nota */}
      {printTagihan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div id="nota-tagihan" className="p-6 font-mono text-sm">
              <div className="text-center mb-4">
                <div className="text-lg font-bold flex items-center justify-center gap-2">
                  <i className="bi bi-house-door-fill text-teal-600" /> {properti?.nama ?? 'ZXRoom'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {properti
                    ? `${properti.alamat}, ${properti.kota}, ${properti.provinsi}`
                    : 'Sistem Manajemen Kos & Apartemen'}
                </div>
                {properti?.noHp && (
                  <div className="text-xs text-gray-500 mt-0.5">HP {properti.noHp}</div>
                )}
                <div className="border-t border-dashed border-gray-300 my-3" />
              </div>

              <div className="text-center text-xs font-medium text-gray-600 mb-3">NOTA TAGIHAN SEWA</div>

              <div className="space-y-1 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Kamar</span>
                  <span className="font-semibold">{printTagihan.sewa.kamar.nomor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Penyewa</span>
                  <span className="font-semibold">{namaPenyewa(printTagihan.sewa.penyewa.nama)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jatuh Tempo</span>
                  <span>{formatTanggal(printTagihan.jatuhTempo, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Metode</span>
                  <span>{printTagihan.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={printTagihan.status === 'LUNAS' ? 'text-teal-600 font-semibold' : 'text-amber-500 font-semibold'}>
                    {statusTagihanLabel(printTagihan.status)}
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />

              <div className="flex justify-between font-bold text-sm mb-3">
                <span>TOTAL</span>
                <span>{formatRupiah(printTagihan.nominal)}</span>
              </div>

              {printTagihan.status === 'LUNAS' && (
                <div className="border border-teal-400 rounded text-center text-teal-600 font-bold text-xs py-1 mb-3 tracking-widest">
                  <CheckLg className="inline mr-1" aria-hidden="true" />LUNAS
                </div>
              )}

              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="text-center text-xs text-gray-500 whitespace-pre-line">
                {properti?.teksNota
                  ? properti.teksNota
                  : <>
                      <p>Terima kasih atas kepercayaan Anda.</p>
                      <p>Simpan nota ini sebagai bukti pembayaran.</p>
                    </>}
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => cetak(printTagihan)}
                disabled={mengirim}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Printer size={14} /> {mengirim ? 'Mengirim…' : 'Cetak'}
              </button>
              <button
                onClick={() => setPrintTagihan(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                Tutup
              </button>
            </div>
            {pesanCetak && (
              <p className={`px-6 pb-5 pt-0 text-xs ${pesanCetak.startsWith('Nota') ? 'text-gray-500' : 'text-red-600'}`}>
                {pesanCetak}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal catat pembayaran */}
      {bayarTagihan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Catat pembayaran</h2>
              <p className="text-sm text-gray-400 mb-4">
                Kamar {bayarTagihan.sewa.kamar.nomor} · {namaPenyewa(bayarTagihan.sewa.penyewa.nama)}
              </p>

              <div className="flex justify-between font-bold text-sm mb-4">
                <span className="text-gray-500 font-medium">Jumlah</span>
                <span>{formatRupiah(bayarTagihan.nominal)}</span>
              </div>

              <label className="block text-xs font-medium text-gray-500 mb-1.5">Metode bayar</label>
              <select
                value={metodePilih}
                onChange={(e) => setMetodePilih(e.target.value as typeof metodePilih)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="TUNAI">Tunai</option>
                <option value="TRANSFER">Transfer</option>
                <option value="QRIS">QRIS</option>
                <option value="LAINNYA">Lainnya</option>
              </select>

              {pesanBayar && (
                <p className="text-xs text-red-600 mb-3">{pesanBayar}</p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => konfirmasiBayar()}
                disabled={mengirimBayar}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {mengirimBayar ? 'Menyimpan…' : 'Sudah dibayar'}
              </button>
              <button
                onClick={() => { setBayarTagihan(null); setPesanBayar('') }}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
