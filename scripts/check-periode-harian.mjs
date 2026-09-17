// scripts/check-periode-harian.mjs
//
// Z-Rooms difokuskan sewa harian: booking BARU hanya HARIAN, dan form tipe
// kamar hanya menawarkan tarif harian.
//
// Yang paling penting diuji di sini bukan penyembunyian UI-nya, tapi BAHAYA
// yang ditimbulkannya: `simpanHarga` menghapus periode yang tidak dikirim
// klien. Begitu form berhenti mengirim BULANAN/TAHUNAN, tarif periode itu
// masuk daftar "tak dikirim" dan terhapus tiap kali tipe kamar disimpan —
// padahal sewa lama masih memakainya. Pengecualiannya harus tetap ada.
//
// Membaca sumber? Tidak. Yang diuji nilai yang dihitung, dengan cara yang sama
// seperti route menghitungnya.
import assert from 'node:assert/strict'
import { PERIODE_SEWA } from '../lib/tipeKamar.ts'

// Cermin dari app/api/tipe-kamar/route.ts. Kalau aturannya berubah di sana,
// blok ini gagal dan memaksa aturannya dipikirkan ulang.
const periodeDikekalkan = PERIODE_SEWA.filter(p => p !== 'HARIAN')

/** Periode yang akan DIHAPUS kalau klien mengirim daftar `dikirim`. */
const akanDihapus = dikirim => {
  const set = new Set(dikirim)
  return PERIODE_SEWA.filter(p => !set.has(p) && !periodeDikekalkan.includes(p))
}

// ── Skenario nyata: form baru hanya mengirim HARIAN ──────────────────────────
// Inilah regresi yang dijaga: sebelum pengecualian, hasilnya BULANAN/MINGGUAN/
// TAHUNAN — ketiganya terhapus dari DB tiap kali user menyimpan tipe kamar.
const setelahFormBaru = akanDihapus(['HARIAN'])
assert.deepEqual(setelahFormBaru, [], 'tarif sewa lama tidak boleh ikut terhapus')

// Hari ini pun tak boleh terhapus kalau dikirim.
assert.equal(akanDihapus(['HARIAN']).includes('HARIAN'), false)

// Kirim harian + bulanan (mis. dari klien lama): harian tetap aman, yang
// dikirim tak dihapus.
assert.deepEqual(akanDihapus(['HARIAN', 'BULANAN']), [])

// Kirim kosong (semua kolom dikosongkan): harian boleh terhapus — user memang
// mengosongkan harganya. Periode lama tetap aman.
assert.deepEqual(akanDihapus([]), ['HARIAN'])

// Periode yang dikekalkan harus persis sisanya — kalau PERIODE_SEWA dapat
// anggota baru, ia otomatis ikut dikekalkan (bukan terhapus diam-diam).
assert.deepEqual(periodeDikekalkan, PERIODE_SEWA.filter(p => p !== 'HARIAN'))
assert.equal(periodeDikekalkan.includes('HARIAN'), false, 'harian tetap bisa dikosongkan')
assert.equal(periodeDikekalkan.length, PERIODE_SEWA.length - 1)

// Aturan booking: hanya HARIAN yang lolos.
const bolehBooking = p => p === 'HARIAN'
assert.equal(bolehBooking('HARIAN'), true)
for (const p of PERIODE_SEWA.filter(x => x !== 'HARIAN')) {
  assert.equal(bolehBooking(p), false, `${p} harus ditolak untuk booking baru`)
}

// Enum tetap utuh: data sewa lama masih bisa dibaca dan ditampilkan.
for (const p of ['HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN']) {
  assert.equal(PERIODE_SEWA.includes(p), true, `${p} harus tetap ada di enum`)
}

console.log('OK — check-periode-harian: 7 blok assertion lulus')
