'use client'
// components/kamar/CheckoutModal.tsx
//
// Modal check-out: dibuka dari grid kamar (kamar TERISI). Alur:
//   1. Muat sisa tagihan sewa aktif -> kalau ada, tampilkan peringatan (tidak blokir).
//   2. Pilih perlakuan deposit: kembali penuh / sebagian / hangus.
//   3. POST /api/sewa/<id>/checkout.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check2, BoxArrowRight, ExclamationTriangle } from 'react-bootstrap-icons'
import { formatRupiah } from '@/lib/utils'

type Perlakuan = 'PENUH' | 'SEBAGIAN' | 'HANGUS'

export interface SewaAktif {
  id: string
  kamarNomor: string
  penyewaNama: string | null
  tanggalKeluar: string
  deposit: number
  sisaTagihan: number
  jumlahTagihan: number
}

export default function CheckoutModal({ sewa }: { sewa: SewaAktif }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [peringatan, setPeringatan] = useState('')   // 409 masih ada tagihan
  const [sukses, setSukses] = useState('')

  const [perlakuan, setPerlakuan] = useState<Perlakuan>('PENUH')
  const [kembali, setKembali] = useState('')
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [catatan, setCatatan] = useState('')

  const hariIni = new Date().toISOString().slice(0, 10)
  const kembaliNum = Math.min(Math.max(Number(kembali) || 0, 0), sewa.deposit)
  const efektifKembali = perlakuan === 'PENUH' ? sewa.deposit : perlakuan === 'HANGUS' ? 0 : kembaliNum
  const hangus = sewa.deposit - efektifKembali

  function tutup() {
    setBuka(false); setError(''); setPeringatan(''); setSukses('')
    setPerlakuan('PENUH'); setKembali(''); setCatatan('')
    setTanggal(new Date().toISOString().slice(0, 10))
  }

  async function kirim(paksa: boolean) {
    setError(''); setSukses('')
    if (perlakuan === 'SEBAGIAN' && (kembaliNum <= 0 || kembaliNum >= sewa.deposit)) {
      setError(`Nominal sebagian harus antara ${formatRupiah(1)} dan ${formatRupiah(sewa.deposit - 1)}.`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/sewa/${sewa.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deposit: perlakuan,
          depositKembali: perlakuan === 'SEBAGIAN' ? kembaliNum : 0,
          tanggalKeluarAktual: new Date(`${tanggal}T00:00:00`).toISOString(),
          ...(catatan.trim() ? { catatan: catatan.trim() } : {}),
          paksa,
        }),
      })
      const data = await res.json().catch(() => null)

      // 409 = masih ada tagihan belum lunas. Tidak memblokir, tapi user harus
      // menekan "Tetap check-out" secara sadar.
      if (res.status === 409 && data?.error === 'MASIH_ADA_TAGIHAN') {
        setPeringatan(data.pesan || 'Masih ada tagihan belum lunas.')
        return
      }
      if (!res.ok) {
        const fe = data?.error?.fieldErrors
        const pesan = fe ? Object.entries(fe).map(([k, v]: any) => `${k}: ${v.join(', ')}`).join(' · ')
          : data?.error?.message || data?.error
        setError(typeof pesan === 'string' ? pesan : 'Gagal check-out.')
        return
      }

      setSukses(`Kamar ${sewa.kamarNomor} dikosongkan.`)
      router.refresh()
      setTimeout(() => { setSukses(''); setBuka(false) }, 1400)
      setPeringatan('')
    } catch (err: any) {
      setError('Terjadi kesalahan: ' + String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="mt-2 w-full text-[11px] py-1 rounded-lg bg-white/70 hover:bg-white text-gray-700 border border-white/60 transition-colors"
      >
        Check-out
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <BoxArrowRight aria-hidden="true" /> Check-out kamar {sewa.kamarNomor}
              </h2>
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
              <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Ringkasan */}
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Penyewa</span>
                    <span className="text-gray-800 font-medium">{sewa.penyewaNama ?? 'Tanpa nama'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kontrak sampai</span>
                    <span className="text-gray-800">{new Date(sewa.tanggalKeluar).toLocaleDateString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deposit ditahan</span>
                    <span className="text-gray-800 font-medium">{formatRupiah(sewa.deposit)}</span>
                  </div>
                </div>

                {/* Peringatan tagihan belum lunas */}
                {(peringatan || sewa.sisaTagihan > 0) && (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-800 flex gap-2">
                    <ExclamationTriangle className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {peringatan || `Masih ada ${sewa.jumlahTagihan} tagihan belum lunas (${formatRupiah(sewa.sisaTagihan)}).`}
                      {' '}Check-out tetap bisa dilanjutkan, tagihan tetap tercatat sebagai belum lunas.
                    </span>
                  </div>
                )}

                {/* Perlakuan deposit */}
                <div>
                  <label className="form-label">Deposit</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: 'PENUH', l: 'Kembali penuh' },
                      { v: 'SEBAGIAN', l: 'Sebagian' },
                      { v: 'HANGUS', l: 'Hangus' },
                    ] as const).map(({ v, l }) => (
                      <button key={v} type="button" onClick={() => { setPerlakuan(v); setPeringatan('') }}
                        className={`px-2 py-2 rounded-lg text-xs border transition-colors ${perlakuan === v
                          ? 'bg-teal-50 text-teal-700 border-teal-200 font-medium'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {perlakuan === 'SEBAGIAN' && (
                  <div>
                    <label className="form-label">Dikembalikan ke penyewa</label>
                    <input type="number" className="form-input" value={kembali} min={1} max={sewa.deposit - 1}
                      onChange={e => setKembali(e.target.value)} placeholder="0" />
                  </div>
                )}

                {/* Dampak keuangan */}
                <div className="text-xs bg-gray-50 rounded-xl px-3 py-2.5 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dikembalikan</span>
                    <span className="text-gray-800">{formatRupiah(efektifKembali)} <span className="text-gray-400">(pengeluaran)</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hangus</span>
                    <span className={hangus > 0 ? 'text-teal-700 font-medium' : 'text-gray-800'}>
                      {formatRupiah(hangus)} <span className="text-gray-400">(pemasukan)</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Tanggal keluar</label>
                    <input type="date" className="form-input" value={tanggal} max={hariIni}
                      onChange={e => setTanggal(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Catatan</label>
                    <input className="form-input" value={catatan} onChange={e => setCatatan(e.target.value)}
                      placeholder="opsional" />
                  </div>
                </div>

                {error && <p className="text-xs text-coral-600">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={tutup} className="btn btn-ghost flex-1">Batal</button>
                  {peringatan ? (
                    <button type="button" onClick={() => kirim(true)} disabled={loading}
                      className="btn btn-primary flex-1">
                      {loading ? 'Memproses…' : 'Tetap check-out'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => kirim(false)} disabled={loading}
                      className="btn btn-primary flex-1">
                      {loading ? 'Memproses…' : 'Check-out'}
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-gray-400 text-center">
                  Sewa ditutup, kamar jadi Tersedia, uang titipan diselesaikan.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
