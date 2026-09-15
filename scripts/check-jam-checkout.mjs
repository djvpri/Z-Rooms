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

// Dua bentuk waktu yang BEDA, dan mencampurnya adalah sumber bug:
//   tglKeluar(t)   -> `tanggalKeluar` seperti tersimpan di DB: tengah malam UTC.
//   saat(t, j, m)  -> titik waktu untuk `sekarang`, jam `j` waktu WIB.
// Container produksi jalan TZ=UTC, sedangkan `new Date(2026, 8, t, j)` memakai
// zona mesin — test versi lama cuma lulus di mesin dev ber-WIB dan GAGAL di
// TZ=UTC, yang justru menyembunyikan bug batas check-out meleset 7 jam.
const tglKeluar = (t) => new Date(Date.UTC(2026, 8, t))
const saat = (t, j = 0, m = 0) => new Date(Date.UTC(2026, 8, t, j - 7, m, 0, 0))

// Jam dinding WIB dari sebuah Date, untuk assertion yang membaca getHours.
const jamWIB = (d) => Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }))
const tglWIB = (d) => Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric' }))

// 1. Tepat di batas (14:00) BELUM lewat — batas itu inklusif.
{
  const r = cekLewat(tglKeluar(10), ATURAN, saat(10, 14, 0))
  assert.equal(r.lewat, false, 'tepat jam batas belum boleh ditandai lewat')
  assert.equal(r.menitLebih, 0)
}

// 2. Satu menit setelah batas -> lewat, 1 menit.
{
  const r = cekLewat(tglKeluar(10), ATURAN, saat(10, 14, 1))
  assert.equal(r.lewat, true)
  assert.equal(r.menitLebih, 1)
}

// 3. Inti aturan user: masuk jam 15:00 tetap habis jam 12:00 besoknya.
//    Batas 12:00+2 jam di tanggal keluar, BUKAN jam masuk + 24 jam.
{
  const masuk = saat(10, 15, 0)
  const keluar = tglKeluar(11)  // 11 Sep, tengah malam UTC
  const batas = batasCheckout(keluar, ATURAN)
  assert.equal(tglWIB(batas), 11, 'batas harus di tanggal keluar, bukan tanggal masuk')
  assert.equal(jamWIB(batas), 14, 'batas = jam acuan + toleransi (14:00)')
  // Jam masuk tidak berpengaruh sama sekali.
  const batasMasukPagi = batasCheckout(keluar, ATURAN)
  assert.equal(batasMasukPagi.getTime(), batas.getTime(), 'jam masuk tak boleh menggeser batas')
}

// 4. Sebelum batas -> belum lewat, walaupun sudah lewat tanggal kontrak paginya.
{
  const r = cekLewat(tglKeluar(10), ATURAN, saat(10, 13, 30))
  assert.equal(r.lewat, false, 'toleransi harus dihormati')
}

// 5. Lewat berhari-hari -> menitLebih akumulatif dan labelnya benar.
{
  const r = cekLewat(tglKeluar(10), ATURAN, saat(12, 17, 0))  // 10 Sep 14:00 -> 12 Sep 17:00
  assert.equal(r.lewat, true)
  assert.equal(r.menitLebih, 2 * 24 * 60 + 3 * 60, '51 jam = 3060 menit')
  assert.equal(labelLewat(r.menitLebih), '2 hari 3 jam')
}

// 6. Toleransi 0 -> batas persis jam acuan.
{
  const batas = batasCheckout(tglKeluar(10), { jamCheckout: '12:00', toleransiCheckout: 0 })
  assert.equal(jamWIB(batas), 12, 'toleransi 0 -> batas 12:00 WIB')
}

// 7. Toleransi negatif diperlakukan 0, bukan memundurkan batas.
{
  const batas = batasCheckout(tglKeluar(10), { jamCheckout: '12:00', toleransiCheckout: -60 })
  assert.equal(jamWIB(batas), 12, 'toleransi negatif tak boleh bikin batas lebih awal')
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
  const batas = batasCheckout(tglKeluar(10), { jamCheckout: '23:00', toleransiCheckout: 180 })
  assert.equal(tglWIB(batas), 11, '23:00 + 3 jam harus jadi 02:00 besoknya')
  assert.equal(jamWIB(batas), 2)
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
    const r = cekLewat(tglKeluar(10), ATURAN, new Date(saat(10, 12, 0).getTime() + m * 60000))
    assert.ok(!(sebelumnya && !r.lewat), `status mundur di menit ke-${m}`)
    sebelumnya = r.lewat
  }
}

// 12. REGRESI: batas check-out dihitung waktu WIB, bukan waktu server.
//     Container produksi jalan TZ=UTC. Versi lama memakai setHours, jadi
//     "12:00" terpasang sebagai 12:00 UTC = 19:00 WIB dan kasir baru diberi
//     peringatan lewat 7 jam terlambat. Blok ini gagal di TZ=UTC sebelum fix.
{
  const batas = batasCheckout(tglKeluar(10), { jamCheckout: '12:00', toleransiCheckout: 0 })
  assert.equal(batas.toISOString(), '2026-09-10T05:00:00.000Z',
    '12:00 WIB = 05:00 UTC')
  assert.equal(jamWIB(batas), 12, 'kasir harus melihat batas 12:00')
  assert.equal(tglWIB(batas), 10, 'tanggal batas tidak boleh bergeser')
}

// 13. Toleransi juga dalam menit WIB.
{
  const batas = batasCheckout(tglKeluar(10), ATURAN)   // 12:00 + 120 menit
  assert.equal(batas.toISOString(), '2026-09-10T07:00:00.000Z', '14:00 WIB = 07:00 UTC')
  assert.equal(jamWIB(batas), 14)
}

// 14. Tepat SEBELUM batas WIB belum lewat; tepat SESUDAH baru lewat.
//     Mengunci batasnya ke WIB, bukan UTC.
{
  assert.equal(cekLewat(tglKeluar(10), ATURAN, new Date('2026-09-10T06:59:00Z')).lewat, false,
    '13:59 WIB masih dalam toleransi')
  assert.equal(cekLewat(tglKeluar(10), ATURAN, new Date('2026-09-10T07:00:00Z')).lewat, false,
    '14:00 WIB tepat di batas, belum lewat')
  assert.equal(cekLewat(tglKeluar(10), ATURAN, new Date('2026-09-10T07:01:00Z')).lewat, true,
    '14:01 WIB sudah lewat')
}

console.log('OK — check-jam-checkout: 14 blok assertion lulus')
