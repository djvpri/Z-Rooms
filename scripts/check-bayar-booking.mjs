// scripts/check-bayar-booking.mjs
//
// Self-check logika "bayar sekarang saat booking" di app/api/booking/route.ts.
// Jalankan: node scripts/check-bayar-booking.mjs
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
// Salinan logika cabang bayarSekarang (route memilih status tagihan + apakah
// menulis baris Pembayaran). Kalau route diubah, ubah juga di sini — invarian
// yang dijaga ada di komentar atas tiap blok.

const assert = (ok, pesan) => { if (!ok) throw new Error(`GAGAL: ${pesan}`) }

// Cermin dari route: status tagihan + baris pembayaran yang ditulis.
function transaksiBooking({ harga, bayarSekarang, metodeBayar }) {
  const tagihan = { nominal: Number(harga), status: bayarSekarang ? 'LUNAS' : 'BELUM_BAYAR' }
  const pembayaran = []
  if (bayarSekarang) {
    pembayaran.push({ tagihanNominal: tagihan.nominal, nominal: Number(harga), metodeBayar })
  }
  // Kamar TIDAK berubah karena bayarSekarang — tetap TERISI (opsi B).
  return { tagihan, pembayaran, kamarStatus: 'TERISI' }
}

const H = 1_500_000

// 1. bayarSekarang=false: tak ada Pembayaran, tagihan BELUM_BAYAR.
{
  const r = transaksiBooking({ harga: H, bayarSekarang: false, metodeBayar: 'TUNAI' })
  assert(r.pembayaran.length === 0, 'false tak boleh menulis Pembayaran')
  assert(r.tagihan.status === 'BELUM_BAYAR', 'false harus BELUM_BAYAR')
}

// 2. bayarSekarang=true: TEPAT SATU Pembayaran (bukan nol, bukan dua).
{
  const r = transaksiBooking({ harga: H, bayarSekarang: true, metodeBayar: 'TRANSFER' })
  assert(r.pembayaran.length === 1, `true harus 1 Pembayaran, dapat ${r.pembayaran.length}`)
}

// 3. tagihan WAJIB LUNAS saat true — keuangan/route.ts menjumlahkan status
//    LUNAS, bukan baris Pembayaran. Pembayaran tanpa LUNAS = uang tak terlihat.
{
  const r = transaksiBooking({ harga: H, bayarSekarang: true, metodeBayar: 'TUNAI' })
  assert(r.tagihan.status === 'LUNAS', 'true harus LUNAS, bukan hanya bikin Pembayaran')
}

// 4. nominal Pembayaran HARUS sama dengan nominal tagihan (tak ada selisih,
//    tak ada double-count).
for (const harga of [0, 1, 999, 1_500_000, 12_345_678]) {
  const r = transaksiBooking({ harga, bayarSekarang: true, metodeBayar: 'QRIS' })
  assert(r.pembayaran[0].nominal === r.tagihan.nominal, `nominal beda utk harga ${harga}`)
  assert(r.pembayaran[0].tagihanNominal === r.tagihan.nominal, `tagihanId ragu utk harga ${harga}`)
}

// 5. metodeBayar diteruskan apa adanya (tak diam-diam jadi TUNAI).
for (const m of ['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']) {
  const r = transaksiBooking({ harga: H, bayarSekarang: true, metodeBayar: m })
  assert(r.pembayaran[0].metodeBayar === m, `metodeBayar ${m} berubah`)
}

// 6. Status kamar TIDAK bergantung pada bayarSekarang (opsi B: DIPESAN belum
//    dipakai, kamar tetap TERISI untuk kedua cabang).
for (const b of [true, false]) {
  assert(transaksiBooking({ harga: H, bayarSekarang: b, metodeBayar: 'TUNAI' }).kamarStatus === 'TERISI',
    `kamarStatus berubah saat bayarSekarang=${b}`)
}

// 7. Jumlah Pembayaran per tagihan = jumlah cabang true (tak ada duplikat
//    kalau fungsi dipanggil berkali-kali).
{
  const total = [true, true, false, true].flatMap(b =>
    transaksiBooking({ harga: H, bayarSekarang: b, metodeBayar: 'TUNAI' }).pembayaran).length
  assert(total === 3, `harus 3 Pembayaran dari 3 booking lunas, dapat ${total}`)
}

console.log('OK — check-bayar-booking: 7 blok assertion lulus')
