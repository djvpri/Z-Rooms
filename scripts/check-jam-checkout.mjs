// scripts/check-jam-checkout.mjs
//
// Self-check logika lib/checkout.ts. Jalankan: npm run check
//
// Sebelumnya berkas ini MENYALIN rumus dari lib/checkout.ts, jadi mengubah
// lib-nya tidak membuat test gagal — sudah dibuktikan: fallback jam diubah
// 12:00 -> 11:00 dan 11 blok assertion tetap "lulus". Sekarang mengimpor
// langsung lewat tsx (ada di devDependencies) supaya satu-satunya sumber
// kebenaran tetap lib/checkout.ts.
//
// tsx yang mengimpor .ts: jalankan `npm run check` (yang memakai tsx), BUKAN
// `node` polos — Node tak paham sintaks TypeScript.
import assert from 'node:assert/strict'
import {
  jamKeMenit, batasCheckout, cekLewat, labelLewat,
} from '../lib/checkout.ts'

const ATURAN = { jamCheckout: '12:00', toleransiCheckout: 120 }   // 12:00 + 2 jam
const hari = (t, j = 0, m = 0) => new Date(2026, 8, t, j, m, 0, 0)  // September 2026

// 1. Tepat di batas (14:00) BELUM lewat — batas itu inklusif.
{
  const r = cekLewat(hari(10), ATURAN, hari(10, 14, 0))
  assert.equal(r.lewat, false, 'tepat jam batas belum boleh ditandai lewat')
  assert.equal(r.menitLebih, 0)
}

// 2. Satu menit setelah batas -> lewat, 1 menit.
{
  const r = cekLewat(hari(10), ATURAN, hari(10, 14, 1))
  assert.equal(r.lewat, true)
  assert.equal(r.menitLebih, 1)
}

// 3. Inti aturan user: masuk jam 15:00 tetap habis jam 12:00 besoknya.
//    Batas 12:00+2 jam di tanggal keluar, BUKAN jam masuk + 24 jam.
{
  const masuk = hari(10, 15, 0)
  const keluar = new Date(masuk); keluar.setDate(keluar.getDate() + 1)  // 11 Sep
  const batas = batasCheckout(keluar, ATURAN)
  assert.equal(batas.getDate(), 11, 'batas harus di tanggal keluar, bukan tanggal masuk')
  assert.equal(batas.getHours(), 14, 'batas = jam acuan + toleransi (14:00)')
  assert.equal(batas.getMinutes(), 0)
  // Jam masuk tidak berpengaruh sama sekali.
  const batasMasukPagi = batasCheckout(keluar, ATURAN)
  assert.equal(batasMasukPagi.getTime(), batas.getTime(), 'jam masuk tak boleh menggeser batas')
}

// 4. Sebelum batas -> belum lewat, walaupun sudah lewat tanggal kontrak paginya.
{
  const r = cekLewat(hari(10), ATURAN, hari(10, 13, 30))
  assert.equal(r.lewat, false, 'toleransi harus dihormati')
}

// 5. Lewat berhari-hari -> menitLebih akumulatif dan labelnya benar.
{
  const r = cekLewat(hari(10), ATURAN, hari(12, 17, 0))  // 10 Sep 14:00 -> 12 Sep 17:00
  assert.equal(r.lewat, true)
  assert.equal(r.menitLebih, 2 * 24 * 60 + 3 * 60, '51 jam = 3060 menit')
  assert.equal(labelLewat(r.menitLebih), '2 hari 3 jam')
}

// 6. Toleransi 0 -> batas persis jam acuan.
{
  const batas = batasCheckout(hari(10), { jamCheckout: '12:00', toleransiCheckout: 0 })
  assert.equal(batas.getHours(), 12)
  assert.equal(batas.getMinutes(), 0)
}

// 7. Toleransi negatif diperlakukan 0, bukan memundurkan batas.
{
  const batas = batasCheckout(hari(10), { jamCheckout: '12:00', toleransiCheckout: -60 })
  assert.equal(batas.getHours(), 12, 'toleransi negatif tak boleh bikin batas lebih awal')
}

// 8. Jam tak valid -> fallback 12:00, bukan NaN (NaN akan bikin semua kamar
//    tampak "belum lewat" secara diam-diam).
{
  assert.equal(jamKeMenit(''), 720)
  assert.equal(jamKeMenit('abc'), 720)
  assert.equal(jamKeMenit('25:00'), 720)
  assert.equal(jamKeMenit('12:99'), 720)
  assert.equal(jamKeMenit('9:30'), 570, 'jam satu digit harus diterima')
}

// 9. Toleransi menyeberang tengah malam -> batas pindah ke hari berikutnya,
//    bukan membungkus jadi dini hari hari yang sama.
{
  const batas = batasCheckout(hari(10), { jamCheckout: '23:00', toleransiCheckout: 180 })
  assert.equal(batas.getDate(), 11, '23:00 + 3 jam harus jadi 02:00 besoknya')
  assert.equal(batas.getHours(), 2)
}

// 10. Label: satuan menit di bawah 1 jam, jam di bawah 1 hari.
{
  assert.equal(labelLewat(0), '0 menit')
  assert.equal(labelLewat(45), '45 menit')
  assert.equal(labelLewat(60), '1 jam')
  assert.equal(labelLewat(23 * 60 + 59), '23 jam')
  assert.equal(labelLewat(24 * 60), '1 hari')
  assert.equal(labelLewat(25 * 60), '1 hari 1 jam')
}

// 11. Monoton: menambah waktu tak pernah membalik "lewat" jadi "belum lewat".
{
  let sebelumnya = false
  for (let m = 0; m <= 300; m += 5) {
    const r = cekLewat(hari(10), ATURAN, new Date(hari(10, 12, 0).getTime() + m * 60000))
    assert.ok(!(sebelumnya && !r.lewat), `status mundur di menit ke-${m}`)
    sebelumnya = r.lewat
  }
}

console.log('OK — check-jam-checkout: 11 blok assertion lulus')
