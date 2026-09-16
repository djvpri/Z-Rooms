// scripts/check-tipe-kamar.mjs
//
// Aturan tipe kamar & fasilitasnya (lib/tipeKamar.ts). Impor sumber .ts
// langsung — salinan terbukti tak menjaga saat sumber berubah.
//
// Jalankan: node scripts/check-tipe-kamar.mjs
import assert from 'node:assert/strict'
import {
  fasilitasEfektif, namaTipe, rapikanFasilitas, kunciNama, TIPE_BAWAAN,
} from '../lib/tipeKamar.ts'

let lulus = 0
const blok = (nama, fn) => {
  try { fn(); lulus++; console.log(`  ok  ${nama}`) }
  catch (e) { console.error(`FAIL  ${nama}\n      ${e.message}`); process.exitCode = 1 }
}

console.log('lib/tipeKamar.ts')

// ── Warisan fasilitas: kamar kosong memakai fasilitas tipe
blok('kamar tanpa fasilitas mewarisi fasilitas tipe', () => {
  const k = { fasilitas: [], tipe: { fasilitas: ['AC', 'TV'] } }
  assert.deepEqual(fasilitasEfektif(k), ['AC', 'TV'])
})

blok('kamar dengan fasilitas sendiri tidak ditimpa tipe', () => {
  // Kasus nyata prod: A 101 dan A 102 sama-sama STANDAR tapi isinya beda.
  const k = { fasilitas: ['Dapur'], tipe: { fasilitas: ['AC', 'TV'] } }
  assert.deepEqual(fasilitasEfektif(k), ['Dapur'])
})

blok('kamar tanpa tipe dan tanpa fasilitas -> daftar kosong', () => {
  assert.deepEqual(fasilitasEfektif({ fasilitas: [], tipe: null }), [])
  assert.deepEqual(fasilitasEfektif({}), [])
})

blok('fasilitas null/undefined diperlakukan sebagai kosong', () => {
  assert.deepEqual(fasilitasEfektif({ fasilitas: null, tipe: { fasilitas: ['AC'] } }), ['AC'])
  assert.deepEqual(fasilitasEfektif({ fasilitas: undefined, tipe: undefined }), [])
})

blok('fasilitas tipe null tidak meledak', () => {
  assert.deepEqual(fasilitasEfektif({ fasilitas: [], tipe: { fasilitas: null } }), [])
})

// ── Nama tipe
blok('nama tipe dipakai apa adanya', () => {
  assert.equal(namaTipe({ nama: 'VIP' }), 'VIP')
  assert.equal(namaTipe({ nama: '  Family Room  ' }), 'Family Room')
})

blok('kamar tanpa tipe tampil "Tanpa tipe", bukan undefined', () => {
  assert.equal(namaTipe(null), 'Tanpa tipe')
  assert.equal(namaTipe(undefined), 'Tanpa tipe')
  assert.equal(namaTipe({ nama: '   ' }), 'Tanpa tipe')
})

// ── Pembersihan fasilitas
blok('rapikanFasilitas buang kosong, spasi berlebih, dan non-string', () => {
  assert.deepEqual(rapikanFasilitas(['  AC ', '', '  ', 'TV', 42, null]), ['AC', 'TV'])
})

blok('rapikanFasilitas buang duplikat tanpa peduli huruf besar/kecil', () => {
  assert.deepEqual(rapikanFasilitas(['AC', 'ac', 'Ac']), ['AC'])
})

blok('rapikanFasilitas pada bukan-array -> kosong', () => {
  assert.deepEqual(rapikanFasilitas('AC'), [])
  assert.deepEqual(rapikanFasilitas(undefined), [])
})

blok('rapikanFasilitas batasi jumlah', () => {
  const banyak = Array.from({ length: 100 }, (_, i) => `F${i}`)
  assert.equal(rapikanFasilitas(banyak).length, 30)
})

blok('rapikanFasilitas buang nama kepanjangan', () => {
  assert.deepEqual(rapikanFasilitas(['x'.repeat(41)]), [])
})

// ── Kunci unik nama tipe: "VIP " == "vip", tapi "VIP A" != "VIP  A"
blok('kunciNama menormalkan spasi & huruf', () => {
  assert.equal(kunciNama(' VIP  '), kunciNama('vip'))
  assert.equal(kunciNama('Family   Room'), kunciNama('family room'))
  assert.notEqual(kunciNama('VIP'), kunciNama('VIP A'))
})

// ── Tipe bawaan harus konsisten (dipakai saat properti baru dibuat)
blok('TIPE_BAWAAN: nama unik dan urutan menaik', () => {
  const kunci = TIPE_BAWAAN.map(t => kunciNama(t.nama))
  assert.equal(new Set(kunci).size, kunci.length, 'nama tipe bawaan duplikat')
  const urutan = TIPE_BAWAAN.map(t => t.urutan)
  assert.deepEqual(urutan, [...urutan].sort((a, b) => a - b))
})

blok('TIPE_BAWAAN: tiap tipe punya fasilitas bersih & ada isinya', () => {
  for (const t of TIPE_BAWAAN) {
    const bersih = rapikanFasilitas(t.fasilitas)
    assert.deepEqual(bersih, t.fasilitas, `${t.nama}: fasilitas tidak bersih`)
    assert.ok(bersih.length > 0, `${t.nama}: fasilitas kosong`)
  }
})

if (process.exitCode) console.error('\nADA YANG GAGAL')
else console.log(`\n${lulus} blok lulus`)
