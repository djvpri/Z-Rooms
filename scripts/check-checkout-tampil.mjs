// Layar kamar menampilkan "Selesai <tgl>, <jam>" dari batasCheckout() — bukan
// jam masuk + 24 jam, dan bukan kolom Sewa.tanggalKeluar apa adanya.
//
// Kasus nyata 2026-09-17, PENGINAPAN KD, kamar 003:
//   tanggalMasuk  17 Sep 11:00 WIB  -> tersimpan 2026-09-17T04:00:00Z
//   tanggalKeluar 18 Sep 11:00 WIB  -> tersimpan 2026-09-18T04:00:00Z
//   Properti.jamCheckout = "14:00", toleransiCheckout = 0
// Layar harus menulis "18 Sep, 14.00". Kalau menulis 13:00, ada yang menggeser
// 7 jam lagi (UTC dibaca sebagai WIB) di antara batasCheckout dan render.
//
// Checker ini menjaga janji itu: jam yang TAMPIL = jamCheckout properti, bukan
// jam masuk, dan bukan hasil geser dua kali.
import assert from 'node:assert/strict'
import { batasCheckout, jamKeMenit, cekLewat, tambahPeriode } from '../lib/checkout.ts'
import { tglJamSingkat } from '../lib/utils.ts'

const WIB = 7 * 60 * 60000
const aturan = { jamCheckout: '14:00', toleransiCheckout: 0 }

// 1. Jam mentah dari DB: 18 Sep 11:00 WIB (= 04:00Z).
const keluarDb = new Date('2026-09-18T04:00:00.000Z')

// 2. batasCheckout memasang jam properti pada HARI yang benar.
const batas = batasCheckout(keluarDb, aturan)
assert.equal(
  batas.toISOString(), '2026-09-18T07:00:00.000Z',
  'batasCheckout harus 18 Sep 14:00 WIB = 07:00Z',
)
// Hari tetap 18 Sep — bukan 17 atau 19. Geser WIB lalu baca UTC-nya.
const hariWib = new Date(batas.getTime() + WIB).toISOString().slice(0, 10)
assert.equal(hariWib, '2026-09-18', 'harinya harus tetap 18 Sep')

// 3. Yang TAMPIL di layar. assert jam "14" ada, dan "13" tidak ada — inti bug.
const tampil = tglJamSingkat(batas).replace(/\u00a0/g, ' ')
assert.match(tampil, /18/, `tanggal 18 harus tampil, dapat: ${tampil}`)
assert.match(tampil, /14[.:]00/, `jam 14:00 harus tampil, dapat: ${tampil}`)
assert.doesNotMatch(tampil, /13[.:]00/, `13:00 = salah geser UTC; dapat: ${tampil}`)

// 4. Jam tampil HANYA bergantung pada jamCheckout, bukan jam masuk.
for (const [masuk, keluar] of [
  ['2026-09-17T04:00:00Z', '2026-09-18T04:00:00Z'], // masuk 11:00 WIB
  ['2026-09-17T07:00:00Z', '2026-09-18T07:00:00Z'], // masuk 14:00 WIB
  ['2026-09-16T17:00:00Z', '2026-09-18T17:00:00Z'], // masuk 00:00 WIB
]) {
  const b = batasCheckout(new Date(keluar), aturan)
  const t = tglJamSingkat(b).replace(/\u00a0/g, ' ')
  assert.match(t, /14[.:]00/, `jam masuk ${masuk} tetap harus keluar 14:00, dapat: ${t}`)
}

// 5. Jam checkout yang DIUBAH di pengaturan-umum harus ikut berubah di layar.
const pukul12 = batasCheckout(keluarDb, { jamCheckout: '12:00', toleransiCheckout: 0 })
assert.match(tglJamSingkat(pukul12).replace(/\u00a0/g, ' '), /12[.:]00/, 'jamCheckout 12:00 harus ikut tampil 12:00')

// 6. Toleransi ikut menambah batas — nota & layar memakai angka sama.
const toleran = batasCheckout(keluarDb, { jamCheckout: '14:00', toleransiCheckout: 120 })
assert.equal(
  toleran.getTime() - batas.getTime(), 120 * 60000,
  'toleransi 120 menit harus menggeser batas 120 menit',
)

// 7. Batas jatuh di HARI tanggalKeluar, walau tanggalKeluar jamnya tengah malam WIB.
//    Masuk 00:00 WIB tersimpan "16 Sep 17:00Z" — dibaca sebagai 16 Sep, sehari
//    terlalu cepat kalau tak digeser ke WIB dulu.
const tengahMalam = new Date('2026-09-17T17:00:00.000Z') // 18 Sep 00:00 WIB
const bTm = batasCheckout(tengahMalam, aturan)
assert.equal(
  new Date(bTm.getTime() + WIB).toISOString().slice(0, 10), '2026-09-18',
  'tengah malam WIB harus tetap dihitung 18 Sep, bukan 17',
)

// 8. cekLewat pakai batas yang sama — jadi badge "Lewat" tak bisa beda dengan label.
const tepat = cekLewat(keluarDb, aturan, batas)
assert.equal(tepat.lewat, false, 'tepat pada batas belum lewat')
const sedetik = cekLewat(keluarDb, aturan, new Date(batas.getTime() + 1000))
assert.equal(sedetik.lewat, true, 'sedetik setelah batas sudah lewat')

// 9. tanggalKeluar tetap jam masuk + durasi (penanda hari), terpisah dari batas.
const masuk = new Date('2026-09-17T04:00:00.000Z')
assert.equal(
  tambahPeriode(masuk, 'HARIAN').toISOString(), '2026-09-18T04:00:00.000Z',
  'tanggalKeluar = masuk + 24 jam, jamnya ikut masuk',
)
// dan jamnya BUKAN jam checkout — dua nilai ini memang beda maksud.
assert.notEqual(
  tambahPeriode(masuk, 'HARIAN').getTime(), batas.getTime(),
  'tanggalKeluar dan batasCheckout harus beda nilai (hari vs jam acuan)',
)

// 10. jamKeMenit: nilai rusak jatuh ke 12:00, bukan crash.
assert.equal(jamKeMenit('14:00'), 840)
assert.equal(jamKeMenit(''), 720)
assert.equal(jamKeMenit('99:99'), 720)
assert.equal(jamKeMenit('24:00'), 720)

console.log('check-checkout-tampil: 10 blok lulus')
