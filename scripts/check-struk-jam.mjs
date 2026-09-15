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
import { tglJam } from '../lib/utils.ts'

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

console.log('OK — check-struk-jam: 13 blok assertion lulus')
