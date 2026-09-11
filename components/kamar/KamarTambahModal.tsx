'use client'
// components/kamar/KamarTambahModal.tsx
// Form tambah kamar. Endpoint POST /api/kamar sudah ada sejak lama tapi belum
// punya UI — komponen inilah pemanggilnya.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, PlusLg, Check2 } from 'react-bootstrap-icons'
import { formatRupiah } from '@/lib/utils'

const TIPE = ['STANDAR', 'DELUXE', 'VIP', 'SUITE', 'STUDIO'] as const
const TIPE_LABEL: Record<string, string> = {
  STANDAR: 'Standar', DELUXE: 'Deluxe', VIP: 'VIP', SUITE: 'Suite', STUDIO: 'Studio',
}
const FASILITAS_UMUM = ['AC', 'Kamar Mandi Dalam', 'Kasur Queen', 'Kasur King', 'Lemari', 'Meja', 'WiFi', 'TV', 'Dapur', 'Balkon']

export default function KamarTambahModal() {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')

  const [f, setF] = useState({
    nomor: '', lantai: 1, tipe: 'STANDAR', luas: '',
    fasilitas: [] as string[], hargaBulanan: '', depositBulanan: '',
    hargaHarian: '', hargaTahunan: '',
  })

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF(p => ({ ...p, [k]: v }))
  }

  function toggleFasilitas(nama: string) {
    setF(p => ({
      ...p,
      fasilitas: p.fasilitas.includes(nama) ? p.fasilitas.filter(x => x !== nama) : [...p.fasilitas, nama],
    }))
  }

  function reset() {
    setF({ nomor: '', lantai: 1, tipe: 'STANDAR', luas: '', fasilitas: [], hargaBulanan: '', depositBulanan: '', hargaHarian: '', hargaTahunan: '' })
    setError('')
  }

  function tutup() {
    setBuka(false); setError(''); setSukses(''); reset()
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const hargaBulanan = Number(f.hargaBulanan)
    if (!f.nomor.trim()) { setError('Nomor kamar wajib diisi.'); return }
    if (!hargaBulanan || hargaBulanan <= 0) { setError('Harga bulanan wajib diisi dan lebih dari 0.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/kamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomor: f.nomor.trim(),
          lantai: Number(f.lantai) || 1,
          tipe: f.tipe,
          ...(f.luas ? { luas: Number(f.luas) } : {}),
          fasilitas: f.fasilitas,
          hargaBulanan,
          // Kosong = biarkan server pakai default (2x harga bulanan / harga itu sendiri).
          ...(f.depositBulanan ? { depositBulanan: Number(f.depositBulanan) } : {}),
          ...(f.hargaHarian ? { hargaHarian: Number(f.hargaHarian) } : {}),
          ...(f.hargaTahunan ? { hargaTahunan: Number(f.hargaTahunan) } : {}),
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

  const hargaNum = Number(f.hargaBulanan) || 0
  const depositEfektif = f.depositBulanan ? Number(f.depositBulanan) : hargaNum * 2

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
                      <label className="form-label">Tipe *</label>
                      <select className="form-input" value={f.tipe} onChange={e => set('tipe', e.target.value)}>
                        {TIPE.map(t => <option key={t} value={t}>{TIPE_LABEL[t]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Luas (m²)</label>
                      <input type="number" step="0.5" className="form-input" value={f.luas}
                        onChange={e => set('luas', e.target.value)} placeholder="12.5" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Harga / bulan *</label>
                      <input type="number" className="form-input" value={f.hargaBulanan}
                        onChange={e => set('hargaBulanan', e.target.value)} placeholder="1000000" required />
                    </div>
                    <div>
                      <label className="form-label">Deposit</label>
                      <input type="number" className="form-input" value={f.depositBulanan}
                        onChange={e => set('depositBulanan', e.target.value)}
                        placeholder={hargaNum ? String(hargaNum * 2) : '2x sewa'} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Harga / hari (opsional)</label>
                      <input type="number" className="form-input" value={f.hargaHarian}
                        onChange={e => set('hargaHarian', e.target.value)} placeholder="—" />
                    </div>
                    <div>
                      <label className="form-label">Harga / tahun (opsional)</label>
                      <input type="number" className="form-input" value={f.hargaTahunan}
                        onChange={e => set('hargaTahunan', e.target.value)} placeholder="—" />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Fasilitas</label>
                    <div className="flex flex-wrap gap-1.5">
                      {FASILITAS_UMUM.map(nama => {
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

                  {hargaNum > 0 && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      Harga {formatRupiah(hargaNum)}/bulan · deposit {formatRupiah(depositEfektif)}
                    </p>
                  )}

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
