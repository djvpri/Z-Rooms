'use client'
// app/(dashboard)/booking/page.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupiah } from '@/lib/utils'

type Kamar = {
  id: string
  nomor: string
  tipe: string
  luas: number | null
  harga: { periodeSewa: string; harga: string }[]
}

const PERIODE = ['HARIAN', 'BULANAN', 'TAHUNAN']
const SUMBER = ['LANGSUNG', 'MAMIKOS', 'TRAVELOKA', 'BOOKING_COM', 'TOKOPEDIA', 'ONLINE_LAIN']
const PEKERJAAN = ['Mahasiswa', 'Karyawan Swasta', 'PNS / ASN', 'Wirausaha', 'Pensiunan', 'Lainnya']

export default function BookingPage() {
  const router = useRouter()
  const [kamarList, setKamarList] = useState<Kamar[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'INDIVIDU' | 'PERUSAHAAN'>('INDIVIDU')

  const [form, setForm] = useState({
    nama: '', nik: '', noHp: '', pekerjaan: 'Mahasiswa',
    namaPerusahaan: '', npwp: '',
    kamarId: '', periodeSewa: 'BULANAN', tanggalMasuk: '', durasi: 1,
    deposit: '', sumber: 'LANGSUNG', catatan: '',
  })

  useEffect(() => {
    fetch('/api/kamar?status=TERSEDIA')
      .then(r => r.json())
      .then(setKamarList)
  }, [])

  const kamarDipilih = kamarList.find(k => k.id === form.kamarId)
  const hargaKamar = kamarDipilih?.harga.find(h => h.periodeSewa === form.periodeSewa)
  const hargaNum = hargaKamar ? Number(hargaKamar.harga) : 0

  function set(key: string, val: string | number) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.kamarId || !form.tanggalMasuk) {
      setError('Pilih kamar dan tanggal masuk.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tipeEntitas: activeTab,
          durasi: Number(form.durasi),
          deposit: Number(form.deposit) || hargaNum * 2,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message ?? 'Gagal menyimpan booking')
      }
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center mt-20">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Booking berhasil disimpan!</h2>
        <p className="text-sm text-gray-500">Mengarahkan ke dashboard...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Booking / Sewa Baru</h1>
        <p className="text-sm text-gray-400">Catat penyewa baru dan buat tagihan otomatis</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Tab tipe entitas */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {(['INDIVIDU', 'PERUSAHAAN'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                activeTab === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'INDIVIDU' ? '👤 Individu' : '🏢 Perusahaan / Instansi'}
            </button>
          ))}
        </div>

        {/* Data penyewa */}
        <div className="card space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Data penyewa</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Nama lengkap *</label>
              <input className="form-input" value={form.nama} onChange={e => set('nama', e.target.value)} required placeholder="Nama sesuai KTP" />
            </div>
            <div>
              <label className="form-label">No. HP *</label>
              <input className="form-input" value={form.noHp} onChange={e => set('noHp', e.target.value)} required placeholder="08xx-xxxx-xxxx" />
            </div>
          </div>

          {activeTab === 'INDIVIDU' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">NIK (opsional)</label>
                <input className="form-input" value={form.nik} onChange={e => set('nik', e.target.value)} placeholder="16 digit NIK" maxLength={16} />
              </div>
              <div>
                <label className="form-label">Pekerjaan</label>
                <select className="form-input" value={form.pekerjaan} onChange={e => set('pekerjaan', e.target.value)}>
                  {PEKERJAAN.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Nama perusahaan *</label>
                <input className="form-input" value={form.namaPerusahaan} onChange={e => set('namaPerusahaan', e.target.value)} placeholder="PT. / CV. / Dinas ..." />
              </div>
              <div>
                <label className="form-label">NPWP (opsional)</label>
                <input className="form-input" value={form.npwp} onChange={e => set('npwp', e.target.value)} placeholder="00.000.000.0-000.000" />
              </div>
            </div>
          )}
        </div>

        {/* Detail sewa */}
        <div className="card space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Detail sewa</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Pilih kamar *</label>
              <select className="form-input" value={form.kamarId} onChange={e => set('kamarId', e.target.value)} required>
                <option value="">-- Pilih kamar --</option>
                {kamarList.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.nomor} — {k.tipe.charAt(0) + k.tipe.slice(1).toLowerCase()}{k.luas ? ` (${k.luas}m²)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Periode sewa</label>
              <select className="form-input" value={form.periodeSewa} onChange={e => set('periodeSewa', e.target.value)}>
                {PERIODE.map(p => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Tanggal masuk *</label>
              <input type="date" className="form-input" value={form.tanggalMasuk} onChange={e => set('tanggalMasuk', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Durasi ({form.periodeSewa === 'HARIAN' ? 'hari' : form.periodeSewa === 'BULANAN' ? 'bulan' : 'tahun'})</label>
              <input type="number" min={1} max={36} className="form-input" value={form.durasi} onChange={e => set('durasi', Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Harga sewa</label>
              <div className="form-input bg-gray-50 text-gray-500 cursor-not-allowed">
                {hargaNum > 0 ? formatRupiah(hargaNum) : 'Pilih kamar & periode dulu'}
              </div>
            </div>
            <div>
              <label className="form-label">Deposit (kosongkan = 2x sewa)</label>
              <input type="number" className="form-input" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder={hargaNum > 0 ? String(hargaNum * 2) : '0'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Sumber booking</label>
              <select className="form-input" value={form.sumber} onChange={e => set('sumber', e.target.value)}>
                {SUMBER.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Catatan</label>
              <input className="form-input" value={form.catatan} onChange={e => set('catatan', e.target.value)} placeholder="Motor, kebutuhan khusus, dll." />
            </div>
          </div>
        </div>

        {/* Ringkasan */}
        {kamarDipilih && hargaNum > 0 && (
          <div className="card bg-teal-50 border-teal-100">
            <h2 className="text-sm font-medium text-teal-800 mb-2">Ringkasan transaksi</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-teal-700">
                <span>Kamar {kamarDipilih.nomor} ({kamarDipilih.tipe.toLowerCase()})</span>
                <span>{formatRupiah(hargaNum)} × {form.durasi}</span>
              </div>
              <div className="flex justify-between text-teal-700">
                <span>Deposit</span>
                <span>{formatRupiah(Number(form.deposit) || hargaNum * 2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-teal-900 pt-1 border-t border-teal-200">
                <span>Total dibayar pertama</span>
                <span>{formatRupiah(hargaNum + (Number(form.deposit) || hargaNum * 2))}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-coral-50 text-coral-600 border border-coral-100 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Batal</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Menyimpan...' : '💾 Simpan Booking'}
          </button>
        </div>
      </form>
    </div>
  )
}
