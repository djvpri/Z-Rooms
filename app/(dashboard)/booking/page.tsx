'use client'
// app/(dashboard)/booking/page.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, PersonFill, BuildingFill, FloppyFill } from 'react-bootstrap-icons'
import { formatRupiah, namaPenyewa, metodeBayarLabel } from '@/lib/utils'

type NotaBooking = {
  nama: string; noHp: string; kamarNomor: string; kamarTipe: string
  periodeSewa: string; tanggalMasuk: string; durasi: number
  harga: number; deposit: number; metodeBayar: string; bayarSekarang: boolean
  catatan: string; tanggalCetak: string
}

type Kamar = {
  id: string
  nomor: string
  tipe: string
  luas: number | null
  harga: { periodeSewa: string; harga: string }[]
}

type PenyewaHasil = {
  id: string
  nama: string | null
  nik: string | null
  noHp: string | null
  pekerjaan: string | null
  namaPerusahaan: string | null
  npwp: string | null
  tipeEntitas: 'INDIVIDU' | 'PERUSAHAAN'
  jumlahSewa: number
}

const PERIODE = ['HARIAN', 'BULANAN', 'TAHUNAN']
const METODE_BAYAR = ['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA'] as const
const PEKERJAAN = ['Mahasiswa', 'Karyawan Swasta', 'PNS / ASN', 'Wirausaha', 'Pensiunan', 'Lainnya']

export default function BookingPage() {
  const router = useRouter()
  const [kamarList, setKamarList] = useState<Kamar[]>([])
  const [loading, setLoading] = useState(false)
  const [nota, setNota] = useState<NotaBooking | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'INDIVIDU' | 'PERUSAHAAN'>('INDIVIDU')

  // Pencarian penyewa lama. `penyewaId` kosong = penyewa baru.
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState<PenyewaHasil[]>([])
  const [penyewaId, setPenyewaId] = useState('')
  const [penyewaNama, setPenyewaNama] = useState('')

  const [form, setForm] = useState({
    nama: '', nik: '', noHp: '', pekerjaan: 'Mahasiswa',
    namaPerusahaan: '', npwp: '',
    kamarId: '', periodeSewa: 'HARIAN', tanggalMasuk: '', durasi: 1,
    deposit: '', metodeBayar: 'TUNAI', bayarSekarang: true, catatan: '',
  })

  useEffect(() => {
    fetch('/api/kamar?status=TERSEDIA')
      .then(r => r.json())
      .then(setKamarList)
  }, [])

  // Cari penyewa lama. Dibatasi >=2 huruf supaya tak menarik seluruh tabel,
  // dan di-debounce 300ms supaya tiap ketikan tidak jadi satu request.
  useEffect(() => {
    const q = cari.trim()
    if (q.length < 2) { setHasil([]); return }
    const t = setTimeout(() => {
      fetch(`/api/penyewa?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setHasil(d.data ?? []))
        .catch(() => setHasil([]))
    }, 300)
    return () => clearTimeout(t)
  }, [cari])

  function pilihPenyewa(p: PenyewaHasil) {
    setPenyewaId(p.id)
    setPenyewaNama(p.nama ?? '')
    setActiveTab(p.tipeEntitas)
    setForm(f => ({
      ...f,
      nama: p.nama ?? '', nik: p.nik ?? '', noHp: p.noHp ?? '',
      pekerjaan: p.pekerjaan || 'Mahasiswa',
      namaPerusahaan: p.namaPerusahaan ?? '', npwp: p.npwp ?? '',
    }))
    setCari(''); setHasil([])
  }

  function penyewaBaru() {
    setPenyewaId(''); setPenyewaNama('')
    setForm(f => ({
      ...f, nama: '', nik: '', noHp: '',
      pekerjaan: 'Mahasiswa', namaPerusahaan: '', npwp: '',
    }))
  }

  const kamarDipilih = kamarList.find(k => k.id === form.kamarId)
  const hargaKamar = kamarDipilih?.harga.find(h => h.periodeSewa === form.periodeSewa)
  const hargaNum = hargaKamar ? Number(hargaKamar.harga) : 0

  function set(key: string, val: string | number | boolean) {
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
          deposit: Number(form.deposit) || 0,
          bayarSekarang: form.bayarSekarang,
          penyewaId: penyewaId || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        let msg: string
        if (typeof data.error === 'string') {
          msg = data.error
        } else if (data.error?.fieldErrors) {
          const fields = Object.entries(data.error.fieldErrors as Record<string, string[]>)
          msg = fields.map(([k, v]) => `${k}: ${v[0]}`).join(', ')
        } else {
          msg = data.error?.message ?? data.message ?? `Booking gagal (${res.status})`
        }
        throw new Error(msg)
      }
      setNota({
        nama: form.nama,
        noHp: form.noHp,
        kamarNomor: kamarDipilih?.nomor ?? '',
        kamarTipe: kamarDipilih?.tipe ?? '',
        periodeSewa: form.periodeSewa,
        tanggalMasuk: form.tanggalMasuk,
        durasi: Number(form.durasi),
        harga: hargaNum,
        deposit: Number(form.deposit) || 0,
        metodeBayar: form.metodeBayar,
        bayarSekarang: form.bayarSekarang,
        catatan: form.catatan,
        tanggalCetak: new Date().toISOString(),
      })
      // Reset pilihan penyewa: kalau tidak, booking berikutnya ikut memakai
      // penyewa lama tanpa kasir menyadarinya.
      penyewaBaru()
      setForm(f => ({ ...f, kamarId: '', catatan: '', deposit: '' }))
      fetch('/api/kamar?status=TERSEDIA').then(r => r.json()).then(setKamarList)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const PERIODE_LABEL: Record<string, string> = { HARIAN: 'Harian', BULANAN: 'Bulanan', TAHUNAN: 'Tahunan' }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #nota-booking, #nota-booking * { visibility: visible !important; }
          #nota-booking {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100% !important; padding: 24px !important; background: white !important;
          }
        }
      `}</style>
      <div className="mb-4 md:mb-6">
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
              <span className="inline-flex items-center gap-1.5">
                {t === 'INDIVIDU' ? <PersonFill aria-hidden="true" /> : <BuildingFill aria-hidden="true" />}
                {t === 'INDIVIDU' ? 'Individu' : 'Perusahaan / Instansi'}
              </span>
            </button>
          ))}
        </div>

        {/* Pilih penyewa lama — sekali klik, data terisi; tak perlu ketik ulang. */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Penyewa</h2>
            {penyewaNama && (
              <button type="button" onClick={penyewaBaru}
                className="text-xs text-teal-700 hover:underline">
                Ganti ke penyewa baru
              </button>
            )}
          </div>

          {penyewaNama ? (
            <div className="flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2">
              <span className="text-sm text-teal-900">
                <PersonFill aria-hidden="true" className="inline mr-1.5" />
                Penyewa terdaftar: <strong>{penyewaNama}</strong>
              </span>
              <span className="text-xs text-teal-700">Riwayat sewa disatukan</span>
            </div>
          ) : (
            <div className="relative">
              <input
                className="form-input"
                value={cari}
                onChange={e => setCari(e.target.value)}
                placeholder="Ketik nama / NIK / no. HP penyewa lama, atau isi data baru di bawah"
              />
              {hasil.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {hasil.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pilihPenyewa(p)}
                        className="w-full px-3 py-2 text-left hover:bg-teal-50">
                        <div className="text-sm text-gray-900">{p.nama ?? '(tanpa nama)'}</div>
                        <div className="text-xs text-gray-500">
                          {[p.noHp, p.nik ? `NIK ${p.nik}` : null, `${p.jumlahSewa} sewa`]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Data penyewa */}
        <div className="card space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Data penyewa</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Nama lengkap</label>
              <input className="form-input" value={form.nama} onChange={e => set('nama', e.target.value)} placeholder="Nama sesuai KTP" />
            </div>
            <div>
              <label className="form-label">No. HP</label>
              <input className="form-input" value={form.noHp} onChange={e => set('noHp', e.target.value)} placeholder="08xx-xxxx-xxxx" />
            </div>
          </div>

          {activeTab === 'INDIVIDU' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Tanggal masuk *</label>
              <input type="date" className="form-input" value={form.tanggalMasuk} onChange={e => set('tanggalMasuk', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Durasi ({form.periodeSewa === 'HARIAN' ? 'hari' : form.periodeSewa === 'BULANAN' ? 'bulan' : 'tahun'})</label>
              <input type="number" min={1} max={36} className="form-input" value={form.durasi} onChange={e => set('durasi', Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Harga sewa</label>
              <div className="form-input bg-gray-50 text-gray-500 cursor-not-allowed">
                {hargaNum > 0 ? formatRupiah(hargaNum) : 'Pilih kamar & periode dulu'}
              </div>
            </div>
            <div>
              <label className="form-label">Deposit (kosongkan = 0)</label>
              <input type="number" className="form-input" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Pembayaran</label>
              <select className="form-input" value={form.metodeBayar} onChange={e => set('metodeBayar', e.target.value)} disabled={!form.bayarSekarang}>
                {METODE_BAYAR.map(m => <option key={m} value={m}>{metodeBayarLabel(m)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Catatan</label>
              <input className="form-input" value={form.catatan} onChange={e => set('catatan', e.target.value)} placeholder="Motor, kebutuhan khusus, dll." />
            </div>
          </div>

          {/* Bayar sekarang / bayar nanti. Bukan toggle: dua pilihan yang saling
              meniadakan, dan "bayar nanti" adalah perilaku default lama. */}
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="bayarSekarang" className="mt-1" checked={form.bayarSekarang}
                onChange={() => set('bayarSekarang', true)} />
              <span className="text-sm text-gray-700">
                Bayar sekarang
                <span className="block text-xs text-gray-400">
                  {hargaNum > 0 ? `${formatRupiah(hargaNum)} langsung tercatat lunas` : 'Tagihan langsung tercatat lunas'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="bayarSekarang" className="mt-1" checked={!form.bayarSekarang}
                onChange={() => set('bayarSekarang', false)} />
              <span className="text-sm text-gray-700">
                Bayar saat check-out
                <span className="block text-xs text-gray-400">
                  Tagihan jatuh tempo 3 hari setelah masuk, dilunasi lewat modal check-out kamar
                </span>
              </span>
            </label>
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
                <span>{formatRupiah(Number(form.deposit) || 0)}</span>
              </div>
              <div className="flex justify-between font-semibold text-teal-900 pt-1 border-t border-teal-200">
                <span>{form.bayarSekarang ? 'Total dibayar' : 'Total dibayar pertama'}</span>
                <span>{formatRupiah(hargaNum + (Number(form.deposit) || 0))}</span>
              </div>
              <div className="text-xs text-teal-600 pt-1">
                {form.bayarSekarang
                  ? 'Sewa langsung tercatat lunas. Deposit diselesaikan saat check-out.'
                  : 'Tagihan sewa belum lunas — bisa dilunasi kapan saja atau saat check-out.'}
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
            {loading ? 'Menyimpan...' : (<><FloppyFill aria-hidden="true" /> Simpan Booking</>)}
          </button>
        </div>
      </form>

      {/* Modal Nota Booking */}
      {nota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div id="nota-booking" className="p-6 font-mono text-sm">
              <div className="text-center mb-4">
                <div className="text-lg font-bold flex items-center justify-center gap-2">
                  <i className="bi bi-house-door-fill text-teal-600" /> ZXRoom
                </div>
                <div className="text-xs text-gray-500 mt-1">Sistem Manajemen Kos & Apartemen</div>
                <div className="border-t border-dashed border-gray-300 my-3" />
              </div>

              <div className="text-center text-xs font-medium text-gray-600 mb-3">NOTA BOOKING SEWA</div>

              <div className="space-y-1 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tanggal</span>
                  <span>{new Date(nota.tanggalCetak).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />

              <div className="space-y-1 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Penyewa</span>
                  <span className="font-semibold">{namaPenyewa(nota.nama)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">No. HP</span>
                  <span>{nota.noHp || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Kamar</span>
                  <span className="font-semibold">{nota.kamarNomor} ({nota.kamarTipe.toLowerCase()})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Periode</span>
                  <span>{PERIODE_LABEL[nota.periodeSewa] ?? nota.periodeSewa}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tanggal Masuk</span>
                  <span>{new Date(nota.tanggalMasuk).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Durasi</span>
                  <span>{nota.durasi} {nota.periodeSewa === 'HARIAN' ? 'hari' : nota.periodeSewa === 'BULANAN' ? 'bulan' : 'tahun'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pembayaran</span>
                  <span>{nota.bayarSekarang ? metodeBayarLabel(nota.metodeBayar) : 'Bayar saat check-out'}</span>
                </div>
                {nota.catatan && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Catatan</span>
                    <span className="text-right max-w-[55%]">{nota.catatan}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />

              <div className="space-y-1 text-xs mb-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Harga Sewa</span>
                  <span>{formatRupiah(nota.harga)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Deposit</span>
                  <span>{formatRupiah(nota.deposit)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-sm mb-3 pt-1 border-t border-dashed border-gray-300">
                <span>TOTAL BAYAR PERTAMA</span>
                <span>{formatRupiah(nota.harga + nota.deposit)}</span>
              </div>

              <div className="text-center text-xs mb-3">
                {nota.bayarSekarang ? (
                  <span className="text-teal-700 font-semibold">SEWA LUNAS</span>
                ) : (
                  <span className="text-gray-500">Sewa belum dibayar — dilunasi saat check-out</span>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="text-center text-xs text-gray-500">
                <p>Selamat bergabung di properti kami!</p>
                <p>Simpan nota ini sebagai bukti booking.</p>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Cetak
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
