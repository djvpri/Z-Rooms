'use client'
// app/(dashboard)/karaoke/page.tsx
//
// Papan ruang karaoke + kasir sesi.
//
// ATURAN YANG DIPEGANG HALAMAN INI:
//
// 1. HITUNG MUNDUR yang berdetak tiap detik, BUKAN biaya. Biaya sewa naik
//    MELOMPAT tiap jam (tarif per jam), jadi biaya yang mengalir mulus akan
//    bertentangan dengan tagihan — pelanggan berhenti di menit 90 melihat
//    Rp 120.000 di layar padahal tagihannya Rp 160.000. Sisa waktu tak pernah
//    bertentangan, dan justru itu yang berguna: kasir tahu kapan ruang kosong.
//
// 2. Uang SELALU dihitung ulang di server saat bayar. Angka di layar estimasi;
//    server yang menentukan. `tutup` mengirim durasi menit, bukan total.
//
// 3. Waktu berjalan dari `mulaiPada` milik SERVER, bukan jam perangkat. Jam
//    perangkat bisa meleset; menghitung mundur dari waktu server membuat
//    hitungan tetap benar walau jam laptop kasir salah.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  PlusLg, MusicNoteBeamed, ExclamationTriangleFill, X, CashCoin,
  ClockHistory, Printer, CupStraw, BarChartLine,
} from 'react-bootstrap-icons'
import { AMBANG_MENDESAK_MENIT, TOLERANSI_BOOKING_MENIT, formatDurasi } from '@/lib/karaoke'

type Ruang = { id: string; nama: string; kapasitas: number | null; aktif: boolean }
type Produk = { id: string; nama: string; hargaJual: string | number; stok: number }
type BarisMinuman = {
  id: string
  produkId: string
  namaProduk: string
  hargaSatuan: string | number
  jumlah: number
  subtotal: string | number
}
type Sesi = {
  id: string
  nomor: string
  ruangId: string
  namaPelanggan: string | null
  mulaiPada: string
  rencanaSelesai: string
  selesaiAktual: string | null
  jumlahJam: number
  totalSewa: string | number
  jaminan: string | number
  status: 'BOOKING' | 'BERJALAN' | 'SELESAI' | 'BATAL'
  catatan: string | null
  ruang?: { id: string; nama: string }
  minuman?: BarisMinuman[]
}

const rupiah = (n: unknown) => 'Rp ' + Number(n).toLocaleString('id-ID')

/** "2026-09-18T19:00" untuk input datetime-local, dari waktu server. */
function keLokalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

export default function KaraokePage() {
  const [ruang, setRuang] = useState<Ruang[]>([])
  const [sesi, setSesi] = useState<Sesi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')

  // Geser waktu: server - perangkat, diukur sekali per muat. Hitung mundur
  // memakai `Date.now() + geser`, jadi jam perangkat yang salah tak merusak
  // tampilan dan tak pernah membuat layar berbeda dari tagihan.
  const [geser, setGeser] = useState(0)
  const [, setDetak] = useState(0)

  const [formBuka, setFormBuka] = useState<{ ruangId: string; nama: string; jam: string; menit: string; jaminan: string; pada: string } | null>(null)
  const [proses, setProses] = useState(false)
  const [struk, setStruk] = useState<{ sesi: Sesi; ringkas: { sewa: number; minuman: number; jaminan: number; total: number; dibayar: number } } | null>(null)

  // Minuman: katalog produk dimuat sekali (untuk panel minuman), dan sesi yang
  // panelnya sedang dibuka. Panel dibuka atas permintaan kasir — bukan otomatis
  // untuk semua kartu, karena tiap panel berarti satu permintaan katalog.
  const [produk, setProduk] = useState<Produk[]>([])
  const [panelMinuman, setPanelMinuman] = useState<{ sesiId: string; produkId: string; jumlah: string } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setDetak((d) => d + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const muat = useCallback(async (pertama = false) => {
    if (pertama) setLoading(true)
    try {
      const [rRes, sRes] = await Promise.all([
        fetch('/api/karaoke/ruang', { cache: 'no-store' }),
        fetch('/api/karaoke/sesi?status=jalan', { cache: 'no-store' }),
      ])
      const rData = await rRes.json().catch(() => null)
      const sData = await sRes.json().catch(() => null)
      if (pertama && !rRes.ok) throw new Error(rData?.error?.message ?? 'Gagal memuat ruang.')
      setRuang(rData?.ruang ?? [])
      setSesi(sData?.sesi ?? [])

      // Waktu server dari header HTTP — tak perlu endpoint khusus.
      const tgl = rRes.headers.get('date')
      if (tgl) setGeser(new Date(tgl).getTime() - Date.now())
      if (pertama) setError('')
    } catch (e) {
      if (pertama) setError((e as Error).message)
    } finally {
      if (pertama) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void muat(true)
  }, [muat])

  const sekarang = Date.now() + geser

  // Ruang → sesi yang memegangnya. BOOKING yang sudah lewat 15 menit dianggap
  // lepas (pelanggan tak datang) — dihitung di sini, bukan oleh cron.
  const petaSesi = useMemo(() => {
    const p = new Map<string, Sesi>()
    for (const s of sesi) {
      if (s.status === 'BERJALAN') {
        p.set(s.ruangId, s)
        continue
      }
      if (s.status === 'BOOKING') {
        const batas = new Date(s.mulaiPada).getTime() + TOLERANSI_BOOKING_MENIT * 60000
        if (sekarang < batas) p.set(s.ruangId, s)
      }
    }
    return p
  }, [sesi, sekarang])

  async function bukaSesi(e: React.FormEvent) {
    e.preventDefault()
    if (!formBuka) return
    setError('')
    setPesan('')
    setProses(true)
    try {
      const durasi = Number(formBuka.jam || 0) * 60 + Number(formBuka.menit || 0)
      if (!Number.isFinite(durasi) || durasi <= 0) throw new Error('Isi durasi minimal 1 jam.')
      const res = await fetch('/api/karaoke/sesi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruangId: formBuka.ruangId,
          namaPelanggan: formBuka.nama || null,
          durasiMenit: durasi,
          jaminan: formBuka.jaminan ? Number(formBuka.jaminan.replace(/[^\d]/g, '')) : 0,
          // Kosong = mulai sekarang (BERJALAN). Terisi = BOOKING untuk jam itu.
          // `new Date(...).toISOString()` mengubah waktu lokal kasir jadi UTC
          // berlabel, jadi server tak perlu tahu zona waktu perangkat.
          ...(formBuka.pada ? { pada: new Date(formBuka.pada).toISOString() } : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal membuka sesi.')
      const booking = data.sesi.status === 'BOOKING'
      setPesan(
        booking
          ? `Booking ${data.sesi.nomor} untuk ${new Date(data.sesi.mulaiPada).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}. ${rupiah(data.sesi.totalSewa)}.`
          : `Sesi ${data.sesi.nomor} dibuka. ${rupiah(data.sesi.totalSewa)} untuk ${data.sesi.jumlahJam} jam.`,
      )
      setFormBuka(null)
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProses(false)
    }
  }

  /** Katalog produk dimuat sekali saat panel pertama dibuka. */
  async function bukaPanelMinuman(s: Sesi) {
    setPanelMinuman({ sesiId: s.id, produkId: '', jumlah: '1' })
    if (produk.length > 0) return
    try {
      const res = await fetch('/api/produk', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok) setProduk(data?.produk ?? [])
    } catch {
      // Diamkan: katalog gagal dimuat bukan alasan memblokir kasir. Panel tetap
      // terbuka dan pesannya muncul saat kasir menekan Tambah.
      setProduk([])
    }
  }

  async function tambahMinuman(e: React.FormEvent) {
    e.preventDefault()
    if (!panelMinuman?.produkId) return
    setError('')
    setPesan('')
    setProses(true)
    try {
      const res = await fetch(`/api/karaoke/sesi/${panelMinuman.sesiId}/minuman`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produkId: panelMinuman.produkId, jumlah: Number(panelMinuman.jumlah || 1) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // STOK_KURANG datang sebagai `pesan`, bukan `error.message` — bentuk ini
        // dipakai bersama jalur penjualan barang.
        throw new Error(data?.pesan ?? data?.error?.message ?? 'Gagal menambah minuman.')
      }
      setPesan(`${data.baris.namaProduk} × ${data.baris.jumlah} ditambahkan. Total jadi ${rupiah(data.total)}.`)
      if (data.peringatanJaminan) setError(data.peringatanJaminan)
      setPanelMinuman({ ...panelMinuman, produkId: '', jumlah: '1' })
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProses(false)
    }
  }

  async function hapusMinuman(sesiId: string, baris: BarisMinuman) {
    if (!window.confirm(`Hapus ${baris.namaProduk} × ${baris.jumlah} dari sesi ini? Stok dikembalikan.`)) return
    setError('')
    setPesan('')
    setProses(true)
    try {
      const res = await fetch(`/api/karaoke/sesi/${sesiId}/minuman?itemId=${baris.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menghapus minuman.')
      setPesan(data?.pesan ?? 'Minuman dihapus.')
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProses(false)
    }
  }

  async function tutupSesi(s: Sesi) {
    // BOOKING = pelanggan baru datang → mulai berjalan. Waktu mulai di-reset ke
    // sekarang: tak masuk akal menagih waktu tunggu sejak slot dijadwalkan.
    const pesanKonfirmasi = s.status === 'BOOKING'
      ? `Mulai sesi ${s.nomor} sekarang? Hitungan waktu berjalan dari saat ini.`
      : `Tutup sesi ${s.nomor} dan hitung biayanya?`
    if (!window.confirm(pesanKonfirmasi)) return
    setError('')
    setPesan('')
    setProses(true)
    try {
      const res = await fetch(`/api/karaoke/sesi/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // `mulaiSekarang: true` hanya untuk BOOKING → BERJALAN. Tanpa ini,
        // server menutup sesi dan menagih dari `mulaiPada` (waktu booking),
        // yang bisa berarti berjam-jam waktu tunggu ikut ditagih.
        body: JSON.stringify(s.status === 'BOOKING' ? { mulaiSekarang: true } : {}),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menutup sesi.')
      setStruk({ sesi: data.sesi, ringkas: data.ringkas })
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProses(false)
    }
  }

  async function batalSesi(s: Sesi) {
    const alasan = window.prompt(`Batalkan sesi ${s.nomor}? Tulis alasan (opsional).`, '')
    if (alasan === null) return
    setError('')
    setPesan('')
    setProses(true)
    try {
      const res = await fetch(`/api/karaoke/sesi/${s.id}/batal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan: alasan }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal membatalkan sesi.')
      setPesan(data?.pesan ?? 'Sesi dibatalkan.')
      await muat()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProses(false)
    }
  }

  const berjalan = [...petaSesi.values()].filter((s) => s.status === 'BERJALAN').length

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Karaoke</h1>
          <p className="text-sm text-gray-400">
            {ruang.length} ruang · {berjalan} sedang dipakai
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/karaoke/laporan" className="btn btn-ghost text-xs">
            <BarChartLine aria-hidden="true" /> Laporan
          </Link>
          <Link href="/pengaturan/karaoke" className="btn btn-ghost text-xs">
            <MusicNoteBeamed aria-hidden="true" /> Tarif
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border-l-4 border-l-coral-400 bg-coral-50 p-3 text-sm text-coral-600 flex items-start gap-2">
          <ExclamationTriangleFill className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {pesan && <div className="mb-4 rounded-lg border-l-4 border-l-teal-400 bg-teal-50 p-3 text-sm text-teal-700">{pesan}</div>}

      {loading && <p className="text-sm text-gray-400">Memuat…</p>}

      {!loading && ruang.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <MusicNoteBeamed className="text-3xl mx-auto mb-2 opacity-40" aria-hidden="true" />
          <p className="text-sm">Belum ada ruang karaoke.</p>
          <Link href="/pengaturan/karaoke" className="btn btn-primary text-xs mt-3">
            Atur ruang & tarif
          </Link>
        </div>
      )}

      {/* Papan ruang */}
      <div className="grid gap-3 sm:grid-cols-2">
        {ruang.map((r) => {
          const s = petaSesi.get(r.id)
          return (
            <KartuRuang
              key={r.id}
              ruang={r}
              sesi={s}
              sekarang={sekarang}
              proses={proses}
              onBuka={() => setFormBuka({ ruangId: r.id, nama: '', jam: '1', menit: '0', jaminan: '', pada: '' })}
              onTutup={s ? () => tutupSesi(s) : undefined}
              onBatal={s ? () => batalSesi(s) : undefined}
              onMinuman={s && s.status === 'BERJALAN' ? () => void bukaPanelMinuman(s) : undefined}
              onHapusMinuman={s ? (b) => void hapusMinuman(s.id, b) : undefined}
              minumanDibuka={panelMinuman?.sesiId === s?.id}
              panel={
                panelMinuman && panelMinuman.sesiId === s?.id
                  ? { produkId: panelMinuman.produkId, jumlah: panelMinuman.jumlah }
                  : undefined
              }
              produk={produk}
              onPanel={(p) => setPanelMinuman((f) => (f ? { ...f, ...p } : f))}
              onSimpanMinuman={tambahMinuman}
            />
          )
        })}
      </div>

      {/* Modal buka sesi */}
      {formBuka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={bukaSesi} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-900">
                Mulai sesi — {ruang.find((r) => r.id === formBuka.ruangId)?.nama}
              </h2>
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => setFormBuka(null)}>
                <X aria-hidden="true" />
              </button>
            </div>

            <label className="block mb-3">
              <span className="block text-xs text-gray-500 mb-1">Nama pelanggan (opsional)</span>
              <input
                className="input w-full"
                value={formBuka.nama}
                onChange={(e) => setFormBuka((f) => (f ? { ...f, nama: e.target.value } : f))}
                placeholder="Umum"
              />
            </label>

            <div className="flex gap-3 mb-3">
              <label className="w-24">
                <span className="block text-xs text-gray-500 mb-1">Jam</span>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  value={formBuka.jam}
                  onChange={(e) => setFormBuka((f) => (f ? { ...f, jam: e.target.value } : f))}
                />
              </label>
              <label className="w-24">
                <span className="block text-xs text-gray-500 mb-1">Menit</span>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={59}
                  value={formBuka.menit}
                  onChange={(e) => setFormBuka((f) => (f ? { ...f, menit: e.target.value } : f))}
                />
              </label>
              <p className="flex-1 self-end pb-2 text-[11px] text-gray-400">
                Dibulatkan ke atas ke jam penuh. Kurang dari 1 jam tetap dihitung 1 jam.
              </p>
            </div>

            <label className="block mb-4">
              <span className="block text-xs text-gray-500 mb-1">Uang jaminan (opsional)</span>
              <input
                className="input w-full"
                value={formBuka.jaminan}
                onChange={(e) => setFormBuka((f) => (f ? { ...f, jaminan: e.target.value } : f))}
                placeholder="0"
                inputMode="numeric"
              />
              <span className="block text-[11px] text-gray-400 mt-1">
                Jaminan bukan diskon — ia mengurangi yang dibayar di akhir, bukan totalnya.
              </span>
            </label>

            <label className="block mb-4">
              <span className="block text-xs text-gray-500 mb-1">Mulai</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn text-xs flex-1 ${formBuka.pada ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={() => setFormBuka((f) => (f ? { ...f, pada: '' } : f))}
                >
                  Sekarang
                </button>
                <button
                  type="button"
                  className={`btn text-xs flex-1 ${formBuka.pada ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFormBuka((f) => (f ? { ...f, pada: keLokalInput(Date.now() + geser + 3600000) } : f))}
                >
                  Booking (nanti)
                </button>
              </div>
              {formBuka.pada && (
                <input
                  className="input w-full mt-2"
                  type="datetime-local"
                  required
                  value={formBuka.pada}
                  onChange={(e) => setFormBuka((f) => (f ? { ...f, pada: e.target.value } : f))}
                />
              )}
              <span className="block text-[11px] text-gray-400 mt-1">
                {formBuka.pada
                  ? 'Booking memegang ruang 15 menit setelah jam ini. Lewat itu ruang dianggap lepas.'
                  : 'Sesi berjalan mulai sekarang.'}
              </span>
            </label>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={proses}>
                <PlusLg aria-hidden="true" /> {proses ? 'Menyimpan…' : formBuka.pada ? 'Booking' : 'Mulai'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setFormBuka(null)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Struk */}
      {struk && <StrukKaraoke data={struk} onTutup={() => setStruk(null)} />}
    </div>
  )
}

/**
 * Satu kartu ruang. Hitung mundur dihitung dari `sekarang` yang dilewatkan
 * induknya (berdetak tiap detik) — bukan timer sendiri per kartu, supaya semua
 * kartu berdetak bersamaan dan tak ada 8 interval berjalan.
 */
function KartuRuang({
  ruang,
  sesi,
  sekarang,
  proses,
  onBuka,
  onTutup,
  onBatal,
  onMinuman,
  onHapusMinuman,
  minumanDibuka,
  panel,
  produk,
  onPanel,
  onSimpanMinuman,
}: {
  ruang: Ruang
  sesi?: Sesi
  sekarang: number
  proses: boolean
  onBuka: () => void
  onTutup?: () => void
  onBatal?: () => void
  onMinuman?: () => void
  onHapusMinuman?: (b: BarisMinuman) => void
  minumanDibuka?: boolean
  panel?: { produkId: string; jumlah: string }
  produk?: Produk[]
  onPanel?: (p: { produkId: string; jumlah: string }) => void
  onSimpanMinuman?: (e: React.FormEvent) => void
}) {
  const dipakai = Boolean(sesi)

  if (!dipakai || !sesi) {
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
              {ruang.nama}
              {!ruang.aktif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">nonaktif</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {ruang.kapasitas ? `${ruang.kapasitas} orang · ` : ''}kosong
            </p>
          </div>
          <button className="btn btn-primary text-xs" onClick={onBuka} disabled={!ruang.aktif || proses}>
            <PlusLg aria-hidden="true" /> Mulai
          </button>
        </div>
      </div>
    )
  }

  const mulai = new Date(sesi.mulaiPada).getTime()
  const rencana = new Date(sesi.rencanaSelesai).getTime()
  const berjalan = sesi.status === 'BERJALAN'
  const sisaMs = rencana - sekarang
  const sisaMenit = Math.floor(sisaMs / 60000)
  const lampau = sisaMs <= 0
  const mendesak = sisaMenit <= AMBANG_MENDESAK_MENIT
  const lewatMenit = Math.floor((sekarang - mulai) / 60000)
  const lewatJam = Math.max(1, Math.ceil(lewatMenit / 60))
  const totalMinuman = (sesi.minuman ?? []).reduce((a, b) => a + Number(b.subtotal), 0)

  // Warna: BERJALAN tenang, mendesak kuning, lewat merah. BOOKING beda warna
  // supaya kasir tak mengira ruang sudah terisi.
  const warna = !berjalan
    ? 'border-purple-200 bg-purple-50'
    : lampau
      ? 'border-coral-300 bg-coral-50'
      : mendesak
        ? 'border-amber-300 bg-amber-50'
        : 'border-teal-200 bg-teal-50'

  return (
    <div className={`rounded-lg border p-4 ${warna}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
            {ruang.nama}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              berjalan ? 'bg-teal-100 text-teal-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {berjalan ? 'berjalan' : 'booking'}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {sesi.nomor} · {sesi.namaPelanggan || 'Umum'}
          </p>
        </div>

        <div className="text-right shrink-0">
          {berjalan ? (
            <>
              <p className={`text-sm font-semibold tabular-nums ${lampau ? 'text-coral-600' : mendesak ? 'text-amber-600' : 'text-teal-700'}`}>
                {lampau ? `lewat ${formatDurasi(-sisaMenit)}` : `sisa ${formatDurasi(sisaMenit)}`}
              </p>
              <p className="text-[11px] text-gray-400">
                jalan {formatDurasi(lewatMenit)} · {lewatJam} jam
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-purple-700 tabular-nums">
                {new Date(sesi.mulaiPada).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[11px] text-gray-400">jadwal mulai</p>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mt-2">
        Sewa tercatat {rupiah(sesi.totalSewa)}
        {Number(sesi.jaminan) > 0 && ` · jaminan ${rupiah(sesi.jaminan)}`}
        {totalMinuman > 0 && ` · minuman ${rupiah(totalMinuman)}`}
        {mendesak && berjalan && !lampau && ' · siap-siap ruang kosong'}
      </p>

      {/* Minuman: hanya sesi BERJALAN yang bisa dicatat. BOOKING belum
          didatangi pelanggannya, jadi mencatat minumannya berarti memotong
          stok untuk penjualan yang belum tentu terjadi. */}
      {berjalan && (
        <div className="mt-3 border-t border-gray-200/70 pt-3">
          {(sesi.minuman ?? []).length > 0 && (
            <div className="space-y-1 mb-2">
              {(sesi.minuman ?? []).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-gray-600">
                    {b.namaProduk} × {b.jumlah}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-gray-500">{rupiah(b.subtotal)}</span>
                    <button
                      type="button"
                      className="text-coral-500 hover:text-coral-700 disabled:opacity-40"
                      onClick={() => onHapusMinuman?.(b)}
                      disabled={proses}
                      aria-label={`Hapus ${b.namaProduk}`}
                      title="Hapus (stok dikembalikan)"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {minumanDibuka && panel && onPanel && (
            <form onSubmit={onSimpanMinuman} className="flex gap-2 mb-2">
              <select
                className="input flex-1 text-xs"
                value={panel.produkId}
                onChange={(e) => onPanel({ ...panel, produkId: e.target.value })}
                required
              >
                <option value="">Pilih minuman…</option>
                {(produk ?? []).map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stok <= 0}>
                    {p.nama} — {rupiah(p.hargaJual)} (stok {p.stok})
                  </option>
                ))}
              </select>
              <input
                className="input w-16 text-xs text-center"
                type="number"
                min={1}
                max={999}
                value={panel.jumlah}
                onChange={(e) => onPanel({ ...panel, jumlah: e.target.value })}
                aria-label="Jumlah"
              />
              <button type="submit" className="btn btn-primary text-xs" disabled={proses || !panel.produkId}>
                Tambah
              </button>
            </form>
          )}

          {(produk ?? []).length === 0 && minumanDibuka && (
            <p className="text-[11px] text-gray-400 mb-2">
              Belum ada produk aktif. Tambahkan di menu Produk.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {berjalan ? (
          <button className="btn btn-primary text-xs flex-1" onClick={onTutup} disabled={proses}>
            <CashCoin aria-hidden="true" /> Selesai & bayar
          </button>
        ) : (
          <button className="btn btn-primary text-xs flex-1" onClick={onTutup} disabled={proses}>
            <ClockHistory aria-hidden="true" /> Pelanggan datang
          </button>
        )}
        {onMinuman && (
          <button className="btn btn-ghost text-xs" onClick={onMinuman} disabled={proses}>
            <CupStraw aria-hidden="true" /> Minuman
          </button>
        )}
        <button className="btn btn-ghost text-xs text-coral-600" onClick={onBatal} disabled={proses}>
          Batal
        </button>
      </div>
    </div>
  )
}

/**
 * Struk karaoke. Pola sama dengan `TagihanTable.tsx`: modal + blok `@media
 * print` yang menyembunyikan seluruh body lalu memunculkan `#nota-karaoke`.
 *
 * RINCIAN PER JAM WAJIB TERCETAK. Pelanggan yang bertanya "kok mahal?" harus
 * bisa membaca jawabannya dari struk — inilah yang membuat aturan "per blok"
 * bisa diperiksa pelanggan, bukan cuma dipercaya.
 */
function StrukKaraoke({
  data,
  onTutup,
}: {
  data: { sesi: Sesi; ringkas: { sewa: number; minuman: number; jaminan: number; total: number; dibayar: number } }
  onTutup: () => void
}) {
  const { sesi, ringkas } = data
  const item = (sesi as Sesi & { item?: { jamKe: number; mulai: string; selesai: string; hargaPerJam: string | number }[] }).item ?? []

  const jam = (d: string | null) =>
    d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #nota-karaoke, #nota-karaoke * { visibility: visible !important; }
          #nota-karaoke {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100% !important; padding: 24px !important; background: white !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          <div id="nota-karaoke" className="p-6 font-mono text-sm">
            <div className="text-center mb-3">
              <div className="text-base font-bold">ZXRoom</div>
              <div className="text-xs text-gray-500">Struk Karaoke</div>
            </div>

            <div className="border-t border-dashed border-gray-300 my-3" />

            <div className="text-xs space-y-0.5">
              <div className="flex justify-between"><span>{sesi.nomor}</span><span>{jam(sesi.mulaiPada)}</span></div>
              <div className="flex justify-between">
                <span>Ruang</span>
                <span>{sesi.ruang?.nama ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>Pelanggan</span>
                <span>{sesi.namaPelanggan || 'Umum'}</span>
              </div>
              <div className="flex justify-between">
                <span>Mulai</span>
                <span>{jam(sesi.mulaiPada)}</span>
              </div>
              <div className="flex justify-between">
                <span>Selesai</span>
                <span>{jam(sesi.selesaiAktual)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Durasi ditagih</span>
                <span>{sesi.jumlahJam} jam</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 my-3" />

            {/* Rincian per jam — jawaban untuk "kok mahal?" */}
            <div className="text-xs space-y-0.5">
              {item.map((it) => (
                <div key={it.jamKe} className="flex justify-between">
                  <span>
                    Jam {it.jamKe} ({jam(it.mulai)}–{jam(it.selesai)})
                  </span>
                  <span>{Number(it.hargaPerJam).toLocaleString('id-ID')}</span>
                </div>
              ))}
              {item.length === 0 && (
                <div className="flex justify-between">
                  <span>Sewa {sesi.jumlahJam} jam</span>
                  <span>{Number(ringkas.sewa).toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-gray-300 my-3" />

            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Sewa ruang</span>
                <span>{rupiah(ringkas.sewa)}</span>
              </div>
              {ringkas.minuman > 0 && (
                <div className="flex justify-between">
                  <span>Minuman</span>
                  <span>{rupiah(ringkas.minuman)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-gray-300 pt-1">
                <span>TOTAL</span>
                <span>{rupiah(ringkas.total)}</span>
              </div>
              {ringkas.jaminan > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span>Jaminan dibayar di depan</span>
                    <span>-{rupiah(ringkas.jaminan)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>DIBAYAR SEKARANG</span>
                    <span>{rupiah(ringkas.dibayar)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-dashed border-gray-300 my-3" />
            <p className="text-[10px] text-center text-gray-400">
              Tarif per jam ditentukan jam mulai tiap jam. Terima kasih.
            </p>
          </div>

          <div className="flex gap-2 p-4 border-t border-gray-100">
            <button className="btn btn-primary flex-1" onClick={() => window.print()}>
              <Printer aria-hidden="true" /> Cetak
            </button>
            <button className="btn btn-ghost" onClick={onTutup}>
              Tutup
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
