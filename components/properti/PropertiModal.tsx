'use client'
// components/properti/PropertiModal.tsx
// Form tambah/edit properti. Satu komponen untuk dua mode — `data` ada = edit.
// Nonaktifkan/aktifkan ditangani halaman (bukan modal) karena aksinya berbeda.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check2 } from 'react-bootstrap-icons'

export type PropertiData = {
  id: string
  nama: string
  tipe: string
  alamat: string
  kota: string
  provinsi: string
  deskripsi: string | null
  fasilitas: string[]
  // Muncul di nota cetak. Opsional: kosong -> nota pakai teks bawaan.
  noHp: string | null
  teksNota: string | null
}

const TIPE = [
  { v: 'KOS', l: 'Kos' },
  { v: 'KONTRAKAN', l: 'Kontrakan' },
  { v: 'HOTEL', l: 'Hotel' },
  { v: 'APARTEMEN', l: 'Apartemen' },
]

const FASILITAS_UMUM = [
  'WiFi', 'Parkir', 'CCTV', 'Penjaga 24 Jam', 'Dapur Bersama', 'Mesin Cuci',
  'Air Panas', 'Listrik Token', 'Laundry', 'Ruang Tamu', 'Kolam Renang', 'Gym',
]

const KOSONG = {
  nama: '', tipe: 'KOS', alamat: '', kota: '', provinsi: 'Kalimantan Barat',
  deskripsi: '', fasilitas: [] as string[], noHp: '', teksNota: '',
}

export default function PropertiModal({
  data, onTutup,
}: {
  data: PropertiData | null
  onTutup: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState(KOSONG)

  // Isi form saat modal dibuka untuk edit.
  useEffect(() => {
    if (data) {
      setF({
        nama: data.nama, tipe: data.tipe, alamat: data.alamat, kota: data.kota,
        provinsi: data.provinsi, deskripsi: data.deskripsi ?? '', fasilitas: data.fasilitas,
        noHp: data.noHp ?? '', teksNota: data.teksNota ?? '',
      })
    } else {
      setF(KOSONG)
    }
    setError('')
  }, [data])

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF(p => ({ ...p, [k]: v }))
  }

  function toggleFasilitas(nama: string) {
    setF(p => ({
      ...p,
      fasilitas: p.fasilitas.includes(nama)
        ? p.fasilitas.filter(x => x !== nama)
        : [...p.fasilitas, nama],
    }))
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.nama.trim()) { setError('Nama properti wajib diisi.'); return }
    if (!f.alamat.trim()) { setError('Alamat wajib diisi.'); return }
    if (!f.kota.trim()) { setError('Kota wajib diisi.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/properti', {
        method: data ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data ? { ...f, id: data.id } : f),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error?.message ?? json?.error ?? 'Gagal menyimpan properti.')
        return
      }
      onTutup()
      router.refresh()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onTutup}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{data ? 'Edit properti' : 'Tambah properti'}</h2>
          <button type="button" onClick={onTutup} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Tutup">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={simpan} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama properti</label>
            <input
              value={f.nama} onChange={e => set('nama', e.target.value)}
              placeholder="Mis. Hotel Demo"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
            <select
              value={f.tipe} onChange={e => set('tipe', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {TIPE.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
            <input
              value={f.alamat} onChange={e => set('alamat', e.target.value)}
              placeholder="Jln. Gajah Mada No. 88"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kota</label>
              <input
                value={f.kota} onChange={e => set('kota', e.target.value)}
                placeholder="Pontianak"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
              <input
                value={f.provinsi} onChange={e => set('provinsi', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor HP <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              value={f.noHp} onChange={e => set('noHp', e.target.value)}
              inputMode="tel" placeholder="0812-3456-7890"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="text-xs text-gray-400 mt-1">Muncul di nota cetak sebagai kontak yang bisa dihubungi.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teks nota bagian bawah <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              value={f.teksNota} onChange={e => set('teksNota', e.target.value)}
              rows={3} placeholder="Mis. Barang berharga harap dibawa pulang. Terima kasih."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Tampil di bagian bawah nota tagihan & nota booking. Kosongkan untuk memakai teks bawaan.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deskripsi <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              value={f.deskripsi} onChange={e => set('deskripsi', e.target.value)}
              rows={3} placeholder="Keterangan singkat properti"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fasilitas <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FASILITAS_UMUM.map(nama => {
                const aktif = f.fasilitas.includes(nama)
                return (
                  <button
                    key={nama} type="button" onClick={() => toggleFasilitas(nama)}
                    className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      aktif
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
                    }`}
                  >
                    {aktif && <Check2 size={12} />}
                    {nama}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onTutup}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold"
            >
              {loading ? 'Menyimpan...' : data ? 'Simpan perubahan' : 'Simpan properti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
