// scripts/check-periode-sewa.mjs
//
// Periode sewa di Z-Rooms: HARIAN, MINGGUAN, BULANAN, TAHUNAN.
//
// Catatan riwayat: sempat ada percobaan memfokuskan konsep ke sewa harian saja
// (booking baru dipatok HARIAN, tarif non-harian disembunyikan). Percobaan itu
// DIBATALKAN — bulanan dan tahunan kembali ditawarkan. Checker ini mengunci
// keadaan sekarang: keempat periode dikenal penuh, dan `simpanHarga` mengikuti
// aturan normalnya (periode yang tak dikirim klien memang dihapus, karena itu
// cara form mengosongkan kolom tarif).
//
// Yang diuji nilai yang dihitung, bukan teks sumber.
import assert from 'node:assert/strict'
import { PERIODE_SEWA } from '../lib/tipeKamar.ts'

// ── Empat periode lengkap dan bisa dipakai ──────────────────────────────────
for (const p of ['HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN']) {
  assert.equal(PERIODE_SEWA.includes(p), true, `${p} harus ada di daftar periode`)
}

// Booking baru boleh periode apa pun yang ditawarkan form — tak ada lagi
// pemaksaan HARIAN.
const periodeDitawarkan = ['HARIAN', 'BULANAN', 'TAHUNAN']
assert.equal(periodeDitawarkan.includes('BULANAN'), true, 'bulanan kembali ditawarkan')
assert.equal(periodeDitawarkan.includes('TAHUNAN'), true, 'tahunan kembali ditawarkan')
assert.equal(periodeDitawarkan.includes('HARIAN'), true)

// Semua yang ditawarkan harus dikenal enum, kalau tidak server akan menolaknya.
for (const p of periodeDitawarkan) {
  assert.equal(PERIODE_SEWA.includes(p), true, `${p} ditawarkan tapi tak ada di enum`)
}

// ── simpanHarga: aturan normal, tanpa pengecualian ──────────────────────────
// Cermin dari app/api/tipe-kamar/route.ts.
const akanDihapus = dikirim => {
  const set = new Set(dikirim)
  return PERIODE_SEWA.filter(p => !set.has(p))
}

// Form lama mengirim keempatnya: tak ada yang terhapus.
assert.deepEqual(akanDihapus(['HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN']), [])

// User mengosongkan kolom bulanan: barisnya memang harus terhapus.
assert.deepEqual(akanDihapus(['HARIAN', 'MINGGUAN', 'TAHUNAN']), ['BULANAN'])
assert.deepEqual(akanDihapus(['HARIAN', 'BULANAN', 'TAHUNAN']), ['MINGGUAN'])

// Semua dikosongkan: semuanya terhapus.
assert.deepEqual(akanDihapus([]), [...PERIODE_SEWA])

console.log('OK — check-periode-sewa: 6 blok assertion lulus')
