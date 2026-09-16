// scripts/check-tipe-kamar.mjs
//
// Aturan tipe kamar & fasilitasnya (lib/tipeKamar.ts). Impor sumber .ts
// langsung — salinan terbukti tak menjaga saat sumber berubah.
//
// Jalankan: node scripts/check-tipe-kamar.mjs
import assert from 'node:assert/strict'
import {
  fasilitasEfektif, fasilitasSendiri, namaTipe, rapikanFasilitas, kunciNama, TIPE_BAWAAN,
  hargaEfektif, depositEfektif, periodeTersedia, hargaRingkas,
} from '../lib/tipeKamar.ts'

let lulus = 0
const blok = (nama, fn) => {
  try { fn(); lulus++; console.log(`  ok  ${nama}`) }
  catch (e) { console.error(`FAIL  ${nama}\n      ${e.message}`); process.exitCode = 1 }
}

console.log('lib/tipeKamar.ts')

// ── Fasilitas: SELALU dari tipe, bukan dari kamar
blok('kamar tanpa fasilitas mewarisi fasilitas tipe', () => {
  const k = { fasilitas: [], tipe: { fasilitas: ['AC', 'TV'] } }
  assert.deepEqual(fasilitasEfektif(k), ['AC', 'TV'])
})

blok('fasilitas kamar DIIABAIKAN — tipe menang', () => {
  // Regresi yang dijaga: dulu kamar yang punya daftar sendiri menang, dan
  // akibatnya 15 dari 15 kamar prod tak mengikuti fasilitas tipenya. Kamar 001
  // tampil tanpa "Kasur King" walau tipe Standarnya punya.
  const k = { fasilitas: ['Dapur'], tipe: { fasilitas: ['AC', 'TV'] } }
  assert.deepEqual(fasilitasEfektif(k), ['AC', 'TV'])
})

blok('fasilitasSendiri tetap membaca kolom kamar (untuk periksa sisa data)', () => {
  const k = { fasilitas: ['Dapur'], tipe: { fasilitas: ['AC', 'TV'] } }
  assert.deepEqual(fasilitasSendiri(k), ['Dapur'])
  assert.deepEqual(fasilitasSendiri({ fasilitas: null }), [])
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

blok('kamar bersisa data lama TIDAK menyembunyikan fasilitas tipe', () => {
  // Bentuk nyata baris prod pra-migrasi: kamar 001, tipe Standar.
  const kamar001 = { fasilitas: ['AC', 'Kamar Mandi Dalam'], tipe: { fasilitas: ['AC', 'Kamar Mandi Dalam', 'Kasur King'] } }
  assert.deepEqual(fasilitasEfektif(kamar001), ['AC', 'Kamar Mandi Dalam', 'Kasur King'])
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

// ── Harga: melekat pada tipe, dibaca lewat helper warisan
const kmr = (harga) => ({ tipe: harga ? { harga } : null })

blok('hargaEfektif membaca tarif tipe', () => {
  const k = kmr([{ periodeSewa: 'BULANAN', harga: 1200000, deposit: 2400000 }])
  assert.equal(hargaEfektif(k, 'BULANAN'), 1200000)
  assert.equal(depositEfektif(k, 'BULANAN'), 2400000)
})

blok('periode tanpa tarif -> 0, bukan NaN', () => {
  const k = kmr([{ periodeSewa: 'BULANAN', harga: 1200000 }])
  assert.equal(hargaEfektif(k, 'HARIAN'), 0)
  assert.equal(hargaEfektif(k, 'TAHUNAN'), 0)
})

blok('kamar tanpa tipe / tanpa harga -> 0', () => {
  assert.equal(hargaEfektif(kmr(null), 'BULANAN'), 0)
  assert.equal(hargaEfektif(null, 'BULANAN'), 0)
  assert.equal(hargaEfektif({}, 'BULANAN'), 0)
})

blok('baris nonaktif diabaikan', () => {
  const k = kmr([{ periodeSewa: 'BULANAN', harga: 999, aktif: false }])
  assert.equal(hargaEfektif(k, 'BULANAN'), 0)
})

blok('harga Decimal-as-string tetap terbaca', () => {
  // Prisma mengembalikan Decimal; sesudah lewat JSON bentuknya string.
  const k = kmr([{ periodeSewa: 'BULANAN', harga: '1500000' }])
  assert.equal(hargaEfektif(k, 'BULANAN'), 1500000)
})

blok('harga/tarif tak masuk akal -> 0', () => {
  assert.equal(hargaEfektif(kmr([{ periodeSewa: 'BULANAN', harga: 'abc' }]), 'BULANAN'), 0)
  assert.equal(hargaEfektif(kmr([{ periodeSewa: 'BULANAN', harga: -5 }]), 'BULANAN'), 0)
  assert.equal(hargaEfektif(kmr([{ periodeSewa: 'BULANAN', harga: 0 }]), 'BULANAN'), 0)
})

blok('periodeTersedia hanya periode bertarif, urut PERIODE_SEWA', () => {
  const k = kmr([
    { periodeSewa: 'TAHUNAN', harga: 1000 },
    { periodeSewa: 'HARIAN', harga: 100 },
    { periodeSewa: 'MINGGUAN', harga: 500, aktif: false },
  ])
  assert.deepEqual(periodeTersedia(k), ['HARIAN', 'TAHUNAN'])
})

blok('hargaRingkas sejajar periodeTersedia', () => {
  const k = kmr([{ periodeSewa: 'HARIAN', harga: 80000, deposit: 80000 }])
  const r = hargaRingkas(k)
  assert.deepEqual(r.map(x => x.periodeSewa), periodeTersedia(k))
  assert.equal(r[0].harga, 80000)
  assert.equal(r[0].deposit, 80000)
})

if (process.exitCode) console.error('\nADA YANG GAGAL')
else console.log(`\n${lulus} blok lulus`)
