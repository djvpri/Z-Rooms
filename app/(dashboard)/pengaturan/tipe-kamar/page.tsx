'use client'
// app/(dashboard)/pengaturan/tipe-kamar/page.tsx
//
// Atur tipe kamar, fasilitas, dan HARGA tiap tipe.
//
// Fasilitas di sini adalah BAWAAN: kamar yang belum diisi fasilitas sendiri
// memakainya. Kamar yang sudah punya fasilitas sendiri tidak ditimpa — di data
// lama, kamar bertipe sama memang beda isinya, jadi menimpanya akan menghapus
// keterangan yang benar.
//
// Harga juga melekat pada tipe (HargaTipe), bukan per kamar. Kolom harga yang
// dibiarkan kosong berarti periode itu tidak disewakan untuk tipe ini.
import { useEffect, useState } from 'react'
import {
  PlusLg, PencilSquare, Trash3, Check2, CheckCircleFill,
  ExclamationTriangleFill, DoorClosed, InfoCircle,
} from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import { SARAN_FASILITAS, PERIODE_SEWA, LABEL_PERIODE, type PeriodeSewa } from '@/lib/tipeKamar'

type BarisHarga = { periodeSewa: PeriodeSewa; harga: number | string; deposit: number | string | null; aktif: boolean }

type Tipe = {
  id: string
  nama: string
  keterangan: string | null
  fasilitas: string[]
  urutan: number
  _count: { kamar: number }
  harga: BarisHarga[]
}

/** Rupiah tanpa desimal — harga selalu bulat. */
function rp(n: number) {
  return 'Rp' + n.toLocaleString('id-ID')
}

/** Nilai harga awal untuk form: '' kalau periode itu belum punya tarif. */
function hargaAwal(t: Tipe | null): Record<PeriodeSewa, string> {
  const keluar = {} as Record<PeriodeSewa, string>
  for (const p of PERIODE_SEWA) keluar[p] = ''
  for (const h of t?.harga ?? []) {
    if (h.aktif !== false) keluar[h.periodeSewa] = String(Number(h.harga))
  }
  return keluar
}

export default function TipeKamarPage() {
  const [daftar, setDaftar] = useState<Tipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [prosesId, setProsesId] = useState('')

  const [buka, setBuka] = useState(false)
  const [edit, setEdit] = useState<Tipe | null>(null)
  const [f, setF] = useState({ nama: '', keterangan: '', fasilitas: [] as string[], harga: hargaAwal(null) })
  const [simpan, setSimpan] = useState(false)

  async function muat() {
    try {
      const res = await fetch('/api/tipe-kamar')
      const json = await res.json()
      if (!res.ok) { setError(json?.error?.message ?? json?.error ?? 'Gagal memuat tipe kamar.'); return }
      setDaftar(json.tipe ?? [])
    } catch {
      setError('Gagal memuat tipe kamar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { muat() }, [])

  function bukaTambah() {
    setEdit(null)
    setF({ nama: '', keterangan: '', fasilitas: [], harga: hargaAwal(null) })
    setBuka(true); setError(''); setPesan('')
  }

  function bukaEdit(t: Tipe) {
    setEdit(t)
    setF({ nama: t.nama, keterangan: t.keterangan ?? '', fasilitas: [...t.fasilitas], harga: hargaAwal(t) })
    setBuka(true); setError(''); setPesan('')
  }

  /**
   * Ubah satu kolom harga. Hanya digit yang diterima supaya tak perlu membersihkan
   * titik/koma yang diketik kasir. String kosong = periode itu tidak disewakan.
   */
  function setHarga(p: PeriodeSewa, nilai: string) {
    const digit = nilai.replace(/\D/g, '').slice(0, 10)
    setF((prev) => ({ ...prev, harga: { ...prev.harga, [p]: digit } }))
  }

  function toggleFasilitas(nama: string) {
    setF((p) => ({
      ...p,
      fasilitas: p.fasilitas.includes(nama)
        ? p.fasilitas.filter((x) => x !== nama)
        : [...p.fasilitas, nama],
    }))
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nama.trim()) { setError('Nama tipe wajib diisi.'); return }

    setSimpan(true); setError('')
    try {
      // Kirim hanya periode yang diisi; yang kosong tidak ikut, dan server
      // menghapus tarif periode itu (artinya periode tak disewakan).
      const harga = PERIODE_SEWA
        .filter((p) => f.harga[p] !== '')
        .map((p) => ({ periodeSewa: p, harga: Number(f.harga[p]), aktif: true }))

      const res = await fetch('/api/tipe-kamar', {
        method: edit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(edit ? { id: edit.id } : {}),
          nama: f.nama.trim(),
          keterangan: f.keterangan.trim(),
          fasilitas: f.fasilitas,
          harga,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error?.message ?? data?.error ?? 'Gagal menyimpan tipe kamar.')
        return
      }
      setPesan(edit ? `Tipe ${f.nama.trim()} diperbarui.` : `Tipe ${f.nama.trim()} ditambahkan.`)
      setBuka(false)
      await muat()
    } catch (err: any) {
      setError('Terjadi kesalahan: ' + String(err?.message || err))
    } finally {
      setSimpan(false)
    }
  }

  async function hapus(t: Tipe) {
    const pakai = t._count.kamar
    const lanjut = confirm(
      pakai > 0
        ? `Hapus tipe "${t.nama}"? ${pakai} kamar yang memakainya akan dipindahkan ke tipe lain (kamarnya TIDAK terhapus).`
        : `Hapus tipe "${t.nama}"?`,
    )
    if (!lanjut) return

    setProsesId(t.id); setError(''); setPesan('')
    try {
      const res = await fetch(`/api/tipe-kamar?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menghapus tipe.'); return }
      const n = data?.kamarDipindah ?? 0
      setPesan(n > 0 ? `Tipe ${t.nama} dihapus. ${n} kamar dipindahkan ke ${data.keTipe}.` : `Tipe ${t.nama} dihapus.`)
      await muat()
    } catch {
      setError('Gagal menghapus tipe.')
    } finally {
      setProsesId('')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
        <p className="text-sm text-gray-400">Tipe kamar dan fasilitasnya</p>
      </div>

      <TabPengaturan aktif="/pengaturan/tipe-kamar" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Tipe kamar</h2>
          <p className="text-sm text-gray-400">{daftar.length} tipe</p>
        </div>
        <button onClick={bukaTambah} className="btn btn-primary inline-flex items-center gap-1.5">
          <PlusLg size={14} aria-hidden="true" /> Tambah tipe
        </button>
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

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : daftar.length === 0 ? (
        <div className="card text-center py-14">
          <DoorClosed className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada tipe kamar</h2>
          <p className="text-sm text-gray-500 mt-1">
            Tambahkan tipe seperti Standar atau Deluxe, lalu tentukan fasilitas bawaannya.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {daftar.map((t) => (
            <div key={t.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-gray-900 truncate">{t.nama}</h2>
                    <span className="badge bg-gray-100 text-gray-600 text-[10px] inline-flex items-center gap-1">
                      <DoorClosed size={9} aria-hidden="true" /> {t._count.kamar} kamar
                    </span>
                  </div>
                  {t.keterangan && <p className="text-xs text-gray-500 mt-1">{t.keterangan}</p>}

                  {t.fasilitas.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t.fasilitas.map((x) => (
                        <span key={x} className="text-[10px] bg-teal-50 text-teal-700 rounded-full px-2 py-0.5">{x}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">Belum ada fasilitas bawaan.</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    {PERIODE_SEWA.map((p) => {
                      const baris = t.harga.find((h) => h.periodeSewa === p && h.aktif !== false)
                      return (
                        <div key={p} className="text-xs">
                          <span className="text-gray-400">{LABEL_PERIODE[p]}</span>{' '}
                          <span className={baris ? 'font-medium text-gray-900' : 'text-gray-300'}>
                            {baris ? rp(Number(baris.harga)) : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => bukaEdit(t)} className="btn btn-ghost text-xs inline-flex items-center gap-1.5">
                    <PencilSquare size={13} aria-hidden="true" /> Edit
                  </button>
                  <button
                    onClick={() => hapus(t)}
                    disabled={prosesId === t.id}
                    className="btn btn-ghost text-xs text-coral-600 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash3 size={13} aria-hidden="true" /> Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6 inline-flex items-start gap-1.5">
        <InfoCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Fasilitas adalah bawaan tipe — kamar yang sudah diisi fasilitas sendiri tidak ditimpa.
          Harga juga milik tipe: semua kamar bertipe sama memakai tarif yang sama.
        </span>
      </p>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                {edit ? `Edit tipe ${edit.nama}` : 'Tambah tipe kamar'}
              </h2>
              <button type="button" onClick={() => setBuka(false)} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Tutup">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form onSubmit={kirim}>
              <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
                <div>
                  <label htmlFor="nama" className="form-label">Nama tipe *</label>
                  <input
                    id="nama" className="form-input" value={f.nama} required autoFocus
                    maxLength={40} placeholder="Standar / Deluxe / Family"
                    onChange={(e) => setF((p) => ({ ...p, nama: e.target.value }))}
                  />
                </div>

                <div>
                  <label htmlFor="keterangan" className="form-label">Keterangan</label>
                  <input
                    id="keterangan" className="form-input" value={f.keterangan} maxLength={120}
                    placeholder="Contoh: kamar lantai 2, jendela menghadap jalan"
                    onChange={(e) => setF((p) => ({ ...p, keterangan: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="form-label">Fasilitas bawaan</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SARAN_FASILITAS.map((nama) => {
                      const aktif = f.fasilitas.includes(nama)
                      return (
                        <button
                          key={nama} type="button" onClick={() => toggleFasilitas(nama)}
                          className={`badge border transition-colors ${aktif
                            ? 'bg-teal-50 text-teal-700 border-teal-100'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {aktif && <Check2 size={10} className="mr-1" aria-hidden="true" />}{nama}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Pilih yang berlaku umum untuk tipe ini. Perbedaan antar kamar diatur di kamarnya masing-masing.
                  </p>
                </div>

                <div>
                  <label className="form-label">Harga sewa per tipe</label>
                  <div className="grid grid-cols-2 gap-3">
                    {PERIODE_SEWA.map((p) => (
                      <div key={p}>
                        <label htmlFor={`harga-${p}`} className="text-xs text-gray-500">{LABEL_PERIODE[p]}</label>
                        <input
                          id={`harga-${p}`} className="form-input" inputMode="numeric"
                          value={f.harga[p]} placeholder="kosongkan bila tak disewakan"
                          onChange={(e) => setHarga(p, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Semua kamar bertipe ini memakai harga di sini. Kosongkan kolom yang tidak disewakan.
                  </p>
                </div>

                {error && (
                  <div className="bg-coral-50 text-coral-600 border border-coral-100 rounded-lg px-3 py-2 text-sm">{error}</div>
                )}
              </div>

              <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-100">
                <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost">Batal</button>
                <button type="submit" disabled={simpan} className="btn btn-primary">
                  {simpan ? 'Menyimpan...' : (<><Check2 aria-hidden="true" /> Simpan</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
