// scripts/check-ktp.mjs
//
// Aturan pembacaan KTP. Diuji di fungsi rapikan (lib/ktp.ts), bukan di route,
// supaya tak perlu memanggil Gemini sungguhan.
//
// Yang dijaga: hasil bacaan mentah dari model TIDAK boleh dipercaya apa adanya.
// Dua kasus nyata yang pernah terjadi saat pengembangan:
//   - gambar bukan KTP tetap mengisi "LAKI-LAKI" (model terpaksa memilih karena
//     field-nya enum) -> sekarang jenis kelamin disaring ke dua nilai sah saja;
//   - NIK datang dengan spasi/titik -> sekarang diambil 16 digit dan selain itu
//     dianggap gagal baca, supaya tidak ada NIK separuh yang tersimpan.
import assert from 'node:assert/strict'
import { rapikanHasil, rapikanNik, rapikanJenisKelamin, MIME_DIIZINKAN, MAKS_UKURAN } from '../lib/ktp.ts'

let lulus = 0
function blok(nama, fn) {
  try { fn(); console.log(`  ok  ${nama}`); lulus++ }
  catch (e) { console.error(`  GAGAL  ${nama}\n        ${e.message}`); process.exitCode = 1 }
}

console.log('check-ktp')

blok('hasil KTP normal diteruskan apa adanya', () => {
  const h = rapikanHasil({
    nama: '  BUDI SANTOSO WIJAYA  ',
    nik: '1271015507900007',
    alamat: 'JL. MERDEKA NO. 45',
    jenisKelamin: 'LAKI-LAKI',
  })
  assert.equal(h.nama, 'BUDI SANTOSO WIJAYA')
  assert.equal(h.nik, '1271015507900007')
  assert.equal(h.alamat, 'JL. MERDEKA NO. 45')
  assert.equal(h.jenisKelamin, 'LAKI-LAKI')
})

blok('NIK dengan spasi/titik tetap jadi 16 digit', () => {
  assert.equal(rapikanNik('1271 0155 0790 0007'), '1271015507900007')
  assert.equal(rapikanNik('1271.0155.0790.0007'), '1271015507900007')
})

blok('NIK bukan 16 digit dibuang, bukan dipotong', () => {
  assert.equal(rapikanNik('12710155079000'), '', '15 digit harus kosong')
  assert.equal(rapikanNik('12710155079000071'), '', '17 digit harus kosong')
  assert.equal(rapikanNik(''), '')
  assert.equal(rapikanNik(null), '')
  assert.equal(rapikanNik('tidak terbaca'), '')
})

blok('jenis kelamin hanya LAKI-LAKI atau PEREMPUAN', () => {
  assert.equal(rapikanJenisKelamin('laki-laki'), 'LAKI-LAKI')
  assert.equal(rapikanJenisKelamin('LAKI LAKI'), 'LAKI-LAKI')
  assert.equal(rapikanJenisKelamin('Perempuan'), 'PEREMPUAN')
  assert.equal(rapikanJenisKelamin('PRIA'), '', 'sinonim tak dikenal harus kosong')
  assert.equal(rapikanJenisKelamin(''), '')
  assert.equal(rapikanJenisKelamin(undefined), '')
})

blok('gambar bukan KTP -> semua field kosong, termasuk jenis kelamin', () => {
  // Bentuk balasan nyata dari Gemini untuk gambar yang bukan KTP.
  const h = rapikanHasil({ nama: '', nik: '', alamat: '', jenisKelamin: '' })
  assert.deepEqual(h, { nama: '', nik: '', alamat: '', jenisKelamin: '' })
})

blok('balasan tanpa field sama sekali tidak melempar', () => {
  const h = rapikanHasil({})
  assert.deepEqual(h, { nama: '', nik: '', alamat: '', jenisKelamin: '' })
  assert.doesNotThrow(() => rapikanHasil(null))
  assert.doesNotThrow(() => rapikanHasil(undefined))
})

blok('alamat dua baris digabung jadi satu string', () => {
  const h = rapikanHasil({ alamat: 'JL. MERDEKA NO. 45, KEL. BABURA KEC. MEDAN BARU' })
  assert.equal(h.alamat, 'JL. MERDEKA NO. 45, KEL. BABURA KEC. MEDAN BARU')
})

blok('format dan ukuran berkas dibatasi', () => {
  assert.ok(MIME_DIIZINKAN.includes('image/jpeg'))
  assert.ok(MIME_DIIZINKAN.includes('image/png'))
  assert.ok(!MIME_DIIZINKAN.includes('application/pdf'), 'PDF belum didukung')
  assert.equal(MAKS_UKURAN, 6 * 1024 * 1024)
})

console.log(`\n${lulus} blok lulus`)
