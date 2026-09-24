'use client'
// app/(dashboard)/karaoke/laporan/page.tsx
//
// Laporan pendapatan karaoke. Halaman terpisah dari `/keuangan`: keuangan
// menghitung uang hotel (sewa kamar, pengeluaran, piutang), karaoke unit usaha
// sendiri. Mencampur keduanya membuat pemilik harus memilah sendiri mana yang
// dari ruang karaoke.
//
// Angka di sini SEMUA datang dari server (`/api/karaoke/laporan`), yang membaca
// `totalSewa` dan `subtotal` yang tersimpan. Halaman tak menghitung ulang tarif:
// tarif boleh berubah besok, laporan bulan lalu tak boleh ikut berubah.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CashCoin, CupStraw, MusicNoteBeamed, Printer } from 'react-bootstrap-icons'

type Laporan = {
  dari: string
  sampai: string
  ringkasan: {
    totalSewa: number
    totalMinuman: number
    total: number
    totalJaminan: number
    jumlahSesi: number
    totalJam: number
    rataPerSesi: number
  }
  perRuang: { ruangId: string; nama: string; sesi: number; jam: number; sewa: number; minuman: number }[]
  perHari: { tanggal: string; sesi: number; sewa: number; minuman: number }[]
  perProduk: { nama: string; jumlah: number; subtotal: number }[]
  sesi: {
    id: string
    nomor: string
    ruang: string
    namaPelanggan: string | null
    mulaiPada: string
    selesaiAktual: string | null
    jumlahJam: number
    totalSewa: number
    totalMinuman: number
    jaminan: number
    lunas?: boolean
  }[]
}

const rupiah = (n: unknown) => 'Rp ' + Number(n).toLocaleString('id-ID')

/** "2026-09-01" untuk input type="date", dari waktu LOKAL (bukan UTC). */
function tanggalLokal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const jamMenit = (d: string) =>
  new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function LaporanKaraokePage() {
  // Bulan berjalan sebagai default, sama dengan halaman keuangan.
  const sekarang = new Date()
  const [dari, setDari] = useState(tanggalLokal(new Date(sekarang.getFullYear(), sekarang.getMonth(), 1)))
  const [sampai, setSampai] = useState(tanggalLokal(sekarang))

  const [data, setData] = useState<Laporan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      // Akhir hari, bukan jam 00:00: tanpa ini sesi yang mulai siang di tanggal
      // terakhir rentang akan terbuang.
      const res = await fetch(`/api/karaoke/laporan?dari=${dari}&sampai=${sampai}T23:59:59`, { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? d?.error ?? 'Gagal memuat laporan.')
      setData(d)
      setError('')
    } catch (e) {
      setError((e as Error).message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dari, sampai])

  useEffect(() => {
    void muat()
  }, [muat])

  const r = data?.ringkasan

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #laporan-karaoke, #laporan-karaoke * { visibility: visible !important; }
          #laporan-karaoke { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; }
          .tanpa-cetak { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-4 md:mb-6 tanpa-cetak">
        <div>
          <Link href="/karaoke" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 mb-1">
            <ArrowLeft aria-hidden="true" /> Karaoke
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Laporan Karaoke</h1>
          <p className="text-sm text-gray-400">
            {r ? `${r.jumlahSesi} sesi · ${r.totalJam} jam · ${rupiah(r.total)}` : 'Memuat…'}
          </p>
        </div>
        <button className="btn btn-ghost text-xs" onClick={() => window.print()} disabled={!data}>
          <Printer aria-hidden="true" /> Cetak
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 tanpa-cetak">
        <label>
          <span className="block text-xs text-gray-500 mb-1">Dari</span>
          <input className="input" type="date" value={dari} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label>
          <span className="block text-xs text-gray-500 mb-1">Sampai</span>
          <input className="input" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} />
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border-l-4 border-l-coral-400 bg-coral-50 p-3 text-sm text-coral-600">{error}</div>
      )}

      {loading && !data && <p className="text-sm text-gray-400">Memuat…</p>}

      {!loading && data && r && r.jumlahSesi === 0 && (
        <div className="text-center py-16 text-gray-400">
          <MusicNoteBeamed className="text-3xl mx-auto mb-2 opacity-40" aria-hidden="true" />
          <p className="text-sm">Belum ada sesi selesai pada rentang ini.</p>
        </div>
      )}

      {data && r && r.jumlahSesi > 0 && (
        <div id="laporan-karaoke">
          {/* Ringkasan */}
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MusicNoteBeamed aria-hidden="true" /> Sewa ruang
              </p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">{rupiah(r.totalSewa)}</p>
              <p className="text-[11px] text-gray-400">{r.totalJam} jam ditagih</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <CupStraw aria-hidden="true" /> Minuman
              </p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">{rupiah(r.totalMinuman)}</p>
              <p className="text-[11px] text-gray-400">{data.perProduk.length} jenis produk</p>
            </div>
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
              <p className="text-xs text-teal-700 flex items-center gap-1">
                <CashCoin aria-hidden="true" /> Total
              </p>
              <p className="text-lg font-semibold text-teal-800 tabular-nums">{rupiah(r.total)}</p>
              <p className="text-[11px] text-teal-600">rata {rupiah(r.rataPerSesi)} per sesi</p>
            </div>
          </div>

          {r.totalJaminan > 0 && (
            <p className="text-[11px] text-gray-400 mb-4">
              Jaminan tercatat {rupiah(r.totalJaminan)} — uang muka, BUKAN diskon. Tidak dikurangkan dari total di atas.
            </p>
          )}

          {/* Per ruang */}
          <h2 className="text-sm font-medium text-gray-900 mb-2">Per ruang</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-1.5">Ruang</th>
                  <th className="text-right py-1.5">Sesi</th>
                  <th className="text-right py-1.5">Jam</th>
                  <th className="text-right py-1.5">Sewa</th>
                  <th className="text-right py-1.5">Minuman</th>
                  <th className="text-right py-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.perRuang.map((x) => (
                  <tr key={x.ruangId} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-800">{x.nama}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{x.sesi}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{x.jam}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{rupiah(x.sewa)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{rupiah(x.minuman)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                      {rupiah(x.sewa + x.minuman)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per hari */}
          <h2 className="text-sm font-medium text-gray-900 mb-2">Per hari</h2>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-1.5">Tanggal</th>
                  <th className="text-right py-1.5">Sesi</th>
                  <th className="text-right py-1.5">Sewa</th>
                  <th className="text-right py-1.5">Minuman</th>
                  <th className="text-right py-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.perHari.map((x) => (
                  <tr key={x.tanggal} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-800">{x.tanggal}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{x.sesi}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{rupiah(x.sewa)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{rupiah(x.minuman)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                      {rupiah(x.sewa + x.minuman)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Produk terlaris */}
          {data.perProduk.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-gray-900 mb-2">Minuman terjual</h2>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-xs">
                  <thead className="text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-1.5">Produk</th>
                      <th className="text-right py-1.5">Jumlah</th>
                      <th className="text-right py-1.5">Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perProduk.map((x) => (
                      <tr key={x.nama} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-800">{x.nama}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{x.jumlah}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">{rupiah(x.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Daftar sesi — angka yang janggal harus bisa ditelusuri */}
          <h2 className="text-sm font-medium text-gray-900 mb-2">Sesi</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-1.5">Nomor</th>
                  <th className="text-left py-1.5">Ruang</th>
                  <th className="text-left py-1.5">Mulai</th>
                  <th className="text-left py-1.5">Pelanggan</th>
                  <th className="text-right py-1.5">Jam</th>
                  <th className="text-right py-1.5">Sewa</th>
                  <th className="text-right py-1.5">Minuman</th>
                  <th className="text-center py-1.5">Lunas</th>
                </tr>
              </thead>
              <tbody>
                {data.sesi.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-800">{s.nomor}</td>
                    <td className="py-1.5 text-gray-600">{s.ruang}</td>
                    <td className="py-1.5 text-gray-600">{jamMenit(s.mulaiPada)}</td>
                    <td className="py-1.5 text-gray-600">{s.namaPelanggan || 'Umum'}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{s.jumlahJam}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">{rupiah(s.totalSewa)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600">
                                          {s.totalMinuman > 0 ? rupiah(s.totalMinuman) : '—'}
                                        </td>
                                        <td className={`py-1.5 text-center ${s.lunas === false ? 'text-coral-600 font-medium' : 'text-gray-400'}`}>
                                          {s.lunas === false ? 'belum' : '✓'}
                                        </td>
                                      </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
