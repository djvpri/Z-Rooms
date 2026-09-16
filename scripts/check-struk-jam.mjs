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
import { tglJam, tglJamSingkat, tglJamJadiDate, sekarangWib } from '../lib/utils.ts'
import { tanggalKeluar } from '../lib/sewa.ts'
import { batasCheckout } from '../lib/checkout.ts'

// Gabungan tanggal + jam sekarang impor dari lib/utils.ts — dulu berkas ini
// menyalin rumusnya sendiri (`new Date(\`${tgl}T${jam}:00+07:00\`)`), dan
// salinan itu tak akan ketahuan kalau produksi berubah. Produksi memakai
// tglJamJadiDate(), jadi itu yang diuji di sini.
const gabung = tglJamJadiDate

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

// 6. Nota booking: baris "Keluar" = TANGGAL dari tanggalKeluar(), tetapi
//    JAMNYA dari setelan jam check-out properti (tab Pengaturan) — bukan jam
//    masuk. Karena itu yang diuji di sini adalah batasCheckout().
//    (Sebelumnya berkas ini menguji "jam keluar = jam masuk", padahal app
//    mencetak jam check-out. Test-nya membenarkan perilaku yang salah.)
const ATURAN_14 = { jamCheckout: '14:00', toleransiCheckout: 0 }
const ATURAN_12 = { jamCheckout: '12:00', toleransiCheckout: 0 }

// Masuk 15 Sep 14:30, harian 1 hari -> hari terakhir 16 Sep, keluar 14:00.
const hariKeluar = tanggalKeluar(m1, 'HARIAN', 1)
const jamKeluar = batasCheckout(hariKeluar, ATURAN_14)
assert.ok(tglJam(jamKeluar.toISOString()).includes('16 September'), 'tanggal keluar +1 hari')
assert.ok(tglJam(jamKeluar.toISOString()).includes('14.00'), 'jam keluar dari setelan, bukan jam masuk')

// 6b. Penyewa masuk MALAM (19:00) tetap keluar 14:00 hari terakhir — inilah
//     aturan yang dipegang: orang masuk 15:00 tetap habis 12:00 besok.
const masukMalam = gabung('2026-09-16', '19:00')
const keluarMalam = batasCheckout(tanggalKeluar(masukMalam, 'HARIAN', 1), ATURAN_14)
assert.ok(tglJam(keluarMalam.toISOString()).includes('17 September'), 'masuk 19:00 -> hari terakhir 17 Sep')
assert.ok(tglJam(keluarMalam.toISOString()).includes('14.00'), 'jam 14:00, BUKAN 19.00')
assert.ok(!tglJam(keluarMalam.toISOString()).includes('19.00'), 'jam masuk tak boleh bocor ke baris Keluar')

// 6c. Tengah malam: masuk 00:00, keluar tetap 14:00 hari terakhir.
const keluarSubuh = batasCheckout(tanggalKeluar(gabung('2026-09-16', '00:00'), 'HARIAN', 1), ATURAN_14)
assert.ok(tglJam(keluarSubuh.toISOString()).includes('17 September'))
assert.ok(tglJam(keluarSubuh.toISOString()).includes('14.00'))

// 6d. Tanggalnya tetap dihitung dari tanggal masuk, bukan ditambah satu-satu.
assert.ok(tglJam(tanggalKeluar(m1, 'HARIAN', 3).toISOString()).includes('18 September'))
assert.ok(tglJam(tanggalKeluar(m1, 'MINGGUAN', 2).toISOString()).includes('29 September'))

// 7. BULANAN: tanggalnya +1 bulan, jamnya TETAP jam check-out — semua periode
//    seragam, sama seperti layar kamar.
const keluarBulan = batasCheckout(tanggalKeluar(m1, 'BULANAN', 1), ATURAN_14)
assert.ok(tglJam(keluarBulan.toISOString()).includes('15 Oktober'))
assert.ok(tglJam(keluarBulan.toISOString()).includes('14.00'), 'bulanan juga jam check-out')

// 7b. 31 Januari + 1 bulan dijepit ke akhir Februari, tak meluber ke Maret.
assert.ok(tglJam(tanggalKeluar(gabung('2026-01-31', '14:00'), 'BULANAN', 1).toISOString()).includes('28 Februari'))

// 7c. TAHUNAN: tanggal +1 tahun, jam check-out.
const keluarTahun = batasCheckout(tanggalKeluar(m1, 'TAHUNAN', 1), ATURAN_14)
assert.ok(tglJam(keluarTahun.toISOString()).includes('15 September 2027'))
assert.ok(tglJam(keluarTahun.toISOString()).includes('14.00'))

// 7d. Jam check-out properti lain dipakai apa adanya: 12:00 -> 12.00.
assert.ok(tglJam(batasCheckout(hariKeluar, ATURAN_12).toISOString()).includes('12.00'))

// 7e. Toleransi IKUT tercetak: nota dan layar kamar harus menyebut angka yang
//     PERSIS sama untuk sewa yang sama. Dulu nota memakai jamCheckout saja
//     (12.00) sementara kamar memakai jamCheckout+toleransi (14:00), jadi kasir
//     melihat dua jam berbeda untuk satu sewa.
const adaToleransi = batasCheckout(hariKeluar, { jamCheckout: '12:00', toleransiCheckout: 120 })
assert.ok(tglJam(adaToleransi.toISOString()).includes('14.00'), '12:00 + 120 menit = 14.00, sama dgn layar kamar')

// 7f. Setelan rusak jatuh ke 12:00, bukan menghasilkan jam ngawur.
assert.ok(tglJam(batasCheckout(hariKeluar, { jamCheckout: '99:99', toleransiCheckout: 0 }).toISOString()).includes('12.00'))

// 8. Format 24 jam, bukan AM/PM — locale id-ID harus menghasilkan "pukul HH.mm".
//    Regresi nyata: struk pernah memakai locale en lewat input type=time.
assert.ok(!/am|pm/i.test(tglJam(m1.toISOString())), 'struk tak boleh memakai AM/PM')
assert.ok(tglJam(gabung('2026-09-15', '15:30').toISOString()).includes('15.30'), 'sore harus 15.30, bukan 03.30')
assert.ok(tglJam(gabung('2026-09-15', '09:05').toISOString()).includes('09.05'), 'pagi harus 09.05')

// 9. tglJamSingkat dipakai tab Kamar untuk kolom "Selesai 16 Sep, 14:00" (dan
//    "Mulai ...") di samping "Kosong 16 Sep, 12:00" yang lama. Formatnya HARUS
//    24 jam dan ber-WIB, sama seperti tglJam — kalau tidak, kasir melihat jam
//    yang beda dari jam di struk untuk kamar yang sama.
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

// 10. tglJamJadiDate: penggabungan tanggal + jam masuk yang dipakai server.
//     Jam masuk kini dari dropdown dan benar-benar tersimpan, jadi rumus ini
//     yang menentukan jam yang tercetak di nota.
{
  // Nilai dropdown normal.
  assert.equal(gabung('2026-09-16', '14:00').toISOString(), '2026-09-16T07:00:00.000Z')
  assert.equal(gabung('2026-09-16', '00:00').toISOString(), '2026-09-15T17:00:00.000Z')
  assert.equal(gabung('2026-09-16', '23:00').toISOString(), '2026-09-16T16:00:00.000Z')

  // Jam kosong/tak sah -> 00:00 WIB, BUKAN Invalid Date: satu jam aneh tak
  // boleh menggagalkan seluruh booking. Tanggalnya tetap seperti dipilih.
  assert.equal(gabung('2026-09-16', '').toISOString(), '2026-09-15T17:00:00.000Z')
  assert.equal(gabung('2026-09-16', null).toISOString(), '2026-09-15T17:00:00.000Z')
  assert.equal(gabung('2026-09-16', '99:99').toISOString(), '2026-09-15T17:00:00.000Z')

  // Tanggal tak sah -> Invalid Date, supaya route balas 400 (bukan menyimpan
  // waktu acak). Tanggal selalu datang dari <input type="date">.
  assert.ok(isNaN(gabung('', '14:00').getTime()))
  assert.ok(isNaN(gabung('16-09-2026', '14:00').getTime()))

  // Regresi tanggal: `new Date('2026-09-16')` polos = 00:00 UTC = 07:00 WIB,
  // sehingga pemesanan "16 September" tersimpan jam 7 pagi hari itu. Zona
  // harus eksplisit WIB, dan tengah malam WIB memang jatuh di tanggal UTC
  // sebelumnya.
  assert.equal(gabung('2026-09-16').toISOString().slice(0, 10), '2026-09-15')
  assert.ok(tglJam(gabung('2026-09-16', '00:00').toISOString()).includes('16 September'))

  // Jam masuk yang dipilih benar-benar sampai ke nota.
  assert.ok(tglJam(gabung('2026-09-16', '20:00').toISOString()).includes('20.00'))
}

// 11. sekarangWib: isian cepat lewat tombol "Sekarang". Waktu di-hardcode, jadi
//     hasilnya sama kapan pun dijalankan; jam dinding mesin tak boleh berpengaruh.
{
  const wib = (iso) => sekarangWib(new Date(iso))

  // Dibulatkan ke jam TERDEKAT, karena dropdown hanya punya kelipatan jam.
  assert.deepEqual(wib('2026-09-16T07:37:00Z'), { tanggal: '2026-09-16', jam: '15:00' })  // 14:37 WIB
  assert.deepEqual(wib('2026-09-16T07:29:00Z'), { tanggal: '2026-09-16', jam: '14:00' })  // 14:29 WIB
  // Tepat setengah jam membulatkan ke atas (Math.round).
  assert.deepEqual(wib('2026-09-16T07:30:00Z'), { tanggal: '2026-09-16', jam: '15:00' })  // 14:30 WIB

  // Lewat tengah malam: pembulatan ke atas harus MENGGESER TANGGALNYA juga.
  // Ini kasus yang paling mudah salah — 23:40 WIB bukan 24:00 di hari yang
  // sama, tapi 00:00 besoknya.
  assert.deepEqual(wib('2026-09-16T16:40:00Z'), { tanggal: '2026-09-17', jam: '00:00' })  // 23:40 WIB
  assert.deepEqual(wib('2026-09-15T16:35:00Z'), { tanggal: '2026-09-16', jam: '00:00' })  // 23:35 WIB

  // Belum lewat: tetap hari yang sama.
  assert.deepEqual(wib('2026-09-16T16:29:00Z'), { tanggal: '2026-09-16', jam: '23:00' })  // 23:29 WIB
  // Dini hari WIB (masih tanggal UTC sebelumnya) tetap tanggal lokal yang benar.
  assert.deepEqual(wib('2026-09-15T17:05:00Z'), { tanggal: '2026-09-16', jam: '00:00' })  // 00:05 WIB

  // Tengah malam harus "00:00", bukan "24:00" — sebagian mesin mengeluarkan 24
  // kalau hourCycle tak dipatok ke h23.
  assert.equal(wib('2026-09-15T17:20:00Z').jam, '00:00')  // 00:20 WIB

  // Jamnya selalu kelipatan jam yang ADA di dropdown JAM_MASUK halaman Booking,
  // jadi tombol tak bisa menghasilkan nilai yang tak bisa dipilih kasir.
  const pilihan = new Set(Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`))
  for (const iso of ['2026-09-16T07:37:00Z', '2026-09-16T16:40:00Z', '2026-09-15T17:59:00Z', '2026-09-16T07:30:00Z']) {
    assert.ok(pilihan.has(wib(iso).jam), `${wib(iso).jam} harus ada di dropdown`)
  }

  // Tanggalnya harus bentuk yang diterima <input type="date">.
  assert.match(wib('2026-09-16T07:37:00Z').tanggal, /^\d{4}-\d{2}-\d{2}$/)
}

console.log('OK — check-struk-jam: 23 blok assertion lulus')
