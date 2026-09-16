// scripts/check-kamar-ubah.mjs
//
// Aturan validasi data kamar (lib/kamar.ts) yang dipakai POST /api/kamar dan
// PATCH /api/kamar/[id]. Diimpor dari sumber .ts, bukan disalin — salinan tak
// akan ikut berubah saat aturannya diperbaiki.
//
// Yang dijaga di sini adalah janji ke pemilik properti:
//   • kamar boleh dikoreksi sebagian saja (nomor saja, luas saja, tipe saja)
//   • `luas: null` benar-benar bermakna hapus, bukan "tak diubah"
//   • `status` tak punya jalur di form ini — alur sewa yang memegangnya
import assert from 'node:assert/strict'
import { createKamarSchema, updateKamarSchema } from '../lib/kamar.ts'

let lulus = 0
const blok = (nama, fn) => {
  try { fn(); lulus++; console.log(`  ok  ${nama}`) }
  catch (e) { console.error(`FAIL  ${nama}\n      ${e.message}`); process.exitCode = 1 }
}

const ok = (skema, data) => {
  const r = skema.safeParse(data)
  assert.equal(r.success, true, 'harusnya valid: ' + JSON.stringify(data) + ' -> ' + JSON.stringify(r.error?.issues))
  return r.data
}
const tolak = (skema, data) => {
  assert.equal(skema.safeParse(data).success, false, 'harusnya ditolak: ' + JSON.stringify(data))
}

console.log('lib/kamar.ts — tambah kamar')

blok('kamar baru cukup nomor + tipe; lantai & fasilitas punya nilai awal', () => {
  const d = ok(createKamarSchema, { nomor: 'A-101', tipeId: 't1' })
  assert.equal(d.lantai, 1)
  assert.deepEqual(d.fasilitas, [])
})

blok('nomor dipangkas spasinya', () => {
  assert.equal(ok(createKamarSchema, { nomor: '  A-101  ', tipeId: 't1' }).nomor, 'A-101')
})

blok('tanpa tipe ditolak — kamar tanpa tipe tak punya tarif', () => {
  tolak(createKamarSchema, { nomor: 'A-101' })
  tolak(createKamarSchema, { nomor: 'A-101', tipeId: '' })
})

blok('nomor kosong / hanya spasi ditolak', () => {
  tolak(createKamarSchema, { nomor: '', tipeId: 't1' })
  tolak(createKamarSchema, { nomor: '   ', tipeId: 't1' })
})

console.log('lib/kamar.ts — ubah kamar')

blok('kirim sebagian saja boleh (nomor saja, luas saja, tipe saja)', () => {
  ok(updateKamarSchema, { nomor: 'A-102' })
  ok(updateKamarSchema, { luas: 12 })
  ok(updateKamarSchema, { tipeId: 't2' })
  ok(updateKamarSchema, {})
})

blok('luas: null diterima sebagai "hapus luas", bukan ditolak', () => {
  const d = ok(updateKamarSchema, { luas: null })
  assert.equal(d.luas, null)
  // undefined berarti "jangan diubah" — beda dari null. Ini yang bikin bug
  // kalau keduanya diperlakukan sama.
  assert.equal(Object.hasOwn(d, 'luas'), true)
  assert.equal(Object.hasOwn(updateKamarSchema.parse({ nomor: 'X' }), 'luas'), false)
})

blok('luas nol / negatif ditolak', () => {
  tolak(updateKamarSchema, { luas: 0 })
  tolak(updateKamarSchema, { luas: -3 })
})

blok('lantai nol / negatif / pecahan ditolak', () => {
  tolak(updateKamarSchema, { lantai: 0 })
  tolak(updateKamarSchema, { lantai: -1 })
  tolak(updateKamarSchema, { lantai: 1.5 })
  assert.equal(ok(updateKamarSchema, { lantai: 2 }).lantai, 2)
})

blok('nomor kosong / hanya spasi ditolak', () => {
  tolak(updateKamarSchema, { nomor: '' })
  tolak(updateKamarSchema, { nomor: '  ' })
})

blok('status DIABUIKAN — tak ada jalur ubah status dari form ini', () => {
  // Status kamar cerminan alur sewa. Kalau suatu saat field ini lolos ke sini,
  // pemilik bisa menandai kamar TERSEDIA padahal penyewanya masih aktif:
  // tagihan jalan terus, tombol check-out hilang dari layar.
  const d = ok(updateKamarSchema, { nomor: 'A-103', status: 'TERSEDIA' })
  assert.equal(Object.hasOwn(d, 'status'), false, 'status tidak boleh ikut tersimpan')
  assert.equal(Object.hasOwn(d, 'propertiId'), false, 'propertiId tidak boleh ikut tersimpan')
})

blok('tipe kosong ditolak (kalau memang dikirim)', () => {
  tolak(updateKamarSchema, { tipeId: '' })
})

blok('fasilitas harus daftar teks', () => {
  assert.deepEqual(ok(updateKamarSchema, { fasilitas: ['AC', 'TV'] }).fasilitas, ['AC', 'TV'])
  tolak(updateKamarSchema, { fasilitas: 'AC' })
})

blok('badan bukan objek ditolak (bukan meledak 500)', () => {
  tolak(updateKamarSchema, null)
  tolak(updateKamarSchema, 'bukan-objek')
})

console.log(`  ${lulus} blok lulus`)
