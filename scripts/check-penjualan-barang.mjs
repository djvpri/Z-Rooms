// scripts/check-penjualan-barang.mjs
//
// MENGIMPOR lib/produk.ts langsung (bukan menyalin). Salinan pernah terbukti
// tak menjaga apa pun — lihat skill zxroom: fallback diubah, test tetap hijau.
//
// Yang dijaga di sini: perhitungan uang & nomor struk. Keduanya jalur yang
// kalau salah tidak meledak, cuma diam-diam salah.

import assert from 'node:assert/strict'
import { hitungJual, nomorJualBerikut, labaJual, JUMLAH_MAKS } from '../lib/produk.ts'

let n = 0
const blok = (nama, fn) => { fn(); n++; console.log(`  ok ${n} — ${nama}`) }

const baris = (produkId, hargaSatuan, jumlah, stokTersedia = 100, nama = produkId) =>
  ({ produkId, nama, hargaSatuan, hargaBeli: null, jumlah, stokTersedia })

// ── Subtotal ────────────────────────────────────────────────────────

blok('subtotal = harga × jumlah, dijumlahkan antar baris', () => {
  const r = hitungJual([baris('a', 4000, 2), baris('b', 7000, 1)])
  assert.equal(r.subtotal, 15000)
  assert.equal(r.kurang.length, 0)
})

blok('keranjang kosong → subtotal 0, tak ada yang kurang', () => {
  const r = hitungJual([])
  assert.equal(r.subtotal, 0)
  assert.equal(r.kurang.length, 0)
})

blok('harga 0 (produk gratis) tetap dihitung, tidak jadi NaN', () => {
  const r = hitungJual([baris('a', 0, 3)])
  assert.equal(r.subtotal, 0)
  assert.ok(Number.isFinite(r.subtotal))
})

// ── Stok — ini yang wajib TERTANGKAP, bukan cuma "ada pemeriksa" ────

blok('stok kurang → produk itu dilaporkan, lengkap dengan angkanya', () => {
  const r = hitungJual([baris('a', 4000, 5, 3, 'Air Mineral')])
  assert.equal(r.kurang.length, 1)
  assert.equal(r.kurang[0].nama, 'Air Mineral')
  assert.equal(r.kurang[0].diminta, 5)
  assert.equal(r.kurang[0].tersedia, 3)
})

blok('UJI-NEGATIF: stok PAS masih boleh dijual (batas bukan <, tapi >)', () => {
  // Kalau pemeriksa memakai `>=` alih-alih `>`, ini akan gagal — dan itu
  // memang tujuannya: menjual barang terakhir harus tetap mungkin.
  const r = hitungJual([baris('a', 4000, 3, 3)])
  assert.equal(r.kurang.length, 0)
})

blok('UJI-NEGATIF: produk SAMA dua baris dijumlahkan sebelum dinilai', () => {
  // Keranjang bisa memuat produk sama dua kali (kasir menambah lagi). Menilai
  // tiap baris sendiri-sendiri akan meloloskan stok yang sebenarnya kurang:
  // 3+3=6 diminta, stok cuma 4.
  const r = hitungJual([baris('a', 4000, 3, 4, 'Teh'), baris('a', 4000, 3, 4, 'Teh')])
  assert.equal(r.kurang.length, 1, 'produk sama harus digabung, bukan dinilai terpisah')
  assert.equal(r.kurang[0].diminta, 6)
  assert.equal(r.kurang[0].tersedia, 4)
})

blok('produk sama, jumlah gabungan masih cukup → tak dilaporkan', () => {
  const r = hitungJual([baris('a', 4000, 2, 5), baris('a', 4000, 2, 5)])
  assert.equal(r.kurang.length, 0)
  assert.equal(r.subtotal, 16000)
})

blok('stok minus di DB (sudah selisih) → dilaporkan kurang', () => {
  const r = hitungJual([baris('a', 4000, 1, -2)])
  assert.equal(r.kurang.length, 1)
  assert.equal(r.kurang[0].tersedia, -2)
})

blok('hanya produk yang kurang yang dilaporkan, yang cukup tidak ikut', () => {
  const r = hitungJual([baris('a', 4000, 10, 2, 'Kurang'), baris('b', 5000, 1, 9, 'Cukup')])
  assert.equal(r.kurang.length, 1)
  assert.equal(r.kurang[0].nama, 'Kurang')
})

// ── Nomor struk ─────────────────────────────────────────────────────

blok('nomor pertama → PJ-0001', () => {
  assert.equal(nomorJualBerikut(null), 'PJ-0001')
  assert.equal(nomorJualBerikut(undefined), 'PJ-0001')
})

blok('nomor naik satu dari yang TERTINGGI', () => {
  assert.equal(nomorJualBerikut('PJ-0007'), 'PJ-0008')
})

blok('UJI-NEGATIF: lewat 9, PJ-0010 tetap naik dari PJ-0009', () => {
  // Kalau nomor dibandingkan sebagai teks, 'PJ-0010' < 'PJ-0009' dan nomor
  // berikutnya akan mundur jadi 0010 lagi — menabrak unique(propertiId, nomor).
  assert.equal(nomorJualBerikut('PJ-0009'), 'PJ-0010')
  assert.equal(nomorJualBerikut('PJ-0010'), 'PJ-0011')
})

blok('format tetap 4 digit sampai 9999', () => {
  assert.equal(nomorJualBerikut('PJ-0999'), 'PJ-1000')
  assert.equal(nomorJualBerikut('PJ-9998'), 'PJ-9999')
})

blok('nomor rusak/asing → jatuh ke 0001, bukan NaN', () => {
  assert.equal(nomorJualBerikut(''), 'PJ-0001')
  assert.equal(nomorJualBerikut('xxx'), 'PJ-0001')
  assert.ok(!nomorJualBerikut('xxx').includes('NaN'))
})

// ── Laba ────────────────────────────────────────────────────────────

blok('laba = (jual − modal) × jumlah', () => {
  assert.equal(labaJual([{ hargaSatuan: 4000, hargaBeli: 2500, jumlah: 3 }]), 4500)
})

blok('baris tanpa modal dihitung modal 0, bukan NaN', () => {
  // Pemilik sering belum mengisi HPP. Laba harus tetap keluar angkanya.
  assert.equal(labaJual([{ hargaSatuan: 4000, hargaBeli: null, jumlah: 2 }]), 8000)
  assert.equal(labaJual([{ hargaSatuan: 4000, hargaBeli: undefined, jumlah: 2 }]), 8000)
})

blok('Decimal-as-string tetap terbaca sebagai angka', () => {
  assert.equal(labaJual([{ hargaSatuan: '5000', hargaBeli: '3000', jumlah: 4 }]), 8000)
})

blok('jual di bawah modal → laba negatif (bukan dijepit ke 0)', () => {
  // Menjepit ke 0 akan menyembunyikan barang yang dijual rugi.
  assert.equal(labaJual([{ hargaSatuan: 2000, hargaBeli: 3000, jumlah: 2 }]), -2000)
})

// ── Batas ───────────────────────────────────────────────────────────

blok('JUMLAH_MAKS masuk akal (>0 dan bulat)', () => {
  assert.ok(Number.isInteger(JUMLAH_MAKS) && JUMLAH_MAKS > 0)
})

console.log(`\nOK — check-penjualan-barang: ${n} blok assertion lulus`)
