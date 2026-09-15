// scripts/check-checkout-deposit.mjs
//
// Self-check perhitungan deposit check-out. Jalankan: npm run check
//
// Sebelumnya berkas ini MENYALIN logika dari
// app/api/sewa/[id]/checkout/route.ts, jadi mengubah route tak membuat test
// gagal. Sekarang logikanya tinggal di lib/deposit.ts dan diimpor langsung.
//
// tsx yang mengimpor .ts: jalankan `npm run check` (pakai tsx), BUKAN `node`
// polos — Node tak paham sintaks TypeScript.
import assert from 'node:assert/strict'
import { hitungDeposit } from '../lib/deposit.ts'

const D = 1_000_000
const hasil = (perlakuan, depositKembali, deposit = D) => {
  const k = hitungDeposit(deposit, perlakuan, depositKembali)
  assert.ok(k.ok, `harus diterima: ${perlakuan}/${depositKembali}`)
  return k.hasil
}
const tolak = (perlakuan, depositKembali, deposit = D) => {
  const k = hitungDeposit(deposit, perlakuan, depositKembali)
  assert.equal(k.ok, false, `harus ditolak: ${perlakuan}/${depositKembali}`)
  return k.error
}

// PENUH — deposit utuh kembali, nol pemasukan.
assert.deepEqual(hasil('PENUH', 0), { kembali: D, hangus: 0 })

// HANGUS — nol kembali, seluruh deposit jadi pemasukan.
assert.deepEqual(hasil('HANGUS', 0), { kembali: 0, hangus: D })
// HANGUS mengabaikan depositKembali yang dikirim form.
assert.deepEqual(hasil('HANGUS', 500_000), { kembali: 0, hangus: D })

// SEBAGIAN — dibagi dua.
assert.deepEqual(hasil('SEBAGIAN', 400_000), { kembali: 400_000, hangus: 600_000 })

// SEBAGIAN di luar rentang DITOLAK, bukan dijepit diam-diam. 0 dan penuh sudah
// diwakili HANGUS/PENUH, jadi SEBAGIAN dengan nilai itu tanda kasir salah pilih.
assert.match(tolak('SEBAGIAN', 0), /harus di antara 1 dan 999999/)
assert.match(tolak('SEBAGIAN', -500), /harus di antara/)
assert.match(tolak('SEBAGIAN', D), /harus di antara/)
assert.match(tolak('SEBAGIAN', D + 1), /harus di antara/)

// Batas yang harus diterima.
assert.deepEqual(hasil('SEBAGIAN', 1), { kembali: 1, hangus: D - 1 })
assert.deepEqual(hasil('SEBAGIAN', D - 1), { kembali: D - 1, hangus: 1 })

// Nilai pecahan dipotong ke bawah — rupiah tak punya sen, dan sisa harus tetap
// masuk ke hangus supaya kembali+hangus = deposit.
assert.deepEqual(hasil('SEBAGIAN', 400_000.9), { kembali: 400_000, hangus: 600_000 })

// Pecahan di bawah 1 DITOLAK, bukan diam-diam jadi 0 (itu artinya HANGUS).
assert.match(tolak('SEBAGIAN', 0.9), /minimal Rp 1/)
assert.match(tolak('SEBAGIAN', 0.1), /minimal Rp 1/)

// Invarian: kembali + hangus selalu = deposit, dan keduanya tak pernah negatif.
for (const p of ['PENUH', 'SEBAGIAN', 'HANGUS']) {
  for (const n of [1, 500_000, D - 1]) {
    const r = hasil(p, n)
    assert.equal(r.kembali + r.hangus, D, `${p}/${n}: kembali+hangus harus = deposit`)
    assert.ok(r.kembali >= 0 && r.hangus >= 0, `${p}/${n}: tidak boleh negatif`)
  }
}

// Deposit nol: tak ada yang dikembalikan, tak ada yang hangus.
assert.deepEqual(hasil('PENUH', 0, 0), { kembali: 0, hangus: 0 })
assert.deepEqual(hasil('HANGUS', 0, 0), { kembali: 0, hangus: 0 })
// Deposit 0 tidak bisa dibagi SEBAGIAN (tak ada rentang 1..-1 yang valid).
assert.equal(hitungDeposit(0, 'SEBAGIAN', 1).ok, false, 'deposit 0 tak bisa SEBAGIAN')

// Deposit negatif (data rusak di DB) diperlakukan 0, bukan menghasilkan
// pengembalian negatif di laporan keuangan.
assert.deepEqual(hasil('PENUH', 0, -5000), { kembali: 0, hangus: 0 })

console.log('OK — check-checkout-deposit: 15 blok assertion lulus')
