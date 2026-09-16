'use client'
// app/(dashboard)/booking/page.tsx
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, PersonFill, BuildingFill, FloppyFill } from 'react-bootstrap-icons'
import { formatRupiah, namaPenyewa, metodeBayarLabel, tglJam, tglJamJadiDate } from '@/lib/utils'

type NotaBooking = {
  nama: string; noHp: string; kamarNomor: string; kamarTipe: string
  periodeSewa: string; tanggalMasuk: string; tanggalKeluar: string
  durasi: number
  harga: number; deposit: number; metodeBayar: string; bayarSekarang: boolean
  catatan: string; tanggalCetak: string
}

type Kamar = {
  id: string
  nomor: string
  // Tipe kini objek master data (bukan string enum) dan membawa harga — tarif
  // sewa melekat pada tipe, bukan per kamar.
  tipe: { id: string; nama: string; harga: { periodeSewa: string; harga: string }[] } | null
  luas: number | null
}

type PenyewaHasil = {
  id: string
  nama: string | null
  nik: string | null
  noHp: string | null
  alamatAsal: string | null
  namaPerusahaan: string | null
  npwp: string | null
  tipeEntitas: 'INDIVIDU' | 'PERUSAHAAN'
  jumlahSewa: number
}

type PropertiNota = {
  nama: string
  alamat: string
  kota: string
  provinsi: string
  noHp: string | null
  teksNota: string | null
}

const PERIODE = ['HARIAN', 'BULANAN', 'TAHUNAN']

// Pilihan jam masuk, 24 jam penuh. Dropdown, bukan input teks: kasir tak bisa
// salah ketik, dan tak ada jebakan AM/PM seperti `<input type="time">` yang
// tampilannya ikut locale browser (en-US memaksa AM/PM walau lang="id-ID").
// Urut menaik apa adanya, "00:00" sampai "23:00".
const JAM_MASUK = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

const METODE_BAYAR = ['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA'] as const

export default function BookingPage() {
  const router = useRouter()
  const [kamarList, setKamarList] = useState<Kamar[]>([])
  const [loading, setLoading] = useState(false)
  const [nota, setNota] = useState<NotaBooking | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'INDIVIDU' | 'PERUSAHAAN'>('INDIVIDU')
  // Identitas properti untuk kepala & kaki nota. Diambil sekali; kalau gagal,
  // nota tetap tercetak dengan teks bawaan (bukan blank).
  const [propertiNota, setPropertiNota] = useState<PropertiNota | null>(null)

  // Pencarian penyewa lama. `penyewaId` kosong = penyewa baru.
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState<PenyewaHasil[]>([])
  const [penyewaId, setPenyewaId] = useState('')
  const [penyewaNama, setPenyewaNama] = useState('')

  const [form, setForm] = useState({
    nama: '', nik: '', noHp: '', alamatAsal: '',
    namaPerusahaan: '', npwp: '',
    kamarId: '', periodeSewa: 'HARIAN', tanggalMasuk: '', jamMasuk: '', durasi: 1,
    deposit: '', metodeBayar: 'TUNAI', bayarSekarang: true, catatan: '',
  })

  // Pembacaan KTP. Hanya berarti di mode penyewa baru.
  const [bacaKtpLoading, setBacaKtpLoading] = useState(false)
  // `gagal` dibedakan dari pesan biasa supaya panelnya berubah warna — pesan
  // galat yang terlihat sama dengan pesan sukses bikin kasir mengira berhasil.
  const [pesanKtp, setPesanKtp] = useState<{ teks: string; gagal?: boolean } | null>(null)
  // Penyewa lama yang NIK-nya sama dengan hasil bacaan. Kasir yang memutuskan
  // mau memakai data lama atau tetap membuat yang baru.
  const [ktpDuplikat, setKtpDuplikat] = useState<{ id: string; nama: string | null; noHp: string | null; alamatAsal: string | null } | null>(null)
  // Dua tombol, dua input terpisah. Yang "Kamera" punya `capture="environment"`
  // yang ditulis langsung di JSX; yang "Pilih File" tidak punya sama sekali.
  //
  // Kenapa bukan satu input saja: `setAttribute('capture', ...)` menulis
  // atribut mentah, dan WebKit/Blink memutuskan buka kamera atau tidak saat
  // elemen dibuat — atribut yang disuntik setelahnya tak dianggap. Mengosongkan
  // atribut (`removeAttribute`) pun hanya aman kalau inputnya belum pernah
  // difoto: sesudah `value` terisi, input yang sama tak membuka apa pun.
  // Dua elemen menghindari dua jebakan itu sekaligus.
  const inputKamera = useRef<HTMLInputElement>(null)
  const inputBerkas = useRef<HTMLInputElement>(null)

  const ambilDari = (sumber: 'kamera' | 'berkas') => {
    const el = sumber === 'kamera' ? inputKamera.current : inputBerkas.current
    if (!el) return
    // Input file mengingat berkas terakhir. Kalau tak dikosongkan, memilih
    // foto yang sama dua kali tak memicu `change` — kasir mengira tombolnya
    // rusak. Dikosongkan di sini, sebelum klik.
    el.value = ''
    el.click()
  }


  useEffect(() => {
    fetch('/api/properti/aktif')
      .then(r => r.json())
      .then(j => setPropertiNota(j?.properti ?? null))
      .catch(() => setPropertiNota(null))
  }, [])

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
      alamatAsal: p.alamatAsal ?? '',
      namaPerusahaan: p.namaPerusahaan ?? '', npwp: p.npwp ?? '',
    }))
    setCari(''); setHasil([])
  }

  function penyewaBaru() {
    setPenyewaId(''); setPenyewaNama('')
    setForm(f => ({
      ...f, nama: '', nik: '', noHp: '', alamatAsal: '',
      namaPerusahaan: '', npwp: '',
    }))
    setPesanKtp(null); setKtpDuplikat(null)
  }

  // Baca KTP dari foto. Field yang terbaca MENIMPA isian yang ada — kasir
  // menekan tombol ini justru karena isian itu belum benar. Yang tidak terbaca
  // dibiarkan apa adanya supaya ketikan manual tidak hilang.
  async function bacaKtpDariFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0]
    // Reset input supaya memilih foto yang sama dua kali tetap memicu onChange
    // (mis. foto pertama buram, kasir mengulang dengan berkas yang sama).
    e.target.value = ''
    if (!berkas) return

    setBacaKtpLoading(true); setPesanKtp(null); setKtpDuplikat(null)
    try {
      const fd = new FormData()
      fd.append('foto', berkas)
      const res = await fetch('/api/ktp/baca', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Gagal membaca KTP.')

      const h = data.hasil as { nama: string; nik: string; alamat: string; jenisKelamin: string }
      setForm(f => ({
        ...f,
        nama: h.nama || f.nama,
        nik: h.nik || f.nik,
        alamatAsal: h.alamat || f.alamatAsal,
      }))

      const bagian = [
        h.nama && 'nama',
        h.nik && 'NIK',
        h.alamat && 'alamat',
        h.jenisKelamin && `jenis kelamin (${h.jenisKelamin})`,
      ].filter(Boolean) as string[]
      setPesanKtp({ teks: `Terbaca: ${bagian.join(', ')}. Periksa lagi sebelum disimpan.` })

      if (data.terdaftar) setKtpDuplikat(data.terdaftar)
    } catch (err: any) {
      setPesanKtp({ teks: err.message, gagal: true })
    } finally {
      setBacaKtpLoading(false)
    }
  }

  // Pakai data penyewa lama yang NIK-nya cocok. Ini yang mencegah orang yang
  // sama tercatat dua kali — tanpa ini, NIK yang baru terbaca akurat justru
  // berujung galat 409 di /api/booking.
  function pakaiDataLama() {
    const p = ktpDuplikat
    if (!p) return
    setPenyewaId(p.id)
    setPenyewaNama(p.nama ?? '')
    setForm(f => ({
      ...f,
      nama: p.nama ?? f.nama,
      noHp: p.noHp || f.noHp,
      alamatAsal: p.alamatAsal || f.alamatAsal,
    }))
    setKtpDuplikat(null)
    setPesanKtp({ teks: `Memakai data penyewa lama: ${p.nama ?? 'tanpa nama'}.` })
  }

  const kamarDipilih = kamarList.find(k => k.id === form.kamarId)
  // Tarif datang dari tipe kamar, bukan dari kamar langsung.
  const hargaKamar = kamarDipilih?.tipe?.harga.find(h => h.periodeSewa === form.periodeSewa)
  const hargaNum = hargaKamar ? Number(hargaKamar.harga) : 0

  function set(key: string, val: string | number | boolean) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.kamarId || !form.tanggalMasuk || !form.jamMasuk) {
      setError('Pilih kamar, tanggal masuk, dan jam masuk.')
      return
    }
    // Tak ada validasi format jam di sini: nilainya datang dari dropdown berisi
    // 24 pilihan "00:00".."23:00", jadi tak ada yang bisa diketik salah.
    // Server tetap memvalidasi lewat skema zod — kiriman luar tak dilindungi UI.
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
      // Pakai waktu yang DIKEMBALIKAN server, bukan hitung ulang di klien —
      // kalau tidak, struk bisa beda dengan yang tersimpan di DB.
      const hasil = await res.json()
      setNota({
        nama: form.nama,
        noHp: form.noHp,
        kamarNomor: kamarDipilih?.nomor ?? '',
        kamarTipe: kamarDipilih?.tipe?.nama ?? '',
        periodeSewa: form.periodeSewa,
        // Nota memakai waktu yang dikembalikan server (sudah digabung dengan
        // jam masuk, zona WIB), bukan tanggal mentah dari form — jadi yang
        // tercetak persis yang tersimpan. Kalau respons cacat dan `masuk`
        // hilang, pakai hasil gabungan lokal supaya nota tak mencetak
        // "Invalid Date".
        tanggalMasuk: hasil.masuk ?? tglJamJadiDate(form.tanggalMasuk, form.jamMasuk).toISOString(),
        tanggalKeluar: hasil.keluar ?? '',
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
                          {[p.noHp, p.nik ? `NIK ${p.nik}` : null, p.alamatAsal, `${p.jumlahSewa} sewa`]
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

          {/* Isi otomatis dari foto KTP. Hanya di mode penyewa baru: kalau
              kasir sudah memilih penyewa lama, datanya memang sudah ada.
              Dua tombol, bukan satu: `capture` memaksa kamera dan tanpa itu
              user dapat pemilih berkas. Satu input saja tak bisa dua-duanya —
              `capture` berlaku per-input, bukan per-pilihan.
              Panel status dan duplikat sengaja di LUAR tombol, supaya kliknya
              tak ikut membuka kamera/pemilih berkas. */}
          {!penyewaId && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-teal-600 shadow-sm ring-1 ring-gray-200">
                  {bacaKtpLoading ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1-2h5l1 2h2A1.5 1.5 0 0 1 17 8.5" />
                      <path d="M3.5 8.5h16A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5V10a1.5 1.5 0 0 1 .5-1.5Z" />
                      <circle cx="12" cy="13.5" r="3.2" />
                    </svg>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">
                    {bacaKtpLoading ? 'Membaca foto KTP…' : 'Isi otomatis dari foto KTP'}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {bacaKtpLoading
                      ? 'Tunggu sebentar, jangan tutup halaman ini.'
                      : 'Foto KTP-nya, lalu periksa hasilnya sebelum disimpan.'}
                  </div>
                </div>
              </div>

              {/* Dua sumber. Ikon kamera dan ikon berkas, bukan tombol teks
                  kecil: ini aksi utama blok, dan di HP harus enak diketuk. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => ambilDari('kamera')}
                  disabled={bacaKtpLoading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1-2h5l1 2h2A1.5 1.5 0 0 1 17 8.5" />
                    <path d="M3.5 8.5h16A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5V10a1.5 1.5 0 0 1 .5-1.5Z" />
                    <circle cx="12" cy="13.5" r="3.2" />
                  </svg>
                  Kamera
                </button>
                <button
                  type="button"
                  onClick={() => ambilDari('berkas')}
                  disabled={bacaKtpLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-teal-400 hover:text-teal-700 disabled:opacity-60"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
                  </svg>
                  Pilih File
                </button>
              </div>

              {/* Dua input terpisah, bukan satu yang atributnya diubah saat
                  diklik: `capture` hanya dibaca browser saat elemen dibuat,
                  jadi menyuntiknya lewat setAttribute tak berpengaruh. */}
              <input
                ref={inputKamera}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                capture="environment"
                className="sr-only"
                disabled={bacaKtpLoading}
                onChange={bacaKtpDariFoto}
              />
              <input
                ref={inputBerkas}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                className="sr-only"
                disabled={bacaKtpLoading}
                onChange={bacaKtpDariFoto}
              />

              {/* Hasil bacaan. Warna panel mengikuti `gagal`, supaya pesan
                  galat tak tampil senada pesan sukses. */}
              {pesanKtp && (
                <div
                  role="status"
                  className={`mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs ${
                    pesanKtp.gagal
                      ? 'bg-coral-50 text-coral-600'
                      : 'bg-white text-gray-600 ring-1 ring-gray-100'
                  }`}
                >
                  <svg className="mt-[1px] h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {pesanKtp.gagal ? (
                      <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></>
                    ) : (
                      <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>
                    )}
                  </svg>
                  <span className="leading-relaxed">{pesanKtp.teks}</span>
                </div>
              )}

              {/* NIK hasil bacaan sudah terdaftar. Kasir memutuskan: pakai data
                  lama, atau anggap orang berbeda dan lanjut membuat baru.
                  Dulu blok ini ada di dalam <label>, jadi klik tombolnya ikut
                  membuka pemilih berkas — sekarang tak lagi perlu ditahan. */}
              {ktpDuplikat && (
                <div className="mt-2.5 space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                  <div className="text-xs text-amber-900">
                    NIK ini sudah terdaftar atas nama <span className="font-medium">{ktpDuplikat.nama ?? 'tanpa nama'}</span>.
                    Pakai data lama supaya tidak tercatat dua kali.
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={pakaiDataLama} className="btn-ghost text-xs">Pakai data lama</button>
                    <button type="button" onClick={() => setKtpDuplikat(null)} className="text-xs text-gray-500 hover:text-gray-700">
                      Abaikan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                <label className="form-label">Alamat (opsional)</label>
                <input className="form-input" value={form.alamatAsal} onChange={e => set('alamatAsal', e.target.value)} placeholder="Alamat asal sesuai KTP" />
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
                    {k.nomor} — {k.tipe?.nama ?? 'Tanpa tipe'}{k.luas ? ` (${k.luas}m²)` : ''}
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
              <label className="form-label">Jam masuk *</label>
              <select className="form-input" value={form.jamMasuk} onChange={e => set('jamMasuk', e.target.value)} required>
                <option value="">-- Pilih jam --</option>
                {JAM_MASUK.map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
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
                <span>Kamar {kamarDipilih.nomor} ({kamarDipilih.tipe?.nama ?? 'Tanpa tipe'})</span>
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
                  <i className="bi bi-house-door-fill text-teal-600" /> {propertiNota?.nama ?? 'ZXRoom'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {propertiNota
                    ? `${propertiNota.alamat}, ${propertiNota.kota}, ${propertiNota.provinsi}`
                    : 'Sistem Manajemen Kos & Apartemen'}
                </div>
                {propertiNota?.noHp && (
                  <div className="text-xs text-gray-500 mt-0.5">HP {propertiNota.noHp}</div>
                )}
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
                  <span className="text-gray-500">Masuk</span>
                  <span>{tglJam(nota.tanggalMasuk)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Keluar</span>
                  <span>{nota.tanggalKeluar ? tglJam(nota.tanggalKeluar) : '-'}</span>
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
              <div className="text-center text-xs text-gray-500 whitespace-pre-line">
                {propertiNota?.teksNota
                  ? propertiNota.teksNota
                  : <>
                      <p>Selamat bergabung di properti kami!</p>
                      <p>Simpan nota ini sebagai bukti booking.</p>
                    </>}
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
