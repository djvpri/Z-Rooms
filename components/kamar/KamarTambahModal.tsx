'use client'
// components/kamar/KamarTambahModal.tsx
// Form tambah kamar. Endpoint POST /api/kamar sudah ada sejak lama tapi belum
// punya UI — komponen inilah pemanggilnya.
//
// Tipe kamar kini master data dari /pengaturan/tipe-kamar, bukan daftar lokal.
// Daftar lokal dulu memuat 'STUDIO' yang tak ada di enum Prisma, sehingga
// menambah kamar Studio selalu gagal 500.
//
// Harga tidak diisi di sini — tarif melekat pada tipe (Pengaturan → Tipe kamar).
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, PlusLg, Check2, InfoCircle } from 'react-bootstrap-icons'

export type TipeRingkas = { id: string; nama: string; fasilitas: string[] }

export default function KamarTambahModal({ daftarTipe = [] }: { daftarTipe?: TipeRingkas[] }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')
  // Saran dari master properti (Pengaturan → Fasilitas), bukan daftar hardcoded.
  const [saran, setSaran] = useState<string[]>([])

  useEffect(() => {
    let batal = false
    fetch('/api/fasilitas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (batal) return
        const aktif = (j?.fasilitas ?? []).filter((x: { aktif: boolean }) => x.aktif)
        setSaran(aktif.map((x: { nama: string }) => x.nama))
      })
      .catch(() => {})
    return () => { batal = true }
  }, [])

  const [f, setF] = useState({
    nomor: '', lantai: 1, tipeId: daftarTipe[0]?.id ?? '', luas: '',
    fasilitas: [] as string[],
  })

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF(p => ({ ...p, [k]: v }))
  }

  /** Pilih tipe: fasilitas tipe jadi awalan, tapi tetap bisa dicentang ulang. */
  function pilihTipe(id: string) {
    const tipe = daftarTipe.find(t => t.id === id)
    setF(p => ({ ...p, tipeId: id, fasilitas: tipe ? [...tipe.fasilitas] : p.fasilitas }))
  }

  function toggleFasilitas(nama: string) {
    setF(p => ({
      ...p,
      fasilitas: p.fasilitas.includes(nama) ? p.fasilitas.filter(x => x !== nama) : [...p.fasilitas, nama],
    }))
  }

  function reset() {
    setF({ nomor: '', lantai: 1, tipeId: daftarTipe[0]?.id ?? '', luas: '', fasilitas: [] })
    setError('')
  }

  function tutup() {
    setBuka(false); setError(''); setSukses(''); reset()
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.nomor.trim()) { setError('Nomor kamar wajib diisi.'); return }
    // Tipe wajib kini: harga sewa melekat pada tipe, jadi kamar tanpa tipe tak
    // bisa dihargai. Server juga menolaknya — cek di sini supaya pesannya jelas.
    if (!f.tipeId) { setError('Tipe kamar wajib dipilih. Tambahkan tipe dulu di Pengaturan → Tipe kamar.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/kamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomor: f.nomor.trim(),
          lantai: Number(f.lantai) || 1,
          tipeId: f.tipeId,
          ...(f.luas ? { luas: Number(f.luas) } : {}),
          fasilitas: f.fasilitas,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Zod error datang sebagai {error:{fieldErrors:{...}}} — ambil pesan pertama
        // yang bisa dibaca manusia, jangan tampilkan dump JSON mentah ke kasir.
        const fe = data?.error?.fieldErrors
        const pesan = fe ? Object.entries(fe).map(([k, v]: any) => `${k}: ${v.join(', ')}`).join(' · ')
          : data?.error?.message || data?.error?.formErrors?.join(', ')
        setError(pesan || 'Gagal menyimpan kamar.')
        return
      }
      setSukses(`Kamar ${data?.nomor ?? f.nomor} ditambahkan.`)
      reset()
      router.refresh()
      // biar kasir sempat lihat konfirmasi lalu modal menutup sendiri
      setTimeout(() => { setSukses(''); setBuka(false) }, 1400)
    } catch (err: any) {
      setError('Terjadi kesalahan: ' + String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className="btn btn-primary">
        <PlusLg aria-hidden="true" /> Tambah kamar
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Tambah kamar</h2>
              <button type="button" onClick={tutup} aria-label="Tutup" className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {sukses ? (
              <div className="px-5 py-10 text-center">
                <Check2 className="text-4xl text-teal-600 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900">{sukses}</p>
              </div>
            ) : (
              <form onSubmit={simpan}>
                <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Nomor kamar *</label>
                      <input className="form-input" value={f.nomor} onChange={e => set('nomor', e.target.value)}
                        placeholder="A-101" required autoFocus />
                    </div>
                    <div>
                      <label className="form-label">Lantai</label>
                      <input type="number" className="form-input" value={f.lantai} min={1}
                        onChange={e => set('lantai', Number(e.target.value))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Tipe</label>
                      <select className="form-input" value={f.tipeId} onChange={e => pilihTipe(e.target.value)}>
                        {daftarTipe.length === 0 && <option value="">Belum ada tipe</option>}
                        {daftarTipe.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Luas (m²)</label>
                      <input type="number" step="0.5" className="form-input" value={f.luas}
                        onChange={e => set('luas', e.target.value)} placeholder="12.5" />
                    </div>
                  </div>

                  {daftarTipe.length === 0 && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
                      <InfoCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        Belum ada tipe kamar. Tambahkan dulu di Pengaturan → Tipe kamar —
                        kamar baru wajib punya tipe karena harga sewanya ikut tipe.
                      </span>
                    </p>
                  )}

                  <div>
                    <label className="form-label">Fasilitas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set([...saran, ...f.fasilitas])].map(nama => {
                        const aktif = f.fasilitas.includes(nama)
                        return (
                          <button key={nama} type="button" onClick={() => toggleFasilitas(nama)}
                            className={`badge border transition-colors ${aktif
                              ? 'bg-teal-50 text-teal-700 border-teal-100'
                              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                            {aktif && <Check2 size={10} className="mr-1" aria-hidden="true" />}{nama}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {error && (
                    <div className="bg-coral-50 text-coral-600 border border-coral-100 rounded-lg px-3 py-2 text-sm">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-100">
                  <button type="button" onClick={tutup} className="btn btn-ghost">Batal</button>
                  <button type="submit" disabled={loading} className="btn btn-primary">
                    {loading ? 'Menyimpan...' : (<><Check2 aria-hidden="true" /> Simpan kamar</>)}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
