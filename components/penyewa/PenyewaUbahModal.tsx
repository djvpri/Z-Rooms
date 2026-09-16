'use client'
// components/penyewa/PenyewaUbahModal.tsx
//
// Ubah data penyewa. Field & labelnya sama dengan form booking supaya kasir
// melihat istilah yang sama di dua tempat.
//
// Perubahan berlaku untuk SEMUA sewa & tagihan penyewa ini: Sewa dan Tagihan
// hanya menyimpan penyewaId, jadi tak ada salinan nama di dokumen. Karena itu
// nama lama ikut dicatat di server (riwayatNama) dan ditampilkan di sini.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check2, PencilSquare, ClockHistory } from 'react-bootstrap-icons'

export type PenyewaUbah = {
  id: string
  nama: string | null
  nik: string | null
  noHp: string | null
  email: string | null
  pekerjaan: string | null
  alamatAsal: string | null
  tipeEntitas: 'INDIVIDU' | 'PERUSAHAAN'
  namaPerusahaan: string | null
  npwp: string | null
  jumlahSewa: number
  riwayatNama: { nama: string; digantiPada: string }[]
}

export default function PenyewaUbahModal({ penyewa }: { penyewa: PenyewaUbah }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')

  const kosong = () => ({
    nama: penyewa.nama ?? '',
    nik: penyewa.nik ?? '',
    noHp: penyewa.noHp ?? '',
    email: penyewa.email ?? '',
    pekerjaan: penyewa.pekerjaan ?? '',
    alamatAsal: penyewa.alamatAsal ?? '',
    tipeEntitas: penyewa.tipeEntitas,
    namaPerusahaan: penyewa.namaPerusahaan ?? '',
    npwp: penyewa.npwp ?? '',
  })

  const [f, setF] = useState(kosong)

  function set<K extends keyof ReturnType<typeof kosong>>(k: K, v: string) {
    setF(p => ({ ...p, [k]: v }))
  }

  function bukaModal() {
    setF(kosong()); setError(''); setSukses(''); setBuka(true)
  }

  function tutup() {
    setBuka(false); setError(''); setSukses(''); setF(kosong())
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.nama.trim()) { setError('Nama penyewa wajib diisi.'); return }
    if (f.tipeEntitas === 'PERUSAHAAN' && !f.namaPerusahaan.trim()) {
      setError('Nama perusahaan wajib diisi untuk entitas perusahaan.'); return
    }

    setLoading(true)
    try {
      // Semua field dikirim apa adanya (termasuk '' -> null di server), supaya
      // mengosongkan NIK atau alamat benar-benar terhapus, bukan diabaikan.
      const res = await fetch(`/api/penyewa/${penyewa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: f.nama.trim(),
          nik: f.nik,
          noHp: f.noHp,
          email: f.email,
          pekerjaan: f.pekerjaan,
          alamatAsal: f.alamatAsal,
          tipeEntitas: f.tipeEntitas,
          namaPerusahaan: f.namaPerusahaan,
          npwp: f.npwp,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const fe = data?.error?.fieldErrors
        const pesan = fe ? Object.entries(fe).map(([k, v]: any) => `${k}: ${v.join(', ')}`).join(' · ')
          : data?.error?.message || data?.error
        setError(typeof pesan === 'string' && pesan ? pesan : 'Gagal menyimpan perubahan.')
        return
      }
      setSukses(`Data ${data?.nama ?? f.nama} diperbarui.`)
      router.refresh()
      setTimeout(() => { setSukses(''); setBuka(false) }, 1400)
    } catch (err: any) {
      setError('Terjadi kesalahan: ' + String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  const individu = f.tipeEntitas === 'INDIVIDU'

  return (
    <>
      <button type="button" onClick={bukaModal} className="btn btn-ghost px-2 py-1 text-xs"
        aria-label={`Ubah penyewa ${penyewa.nama ?? ''}`} title="Ubah penyewa">
        <PencilSquare size={13} aria-hidden="true" />
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Ubah penyewa {penyewa.nama ?? ''}</h2>
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
                  {/* Perubahan di sini berlaku ke seluruh riwayat sewa orang ini. */}
                  {penyewa.jumlahSewa > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      Perubahan berlaku untuk {penyewa.jumlahSewa}x sewa penyewa ini.
                      Nama lama tetap tercatat di riwayat.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Nama lengkap *</label>
                      <input className="form-input" value={f.nama} onChange={e => set('nama', e.target.value)}
                        placeholder="Nama sesuai KTP" required autoFocus />
                    </div>
                    <div>
                      <label className="form-label">No. HP</label>
                      <input className="form-input" value={f.noHp} onChange={e => set('noHp', e.target.value)}
                        placeholder="08xx-xxxx-xxxx" />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Bentuk entitas</label>
                    <select className="form-input" value={f.tipeEntitas}
                      onChange={e => set('tipeEntitas', e.target.value)}>
                      <option value="INDIVIDU">Individu</option>
                      <option value="PERUSAHAAN">Perusahaan</option>
                    </select>
                  </div>

                  {individu ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">NIK (opsional)</label>
                        <input className="form-input" value={f.nik} onChange={e => set('nik', e.target.value)}
                          placeholder="16 digit NIK" maxLength={16} />
                      </div>
                      <div>
                        <label className="form-label">Pekerjaan</label>
                        <input className="form-input" value={f.pekerjaan} onChange={e => set('pekerjaan', e.target.value)}
                          placeholder="Karyawan / Wiraswasta" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Nama perusahaan *</label>
                        <input className="form-input" value={f.namaPerusahaan}
                          onChange={e => set('namaPerusahaan', e.target.value)} placeholder="PT. / CV. / Dinas ..." />
                      </div>
                      <div>
                        <label className="form-label">NPWP (opsional)</label>
                        <input className="form-input" value={f.npwp} onChange={e => set('npwp', e.target.value)}
                          placeholder="00.000.000.0-000.000" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="form-label">Alamat (opsional)</label>
                    <input className="form-input" value={f.alamatAsal} onChange={e => set('alamatAsal', e.target.value)}
                      placeholder="Alamat asal sesuai KTP" />
                  </div>

                  <div>
                    <label className="form-label">Email (opsional)</label>
                    <input type="email" className="form-input" value={f.email} onChange={e => set('email', e.target.value)}
                      placeholder="nama@email.com" />
                  </div>

                  {/* Jejak nama lama supaya dokumen lama tetap bisa dilacak. */}
                  {penyewa.riwayatNama.length > 0 && (
                    <div>
                      <label className="form-label inline-flex items-center gap-1.5">
                        <ClockHistory size={13} aria-hidden="true" /> Nama sebelumnya
                      </label>
                      <div className="space-y-1">
                        {penyewa.riwayatNama.map((r, i) => (
                          <p key={i} className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">
                            {r.nama} · diganti {new Date(r.digantiPada).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        ))}
                      </div>
                    </div>
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
                    {loading ? 'Menyimpan...' : (<><Check2 aria-hidden="true" /> Simpan perubahan</>)}
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
