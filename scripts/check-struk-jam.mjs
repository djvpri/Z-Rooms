// scripts/check-struk-jam.mjs
//
// Self-check tampilan jam di struk booking. Jalankan: npm run check
//
// Sebelumnya berkas ini MENYALIN tglJam dari app/(dashboard)/booking/page.tsx.
// Salinan seperti itu tak menjaga apa pun — ubah fungsi aslinya, test tetap
// hijau. tglJam sekarang tinggal di lib/utils.ts supaya bisa diimpor langsung.
//
// tsx yang mengimpor .ts: jalankan `npm run check` (pakai tsx), BUKAN `node`
// polos — Node tak paham sintaks TypeScript.
import assert from 'node:assert/strict'
import { tglJam, tglJamSingkat } from '../lib/utils.ts'

// Gabungan tanggal + jam seperti di handleSubmit.
const gabung = (tgl, jam) => new Date(`${tgl}T${jam}:00+07:00`)

// 1. Kasir ketik 15 Sep 2026, 14:30 -> jam itu yang harus muncul, bukan bergeser.
const m1 = gabung('2026-09-15', '14:30')
assert.ok(tglJam(m1.toISOString()).includes('14.30'), '14:30 WIB harus tampil 14.30')

// 2. Tengah malam WIB tidak boleh jadi tanggal sebelumnya.
assert.ok(tglJam(gabung('2026-09-15', '00:00').toISOString()).includes('15 September'))

// 3. Dini hari WIB (jam 02:00 = 19:00 UTC hari sebelumnya) tetap tanggal benar.
assert.ok(tglJam(gabung('2026-09-15', '02:00').toISOString()).includes('15 September'))

// 4. Jam 23:59 WIB tetap tanggal yang sama, bukan besoknya.
assert.ok(tglJam(gabung('2026-09-15', '23:59').toISOString()).includes('15 September'))

// 5. Offset tersimpan benar: 14:30 WIB = 07:30 UTC.
assert.equal(m1.toISOString(), '2026-09-15T07:30:00.000Z')

// 6. Tanggal keluar HARIAN +1 hari, jam ikut jam masuk (bukan jam 12:00 —
//    jam 12:00 hanya acuan batas check-out, bukan waktu di struk).
const keluar = new Date(m1)
keluar.setUTCDate(keluar.getUTCDate() + 1)
assert.ok(tglJam(keluar.toISOString()).includes('16 September'), 'keluar +1 hari')
assert.ok(tglJam(keluar.toISOString()).includes('14.30'), 'jam keluar = jam masuk')

// 7. BULANAN +1 bulan mempertahankan jam.
const keluarBulan = new Date(m1)
keluarBulan.setUTCMonth(keluarBulan.getUTCMonth() + 1)
assert.ok(tglJam(keluarBulan.toISOString()).includes('15 Oktober'))
assert.ok(tglJam(keluarBulan.toISOString()).includes('14.30'))

// 8. Format 24 jam, bukan AM/PM — locale id-ID harus menghasilkan "pukul HH.mm".
//    Regresi nyata: struk pernah memakai locale en lewat input type=time.
assert.ok(!/am|pm/i.test(tglJam(m1.toISOString())), 'struk tak boleh memakai AM/PM')
assert.ok(tglJam(gabung('2026-09-15', '15:30').toISOString()).includes('15.30'), 'sore harus 15.30, bukan 03.30')
assert.ok(tglJam(gabung('2026-09-15', '09:05').toISOString()).includes('09.05'), 'pagi harus 09.05')

// 9. tglJamSingkat dipakai tab Kamar untuk "Kosong 16 Sep, 12:00". Formatnya
//    HARUS 24 jam dan ber-WIB, sama seperti tglJam — kalau tidak, kasir melihat
//    jam tersedia yang beda dari jam di struk untuk kamar yang sama.
{
  const b = new Date('2026-09-16T05:00:00Z')   // 12:00 WIB
  const s = tglJamSingkat(b)
  assert.ok(s.includes('16'), `tanggal harus 16, dapat "${s}"`)
  assert.ok(s.includes('Sep'), `bulan singkat, dapat "${s}"`)
  assert.ok(s.includes('12:00'), `jam 24 jam 12:00, dapat "${s}"`)
  assert.ok(!/am|pm/i.test(s), `tak boleh AM/PM, dapat "${s}"`)

  // Sore harus 15:xx, bukan 03:xx PM.
  const sore = tglJamSingkat(new Date('2026-09-16T08:30:00Z'))   // 15:30 WIB
  assert.ok(sore.includes('15:30'), `15:30 WIB, dapat "${sore}"`)

  // Pagi 09:05 tetap dua digit — bukan "9:05".
  const pagi = tglJamSingkat(new Date('2026-09-16T02:05:00Z'))   // 09:05 WIB
  assert.ok(pagi.includes('09:05'), `09:05 WIB, dapat "${pagi}"`)

  // Dini hari WIB tetap tanggal yang sama (bukan mundur sehari).
  const dini = tglJamSingkat(new Date('2026-09-15T19:00:00Z'))   // 16 Sep 02:00 WIB
  assert.ok(dini.includes('16'), `dini hari harus 16, dapat "${dini}"`)
  assert.ok(dini.includes('02:00'), `02:00 WIB, dapat "${dini}"`)
}

console.log('OK — check-struk-jam: 19 blok assertion lulus')
