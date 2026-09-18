'use client'
// app/(dashboard)/pengaturan/cetak/page.tsx
//
// Setelan cetak nota — ukuran kertas, koneksi, dan pratinjau.
//
// KENAPA ADA PRATINJAU DI SINI
// Salah pilih ukuran kertas tak terlihat sampai nota pertama tercetak, dan
// saat itu kasir sudah menyerahkan bon yang berlipat ke pelanggan. Pratinjau
// memakai fungsi yang SAMA dengan yang akan mencetak (`lib/cetak.ts`), jadi
// yang dilihat admin di layar persis bentuk yang keluar dari printer —
// termasuk jumlah kolomnya.
import { useEffect, useState } from 'react'
import { Printer, Check2, ArrowCounterclockwise, ExclamationTriangleFill, CupHot } from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import {
  JENIS_KONEKSI,
  NAMA_PRINTER_MAKS,
  PREF_CETAK_BAWAAN,
  UKURAN_KERTAS,
  barisDuaKolom,
  barisKiriKanan,
  barisTengah,
  garisKertas,
  kolomKertas,
  labelPrinter,
  type PrefCetak,
} from '@/lib/cetak'

export default function PengaturanCetakPage() {
  const [pref, setPref] = useState<PrefCetak>(PREF_CETAK_BAWAAN)
  const [loading, setLoading] = useState(true)
  const [simpan, setSimpan] = useState(false)
  const [pesan, setPesan] = useState('')
  const [error, setError] = useState('')

  const muat = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/properti/pref-cetak', { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? d?.error ?? 'Gagal memuat setelan.')
      setPref(d.pref)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void muat()
  }, [])

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPesan('')
    setSimpan(true)
    try {
      const res = await fetch('/api/properti/pref-cetak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pref }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? d?.error ?? 'Gagal menyimpan.')
      // Pakai nilai yang DIKEMBALIKAN server, bukan yang kita kirim: server
      // membuang field tak dikenal, dan menampilkan kiriman mentah akan
      // membuat form tampak berbeda dari yang benar-benar tersimpan.
      setPref(d.pref)
      setPesan('Setelan cetak tersimpan.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSimpan(false)
    }
  }

  async function kembaliBawaan() {
    if (!window.confirm('Kembalikan setelan cetak ke bawaan?')) return
    setError('')
    setPesan('')
    try {
      const res = await fetch('/api/properti/pref-cetak', { method: 'DELETE' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? 'Gagal mengembalikan.')
      setPref(d.pref)
      setPesan('Setelan cetak kembali ke bawaan.')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const kolom = kolomKertas(pref.kertas)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Pengaturan</h1>
      <p className="text-sm text-gray-400 mb-4">Setelan cetak nota untuk properti ini.</p>

      <TabPengaturan aktif="/pengaturan/cetak" />

      {error && (
        <div className="mb-4 rounded-lg border-l-4 border-l-coral-400 bg-coral-50 p-3 text-sm text-coral-600">{error}</div>
      )}
      {pesan && (
        <div className="mb-4 rounded-lg border-l-4 border-l-teal-400 bg-teal-50 p-3 text-sm text-teal-700 flex items-center gap-2">
          <Check2 aria-hidden="true" /> {pesan}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : (
        <form onSubmit={kirim} className="grid gap-6 md:grid-cols-2">
          {/* ── Kolom kiri: form ── */}
          <div className="space-y-5">
            <div>
              <span className="block text-xs text-gray-500 mb-2">Ukuran kertas</span>
              <div className="space-y-2">
                {(Object.keys(UKURAN_KERTAS) as (keyof typeof UKURAN_KERTAS)[]).map((k) => (
                  <label
                    key={k}
                    className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${
                      pref.kertas === k ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="kertas"
                      className="mt-0.5"
                      checked={pref.kertas === k}
                      onChange={() => setPref({ ...pref, kertas: k })}
                    />
                    <span>
                      <span className="block text-sm text-gray-900">{UKURAN_KERTAS[k].label}</span>
                      <span className="block text-[11px] text-gray-400">
                        {UKURAN_KERTAS[k].kolom} kolom karakter per baris
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">Jenis koneksi</span>
              <select
                className="input w-full"
                value={pref.koneksi}
                onChange={(e) => setPref({ ...pref, koneksi: e.target.value as PrefCetak['koneksi'] })}
              >
                {(Object.keys(JENIS_KONEKSI) as (keyof typeof JENIS_KONEKSI)[]).map((k) => (
                  <option key={k} value={k}>
                    {JENIS_KONEKSI[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">Printer terakhir</span>
              <input
                className="input w-full"
                value={pref.printer}
                maxLength={NAMA_PRINTER_MAKS}
                placeholder={pref.koneksi === 'bluetooth' ? 'Alamat MAC, mis. 66:1E:0C:2A:9F:31' : 'Alamat / IP printer'}
                onChange={(e) => setPref({ ...pref, printer: e.target.value })}
              />
              <span className="block text-[11px] text-gray-400 mt-1">
                Diisi otomatis saat kasir pertama kali mencetak. Boleh dikosongkan.
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={pref.salinan}
                onChange={(e) => setPref({ ...pref, salinan: e.target.checked })}
              />
              <span>
                <span className="block text-sm text-gray-900">Cetak salinan untuk pelanggan</span>
                <span className="block text-[11px] text-gray-400">Menghasilkan dua lembar bon per transaksi.</span>
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={pref.kakiNota}
                onChange={(e) => setPref({ ...pref, kakiNota: e.target.checked })}
              />
              <span>
                <span className="block text-sm text-gray-900">Cetak kalimat penutup & kontak</span>
                <span className="block text-[11px] text-gray-400">
                  Memakai nomor HP dan catatan dari tab Properti.
                </span>
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn btn-primary" disabled={simpan}>
                <Check2 aria-hidden="true" /> {simpan ? 'Menyimpan…' : 'Simpan'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={kembaliBawaan}>
                <ArrowCounterclockwise aria-hidden="true" /> Bawaan
              </button>
            </div>
          </div>

          {/* ── Kolom kanan: pratinjau ── */}
          <div>
            <span className="block text-xs text-gray-500 mb-2">
              Pratinjau · {kolom} kolom
            </span>
            <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
              <pre className="text-[11px] leading-tight text-teal-300 font-mono whitespace-pre">
                {pratinjau(pref)}
              </pre>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1">
              <CupHot aria-hidden="true" className="mt-0.5 shrink-0" />
              Panjang garis di bawah mengikuti lebar kertas yang dipilih. Kalau di printer asli
              hasilnya berlipat, ganti ke kertas yang lebih lebar.
            </p>

            {pref.printer === '' && (
              <p className="text-[11px] text-amber-600 mt-2 flex items-start gap-1">
                <ExclamationTriangleFill aria-hidden="true" className="mt-0.5 shrink-0" />
                Printer belum dipilih — kasir akan diminta memilih saat mencetak pertama kali.
              </p>
            )}

            <p className="text-[11px] text-gray-400 mt-2">
              Printer terakhir: <span className="text-gray-600">{labelPrinter(pref.printer)}</span>
            </p>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * Contoh nota memakai fungsi cetak yang sebenarnya — bukan contoh yang ditulis
 * ulang. Kalau `lib/cetak.ts` berubah, pratinjau ikut berubah; kalau contohnya
 * ditulis sendiri di sini, ia bisa menampilkan tata letak yang tak akan pernah
 * keluar dari printer.
 */
function pratinjau(p: PrefCetak): string {
  const k = p.kertas
  const baris = [
    barisTengah('ZXRoom', k),
    barisTengah('Contoh Penginapan', k),
    garisKertas(k, '='),
    barisKiriKanan('No: KR-0042', '18/09 19:30', k),
    barisKiriKanan('Ruang: Melati', 'Kasir: Ani', k),
    garisKertas(k),
    barisDuaKolom('Sewa 2 jam', '130.000', k),
    barisDuaKolom('Air mineral 2x', '10.000', k),
    garisKertas(k),
    barisDuaKolom('TOTAL', '140.000', k),
    barisDuaKolom('Jaminan', '50.000', k),
    garisKertas(k, '='),
  ]
  if (p.kakiNota) {
    baris.push(barisTengah('Terima kasih', k), barisTengah('0812-3456-7890', k))
  }
  if (p.salinan) {
    baris.push('', barisTengah('--- SALINAN ---', k))
  }
  return baris.join('\n')
}
