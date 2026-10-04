'use client'
// app/offline/page.tsx
//
// MODE OFFLINE — dirender 100% dari perangkat, tanpa satu pun permintaan ke
// server (server sedang tak terjangkau; itulah gunanya halaman ini).
//
// Sumber data: localStorage `zxroom.snapshot` — diisi otomatis oleh
// lib/offline.ts tiap kali halaman web normal berhasil dimuat saat online.
// Transaksi (bayar tagihan / jual barang / check-in) dimasukkan ke outbox
// `zxroom.outbox` dan dikirim otomatis ke /api/sinkron begitu online kembali.
//
// Auth sengaja TIDAK dicek di sini: server tak terjangkau, tak ada yang bisa
// diverifikasi. Data snapshot per properti milik siapa pun yang terakhir
// login di perangkat ini — sama seperti cache WebView umumnya.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUKA_HALAMAN_OFFLINE, simpanSnapshot, ambilSnapshot, Snapshot,
  muatOutbox, antreOperasi, hapusDariOutbox, kirimOutbox, Operasi,
} from '@/lib/offline'
import { catat, isiLog, perangkatId, jumlahBaris } from '@/lib/logError'

function rupiah(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}
function jam(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Tab = 'kamar' | 'tagihan' | 'jualan' | 'outbox'
type Item = { produkId: string; nama: string; harga: number; jumlah: number }

export default function HalamanOffline() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<Tab>('kamar')
  const [outbox, setOutbox] = useState<Operasi[]>([])
  const [sewaAktif, setSewaAktif] = useState('') // sewaId utk penjualan titipan
  const [item, setItem] = useState<Item[]>([])
  const [metode, setMetode] = useState('TUNAI')
  const [pesan, setPesan] = useState('')
  const [sedangLog, setSedangLog] = useState(false)
  const [pesanLog, setPesanLog] = useState('')

  const muatSemua = useCallback(() => {
    setSnap(ambilSnapshot())
    setOutbox(muatOutbox())
  }, [])

  useEffect(() => {
    if (!sessionStorage.getItem(BUKA_HALAMAN_OFFLINE)) {
      // Buka langsung via URL (bukan lewat offline.ts) — kasir salah alamat.
      // Snapshot tetap dirender kalau ada; ini cuma penanda.
      sessionStorage.setItem(BUKA_HALAMAN_OFFLINE, '1')
    }
    // Diagnostik "Belum ada data tersimpan" (laporan kasir 2026-10-04):
    // halaman ini terbuka tapi snapshot kosong — catat keadaannya supaya
    // laporan log memperlihatkan sebabnya (belum pernah online? quota?).
    catat('INFO', `offline/buka: snapshot=${snap ? 'ada' : 'KOSONG'} navigatorOnline=${navigator.onLine} sw=${'serviceWorker' in navigator}`)
    muatSemua()
    // Coba kirim outbox saat online kembali / saat halaman dibuka.
    kirimOutbox().finally(muatSemua)
    const dt = () => kirimOutbox().finally(muatSemua)
    window.addEventListener('online', dt)
    return () => window.removeEventListener('online', dt)
  }, [muatSemua])

  const kamarDenganSewa = useMemo(() => {
    if (!snap) return []
    return snap.kamar.filter((k) => k.sewa.length > 0)
  }, [snap])

  function pilihSnapshotBaru() {
    // Paksa muat snapshot segar saat online — dipakai pertama kali.
    fetch('/api/snapshot')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.kamar) {
          simpanSnapshot(data)
          muatSemua()
          catat('INFO', `offline/snapshot: tersimpan (${data.kamar.length} kamar)`)
          setPesan('Snapshot terbaru disimpan.')
        } else {
          catat('INFO', 'offline/snapshot: balasan tak valid (masih offline?)')
          setPesan('Gagal mengambil snapshot (masih offline?).')
        }
      })
      .catch((e) => {
        catat('KESALAHAN', `offline/snapshot: ${e?.message ?? e}`)
        setPesan('Gagal mengambil snapshot (masih offline?).')
      })
  }

  // ── aksi outbox ──
  function antre(op: Operasi, teks: string) {
    antreOperasi(op)
    setPesan(`${teks} masuk antrean — dikirim otomatis saat online.`)
    muatSemua()
  }
  function bayarTagihan(tagihanId: string, label: string, nominal: number) {
    antre(
      { jenis: 'BAYAR_TAGIHAN', idOperasi: crypto.randomUUID(), tagihanId, metodeBayar: metode, dibuatKlien: new Date().toISOString() },
      `Bayar ${label} ${rupiah(nominal)}`,
    )
  }
  function checkin(sewaId: string, label: string) {
    antre(
      { jenis: 'CHECKIN', idOperasi: crypto.randomUUID(), sewaId, dibuatKlien: new Date().toISOString() },
      `Check-in ${label}`,
    )
  }
  function tambahItem(produkId: string, nama: string, harga: number) {
    setItem((s) => {
      const ada = s.find((x) => x.produkId === produkId)
      return ada
        ? s.map((x) => (x.produkId === produkId ? { ...x, jumlah: x.jumlah + 1 } : x))
        : [...s, { produkId, nama, harga, jumlah: 1 }]
    })
  }
  function simpanPenjualan() {
    const total = item.reduce((a, x) => a + x.harga * x.jumlah, 0)
    antre(
      {
        jenis: 'PENJUALAN', idOperasi: crypto.randomUUID(),
        item: item.map((x) => ({ produkId: x.produkId, jumlah: x.jumlah })),
        sewaId: sewaAktif || null, metodeBayar: metode,
        dibuatKlien: new Date().toISOString(),
      },
      `Penjualan ${rupiah(total)}${sewaAktif ? ' (titipan)' : ' (lepas)'}`,
    )
    setItem([])
  }

  function kirimLogOffline() {
    setSedangLog(true)
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perangkat: perangkatId(), nama: '', konten: isiLog() }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        const ok = (d as { ok?: boolean; dedup?: boolean }).ok
        setPesanLog(ok ? (jumlahBaris() > 0 ? `Log terkirim (${jumlahBaris()} kejadian).` : 'Log terkirim.') : `Gagal mengirim log (${JSON.stringify(d)})`)
        if (ok) setPesanLog('Laporan log terkirim.')
      })
      .catch(() => setPesanLog('Tak bisa menghubungi server — masih offline. Coba lagi saat wifi nyala.'))
      .finally(() => setSedangLog(false))
  }

  if (!snap) {
    return (
      <main className="max-w-md mx-auto p-6 pt-16 text-center">
        <i className="bi bi-wifi-off text-5xl text-gray-300" aria-hidden="true" />
        <h1 className="text-xl font-bold mt-4">Mode Offline</h1>
        <p className="text-sm text-gray-500 mt-2">
          Belum ada data tersimpan di perangkat ini. Buka aplikasi sekali saat
          online — data akan disimpan otomatis dan siap dipakai offline.
        </p>
        <button onClick={pilihSnapshotBaru} className="btn-teal mt-4">Coba ambil data</button>
        {pesanLog && <p className="text-xs text-gray-500 mt-2">{pesanLog}</p>}
        <button onClick={kirimLogOffline} disabled={sedangLog}
          className="mt-3 text-xs text-gray-400 underline">
          {sedangLog ? 'Mengirim…' : `Kirim log error (${jumlahBaris()} kejadian)`}
        </button>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24">
      <header className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-bold flex items-center gap-2">
            <i className="bi bi-wifi-off text-amber-500" aria-hidden="true" /> Mode Offline
          </h1>
          <p className="text-xs text-gray-500">{snap.properti.nama} · data {jam(snap.diambilPada)}</p>
        </div>
        <button onClick={pilihSnapshotBaru} className="text-xs text-teal-600 underline">muat ulang</button>
      </header>

      {pesan && <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg px-3 py-2 mb-3">{pesan}</div>}

      <nav className="flex gap-1 mb-4" role="tablist">
        {([
          ['kamar', `Kamar (${kamarDenganSewa.length})`],
          ['tagihan', `Tagihan (${snap.tagihan.length})`],
          ['jualan', 'Jual barang'],
          ['outbox', `Antrean (${outbox.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'kamar' && (
        <ul className="space-y-2">
          {kamarDenganSewa.map((k) => {
            const s = k.sewa[0]
            const tagihan = s.tagihan.reduce((a, t) => a + t.nominal, 0)
            return (
              <li key={k.id} className="bg-white border rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold">Kamar {k.nomor}</span>
                    <span className={`ml-2 badge ${s.statusSewa === 'AKTIF' ? 'badge-green' : 'badge-amber'}`}>{s.statusSewa}</span>
                    <p className="text-sm text-gray-600">{s.penyewa?.nama ?? 'tanpa nama'}{s.penyewa?.noHp ? ` · ${s.penyewa.noHp}` : ''}</p>
                    {tagihan > 0 && <p className="text-sm text-red-600">Tagihan {rupiah(tagihan)}</p>}
                    {s.sisaBarang > 0 && <p className="text-sm text-gray-600">Titipan {rupiah(s.sisaBarang)}</p>}
                  </div>
                  {s.statusSewa === 'PENDING' && (
                    <button onClick={() => checkin(s.id, `kamar ${k.nomor}`)}
                      className="text-sm bg-teal-600 text-white px-3 py-1.5 rounded-lg">
                      <i className="bi bi-box-arrow-in-right" aria-hidden="true" /> Check-in
                    </button>
                  )}
                  {s.statusSewa === 'AKTIF' && (
                    <button onClick={() => { setSewaAktif(s.id); setTab('jualan') }}
                      className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg">
                      <i className="bi bi-cart-plus" aria-hidden="true" /> Jual
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {kamarDenganSewa.length === 0 && <li className="text-sm text-gray-500 p-4">Tidak ada kamar terisi/booking pada data tersimpan.</li>}
        </ul>
      )}

      {tab === 'tagihan' && (
        <ul className="space-y-2">
          {snap.tagihan.map((t) => (
            <li key={t.id} className="bg-white border rounded-xl p-3 flex justify-between items-center">
              <div>
                <span className="font-bold">Kamar {t.kamarNomor}</span>
                <span className="ml-2 text-sm text-gray-600">{t.penyewaNama ?? '-'}</span>
                <p className="text-sm">{rupiah(t.nominal)} · <span className="text-gray-500">tempo {jam(t.jatuhTempo)}</span>{t.status !== 'BELUM_BAYAR' && ` · ${t.status}`}</p>
              </div>
              <button onClick={() => bayarTagihan(t.id, `kamar ${t.kamarNomor}`, t.nominal)}
                className="text-sm bg-teal-600 text-white px-3 py-1.5 rounded-lg">
                <i className="bi bi-cash-coin" aria-hidden="true" /> Bayar
              </button>
            </li>
          ))}
          {snap.tagihan.length === 0 && <li className="text-sm text-gray-500 p-4">Semua tagihan lunas pada data tersimpan.</li>}
        </ul>
      )}

      {tab === 'jualan' && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-gray-600" htmlFor="of-s">Titipan kamar</label>
            <select id="of-s" value={sewaAktif} onChange={(e) => setSewaAktif(e.target.value)}
              className="form-input flex-1">
              <option value="">— jual lepas (lunas) —</option>
              {snap.kamar.flatMap((k) => k.sewa.filter((s) => s.statusSewa === 'AKTIF')
                .map((s) => <option key={s.id} value={s.id}>Kamar {k.nomor} · {s.penyewa?.nama ?? '-'}</option>))}
            </select>
          </div>
          <ul className="grid grid-cols-2 gap-2 mb-3">
            {snap.produk.map((p) => (
              <li key={p.id}>
                <button onClick={() => tambahItem(p.id, p.nama, p.hargaJual)}
                  className="w-full text-left bg-white border rounded-xl p-3">
                  <span className="text-sm font-medium">{p.nama}</span>
                  <span className="block text-xs text-gray-500">{rupiah(p.hargaJual)} · stok {p.stok}</span>
                </button>
              </li>
            ))}
          </ul>
          {item.length > 0 && (
            <div className="bg-white border rounded-xl p-3">
              <ul className="text-sm">
                {item.map((x) => (
                  <li key={x.produkId} className="flex justify-between py-0.5">
                    <span>{x.nama} × {x.jumlah}</span>
                    <span>{rupiah(x.harga * x.jumlah)}
                      <button onClick={() => setItem((s) => s.map((y) => y.produkId === x.produkId ? { ...y, jumlah: y.jumlah - 1 } : y).filter((y) => y.jumlah > 0))}
                        className="ml-2 text-red-500" aria-label={`kurangi ${x.nama}`}><i className="bi bi-dash-circle" aria-hidden="true" /></button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between items-center mt-2 pt-2 border-t">
                <span className="font-bold">{rupiah(item.reduce((a, x) => a + x.harga * x.jumlah, 0))}</span>
                <button onClick={simpanPenjualan} className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm">Catat</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'outbox' && (
        <div>
          <button onClick={() => kirimOutbox().finally(muatSemua)}
            className="mb-3 bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm">
            <i className="bi bi-cloud-arrow-up" aria-hidden="true" /> Kirim sekarang
          </button>
          <ul className="space-y-2">
            {outbox.map((o) => (
              <li key={o.idOperasi} className="bg-white border rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm">{o.jenis === 'BAYAR_TAGIHAN' ? 'Pembayaran' : o.jenis === 'PENJUALAN' ? 'Penjualan' : 'Check-in'} · menunggu kirim</span>
                <button onClick={() => { hapusDariOutbox(o.idOperasi); muatSemua() }}
                  className="text-red-500 text-sm" aria-label="batal antre">
                  <i className="bi bi-x-circle" aria-hidden="true" />
                </button>
              </li>
            ))}
            {outbox.length === 0 && <li className="text-sm text-gray-500 p-4">Antrean kosong — semua sudah terkirim.</li>}
          </ul>
        </div>
      )}
    </main>
  )
}
