// scripts/check-lunasi-checkout.mjs
//
// Self-check logika "bayar saat check-out" di
// app/api/sewa/[id]/checkout/route.ts. Jalankan:
//   node scripts/check-lunasi-checkout.mjs
//
// ─────────────────────────────────────────────────────────────────────────
// PERINGATAN: berkas ini MENYALIN alur dari route, bukan mengimpornya.
// Mengubah route TIDAK membuat test ini gagal. Ia menjaga INVARIAN (kontrak
// yang disepakati), bukan implementasi — jadi ia tetap berguna untuk menahan
// keputusan produk berubah diam-diam, tapi jangan percaya ia membuktikan
// route masih benar.
//
// Mengapa belum diperbaiki seperti check-jam-checkout.mjs: logika yang diuji
// di sini tersebar di dalam prisma.$transaction, jadi mengimpornya butuh
// memisahkan orkestrasi transaksi dari Prisma — refactor besar pada jalur
// uang. Dikerjakan hanya kalau bagian ini memang perlu sering diubah.
// ─────────────────────────────────────────────────────────────────────────
//
// Salinan logika keputusan route (tanpa Prisma/DB). Kalau route berubah,
// ubah file ini juga.
//
// Invarian yang dijaga:
//   I1. lunasi=false + ada tagihan + paksa=false -> 409 MASIH_ADA_TAGIHAN
//   I2. lunasi=true  + ada tagihan                -> lanjut (tak perlu paksa)
//   I3. lunasi=true  -> tiap tagihan dapat tepat 1 Pembayaran senominal tagihan
//   I4. lunasi=true  -> SEMUA tagihan jadi LUNAS (laporan keuangan baca status,
//       bukan baris Pembayaran — kalau ini lewat, uang tak muncul di laporan)
//   I5. lunasi=false -> tak ada Pembayaran atas tagihan sewa
//   I6. lunasi diabaikan kalau tak ada tagihan (tak ada pembayaran hantu 0)
//   I7. lunasi=true  -> penjualan titipan juga jadi LUNAS (jalur uang sendiri,
//       bukan lewat Tagihan — kalau ini lewat, barang tak pernah terbayar)
//   I8. lunasi=false -> penjualan titipan tetap BELUM_BAYAR
import assert from 'node:assert/strict'

/** Salinan keputusan guard di route. */
function perluPaksa({ sisaTagihan, paksa, lunasi }) {
  return sisaTagihan > 0 && !paksa && !lunasi
}

/** Salinan blok transaksi lunasi di route. `penjualan` = titipan barang,
 *  jalur uang SENDIRI (model Penjualan, bukan Tagihan) tapi ikut dilunasi. */
function jalankanLunasi({ tagihan, penjualan = [], lunasi, metodeBayar, keluarAktual }) {
  const pembayaran = []
  const status = new Map([...tagihan, ...penjualan].map(t => [t.id, t.status]))
  const dilunasi = []
  if (lunasi && tagihan.length > 0) {
    for (const t of tagihan) {
      pembayaran.push({
        tagihanId: t.id,
        nominal: Number(t.nominal),
        metodeBayar,
        dibayarPada: keluarAktual,
      })
      status.set(t.id, 'LUNAS')
      dilunasi.push(t.id)
    }
  }
  if (lunasi) for (const p of penjualan) status.set(p.id, 'LUNAS')
  return { pembayaran, status, dilunasi }
}

const TAGIHAN = [
  { id: 't1', nominal: 1_500_000, status: 'BELUM_BAYAR' },
  { id: 't2', nominal: 250_000, status: 'TERLAMBAT' },
]
const KELUAR = new Date('2026-09-15T00:00:00Z')

// I1 — belum lunas tanpa izin -> 409
assert.equal(perluPaksa({ sisaTagihan: 1_750_000, paksa: false, lunasi: false }), true)
// I2 — lunasi=true -> lanjut tanpa paksa
assert.equal(perluPaksa({ sisaTagihan: 1_750_000, paksa: false, lunasi: true }), false)
// paksa=true tetap jalan (perilaku lama tak berubah)
assert.equal(perluPaksa({ sisaTagihan: 1_750_000, paksa: true, lunasi: false }), false)
// tanpa tagihan -> tak pernah minta paksa
assert.equal(perluPaksa({ sisaTagihan: 0, paksa: false, lunasi: false }), false)

// I3, I4 — lunasi: satu pembayaran per tagihan, nominal sama, semua LUNAS
{
  const { pembayaran, status, dilunasi } = jalankanLunasi({
    tagihan: TAGIHAN, lunasi: true, metodeBayar: 'TRANSFER', keluarAktual: KELUAR,
  })
  assert.equal(pembayaran.length, TAGIHAN.length)
  assert.equal(dilunasi.length, TAGIHAN.length)
  for (const t of TAGIHAN) {
    const p = pembayaran.filter(x => x.tagihanId === t.id)
    assert.equal(p.length, 1, `tagihan ${t.id} harus tepat 1 pembayaran`)
    assert.equal(p[0].nominal, Number(t.nominal))
    assert.equal(p[0].metodeBayar, 'TRANSFER')
    assert.deepEqual(p[0].dibayarPada, KELUAR)
    assert.equal(status.get(t.id), 'LUNAS')
  }
  // total uang masuk == total tagihan, tak ada dobel
  const total = pembayaran.reduce((s, p) => s + p.nominal, 0)
  assert.equal(total, TAGIHAN.reduce((s, t) => s + Number(t.nominal), 0))
}

// I5 — lunasi=false -> nol pembayaran, status tak tersentuh
{
  const { pembayaran, status, dilunasi } = jalankanLunasi({
    tagihan: TAGIHAN, lunasi: false, metodeBayar: 'TUNAI', keluarAktual: KELUAR,
  })
  assert.equal(pembayaran.length, 0)
  assert.equal(dilunasi.length, 0)
  assert.equal(status.get('t1'), 'BELUM_BAYAR')
  assert.equal(status.get('t2'), 'TERLAMBAT')
}

// I6 — lunasi=true tapi tak ada tagihan -> tak ada pembayaran hantu nominal 0
{
  const { pembayaran, dilunasi } = jalankanLunasi({
    tagihan: [], lunasi: true, metodeBayar: 'TUNAI', keluarAktual: KELUAR,
  })
  assert.equal(pembayaran.length, 0)
  assert.equal(dilunasi.length, 0)
}

// I7, I8 — penjualan titipan ikut dilunasi, dan hanya kalau lunasi=true
{
  const PENJUALAN = [
    { id: 'p1', total: 7000, status: 'BELUM_BAYAR' },
    { id: 'p2', total: 5000, status: 'BELUM_BAYAR' },
  ]
  const { status } = jalankanLunasi({
    tagihan: [], penjualan: PENJUALAN, lunasi: true, metodeBayar: 'TUNAI', keluarAktual: KELUAR,
  })
  assert.equal(status.get('p1'), 'LUNAS')
  assert.equal(status.get('p2'), 'LUNAS')
  const s2 = jalankanLunasi({
    tagihan: [], penjualan: PENJUALAN, lunasi: false, metodeBayar: 'TUNAI', keluarAktual: KELUAR,
  }).status
  assert.equal(s2.get('p1'), 'BELUM_BAYAR')
  assert.equal(s2.get('p2'), 'BELUM_BAYAR')
}

console.log('OK — 8 blok assertion lulus (lunasi saat check-out)')
