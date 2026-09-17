// scripts/check-jadwal-grid.mjs
//
// Menguji jadwal 14 hari satu kamar (lib/jadwalGrid.ts): peta jam terpakai.
//
// Yang diuji bukan tampilan, tapi kebenaran pewarnaan sel: sel kuning = kamar
// tak bisa dihuni pada jam itu. Kalau salah, kasir menolak penyewa yang
// sebenarnya bisa masuk — atau lebih buruk, menerima yang bentrok.
//
// Diimpor dari lib aslinya, BUKAN disalin.
import assert from 'node:assert/strict'
import { daftarHari, petaTerpakai, labelJam, kunciTanggal, HARI } from '../lib/jadwalGrid.ts'

const aturan = { jamCheckout: '12:00', toleransiCheckout: 0 }

/** Sewa dengan komponen waktu LOKAL (WIB), bukan UTC. */
const s = (y, m, d, j = 0, mi = 0) => new Date(y, m - 1, d, j, mi)

const sekarang = s(2026, 9, 17, 10, 0)

// ── Jendela 14 hari ──────────────────────────────────────────────────────────
assert.equal(HARI, 14, 'owner minta 14 hari')
const hari = daftarHari(sekarang)
assert.equal(hari.length, 14)
assert.equal(hari[0], '2026-09-17', 'mulai hari ini')
assert.equal(hari[13], '2026-09-30', 'H+13')
// Berurutan tanpa bolong dan tanpa duplikat — kalau ada, kolom tanggalnya
// melompat dan kasir kehilangan satu hari.
assert.deepEqual(hari, [...new Set(hari)], 'tidak boleh ada tanggal duplikat')
assert.equal(hari[1], '2026-09-18')

// Menyeberang bulan: 25 Sep + 14 hari = 8 Okt.
const hariOkt = daftarHari(s(2026, 9, 25))
assert.equal(hariOkt[0], '2026-09-25')
assert.equal(hariOkt[6], '2026-10-01')
assert.equal(hariOkt[13], '2026-10-08')

// Menyeberang tahun.
const hariThn = daftarHari(s(2026, 12, 25))
assert.equal(hariThn[0], '2026-12-25')
assert.equal(hariThn[7], '2027-01-01')

// Kunci tanggal pakai komponen LOKAL. toISOString() untuk 17 Sep 00:00 WIB
// akan jadi 16 Sep 17:00 UTC — salah sehari. Ini menjaganya.
assert.equal(kunciTanggal(s(2026, 9, 17, 0, 0)), '2026-09-17')
assert.equal(kunciTanggal(s(2026, 9, 1)), '2026-09-01')
assert.equal(kunciTanggal(s(2026, 9, 9)), '2026-09-09')

assert.equal(labelJam(0), '00:00')
assert.equal(labelJam(9), '09:00')
assert.equal(labelJam(23), '23:00')

// ── Peta jam terpakai ────────────────────────────────────────────────────────
// Penghuni: masuk 17 Sep 09:00, keluar 19 Sep 09:00 -> lepas 19 Sep 12:00.
// Pesanan: masuk 21 Sep 14:00, keluar 23 Sep 09:00 -> lepas 23 Sep 12:00.
const sewa = [
  { statusSewa: 'AKTIF', tanggalMasuk: s(2026, 9, 17, 9, 0), tanggalKeluar: s(2026, 9, 19, 9, 0) },
  { statusSewa: 'PENDING', tanggalMasuk: s(2026, 9, 21, 14, 0), tanggalKeluar: s(2026, 9, 23, 9, 0) },
]
const peta = petaTerpakai(sewa, aturan, hari)

assert.equal(peta.size, 14, 'satu entri per hari, termasuk hari kosong')

/** Index jam terpakai pada tanggal t, urut. */
const jam = t => [...(peta.get(t) ?? [])].sort((a, b) => a - b)

// 17 Sep: masuk 09:00 -> jam 0..8 bebas, 9..23 terpakai.
assert.deepEqual(jam('2026-09-17'), Array.from({ length: 15 }, (_, i) => i + 9))
// 18 Sep: terisi penuh.
assert.equal(jam('2026-09-18').length, 24)
// 19 Sep: lepas 12:00 -> 0..11 terpakai, 12..23 bebas.
assert.deepEqual(jam('2026-09-19'), Array.from({ length: 12 }, (_, i) => i))
// 20 Sep: kosong di antara dua sewa.
assert.deepEqual(jam('2026-09-20'), [])
// 21 Sep: mulai 14:00 -> 14..23.
assert.deepEqual(jam('2026-09-21'), Array.from({ length: 10 }, (_, i) => i + 14))
// 22 Sep penuh, 23 Sep sampai 12:00.
assert.equal(jam('2026-09-22').length, 24)
assert.deepEqual(jam('2026-09-23'), Array.from({ length: 12 }, (_, i) => i))
// 24 Sep ke atas kosong.
assert.deepEqual(jam('2026-09-24'), [])
assert.deepEqual(jam('2026-09-30'), [])

// Jumlah total = jam terpakai sewa 1 (15+24+12=51) + sewa 2 (10+24+12=46).
assert.equal(hari.reduce((n, t) => n + jam(t).length, 0), 97)

// Hanya hari di jendela yang muncul — 16 Sep dan 1 Okt tak boleh ada.
assert.equal(peta.has('2026-09-16'), false, 'sebelum hari ini tak masuk jendela')
assert.equal(peta.has('2026-10-01'), false, 'di luar H+13 tak masuk jendela')

// Sewa yang sudah lewat sepenuhnya tak mewarnai apa pun.
const lewat = petaTerpakai(
  [{ statusSewa: 'AKTIF', tanggalMasuk: s(2026, 9, 1), tanggalKeluar: s(2026, 9, 5) }],
  aturan, hari,
)
assert.equal(hari.reduce((n, t) => n + lewat.get(t).size, 0), 0)

// Sewa di luar jendela (bulan depan) juga tak mewarnai apa pun.
const jauh = petaTerpakai(
  [{ statusSewa: 'PENDING', tanggalMasuk: s(2026, 12, 1), tanggalKeluar: s(2026, 12, 5) }],
  aturan, hari,
)
assert.equal(hari.reduce((n, t) => n + jauh.get(t).size, 0), 0)

// Sewa yang MULAI di tengah jam tetap mengunci jam itu: kamar belum bisa
// dihuni jam 14:00 kalau penyewa barunya datang 14:30.
const setengahJam = petaTerpakai(
  [{ statusSewa: 'AKTIF', tanggalMasuk: s(2026, 9, 17, 14, 30), tanggalKeluar: s(2026, 9, 18, 9) }],
  aturan, hari,
)
assert.equal(jam2(setengahJam, '2026-09-17').includes(14), true)
function jam2(p, t) { return [...p.get(t)].sort((a, b) => a - b) }

// Toleransi check-out menggeser batas lepas: dengan +2 jam, 19 Sep 12:00
// jadi 14:00, sehingga jam 12 dan 13 ikut terpakai.
const petaTol = petaTerpakai(sewa, { jamCheckout: '12:00', toleransiCheckout: 120 }, hari)
const j19tol = [...petaTol.get('2026-09-19')].sort((a, b) => a - b)
assert.deepEqual(j19tol, Array.from({ length: 14 }, (_, i) => i), 'dengan toleransi 2 jam, 12 & 13 terpakai')

// Tanpa sewa sama sekali: semua hari kosong, bukan error.
const kosong = petaTerpakai([], aturan, hari)
assert.equal(hari.reduce((n, t) => n + kosong.get(t).size, 0), 0)

// Daftar hari kosong: tak ada entri, tak error.
assert.equal(petaTerpakai(sewa, aturan, []).size, 0)

console.log('OK — check-jadwal-grid: 9 blok assertion lulus')
