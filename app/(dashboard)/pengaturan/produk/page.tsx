'use client'
// app/(dashboard)/pengaturan/produk/page.tsx
//
// Master data produk jualan (minuman/makanan) per properti — kembar
// /pengaturan/fasilitas, tapi dengan harga & stok.
//
// Menghapus produk yang SUDAH PERNAH TERJUAL tidak menghapus barisnya, hanya
// menonaktifkannya: ItemPenjualan menyimpan produkId sebagai relasi, jadi
// menghapusnya akan memutus riwayat struk. Route yang memutuskan, halaman ini
// hanya melaporkan apa yang terjadi.
import { useEffect, useState } from 'react'
import {
  PlusLg, PencilSquare, Trash3, Check2, X,
  CheckCircleFill, ExclamationTriangleFill, InfoCircle,
} from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import {
  HARGA_PRODUK_MAKS, KATEGORI_MAKS, NAMA_PRODUK_MAKS, SARAN_KATEGORI, SATUAN_MAKS, STOK_MAKS,
} from '@/lib/produk'

type Produk = {
  id: string
  nama: string
  hargaJual: string | number
  hargaBeli: string | number | null
  stok: number
  satuan: string
  kategori: string | null
  aktif: boolean
  urutan: number
}

const rupiah = (n: unknown) => 'Rp ' + Number(n).toLocaleString('id-ID')

/** Kosong = null (modal memang boleh tak diketahui), selain itu angka bulat. */
function keAngka(t: string): number | null {
  const bersih = t.replace(/[^\d-]/g, '')
  if (bersih === '' || bersih === '-') return null
  const n = Number(bersih)
  return Number.isFinite(n) ? n : null
}

type BentukForm = {
  nama: string
  hargaJual: string
  hargaBeli: string
  stok: string
  satuan: string
  kategori: string
}

const FORM_KOSONG: BentukForm = { nama: '', hargaJual: '', hargaBeli: '', stok: '0', satuan: 'pcs', kategori: '' }

export default function ProdukPage() {
  const [daftar, setDaftar] = useState<Produk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [prosesId, setProsesId] = useState('')
  const [simpan, setSimpan] = useState(false)

  const [tampilNonaktif, setTampilNonaktif] = useState(false)
  const [form, setForm] = useState<BentukForm>(FORM_KOSONG)
  const [editId, setEditId] = useState('')

  async function muat() {
    setLoading(true)
    try {
      const res = await fetch('/api/produk?aktif=semua', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal memuat produk.'); return }
      setDaftar(data.produk ?? [])
      setError('')
    } catch {
      setError('Gagal memuat produk.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void muat() }, [])

  const terlihat = tampilNonaktif ? daftar : daftar.filter((p) => p.aktif)
  const jmlNonaktif = daftar.filter((p) => !p.aktif).length

  function mulaiEdit(p: Produk) {
    setEditId(p.id)
    setForm({
      nama: p.nama,
      hargaJual: String(Number(p.hargaJual)),
      hargaBeli: p.hargaBeli === null ? '' : String(Number(p.hargaBeli)),
      stok: String(p.stok),
      satuan: p.satuan,
      kategori: p.kategori ?? '',
    })
    setError(''); setPesan('')
  }

  function batalEdit() {
    setEditId(''); setForm(FORM_KOSONG)
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    const nama = form.nama.trim()
    const hargaJual = keAngka(form.hargaJual)
    if (!nama || simpan) return
    if (hargaJual === null || hargaJual < 0) { setError('Harga jual wajib diisi.'); return }

    setSimpan(true); setError(''); setPesan('')
    const isi = {
      nama,
      hargaJual,
      // String kosong -> null eksplisit: "kosongkan modal", bukan "jangan ubah".
      hargaBeli: form.hargaBeli.trim() === '' ? null : keAngka(form.hargaBeli),
      stok: keAngka(form.stok) ?? 0,
      satuan: form.satuan.trim() || 'pcs',
      kategori: form.kategori.trim() || null,
    }

    try {
      const res = await fetch('/api/produk', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { id: editId, ...isi } : isi),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menyimpan produk.'); return }
      setPesan(editId ? `"${nama}" disimpan.` : `"${nama}" ditambahkan.`)
      batalEdit()
      await muat()
    } catch {
      setError('Gagal menyimpan produk.')
    } finally {
      setSimpan(false)
    }
  }

  async function isiBawaan() {
    if (simpan) return
    setSimpan(true); setError(''); setPesan('')
    try {
      const res = await fetch('/api/produk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isiBawaan: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal mengisi produk bawaan.'); return }
      setPesan(data?.dibuat ? `${data.dibuat} produk bawaan ditambahkan.` : (data?.pesan ?? 'Daftar sudah terisi.'))
      await muat()
    } catch {
      setError('Gagal mengisi produk bawaan.')
    } finally {
      setSimpan(false)
    }
  }

  async function alihAktif(p: Produk) {
    if (prosesId) return
    setProsesId(p.id); setError(''); setPesan('')
    try {
      const res = await fetch('/api/produk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, aktif: !p.aktif }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? 'Gagal mengubah status.'); return }
      setPesan(p.aktif
        ? `"${p.nama}" disembunyikan dari halaman jual.`
        : `"${p.nama}" bisa dijual lagi.`)
      await muat()
    } catch {
      setError('Gagal mengubah status.')
    } finally {
      setProsesId('')
    }
  }

  async function hapus(p: Produk) {
    const lanjut = window.confirm(
      `Hapus "${p.nama}" dari daftar produk?\n\n` +
      'Kalau produk ini pernah terjual, datanya TIDAK dihapus — hanya ' +
      'disembunyikan, supaya riwayat penjualan dan struk lama tetap utuh.'
    )
    if (!lanjut) return

    setProsesId(p.id); setError(''); setPesan('')
    try {
      const res = await fetch(`/api/produk?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error?.message ?? data?.error ?? 'Gagal menghapus produk.'); return }
      setPesan(data?.dinonaktifkan ? (data?.pesan ?? `"${p.nama}" dinonaktifkan.`) : `"${p.nama}" dihapus.`)
      await muat()
    } catch {
      setError('Gagal menghapus produk.')
    } finally {
      setProsesId('')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
        <p className="text-sm text-gray-400">Produk yang bisa dijual</p>
      </div>

      <TabPengaturan aktif="/pengaturan/produk" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Produk</h2>
          <p className="text-sm text-gray-400">
            {terlihat.length} produk
            {jmlNonaktif > 0 ? ` · ${jmlNonaktif} disembunyikan` : ''}
          </p>
        </div>
        {daftar.length === 0 && !loading && (
          <button onClick={() => void isiBawaan()} disabled={simpan} className="btn btn-primary inline-flex items-center gap-1.5">
            <PlusLg size={14} aria-hidden="true" /> Isi produk bawaan
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
        <form onSubmit={kirim} className="space-y-2">
          <input
            className="input w-full"
            placeholder="Nama produk, mis. Air Mineral 600ml"
            value={form.nama}
            maxLength={NAMA_PRODUK_MAKS}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">Harga jual (Rp)</span>
              <input
                className="input w-full" inputMode="numeric"
                placeholder="4000"
                value={form.hargaJual}
                onChange={(e) => setForm({ ...form, hargaJual: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Modal / harga beli (Rp)</span>
              <input
                className="input w-full" inputMode="numeric"
                placeholder="boleh dikosongkan"
                value={form.hargaBeli}
                onChange={(e) => setForm({ ...form, hargaBeli: e.target.value })}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">Stok</span>
              <input
                className="input w-full" inputMode="numeric"
                value={form.stok}
                onChange={(e) => setForm({ ...form, stok: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Satuan</span>
              <input
                className="input w-full"
                placeholder="pcs"
                value={form.satuan}
                maxLength={SATUAN_MAKS}
                onChange={(e) => setForm({ ...form, satuan: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Kategori</span>
              <input
                className="input w-full"
                placeholder="Minuman"
                list="saran-kategori"
                value={form.kategori}
                maxLength={KATEGORI_MAKS}
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}
              />
            </label>
          </div>
          <datalist id="saran-kategori">
            {SARAN_KATEGORI.map((k) => <option key={k} value={k} />)}
          </datalist>

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={simpan || !form.nama.trim()} className="btn btn-primary inline-flex items-center gap-1.5">
              {editId ? <Check2 size={14} aria-hidden="true" /> : <PlusLg size={14} aria-hidden="true" />}
              {editId ? 'Simpan perubahan' : 'Tambah produk'}
            </button>
            {editId && (
              <button type="button" onClick={batalEdit} className="text-sm text-gray-500 inline-flex items-center gap-1">
                <X size={14} aria-hidden="true" /> Batal
              </button>
            )}
          </div>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Modal dipakai menghitung laba. Stok boleh dikosongkan (diisi 0). Stok bisa jadi
          minus kalau barang tetap dijual — itu tanda hitungan perlu diperiksa.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : daftar.length === 0 ? (
        <div className="card text-center py-14">
          <InfoCircle className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada produk</h2>
          <p className="text-sm text-gray-500 mt-1">
            Isi produk bawaan (air mineral, teh kotak, mie instan, …) lalu sunting harganya —
            atau tambah satu per satu.
          </p>
        </div>
      ) : (
        <>
          <div className="card divide-y divide-gray-100 p-0">
            {terlihat.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${p.aktif ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                    {p.nama}
                  </div>
                  <div className="text-xs text-gray-400">
                    {rupiah(p.hargaJual)}
                    {p.hargaBeli !== null ? ` · modal ${rupiah(p.hargaBeli)}` : ' · modal belum diisi'}
                    {' · '}
                    <span className={p.stok < 0 ? 'text-coral-600 font-medium' : p.stok === 0 ? 'text-amber-600' : ''}>
                      stok {p.stok} {p.satuan}
                    </span>
                    {p.kategori ? ` · ${p.kategori}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => void alihAktif(p)}
                  disabled={prosesId === p.id}
                  className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${
                    p.aktif
                      ? 'text-gray-500 border-gray-200 hover:bg-gray-50'
                      : 'text-amber-700 border-amber-200 bg-amber-50'
                  }`}
                >
                  {p.aktif ? 'Dijual' : 'Disembunyikan'}
                </button>
                <button
                  onClick={() => mulaiEdit(p)}
                  className="text-gray-400 hover:text-gray-700 p-1.5 shrink-0"
                  aria-label={`Ubah ${p.nama}`}
                >
                  <PencilSquare size={15} aria-hidden="true" />
                </button>
                <button
                  onClick={() => void hapus(p)}
                  disabled={prosesId === p.id}
                  className="text-gray-400 hover:text-coral-600 p-1.5 shrink-0"
                  aria-label={`Hapus ${p.nama}`}
                >
                  <Trash3 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          {jmlNonaktif > 0 && (
            <button
              onClick={() => setTampilNonaktif(!tampilNonaktif)}
              className="mt-3 text-sm text-gray-500 hover:text-gray-900"
            >
              {tampilNonaktif ? 'Sembunyikan yang nonaktif' : `Tampilkan ${jmlNonaktif} produk nonaktif`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
