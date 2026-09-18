'use client'
// app/(dashboard)/pengaturan/karaoke/page.tsx
//
// Kelola ruang karaoke + blok tarif per ruang.
//
// Bentuk layar: daftar ruang; klik satu ruang → editor blok tarifnya muncul.
// Blok dikirim SELURUHNYA saat simpan (bukan satu per satu) karena aturan "24
// jam tertutup" hanya bisa diperiksa pada keadaan utuh — lihat
// `app/api/karaoke/tarif/route.ts`.
//
// Pratinjau garis waktu di bawah editor bukan hiasan: ia menunjukkan apakah 24
// jam benar-benar tertutup SEBELUM menyimpan, jadi admin tak menemukan
// lubangnya dari pesan error.
import { useEffect, useMemo, useState } from 'react'
import { PlusLg, PencilSquare, Trash3, Check2, X, ExclamationTriangleFill, ClockHistory } from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import { HARGA_KARAOKE_MAKS, NAMA_RUANG_MAKS, menitKeJam, periksaBlok } from '@/lib/karaoke'

type Blok = { jamMulai: number; jamSelesai: number; hargaPerJam: string | number }
type Ruang = {
  id: string
  nama: string
  kapasitas: number | null
  aktif: boolean
  urutan: number
  tarif?: { id: string; jamMulai: number; jamSelesai: number; hargaPerJam: string | number }[]
}

const rupiah = (n: unknown) => 'Rp ' + Number(n).toLocaleString('id-ID')

/** "17:30" → 1050. Terima juga "1730" dan "17.30". */
function keMenit(t: string): number | null {
  const s = t.trim().replace(/[.:\s]/g, ':')
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (m) {
    const j = Number(m[1])
    const mi = Number(m[2])
    if (j >= 0 && j <= 24 && mi >= 0 && mi < 60) {
      // 24:00 sah sebagai batas akhir, 24:15 tidak.
      const total = j * 60 + mi
      return total <= 1440 ? total : null
    }
    return null
  }
  return null
}

const jamDariMenit = (menit: number) => menitKeJam(menit)

export default function KaraokePage() {
  const [daftar, setDaftar] = useState<Ruang[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')

  const [form, setForm] = useState({ nama: '', kapasitas: '' })
  const [editId, setEditId] = useState('')
  const [simpanRuang, setSimpanRuang] = useState(false)

  // Ruang yang sedang dibuka editor tarifnya + blok yang sedang disunting.
  const [bukaTarif, setBukaTarif] = useState('')
  const [blok, setBlok] = useState<{ jamMulai: string; jamSelesai: string; hargaPerJam: string }[]>([])
  const [simpanTarif, setSimpanTarif] = useState(false)

  async function muat() {
    setLoading(true)
    try {
      const res = await fetch('/api/karaoke/ruang?aktif=semua', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal memuat ruang.')
      setDaftar(data.ruang ?? [])
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

  async function kirimRuang(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPesan('')
    setSimpanRuang(true)
    try {
      const kapasitas = form.kapasitas.trim() === '' ? null : Number(form.kapasitas)
      if (kapasitas !== null && (!Number.isInteger(kapasitas) || kapasitas <= 0)) {
        throw new Error('Kapasitas harus bilangan bulat lebih dari 0.')
      }
      const res = await fetch('/api/karaoke/ruang', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId || undefined, nama: form.nama, kapasitas }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menyimpan ruang.')
      setPesan(editId ? 'Ruang diperbarui.' : `Ruang "${form.nama}" ditambahkan.`)
      setForm({ nama: '', kapasitas: '' })
      setEditId('')
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSimpanRuang(false)
    }
  }

  async function hapusRuang(r: Ruang) {
    if (!window.confirm(`Hapus ruang "${r.nama}"?\n\nRuang yang pernah dipakai tidak dihapus — hanya dinonaktifkan, supaya riwayat struk tetap utuh.`)) return
    setError('')
    setPesan('')
    try {
      const res = await fetch(`/api/karaoke/ruang?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menghapus ruang.')
      setPesan(data?.pesan ?? 'Ruang dihapus.')
      await muat()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function bukaEditorTarif(r: Ruang) {
    setError('')
    setPesan('')
    setBukaTarif(r.id)
    setBlok(
      (r.tarif ?? []).map((b) => ({
        jamMulai: jamDariMenit(b.jamMulai),
        jamSelesai: jamDariMenit(b.jamSelesai),
        hargaPerJam: String(b.hargaPerJam),
      })),
    )
  }

  // Blok terurai untuk pratinjau + validasi. Baris yang belum lengkap dibuang
  // dari pratinjau, bukan bikin halaman error.
  const blokTerurai = useMemo(() => {
    const hasil: { jamMulai: number; jamSelesai: number; hargaPerJam: number }[] = []
    for (const b of blok) {
      const mulai = keMenit(b.jamMulai)
      const selesai = keMenit(b.jamSelesai)
      const harga = Number(b.hargaPerJam.replace(/[^\d-]/g, ''))
      if (mulai === null || selesai === null || !Number.isFinite(harga)) continue
      hasil.push({ jamMulai: mulai, jamSelesai: selesai, hargaPerJam: harga })
    }
    return hasil
  }, [blok])

  const periksa = useMemo(() => periksaBlok(blokTerurai), [blokTerurai])
  const lengkap = blokTerurai.length === blok.length && blok.length > 0

  async function kirimTarif() {
    setError('')
    setPesan('')

    if (!lengkap) {
      setError('Ada baris blok yang belum lengkap. Isi jam mulai, jam selesai, dan harga.')
      return
    }
    if (blokTerurai.some((b) => b.hargaPerJam < 0 || b.hargaPerJam > HARGA_KARAOKE_MAKS)) {
      setError('Ada harga yang tidak wajar.')
      return
    }
    if (!periksa.ok) {
      setError(periksa.pesan ?? 'Blok tarif tidak valid.')
      return
    }

    setSimpanTarif(true)
    try {
      const res = await fetch('/api/karaoke/tarif', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruangId: bukaTarif, blok: blokTerurai }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menyimpan tarif.')
      setPesan('Tarif tersimpan.')
      setBukaTarif('')
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSimpanTarif(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mb-4">Pengaturan</h1>
      <TabPengaturan aktif="/pengaturan/karaoke" />

      <div className="mb-4">
        <h2 className="text-sm font-medium text-gray-900">Ruang karaoke</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Tiap ruang punya tarif sendiri. Tarif diatur per blok jam dan <strong>wajib menutup 24 jam</strong> —
          tanpa lubang, tanpa tumpang tindih. Sesi di jam berlubang tidak bisa dihargai, jadi sistem menolak
          menyimpan tarif yang belum lengkap.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border-l-4 border-l-coral-400 bg-coral-50 p-3 text-sm text-coral-600 flex items-start gap-2">
          <ExclamationTriangleFill className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {pesan && (
        <div className="mb-4 rounded-lg border-l-4 border-l-teal-400 bg-teal-50 p-3 text-sm text-teal-700">
          {pesan}
        </div>
      )}

      {/* Form ruang */}
      <form onSubmit={kirimRuang} className="rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[160px]">
            <span className="block text-xs text-gray-500 mb-1">Nama ruang</span>
            <input
              className="input w-full"
              value={form.nama}
              maxLength={NAMA_RUANG_MAKS}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="VIP 1"
              required
            />
          </label>
          <label className="w-28">
            <span className="block text-xs text-gray-500 mb-1">Kapasitas</span>
            <input
              className="input w-full"
              type="number"
              min={1}
              value={form.kapasitas}
              onChange={(e) => setForm((f) => ({ ...f, kapasitas: e.target.value }))}
              placeholder="opsional"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={simpanRuang}>
            {editId ? <Check2 aria-hidden="true" /> : <PlusLg aria-hidden="true" />}
            {simpanRuang ? 'Menyimpan…' : editId ? 'Simpan' : 'Tambah'}
          </button>
          {editId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditId('')
                setForm({ nama: '', kapasitas: '' })
              }}
            >
              <X aria-hidden="true" /> Batal
            </button>
          )}
        </div>
      </form>

      {loading && <p className="text-sm text-gray-400">Memuat…</p>}
      {!loading && daftar.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">
          Belum ada ruang karaoke. Tambahkan ruang pertama di atas.
        </p>
      )}

      <div className="space-y-3">
        {daftar.map((r) => {
          const jumlahBlok = r.tarif?.length ?? 0
          const adaTarif = jumlahBlok > 0
          return (
            <div key={r.id} className={`rounded-lg border p-4 ${r.aktif ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {r.nama}
                    {!r.aktif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">nonaktif</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.kapasitas ? `${r.kapasitas} orang · ` : ''}
                    {adaTarif ? `${jumlahBlok} blok tarif` : 'belum ada tarif'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => (bukaTarif === r.id ? setBukaTarif('') : bukaEditorTarif(r))}
                  >
                    <ClockHistory aria-hidden="true" /> {bukaTarif === r.id ? 'Tutup' : 'Tarif'}
                  </button>
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setEditId(r.id)
                      setForm({ nama: r.nama, kapasitas: r.kapasitas ? String(r.kapasitas) : '' })
                    }}
                  >
                    <PencilSquare aria-hidden="true" />
                  </button>
                  <button className="btn btn-ghost text-xs text-coral-600" onClick={() => hapusRuang(r)}>
                    <Trash3 aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Editor tarif */}
              {bukaTarif === r.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {/* Pratinjau 24 jam */}
                  <GarisWaktu blok={blokTerurai} sah={periksa.ok} />

                  <div className="space-y-2 mt-3">
                    {blok.map((b, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <label className="w-24">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Mulai</span>
                          <input
                            className="input w-full"
                            value={b.jamMulai}
                            onChange={(e) => setBlok((s) => s.map((x, j) => (i === j ? { ...x, jamMulai: e.target.value } : x)))}
                            placeholder="10:00"
                          />
                        </label>
                        <span className="pb-2 text-gray-300">–</span>
                        <label className="w-24">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Selesai</span>
                          <input
                            className="input w-full"
                            value={b.jamSelesai}
                            onChange={(e) => setBlok((s) => s.map((x, j) => (i === j ? { ...x, jamSelesai: e.target.value } : x)))}
                            placeholder="17:00"
                          />
                        </label>
                        <label className="flex-1">
                          <span className="block text-[11px] text-gray-500 mb-0.5">Harga / jam</span>
                          <input
                            className="input w-full"
                            value={b.hargaPerJam}
                            onChange={(e) => setBlok((s) => s.map((x, j) => (i === j ? { ...x, hargaPerJam: e.target.value } : x)))}
                            placeholder="50000"
                            inputMode="numeric"
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost text-xs text-coral-600 pb-2"
                          onClick={() => setBlok((s) => s.filter((_, j) => j !== i))}
                          aria-label="Hapus blok"
                        >
                          <Trash3 aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      onClick={() => setBlok((s) => [...s, { jamMulai: '', jamSelesai: '', hargaPerJam: '' }])}
                    >
                      <PlusLg aria-hidden="true" /> Tambah blok
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      title="Satu blok penuh 00:00-24:00"
                      onClick={() => setBlok([{ jamMulai: '00:00', jamSelesai: '24:00', hargaPerJam: blok[0]?.hargaPerJam ?? '' }])}
                    >
                      Satu tarif 24 jam
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary text-xs ml-auto"
                      onClick={kirimTarif}
                      disabled={simpanTarif || !periksa.ok}
                    >
                      <Check2 aria-hidden="true" /> {simpanTarif ? 'Menyimpan…' : 'Simpan tarif'}
                    </button>
                  </div>

                  {!periksa.ok && periksa.pesan && (
                    <p className="text-xs text-coral-600 mt-2 flex items-start gap-1.5">
                      <ExclamationTriangleFill className="shrink-0 mt-0.5" aria-hidden="true" />
                      {periksa.pesan}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Garis waktu 24 jam. Tiap blok jadi satu batang dengan lebar sebanding
 * durasinya. Lubang terlihat sebagai celah abu-abu, tumpang tindih ditandai
 * merah. Admin melihat masalahnya sebelum menyimpan, bukan dari pesan error.
 */
function GarisWaktu({
  blok,
  sah,
}: {
  blok: { jamMulai: number; jamSelesai: number; hargaPerJam: number }[]
  sah: boolean
}) {
  const urut = [...blok].sort((a, b) => a.jamMulai - b.jamMulai)
  const lebar = (b: { jamMulai: number; jamSelesai: number }) =>
    `${Math.max(0, ((b.jamSelesai - b.jamMulai) / 1440) * 100)}%`

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
        <span className="flex items-center gap-1">
          <ClockHistory size={11} aria-hidden="true" /> Sebaran tarif 24 jam
        </span>
        <span className={sah ? 'text-teal-600 font-medium' : 'text-coral-600 font-medium'}>
          {sah ? 'tertutup penuh' : 'belum tertutup'}
        </span>
      </div>
      <div className="h-6 w-full rounded bg-gray-100 flex overflow-hidden">
        {blok.map((b, i) => (
          <div
            key={i}
            className="h-full bg-teal-400/70 border-r border-white last:border-r-0 flex items-center justify-center"
            style={{ width: lebar(b) }}
            title={`${jamDariMenit(b.jamMulai)}–${jamDariMenit(b.jamSelesai)} · ${rupiah(b.hargaPerJam)}/jam`}
          >
            <span className="text-[9px] text-white font-medium truncate px-1">
              {b.jamSelesai - b.jamMulai >= 120 ? jamDariMenit(b.jamMulai) : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}
