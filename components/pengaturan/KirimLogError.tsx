'use client'
// components/pengaturan/KirimLogError.tsx
//
// Tombol kirim log error dari tab Pengaturan. Log dikumpulkan diam-diam sejak
// halaman dibuka (lib/logError.ts), lalu dikirim hanya saat kasir menekan
// tombol — supaya tak ada popup yang mengganggu saat aplikasi sedang dipakai.
//
// Dipisah dari FormPengaturan: form itu mengurus jam check-out dan pakai
// server action. Yang ini panggilan fetch sendiri dengan status sendiri, dan
// menggabungkannya akan membuat satu `useActionState` menanggung dua hal
// berbeda.
import { useEffect, useState } from 'react'
import { BugFill, CheckCircleFill, ExclamationTriangleFill } from 'react-bootstrap-icons'
import { isiLog, jumlahBaris, kosongkan, pasangPenangkap, perangkatId } from '@/lib/logError'

type Keadaan = { ok: boolean; pesan: string } | null

export default function KirimLogError({ versi }: { versi?: string }) {
  const [keadaan, setKeadaan] = useState<Keadaan>(null)
  const [sedang, setSedang] = useState(false)
  const [nama, setNama] = useState('')
  const [n, setN] = useState(0)

  // Penangkap dipasang setelah mount, bukan saat render: `window` tak ada di
  // server, dan memasangnya saat render akan berbeda antara HTML server dan
  // hasil hidrasi.
  useEffect(() => {
    pasangPenangkap()
    setN(jumlahBaris())

    // Nama perangkat diingat supaya kasir di HP yang sama tak mengetik ulang.
    try { setNama(localStorage.getItem('zxroom.namaPerangkat') ?? '') } catch { /* diblokir */ }

    // Jumlah error bertambah tanpa memicu render — disegarkan berkala saja.
    // Interval 2 detik cukup: angkanya informasi, bukan tombol.
    const t = setInterval(() => setN(jumlahBaris()), 2000)
    return () => clearInterval(t)
  }, [])

  async function kirim() {
    setSedang(true)
    setKeadaan(null)
    const isi = isiLog({ versi })
    try {
      try { localStorage.setItem('zxroom.namaPerangkat', nama) } catch { /* diblokir */ }

      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perangkat: perangkatId(), nama, konten: isi }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setKeadaan({ ok: false, pesan: data.error ?? `Gagal mengirim (HTTP ${res.status})` })
      } else if (data.dedup) {
        setKeadaan({ ok: true, pesan: 'Log yang sama sudah terkirim beberapa menit lalu — tidak dikirim ulang.' })
      } else {
        setKeadaan({ ok: true, pesan: `Log terkirim. ${n} kejadian ikut beserta.` })
        kosongkan()
        setN(0)
      }
    } catch {
      // Gagal jaringan: isi log SENGAJA tidak dikosongkan supaya kasir bisa
      // coba lagi tanpa kehilangan error yang sudah tertangkap.
      setKeadaan({ ok: false, pesan: 'Tak bisa menghubungi server. Periksa koneksi lalu coba lagi.' })
    } finally {
      setSedang(false)
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium text-gray-900 mb-1">Laporan masalah</h2>
      <p className="text-xs text-gray-500 mb-3">
        Kirim catatan error aplikasi ke pengembang. Berguna kalau ada yang tak
        berjalan semestinya — kamu tak perlu menyalin pesan error manual.
      </p>

      {keadaan && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-3 inline-flex items-start gap-2 ${
            keadaan.ok
              ? 'text-teal-700 bg-teal-50 border border-teal-100'
              : 'text-coral-600 bg-coral-50 border border-coral-100'
          }`}
        >
          {keadaan.ok
            ? <CheckCircleFill size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            : <ExclamationTriangleFill size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span>{keadaan.pesan}</span>
        </div>
      )}

      <div className="mb-3">
        <label htmlFor="namaPerangkat" className="form-label">Nama perangkat (opsional)</label>
        <input
          id="namaPerangkat"
          type="text"
          maxLength={60}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="mis. HP kasir depan"
          className="form-input"
        />
        <p className="text-xs text-gray-400 mt-1">
          Supaya pengembang tahu perangkat mana yang bermasalah kalau ada beberapa.
        </p>
      </div>

      <button
        type="button"
        onClick={kirim}
        disabled={sedang}
        className="btn btn-primary disabled:opacity-60 inline-flex items-center gap-2"
      >
        <BugFill size={14} aria-hidden="true" />
        {sedang ? 'Mengirim...' : 'Kirim log error'}
      </button>

      <p className="text-xs text-gray-400 mt-2">
        {n > 0
          ? `${n} kejadian tercatat sejak halaman ini dibuka.`
          : 'Belum ada error tercatat — log tetap bisa dikirim sebagai penanda.'}
      </p>
    </div>
  )
}
