'use client'
// app/(dashboard)/pengaturan/fasilitas/page.tsx
//
// Master data daftar fasilitas properti. Sebelumnya saran fasilitas hardcoded
// di lib/tipeKamar.ts (SARAN_FASILITAS): tiap properti ditawari daftar yang
// sama, dan ejaannya gampang berbeda ("WiFi" vs "Wifi") — kalau beda, kamar
// yang harusnya sama jadi terlihat berbeda saat difilter.
//
// Menghapus di sini hanya membuang SARAN. Fasilitas yang sudah menempel di tipe
// atau kamar tetap ada (keduanya String[]). Dialog hapus melaporkan berapa yang
// masih memakainya supaya tak ada kejutan.
import { useEffect, useState } from 'react'
import {
  PlusLg, PencilSquare, Trash3, Check2, X,
  CheckCircleFill, ExclamationTriangleFill, InfoCircle,
} from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import { NAMA_FASILITAS_MAKS } from '@/lib/tipeKamar'

type Fasilitas = {
  id: string
  nama: string
  urutan: number
  aktif: boolean
  _count?: { tipe: number; kamar: number }
}

export default function FasilitasPage() {
  const [daftar, setDaftar] = useState<Fasilitas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [prosesId, setProsesId] = useState('')

  const [namaBaru, setNamaBaru] = useState('')
  const [simpan, setSimpan] = useState(false)
  const [editId, setEditId] = useState('')
  const [editNama, setEditNama] = useState('')

  async function muat() {
    setLoading(true)
    try {
      const res = await fetch('/api/fasilitas', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal memuat fasilitas.'); return }
      setDaftar(data.fasilitas ?? [])
      setError('')
    } catch {
      setError('Gagal memuat fasilitas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void muat() }, [])

  async function tambah(e: React.FormEvent) {
    e.preventDefault()
    const nama = namaBaru.trim()
    if (!nama || simpan) return
    setSimpan(true); setError(''); setPesan('')
    try {
      const res = await fetch('/api/fasilitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menambah fasilitas.'); return }
      setNamaBaru('')
      setPesan(`Fasilitas "${nama}" ditambahkan.`)
      await muat()
    } catch {
      setError('Gagal menambah fasilitas.')
    } finally {
      setSimpan(false)
    }
  }

  async function isiBawaan() {
    if (simpan) return
    setSimpan(true); setError(''); setPesan('')
    try {
      const res = await fetch('/api/fasilitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isiBawaan: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal mengisi daftar bawaan.'); return }
      setPesan(data?.dibuat ? `${data.dibuat} fasilitas bawaan ditambahkan.` : (data?.pesan ?? 'Daftar sudah terisi.'))
      await muat()
    } catch {
      setError('Gagal mengisi daftar bawaan.')
    } finally {
      setSimpan(false)
    }
  }

  async function simpanNama(id: string) {
    const nama = editNama.trim()
    if (!nama || simpan) return
    setSimpan(true); setError(''); setPesan('')
    try {
      const res = await fetch('/api/fasilitas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nama }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menyimpan.'); return }
      setEditId(''); setEditNama('')
      setPesan('Nama fasilitas disimpan.')
      await muat()
    } catch {
      setError('Gagal menyimpan.')
    } finally {
      setSimpan(false)
    }
  }

  async function alihAktif(f: Fasilitas) {
    if (prosesId) return
    setProsesId(f.id); setError(''); setPesan('')
    try {
      const res = await fetch('/api/fasilitas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, aktif: !f.aktif }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal mengubah status.'); return }
      setPesan(f.aktif
        ? `"${f.nama}" disembunyikan dari form (tipe lama tidak berubah).`
        : `"${f.nama}" ditawarkan lagi di form.`)
      await muat()
    } catch {
      setError('Gagal mengubah status.')
    } finally {
      setProsesId('')
    }
  }

  async function hapus(f: Fasilitas) {
    const lanjut = window.confirm(
      `Hapus "${f.nama}" dari daftar fasilitas?\n\n` +
      'Fasilitas ini juga akan DICABUT dari semua tipe kamar dan kamar yang ' +
      'memakainya. Tindakan ini tidak bisa dibatalkan.\n\n' +
      'Kalau hanya ingin menyembunyikannya dari form, pakai tombol Ditawarkan.'
    )
    if (!lanjut) return

    setProsesId(f.id); setError(''); setPesan('')
    try {
      const res = await fetch(`/api/fasilitas?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menghapus fasilitas.'); return }
      const t = data?.dicabut?.tipe ?? 0
      const km = data?.dicabut?.kamar ?? 0
      setPesan(t + km > 0
        ? `"${f.nama}" dihapus, dicabut dari ${t} tipe dan ${km} kamar.`
        : `"${f.nama}" dihapus.`)
      await muat()
    } catch {
      setError('Gagal menghapus fasilitas.')
    } finally {
      setProsesId('')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
        <p className="text-sm text-gray-400">Daftar fasilitas yang ditawarkan</p>
      </div>

      <TabPengaturan aktif="/pengaturan/fasilitas" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Fasilitas</h2>
          <p className="text-sm text-gray-400">
            {daftar.length} fasilitas
            {daftar.some((f) => !f.aktif) ? ` · ${daftar.filter((f) => !f.aktif).length} disembunyikan` : ''}
          </p>
        </div>
        {daftar.length === 0 && !loading && (
          <button onClick={() => void isiBawaan()} disabled={simpan} className="btn btn-primary inline-flex items-center gap-1.5">
            <PlusLg size={14} aria-hidden="true" /> Isi daftar bawaan
          </button>
        )}
      </div>

      {pesan && (
        <div className="mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <CheckCircleFill size={14} aria-hidden="true" /> {pesan}
        </div>
      )}
      {error && (
        <div className="mb-4 text-sm text-coral-600 bg-coral-50 border border-coral-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <ExclamationTriangleFill size={14} aria-hidden="true" /> {error}
        </div>
      )}

      <div className="card mb-4">
        <form onSubmit={tambah} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Nama fasilitas, mis. Kolam Renang"
            value={namaBaru}
            maxLength={NAMA_FASILITAS_MAKS}
            onChange={(e) => setNamaBaru(e.target.value)}
          />
          <button type="submit" disabled={simpan || !namaBaru.trim()} className="btn btn-primary inline-flex items-center gap-1.5">
            <PlusLg size={14} aria-hidden="true" /> Tambah
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Fasilitas di sini jadi pilihan saat menyusun fasilitas tipe kamar.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : daftar.length === 0 ? (
        <div className="card text-center py-14">
          <InfoCircle className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada daftar fasilitas</h2>
          <p className="text-sm text-gray-500 mt-1">
            Isi daftar bawaan (AC, WiFi, TV, …) lalu sunting seperlunya — atau tambah satu per satu.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100 p-0">
          {daftar.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2.5">
              {editId === f.id ? (
                <>
                  <input
                    autoFocus
                    className="input flex-1"
                    value={editNama}
                    maxLength={NAMA_FASILITAS_MAKS}
                    onChange={(e) => setEditNama(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void simpanNama(f.id) }
                      if (e.key === 'Escape') { setEditId(''); setEditNama('') }
                    }}
                  />
                  <button onClick={() => void simpanNama(f.id)} disabled={simpan} className="text-teal-700 p-1.5" aria-label="Simpan nama">
                    <Check2 size={16} aria-hidden="true" />
                  </button>
                  <button onClick={() => { setEditId(''); setEditNama('') }} className="text-gray-400 p-1.5" aria-label="Batal">
                    <X size={16} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${f.aktif ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                    {f.nama}
                  </span>
                  <button
                    onClick={() => void alihAktif(f)}
                    disabled={prosesId === f.id}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      f.aktif
                        ? 'text-gray-500 border-gray-200 hover:bg-gray-50'
                        : 'text-amber-700 border-amber-200 bg-amber-50'
                    }`}
                  >
                    {f.aktif ? 'Ditawarkan' : 'Disembunyikan'}
                  </button>
                  <button
                    onClick={() => { setEditId(f.id); setEditNama(f.nama) }}
                    className="text-gray-400 hover:text-gray-700 p-1.5"
                    aria-label={`Ubah ${f.nama}`}
                  >
                    <PencilSquare size={15} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => void hapus(f)}
                    disabled={prosesId === f.id}
                    className="text-gray-400 hover:text-coral-600 p-1.5"
                    aria-label={`Hapus ${f.nama}`}
                  >
                    <Trash3 size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
