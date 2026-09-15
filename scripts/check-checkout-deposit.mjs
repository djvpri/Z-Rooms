// scripts/check-checkout-deposit.mjs
//
// Self-check perhitungan deposit check-out. Jalankan: node scripts/check-checkout-deposit.mjs
//
// Salinan logika dari app/api/sewa/[id]/checkout/route.ts — kalau logika di route
// berubah, ubah di sini juga (atau lebih baik: jadikan fungsi bersama). Sengaja
// disalin supaya tes ini tidak bergantung Prisma/DB.
import assert from 'node:assert/strict'

/** @returns {{kembali:number, hangus:number}} */
function hitungDeposit(perlakuan, depositKembali, deposit) {
  let kembali
  if (perlakuan === 'PENUH') kembali = deposit
  else if (perlakuan === 'HANGUS') kembali = 0
  else kembali = Math.min(Math.max(depositKembali, 0), deposit)
  return { kembali, hangus: deposit - kembali }
}

/** Validasi nominal SEBAGIAN: harus benar-benar di antaranya (bukan 0 / bukan penuh). */
function sebagianValid(depositKembali, deposit) {
  return !(depositKembali <= 0 || depositKembali >= deposit)
}

const D = 1000000

// PENUH — deposit utuh kembali, nol pemasukan.
assert.deepEqual(hitungDeposit('PENUH', 0, D), { kembali: D, hangus: 0 })

// HANGUS — nol kembali, seluruh deposit jadi pemasukan.
assert.deepEqual(hitungDeposit('HANGUS', 0, D), { kembali: 0, hangus: D })
// HANGUS mengabaikan depositKembali yang dikirim form.
assert.deepEqual(hitungDeposit('HANGUS', 500000, D), { kembali: 0, hangus: D })

// SEBAGIAN — dibagi dua.
assert.deepEqual(hitungDeposit('SEBAGIAN', 400000, D), { kembali: 400000, hangus: 600000 })

// SEBAGIAN dijepit ke rentang deposit (form bisa kirim nilai liar).
assert.deepEqual(hitungDeposit('SEBAGIAN', -500, D), { kembali: 0, hangus: D })
assert.deepEqual(hitungDeposit('SEBAGIAN', 99_000_000, D), { kembali: D, hangus: 0 })

// Invarian: kembali + hangus selalu = deposit, berapa pun perlakuannya.
for (const p of ['PENUH', 'SEBAGIAN', 'HANGUS']) {
  for (const n of [0, 1, 500000, D, D + 1]) {
    const r = hitungDeposit(p, n, D)
    assert.equal(r.kembali + r.hangus, D, `${p}/${n}: kembali+hangus harus = deposit`)
    assert.ok(r.kembali >= 0 && r.hangus >= 0, `${p}/${n}: tidak boleh negatif`)
  }
}

// Deposit nol: tak ada yang dikembalikan, tak ada yang hangus.
assert.deepEqual(hitungDeposit('PENUH', 0, 0), { kembali: 0, hangus: 0 })
assert.deepEqual(hitungDeposit('HANGUS', 0, 0), { kembali: 0, hangus: 0 })

// Validasi SEBAGIAN menolak nilai di luar rentang.
assert.equal(sebagianValid(0, D), false)
assert.equal(sebagianValid(D, D), false)
assert.equal(sebagianValid(D + 1, D), false)
assert.equal(sebagianValid(1, D), true)
assert.equal(sebagianValid(D - 1, D), true)

console.log('OK — 8 blok assertion lulus')
