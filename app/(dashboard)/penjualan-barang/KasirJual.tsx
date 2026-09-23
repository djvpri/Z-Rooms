'use client'
// components — app/(dashboard)/penjualan-barang/KasirJual.tsx
//
// Kasir barang: pilih produk → keranjang → bayar. Dua mode bayar:
//   - Tunai sekarang: penjualan selesai saat itu (status LUNAS).
//   - Titip ke kamar : status BELUM_BAYAR, ikut ditagih saat penghuni keluar.
//
// Harga TIDAK dikirim ke server. Server membacanya dari DB; yang dikirim cuma
// produkId + jumlah. Kalau harga dipercaya dari klien, siapa pun yang bisa
// memanggil API bisa menjual seharga Rp 1.
import { useMemo, useState } from 'react'
import {
  Bag, CartPlus, CheckCircleFill, Dash, ExclamationTriangleFill,
  Plus, Trash3, InfoCircle, CashCoin, DoorOpen, Printer,
} from 'react-bootstrap-icons'
import { JUMLAH_MAKS } from '@/lib/produk'
import {
  barisDuaKolom, barisKiriKanan, barisTengah, cetakNotaKasir,
  garisKertas, kertasPrefAktif,
} from '@/lib/cetak'

type Produk = {
  id: string
  nama: string
  hargaJual: number
  stok: number
  satuan: string
  kategori: string | null
}

type Kamar = { sewaId: string; nomor: string; penyewa: string | null }

type RiwayatItem = { id: string; nama: string; jumlah: number; hargaSatuan: number }
type Riwayat = {
  id: string
  nomor: string
  total: number
  status: string
  metodeBayar: string | null
  tanggal: string
  kamar: string | null
  penyewa: string | null
  item: RiwayatItem[]
}

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

const METODE = [
  { nilai: 'TUNAI', label: 'Tunai' },
  { nilai: 'TRANSFER', label: 'Transfer' },
  { nilai: 'QRIS', label: 'QRIS' },
] as const

export default function KasirJual({
  produk, kamar, riwayat, tujuanAwal = '',
}: { produk: Produk[]; kamar: Kamar[]; riwayat: Riwayat[]; tujuanAwal?: string }) {
  const [keranjang, setKeranjang] = useState<{ produkId: string; jumlah: number }[]>([])
  const [cari, setCari] = useState('')
  const [kategori, setKategori] = useState('')

  // tujuanAwal: kasir datang dari tombol "Jual" di kartu kamar → penyewa sudah
  // terpilih, kasir tinggal pilih barang. Diverifikasi ada di daftar kamar,
  // supaya ?sewa= sampah tidak mengunci dropdown ke nilai tak dikenal.
  const [tujuan, setTujuan] = useState(kamar.some(k => k.sewaId === tujuanAwal) ? tujuanAwal : '')
  const [metodeBayar, setMetodeBayar] = useState<'TUNAI' | 'TRANSFER' | 'QRIS'>('TUNAI')
  const [catatan, setCatatan] = useState('')
  const [paksaStok, setPaksaStok] = useState(false)

  const [simpan, setSimpan] = useState(false)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [kurang, setKurang] = useState<{ nama: string; diminta: number; tersedia: number }[]>([])
  // Nota penjualan sukses — kasir klik Cetak di banner, baru reload.
  const [notaSukses, setNotaSukses] = useState<{
    nomor: string; total: number; metodeBayar: string; kamar: string | null; item: RiwayatItem[]
  } | null>(null)
  const [mengirimNota, setMengirimNota] = useState(false)
  const [pesanCetakNota, setPesanCetakNota] = useState('')

  const petaProduk = useMemo(() => new Map(produk.map(p => [p.id, p])), [produk])

  const daftarKategori = useMemo(
    () => [...new Set(produk.map(p => p.kategori).filter((k): k is string => !!k))],
    [produk],
  )

  const terlihat = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return produk.filter(p => {
      if (kategori && p.kategori !== kategori) return false
      if (q && !p.nama.toLowerCase().includes(q)) return false
      return true
    })
  }, [produk, cari, kategori])

  /** Nama produk di keranjang (untuk cek stok & tampilan). */
  const baris = keranjang.map(b => {
    const p = petaProduk.get(b.produkId)!
    return { ...b, p }
  })

  const subtotal = baris.reduce((s, b) => s + b.p.hargaJual * b.jumlah, 0)

  function tambah(produkId: string) {
    setError(''); setKurang([])
    setKeranjang(k => {
      const ada = k.find(b => b.produkId === produkId)
      if (ada) {
        if (ada.jumlah >= JUMLAH_MAKS) return k
        return k.map(b => b.produkId === produkId ? { ...b, jumlah: b.jumlah + 1 } : b)
      }
      return [...k, { produkId, jumlah: 1 }]
    })
  }

  function ubahJumlah(produkId: string, delta: number) {
    setError(''); setKurang([])
    setKeranjang(k => k
      .map(b => b.produkId === produkId ? { ...b, jumlah: b.jumlah + delta } : b)
      .filter(b => b.jumlah > 0))
  }

  function setJumlah(produkId: string, nilai: string) {
    const n = Number(nilai.replace(/[^\d]/g, ''))
    if (!Number.isFinite(n)) return
    setError(''); setKurang([])
    setKeranjang(k => k
      .map(b => b.produkId === produkId
        ? { ...b, jumlah: Math.min(Math.max(1, n || 1), JUMLAH_MAKS) }
        : b))
  }

  function bersihkan() {
    setKeranjang([]); setCatatan(''); setPaksaStok(false)
    setKurang([]); setError('')
  }

  async function bayar() {
    if (keranjang.length === 0 || simpan) return
    setSimpan(true); setError(''); setPesan(''); setKurang([])

    try {
      const res = await fetch('/api/penjualan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: keranjang,
          sewaId: tujuan || null,
          metodeBayar,
          catatan: catatan.trim() || null,
          paksaStok,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        // Stok kurang: tampilkan produk mana persisnya. Kasir perlu tahu angka,
        // bukan cuma "gagal" — dia yang memutuskan mau memaksa atau menyesuaikan.
        if (data?.error === 'STOK_KURANG' && Array.isArray(data.kurang)) {
          setKurang(data.kurang)
          setError('Stok tidak cukup. Periksa jumlah, atau centang "Jual walaupun stok kurang".')
          return
        }
        setError(data?.error?.message ?? data?.error ?? data?.pesan ?? 'Gagal menyimpan penjualan.')
        return
      }

      setPesan(
        tujuan
          ? `${data.nomor} — ${rupiah(data.total)} dititipkan ke kamar, masuk tagihan saat check-out.`
          : `${data.nomor} — ${rupiah(data.total)} terjual.`,
      )
      bersihkan()
      // Simpan nota utk tombol cetak. Reload DITUNDA: kalau langsung reload,
      // banner sukses (dan tombol Cetak Nota) lenyap sebelum sempat dibaca.
      setNotaSukses({
        nomor: data.nomor,
        total: data.total,
        metodeBayar: METODE.find(m => m.nilai === metodeBayar)?.label ?? metodeBayar,
        kamar: kamarTerpilih?.nomor ?? null,
        item: data.item as RiwayatItem[],
      })
    } catch {
      setError('Gagal menyimpan penjualan.')
    } finally {
      setSimpan(false)
    }
  }

  /**
   * Cetak nota penjualan terakhir ke printer Bluetooth lewat aplikasi Android
   * (pola sama dengan nota booking & struk karaoke — `window.print()` tak
   * pernah jalan di WebView APK).
   */
  async function cetakNota() {
    if (!notaSukses) return
    setMengirimNota(true)
    setPesanCetakNota('')
    try {
      const kertas = await kertasPrefAktif()
      const baris: string[] = [
        barisTengah('ZXRoom', kertas),
        barisTengah('NOTA PENJUALAN', kertas),
        garisKertas(kertas),
        barisDuaKolom('No.', notaSukses.nomor, kertas),
        ...(notaSukses.kamar
          ? [barisDuaKolom('Kamar', notaSukses.kamar, kertas)]
          : []),
        barisDuaKolom('Tanggal', new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }), kertas),
        garisKertas(kertas),
        ...notaSukses.item.map((it) =>
          // subtotal = jumlah x hargaSatuan (RiwayatItem tak menyimpannya)
          barisKiriKanan(`${it.jumlah}x ${it.nama}`, (it.jumlah * it.hargaSatuan).toLocaleString('id-ID'), kertas),
        ),
        garisKertas(kertas),
        barisKiriKanan('TOTAL', rupiah(notaSukses.total), kertas),
        barisDuaKolom('Bayar', notaSukses.metodeBayar, kertas),
        garisKertas(kertas),
        barisTengah('Terima kasih.', kertas),
      ]
      await cetakNotaKasir(baris)
      setPesanCetakNota('Nota terkirim ke printer.')
    } catch (e) {
      setPesanCetakNota(`Cetak gagal: ${(e as Error).message}`)
    } finally {
      setMengirimNota(false)
    }
  }

  /** Selesai dengan nota: muat ulang supaya stok & riwayat di layar = DB. */
  function selesaiNota() {
    window.location.reload()
  }

  const kamarTerpilih = kamar.find(k => k.sewaId === tujuan)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Kolom kiri: pilih produk ─────────────────────────────── */}
      <div className="lg:col-span-2">
        {pesan && (
          <div className="mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            <div className="inline-flex items-center gap-2">
              <CheckCircleFill size={14} aria-hidden="true" /> {pesan}
            </div>
            {/* Nota dicetak dari sini: reload ditunda sampai kasir selesai,
                kalau tidak banner (dan tombol ini) lenyap sebelum dibaca. */}
            {notaSukses && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => cetakNota()}
                  disabled={mengirimNota}
                  className="inline-flex items-center gap-2 bg-teal-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                >
                  <Printer aria-hidden="true" size={12} /> {mengirimNota ? 'Mengirim…' : 'Cetak Nota'}
                </button>
                <button
                  onClick={selesaiNota}
                  className="inline-flex items-center gap-2 bg-white border border-teal-200 text-teal-700 rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Selesai
                </button>
              </div>
            )}
            {pesanCetakNota && (
              <p className={`mt-2 text-xs ${pesanCetakNota.startsWith('Nota') ? 'text-gray-500' : 'text-red-600'}`}>
                {pesanCetakNota}
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="mb-4 text-sm text-coral-600 bg-coral-50 border border-coral-100 rounded-lg px-3 py-2">
            <div className="inline-flex items-center gap-2">
              <ExclamationTriangleFill size={14} aria-hidden="true" /> {error}
            </div>
            {kurang.length > 0 && (
              <ul className="mt-2 ml-5 list-disc space-y-0.5">
                {kurang.map((k, i) => (
                  <li key={i}>
                    {k.nama}: diminta {k.diminta}, tersedia {k.tersedia}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="card mb-4">
          <input
            className="input w-full mb-2"
            placeholder="Cari produk…"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
          {daftarKategori.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setKategori('')}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  kategori === '' ? 'bg-teal-600 text-white border-teal-600' : 'text-gray-600 border-gray-200'
                }`}
              >
                Semua
              </button>
              {daftarKategori.map(k => (
                <button
                  key={k}
                  onClick={() => setKategori(k)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    kategori === k ? 'bg-teal-600 text-white border-teal-600' : 'text-gray-600 border-gray-200'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>

        {produk.length === 0 ? (
          <div className="card text-center py-14">
            <Bag className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-900">Belum ada produk</h2>
            <p className="text-sm text-gray-500 mt-1">
              Tambah produk dulu di Pengaturan → Produk, lalu kembali ke sini.
            </p>
          </div>
        ) : terlihat.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-sm text-gray-500">Tak ada produk yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {terlihat.map(p => {
              const habis = p.stok <= 0
              return (
                <button
                  key={p.id}
                  onClick={() => tambah(p.id)}
                  className="card text-left hover:border-teal-400 transition-colors p-3"
                >
                  <div className="text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.5rem]">
                    {p.nama}
                  </div>
                  <div className="text-sm font-medium text-teal-700 mt-1">{rupiah(p.hargaJual)}</div>
                  <div className={`text-xs mt-0.5 ${
                    p.stok < 0 ? 'text-coral-600 font-medium' : habis ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    stok {p.stok} {p.satuan}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Kolom kanan: keranjang & bayar ───────────────────────── */}
      <div>
        <div className="card lg:sticky lg:top-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3 inline-flex items-center gap-2">
            <CartPlus size={15} aria-hidden="true" /> Keranjang
          </h2>

          {baris.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada barang. Pilih produk di sebelah.</p>
          ) : (
            <div className="divide-y divide-gray-100 -mx-1">
              {baris.map(b => (
                <div key={b.produkId} className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{b.p.nama}</div>
                    <div className="text-xs text-gray-400">
                      {rupiah(b.p.hargaJual)} × {b.jumlah}
                      {b.jumlah > b.p.stok && (
                        <span className="text-amber-600"> · stok {b.p.stok}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => ubahJumlah(b.produkId, -1)}
                    className="text-gray-500 p-1 shrink-0" aria-label={`Kurangi ${b.p.nama}`}
                  >
                    <Dash size={14} aria-hidden="true" />
                  </button>
                  <input
                    className="input w-14 text-center shrink-0"
                    inputMode="numeric"
                    value={b.jumlah}
                    onChange={(e) => setJumlah(b.produkId, e.target.value)}
                    aria-label={`Jumlah ${b.p.nama}`}
                  />
                  <button
                    onClick={() => ubahJumlah(b.produkId, 1)}
                    className="text-gray-500 p-1 shrink-0" aria-label={`Tambah ${b.p.nama}`}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => ubahJumlah(b.produkId, -b.jumlah)}
                    className="text-gray-400 hover:text-coral-600 p-1 shrink-0"
                    aria-label={`Buang ${b.p.nama}`}
                  >
                    <Trash3 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {baris.length > 0 && (
            <>
              <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between items-baseline">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-lg font-semibold text-gray-900">{rupiah(subtotal)}</span>
              </div>

              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="text-xs text-gray-500">Bayar</span>
                  <select
                    className="input w-full"
                    value={tujuan}
                    onChange={(e) => setTujuan(e.target.value)}
                  >
                    <option value="">Tunai sekarang</option>
                    {kamar.map(k => (
                      <option key={k.sewaId} value={k.sewaId}>
                        Titip ke kamar {k.nomor}{k.penyewa ? ` — ${k.penyewa}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Metode hanya relevan saat uangnya masuk sekarang. Titipan
                    dibayar nanti — memilih metode di sini akan menyesatkan. */}
                {!tujuan && (
                  <div className="flex gap-1.5">
                    {METODE.map(m => (
                      <button
                        key={m.nilai}
                        onClick={() => setMetodeBayar(m.nilai)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded-lg border ${
                          metodeBayar === m.nilai
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'text-gray-600 border-gray-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {tujuan && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5">
                    <InfoCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Belum dibayar. Ikut ditagih saat {kamarTerpilih?.penyewa ?? 'penghuni'} check-out
                      dari kamar {kamarTerpilih?.nomor}.
                    </span>
                  </p>
                )}

                <input
                  className="input w-full"
                  placeholder="Catatan (opsional)"
                  value={catatan}
                  maxLength={200}
                  onChange={(e) => setCatatan(e.target.value)}
                />

                {/* Paksa stok hanya muncul saat memang ada baris yang kurang —
                    menampalkannya selalu cuma jadi tombol yang tak pernah dipakai. */}
                {baris.some(b => b.jumlah > b.p.stok) && (
                  <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={paksaStok}
                      onChange={(e) => setPaksaStok(e.target.checked)}
                    />
                    <span>
                      Jual walaupun stok kurang. Stok akan jadi minus — itu tanda
                      hitungan perlu diperiksa, bukan kegagalan penjualan.
                    </span>
                  </label>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void bayar()}
                    disabled={simpan || keranjang.length === 0}
                    className="btn btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
                  >
                    {tujuan ? <DoorOpen size={14} aria-hidden="true" /> : <CashCoin size={14} aria-hidden="true" />}
                    {simpan ? 'Menyimpan…' : tujuan ? 'Titipkan ke kamar' : 'Bayar'}
                  </button>
                  <button onClick={bersihkan} disabled={simpan} className="btn text-gray-500">
                    Kosongkan
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Riwayat bulan ini ─────────────────────────────────── */}
        <div className="card mt-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Penjualan bulan ini</h2>
          {riwayat.length === 0 ? (
            <p className="text-xs text-gray-400">Belum ada penjualan bulan ini.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {riwayat.map(r => (
                <div key={r.id} className="py-2">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className={`text-xs font-medium ${
                      r.status === 'BATAL' ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}>
                      {r.nomor}
                    </span>
                    <span className={`text-sm shrink-0 ${
                      r.status === 'BATAL' ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}>
                      {rupiah(r.total)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(r.tanggal).toLocaleString('id-ID', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                    {r.kamar ? ` · kamar ${r.kamar}${r.penyewa ? ` (${r.penyewa})` : ''}` : ''}
                    {r.status === 'BELUM_BAYAR' ? ' · belum dibayar' : ''}
                    {r.status === 'BATAL' ? ' · dibatalkan' : ''}
                    {r.metodeBayar && r.status === 'LUNAS' ? ` · ${r.metodeBayar.toLowerCase()}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {r.item.map(it => `${it.nama} ×${it.jumlah}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
