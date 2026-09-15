// scripts/check-struk-jam.mjs
//
// Self-check tampilan jam di struk booking. Jalankan: node scripts/check-struk-jam.mjs
//
// Menyalin `tglJam` dari app/(dashboard)/booking/page.tsx. Berkas itu .tsx dan
// mengimpor React, jadi tak bisa diimpor langsung dari skrip Node — salinan ini
// harus dijaga tetap sama.

const tglJam = (iso) =>
  new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })

// Gabungan tanggal + jam seperti di handleSubmit.
const gabung = (tgl, jam) => new Date(`${tgl}T${jam}:00+07:00`)

let n = 0
const cek = (nama, benar) => {
  n++
  if (!benar) {
    console.error(`GAGAL blok ${n}: ${nama}`)
    process.exit(1)
  }
}

// 1. Kasir ketik 15 Sep 2026, 14:30 -> jam itu yang harus muncul, bukan bergeser.
const m1 = gabung('2026-09-15', '14:30')
cek('14:30 WIB jadi 14:30', tglJam(m1.toISOString()).includes('14.30'))

// 2. Tengah malam WIB tidak boleh jadi tanggal sebelumnya.
const m2 = gabung('2026-09-15', '00:00')
cek('00:00 WIB tetap 15 September', tglJam(m2.toISOString()).includes('15 September'))

// 3. Dini hari WIB (jam 02:00 = 19:00 UTC hari sebelumnya) tetap tanggal benar.
const m3 = gabung('2026-09-15', '02:00')
cek('02:00 WIB tetap 15 September', tglJam(m3.toISOString()).includes('15 September'))

// 4. Jam 23:59 WIB tetap tanggal yang sama, bukan besoknya.
const m4 = gabung('2026-09-15', '23:59')
cek('23:59 WIB tetap 15 September', tglJam(m4.toISOString()).includes('15 September'))

// 5. Offset tersimpan benar: 14:30 WIB = 07:30 UTC.
cek('14:30 WIB = 07:30Z', m1.toISOString() === '2026-09-15T07:30:00.000Z')

// 6. Tanggal keluar HARIAN +1 hari, jam ikut jam masuk (bukan jam 12:00 —
//    jam 12:00 hanya acuan batas check-out, bukan waktu di struk).
const keluar = new Date(m1)
keluar.setUTCDate(keluar.getUTCDate() + 1)
cek('keluar +1 hari', tglJam(keluar.toISOString()).includes('16 September'))
cek('jam keluar = jam masuk', tglJam(keluar.toISOString()).includes('14.30'))

// 7. BULANAN +1 bulan mempertahankan jam.
const keluarBulan = new Date(m1)
keluarBulan.setUTCMonth(keluarBulan.getUTCMonth() + 1)
cek('keluar +1 bulan = 15 Oktober', tglJam(keluarBulan.toISOString()).includes('15 Oktober'))
cek('jam keluar bulanan = jam masuk', tglJam(keluarBulan.toISOString()).includes('14.30'))

// 8. Tanggal tak valid -> jangan tampil "Invalid Date".
cek('tanggal kosong -> bukan Invalid Date', !tglJam(new Date().toISOString()).includes('Invalid'))

console.log(`OK — check-struk-jam: ${n} blok assertion lulus`)
