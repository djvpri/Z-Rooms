// scripts/check-cetak.mjs
//
// Uji murni setelan cetak (`lib/cetak.ts`). Tanpa DB, tanpa server.
//
// INTI YANG DIJAGA DI SINI: jumlah kolom per baris. Salah hitung kolom bukan
// bug kosmetik — printer thermal MEMOTONG karakter di luar lebar kertas, dan
// yang terpotong adalah kolom angka paling kanan, yaitu harga. Nota yang
// harganya hilang lebih buruk daripada nota yang gagal tercetak.
//
// Dijalankan lewat `npm run check` (scripts/check-all.mjs memanggilnya).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Mod from '../lib/cetak.ts'

const C = Mod.default ?? Mod
const akarRepo = join(dirname(fileURLToPath(import.meta.url)), '..')

console.log('check-cetak: setelan cetak nota\n')

const lebar = (s) => [...s].length // panjang per KARAKTER, bukan byte

// ─── 1. Kolom per ukuran kertas ───────────────────────────────────────────
// Angka ini bukan selera: 58mm = 32 kolom, 80mm = 48 kolom, dan keduanya
// dipakai printer thermal yang dijual pasaran.
{
  assert.equal(C.kolomKertas('58'), 32, 'kertas 58mm = 32 kolom')
  assert.equal(C.kolomKertas('80'), 48, 'kertas 80mm = 48 kolom')
  assert.equal(C.kolomKertas(null), 32, 'belum diatur → bawaan 32 kolom')
  assert.equal(C.kolomKertas(undefined), 32, 'tak terdefinisi → bawaan')
  assert.equal(C.kolomKertas('999'), 32, 'ukuran tak dikenal → bawaan, bukan crash')
  assert.equal(C.kolomKertas(''), 32, 'string kosong → bawaan')
  console.log('  ok   ukuran kertas memetakan ke jumlah kolom yang benar')
}

// ─── 2. Garis pemisah selebar kertas ──────────────────────────────────────
// Garis dibuat dari KARAKTER ULANG, bukan CSS — printer thermal mencetak teks
// mentah. Garis yang lebih panjang dari kertas akan berlipat.
{
  assert.equal(lebar(C.garisKertas('58')), 32, 'garis 58mm = 32 karakter')
  assert.equal(lebar(C.garisKertas('80')), 48, 'garis 80mm = 48 karakter')
  assert.ok(C.garisKertas('58').startsWith('-'), 'garis terbuat dari karakter, bukan spasi')
  assert.equal(lebar(C.garisKertas('80', '=')), 48, 'karakter garis bisa diganti, panjang tetap')
  console.log('  ok   garis pemisah tepat selebar kertas')
}

// ─── 3. Baris dua kolom TIDAK PERNAH melebihi lebar kertas ────────────────
// Ini penjaga terpenting berkas ini. Nilai (harga) harus utuh; label yang
// dikorbankan lebih dulu kalau ruang tak cukup.
for (const kertas of ['58', '80']) {
  const lebarKertas = C.kolomKertas(kertas)

  const normal = C.barisDuaKolom('Sewa 2 jam', '130.000', kertas)
  assert.equal(lebar(normal), lebarKertas, `${kertas}: baris normal pas ${lebarKertas} kolom`)
  assert.ok(normal.endsWith('130.000'), `${kertas}: nilai ada di ujung kanan`)

  // Label panjang + nilai panjang: total tetap harus pas.
  const sempit = C.barisDuaKolom('Air mineral kemasan botol 1500ml', '1.250.000', kertas)
  assert.equal(lebar(sempit), lebarKertas, `${kertas}: baris panjang tetap pas`)
  assert.ok(sempit.endsWith('1.250.000'), `${kertas}: harga tetap utuh walau label dipotong`)

  // Nilai lebih panjang dari kertas: tak bisa diselamatkan, tapi TAK BOLEH
  // melebihi lebar — lebih baik terpotong rapi daripada berlipat.
  const kebesaran = C.barisDuaKolom('Total', '9'.repeat(200), kertas)
  assert.equal(lebar(kebesaran), lebarKertas, `${kertas}: nilai kebesaran dipotong ke lebar kertas`)

  // Label tanpa nilai: tetap harus pas.
  const kosong = C.barisDuaKolom('Catatan', '', kertas)
  assert.equal(lebar(kosong), lebarKertas, `${kertas}: baris dengan nilai kosong tetap pas`)
}
console.log('  ok   baris dua kolom tak pernah melebihi lebar kertas (58 & 80)')

// ─── 4. Titik pengisi benar-benar memisahkan ──────────────────────────────
{
  const b = C.barisDuaKolom('Total', '50.000', '58')
  assert.ok(b.startsWith('Total'), 'label di kiri')
  assert.ok(b.includes('.'), 'ada titik pengisi')
  assert.ok(b.endsWith('50.000'), 'nilai di kanan')
  // Minimal satu pemisah walau label + nilai hampir menghabiskan baris.
  const rapat = C.barisDuaKolom('x'.repeat(30), '123456', '58')
  assert.ok(rapat.includes('.'), 'tetap ada pemisah saat baris hampir penuh')
  console.log('  ok   titik pengisi memisahkan label dan nilai')
}

// ─── 5. Baris kiri/kanan (kepala nota) ────────────────────────────────────
{
  for (const kertas of ['58', '80']) {
    const lebarKertas = C.kolomKertas(kertas)
    const b = C.barisKiriKanan('No: KR-0042', '18/09 19:30', kertas)
    assert.equal(lebar(b), lebarKertas, `${kertas}: baris kiri/kanan pas`)
    assert.ok(b.startsWith('No: KR-0042'), `${kertas}: kiri di awal`)
    assert.ok(b.endsWith('18/09 19:30'), `${kertas}: kanan di akhir`)

    // Kiri panjang: kanan harus tetap utuh di ujung.
    const panjang = C.barisKiriKanan('Nama pelanggan yang sangat panjang sekali', '19:30', kertas)
    assert.equal(lebar(panjang), lebarKertas, `${kertas}: kiri panjang tetap pas`)
    assert.ok(panjang.endsWith('19:30'), `${kertas}: kanan tetap utuh`)
  }
  console.log('  ok   baris kiri/kanan rapi di kedua ukuran')
}

// ─── 6. Baris tengah ──────────────────────────────────────────────────────
{
  const t = C.barisTengah('ZXRoom', '58')
  assert.ok(t.startsWith(' '), 'baris tengah menjorok ke dalam')
  assert.ok(t.trim() === 'ZXRoom', 'teks utuh setelah dipangkas')
  assert.ok(lebar(t) <= 32, 'tak melebihi kertas')
  // Teks lebih panjang dari kertas: dipotong, tak melebihi.
  const l = C.barisTengah('x'.repeat(100), '58')
  assert.equal(lebar(l), 32, 'teks panjang dipotong ke lebar kertas')
  console.log('  ok   baris tengah')
}

// ─── 7. Baca preferensi: kiriman kotor jadi nilai aman ────────────────────
// Setelan cetak datang dari DB (bisa dari versi aplikasi lama) dan dari
// kiriman HTTP. Keduanya tak bisa dipercaya — hasilnya harus SELALU objek
// lengkap berbentuk sama.
{
  const kosong = C.bacaPrefCetak(null)
  assert.deepEqual(kosong, C.PREF_CETAK_BAWAAN, 'null → bawaan lengkap')
  assert.deepEqual(C.bacaPrefCetak(undefined), C.PREF_CETAK_BAWAAN, 'undefined → bawaan')
  assert.deepEqual(C.bacaPrefCetak('bukan objek'), C.PREF_CETAK_BAWAAN, 'string → bawaan')
  assert.deepEqual(C.bacaPrefCetak(123), C.PREF_CETAK_BAWAAN, 'angka → bawaan')

  // Kertas tak dikenal DIBUANG, bukan diteruskan.
  const kertasAneh = C.bacaPrefCetak({ kertas: '999' })
  assert.equal(kertasAneh.kertas, '58', 'ukuran kertas tak dikenal → bawaan')

  // Field tak dikenal dibuang.
  const asing = C.bacaPrefCetak({ kertas: '80', jahat: 'x', __proto__: { a: 1 } })
  assert.ok(!('jahat' in asing), 'field tak dikenal dibuang')
  assert.equal(asing.kertas, '80', 'field yang sah tetap dipertahankan')

  // Tipe salah per field: hanya field itu yang jatuh ke bawaan.
  const campur = C.bacaPrefCetak({ kertas: '80', salinan: 'ya', kakiNota: false })
  assert.equal(campur.kertas, '80', 'kertas sah dipertahankan')
  assert.equal(campur.salinan, false, 'salinan bertipe salah → bawaan')
  assert.equal(campur.kakiNota, false, 'kakiNota false dipertahankan (bukan dianggap kosong)')

  // Nama printer dipangkas dan dipotong.
  const namaPanjang = C.bacaPrefCetak({ printer: 'x'.repeat(500) })
  assert.equal(namaPanjang.printer.length, C.NAMA_PRINTER_MAKS, 'nama printer dipotong ke batas')
  const spasi = C.bacaPrefCetak({ printer: '  66:1E:0C  ' })
  assert.equal(spasi.printer, '66:1E:0C', 'spasi tepi dibuang')
  console.log('  ok   bacaPrefCetak menolak kiriman kotor tanpa kehilangan field yang sah')
}

// ─── 8. JSON rusak tak mematikan halaman ──────────────────────────────────
{
  assert.deepEqual(C.bacaPrefCetakMentah(null), C.PREF_CETAK_BAWAAN, 'NULL → bawaan')
  assert.deepEqual(C.bacaPrefCetakMentah(''), C.PREF_CETAK_BAWAAN, 'string kosong → bawaan')
  assert.deepEqual(C.bacaPrefCetakMentah('{rusak'), C.PREF_CETAK_BAWAAN, 'JSON rusak → bawaan')
  assert.deepEqual(C.bacaPrefCetakMentah('[1,2]'), C.PREF_CETAK_BAWAAN, 'array → bawaan')

  const sah = C.bacaPrefCetakMentah('{"kertas":"80","kakiNota":false}')
  assert.equal(sah.kertas, '80', 'JSON sah terbaca')
  assert.equal(sah.kakiNota, false, 'nilai false terbaca sebagai false')
  console.log('  ok   JSON rusak jatuh ke bawaan, JSON sah terbaca')
}

// ─── 9. Bolak-balik simpan/baca tidak mengubah nilai ──────────────────────
// Yang disimpan adalah hasil stringify, jadi nilai yang tak selamat putaran
// ini akan tampak "berubah sendiri" di halaman pengaturan.
{
  const asal = { kertas: '80', koneksi: 'jaringan', printer: '192.168.1.50', salinan: true, kakiNota: false }
  const putaran = C.bacaPrefCetakMentah(C.keStringPrefCetak(asal))
  assert.deepEqual(putaran, asal, 'nilai bertahan setelah disimpan lalu dibaca')
  console.log('  ok   simpan → baca mengembalikan nilai yang sama')
}

// ─── 10. labelPrinter: "belum dipilih" terlihat sengaja ───────────────────
{
  assert.equal(C.labelPrinter(''), 'Belum dipilih', 'kosong → label jelas')
  assert.equal(C.labelPrinter('   '), 'Belum dipilih', 'spasi saja → belum dipilih')
  assert.equal(C.labelPrinter('66:1E:0C'), '66:1E:0C', 'nama terisi dikembalikan apa adanya')
  console.log('  ok   labelPrinter')
}

// ─── 12. Naskah ESC/POS ───────────────────────────────────────────────────
// Perintah dikirim sebagai BYTE. Salah di sini tak terlihat di layar — hanya
// tampak di kertas, sebagai simbol aneh atau tak terpotong sama sekali.
{
  const n = C.naskahNota(['Total ........ 50.000'])
  assert.equal(n[0].jenis, 'mentah', 'naskah diawali perintah, bukan teks')
  assert.deepEqual(n[0].byte, [0x1b, 0x40], 'naskah diawali ESC @ (inisialisasi printer)')
  assert.equal(n[1].jenis, 'mentah', 'rata kiri dikirim sebagai perintah')
  assert.equal(n[2].jenis, 'baris', 'teks nota masuk sebagai baris')

  // Potong kertas: tanpa ini kertas menjuntai di printer.
  const akhir = n.slice(-2)
  assert.deepEqual(akhir[0].byte, [0x1b, 0x64, 0x03], 'maju 3 baris sebelum potong')
  assert.deepEqual(akhir[1].byte, [0x1d, 0x56, 0x42, 0x00], 'naskah diakhiri perintah potong')

  // `potong: false` untuk printer tanpa pemotong — teksnya tetap utuh.
  const tanpaPotong = C.naskahNota(['Halo'], { potong: false })
  assert.equal(tanpaPotong.slice(-1)[0].jenis, 'baris', 'tanpa potong: tak ada perintah potong di akhir')

  // Perintah harus byte 0-255; angka di luar itu bikin penguraian Kotlin
  // memperlakukannya sebagai teks — perintah tak jalan, muncul di kertas.
  for (const p of n) {
    if (p.jenis !== 'mentah') continue
    for (const b of p.byte) {
      assert.ok(Number.isInteger(b) && b >= 0 && b <= 255, `byte perintah di luar 0-255: ${b}`)
    }
  }
  console.log('  ok   naskah ESC/POS: inisialisasi, teks, maju, potong')
}

// ─── 13. Naskah jadi teks: bentuk yang disepakati dengan sisi Kotlin ──────
{
  const teks = C.naskahKeTeks(C.naskahNota(['Halo', 'Total ........ 50.000']))
  // Perintah ditulis `<27,64>` dan HARUS cocok dengan `bacaPerintah` di
  // PrinterBluetooth.kt. Kalau salah satu berubah, perintah tercetak sebagai
  // teks di nota.
  assert.ok(teks.includes('<27,64>'), 'ESC @ ditulis sebagai <27,64>')
  assert.ok(teks.includes('<29,86,66,0>'), 'perintah potong ditulis <29,86,66,0>')
  assert.ok(teks.includes('Total ........ 50.000'), 'teks nota diteruskan apa adanya')
  assert.equal(teks.split('\n').length, 6, 'baris dipisah \\n (2 perintah + 2 teks + maju + potong)')

  // Angka byte harus desimal tanpa spasi — pengurai Kotlin memangkas spasi,
  // tapi menulisnya rapat membuat dua sisi lebih mudah dibandingkan.
  assert.ok(!/<\s/.test(teks), 'perintah tak memakai spasi di dalam kurung')
  console.log('  ok   naskahKeTeks memakai bentuk yang sama dengan sisi Kotlin')
}

// ─── 14. Nota uji: memuat semua yang bisa salah ───────────────────────────
{
  for (const kertas of ['58', '80']) {
    const baris = C.notaUji(kertas)
    const lebar = C.kolomKertas(kertas)
    // Tiap baris harus muat — nota uji yang sendiri berlipat tak berguna untuk
    // menguji apakah nota berlipat.
    for (const b of baris) {
      assert.ok([...b].length <= lebar, `nota uji ${kertas}mm ada baris ${[...b].length} > ${lebar} kolom`)
    }
    assert.ok(baris.join('\n').includes('TES CETAK'), 'nota uji memberi tahu dirinya nota uji')
    // Baris 'X' penuh selebar kertas: satu-satunya cara melihat apakah kertas
    // yang dipilih sudah tepat.
    assert.ok(baris.some((b) => b.trim() === 'X'.repeat(lebar)), `nota uji ${kertas}mm tak punya baris penuh`)
  }
  console.log('  ok   nota uji muat di kedua ukuran kertas')
}

// ─── 15. Jembatan Android ─────────────────────────────────────────────────
// Di peramban jembatan ini TIDAK ADA, dan tombol yang tetap menyala lalu diam
// terbaca kasir sebagai kerusakan. Jadi deteksinya harus tepat.
{
  // Tak ada window / tak ada jembatan.
  assert.equal(C.ambilJembatan(null), null, 'tanpa window → tak ada jembatan')
  assert.equal(C.ambilJembatan({}), null, 'window tanpa ZXR_APK → tak ada jembatan')
  assert.equal(C.adaJembatanCetak({}), false, 'peramban biasa → tak bisa cetak')

  // Jembatan ada TAPI tanpa `cetak` (APK lama): harus dianggap TIDAK bisa cetak.
  // Inilah bedanya "ada" dan "bisa dipakai".
  assert.equal(C.ambilJembatan({ [C.NAMA_JEMBATAN]: {} }), null, 'jembatan tanpa cetak → dianggap tak ada')
  assert.equal(C.ambilJembatan({ [C.NAMA_JEMBATAN]: { kosongkan() {} } }), null,
    'APK lama (hanya kosongkan) → dianggap tak ada')

  // Jembatan lengkap.
  const j = { cetak() {} }
  assert.equal(C.ambilJembatan({ [C.NAMA_JEMBATAN]: j }), j, 'jembatan dengan cetak dikenali')
  assert.equal(C.adaJembatanCetak({ [C.NAMA_JEMBATAN]: j }), true, 'ada → bisa cetak')
  assert.equal(C.NAMA_JEMBATAN, 'ZXR_APK', 'nama jembatan = yang dipasang MainActivity')
  console.log('  ok   jembatan: hanya dianggap ada kalau benar-benar bisa cetak')
}

// ─── 16. Halaman & route memakai fungsi ini ───────────────────────────────
{
  const halaman = readFileSync(join(akarRepo, 'app/(dashboard)/pengaturan/cetak/page.tsx'), 'utf8')
  // Dicek PEMANGGILANNYA: `includes('barisDuaKolom(')` tetap benar walau
  // fungsinya cuma diimpor lalu pratinjau menulis ulang tata letaknya sendiri.
  assert.ok(halaman.includes("barisDuaKolom('"), 'halaman MEMANGGIL barisDuaKolom dari lib/cetak')
  assert.ok(halaman.includes('garisKertas(k'), 'halaman MEMANGGIL garisKertas untuk pembatas nota')
  assert.ok(halaman.includes('kolomKertas('), 'halaman menampilkan jumlah kolom')
  assert.ok(halaman.includes('/api/properti/pref-cetak'), 'halaman menyimpan lewat API pref-cetak')
  // Tombol tes cetak: harus memanggil handler, bukan onClick kosong.
  assert.ok(halaman.includes('onClick={tesCetak}'), 'tombol tes cetak tak memanggil apa pun')

  const route = readFileSync(join(akarRepo, 'app/api/properti/pref-cetak/route.ts'), 'utf8')
  assert.ok(route.includes('bacaPrefCetak('), 'route memvalidasi lewat bacaPrefCetak')
  assert.ok(route.includes('keStringPrefCetak('), 'route menyimpan lewat keStringPrefCetak')
  assert.ok(route.includes('export async function PUT'), 'route punya PUT')
  assert.ok(route.includes('export async function DELETE'), 'route punya DELETE untuk kembali ke bawaan')
  console.log('  ok   halaman & route memakai fungsi lib/cetak, bukan tulis ulang')
}

console.log('\ncheck-cetak: semua uji murni LULUS')
