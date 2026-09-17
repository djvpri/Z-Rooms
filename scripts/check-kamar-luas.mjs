// Uji createKamarSchema: form mengirim `null` saat kolom luas dikosongkan.
// Regresi: "Expected number, received null" bikin tambah kamar gagal total.
import assert from 'node:assert/strict'
import { createKamarSchema, updateKamarSchema } from '../lib/kamar.ts'

// ── Regresi utama: luas null harus LOLOS di POST ────────────────────────────
const tambahKosong = createKamarSchema.safeParse({ nomor: '101', tipeId: 't1', luas: null })
assert.equal(tambahKosong.success, true, `luas null ditolak: ${JSON.stringify(tambahKosong.error?.issues)}`)
assert.equal(tambahKosong.data.luas, null, 'luas null harus tetap null, bukan dibuang')
assert.equal(tambahKosong.data.lantai, 1, 'lantai kosong jadi 1')

// Luas berisi angka tetap lolos.
const tambahIsi = createKamarSchema.safeParse({ nomor: '102', tipeId: 't1', luas: 12 })
assert.equal(tambahIsi.success, true)
assert.equal(tambahIsi.data.luas, 12)

// Field luas tak dikirim sama sekali juga sah (opsional).
const tambahTanpa = createKamarSchema.safeParse({ nomor: '103', tipeId: 't1' })
assert.equal(tambahTanpa.success, true)

// ── Jalur PATCH harus memperlakukan hal yang sama ───────────────────────────
const ubahKosong = updateKamarSchema.safeParse({ luas: null })
assert.equal(ubahKosong.success, true, 'PATCH luas null harus lolos')
assert.equal(ubahKosong.data.luas, null)

// Kedua skema sepakat soal null — kalau menyimpang, salah satu jalur rusak.
for (const nilai of [null, 5]) {
  const a = createKamarSchema.safeParse({ nomor: '104', tipeId: 't1', luas: nilai })
  const b = updateKamarSchema.safeParse({ luas: nilai })
  assert.equal(a.success, b.success, `create & update beda pendapat soal luas=${nilai}`)
}

// ── Yang tetap harus DITOLAK ────────────────────────────────────────────────
// Luas 0 / negatif ditolak, null bukan jalan pintas untuk nilai tak sah.
for (const buruk of [0, -3]) {
  const r = createKamarSchema.safeParse({ nomor: '105', tipeId: 't1', luas: buruk })
  assert.equal(r.success, false, `luas ${buruk} harus ditolak`)
}

// Tipe wajib: kamar tanpa tipe tak punya tarif.
assert.equal(createKamarSchema.safeParse({ nomor: '106', tipeId: '' }).success, false)
assert.equal(createKamarSchema.safeParse({ nomor: '106' }).success, false)

// Nomor wajib & dipangkas spasi.
const spasi = createKamarSchema.safeParse({ nomor: '  107  ', tipeId: 't1' })
assert.equal(spasi.success, true)
assert.equal(spasi.data.nomor, '107')

// `status` dibuang, bukan ditolak — pemanggil lama tak putus.
const statusDibuang = createKamarSchema.safeParse({ nomor: '108', tipeId: 't1', status: 'TERSEDIA' })
assert.equal(statusDibuang.success, true, 'field asing tak boleh bikin gagal')
assert.equal('status' in statusDibuang.data, false, 'status harus dibuang')

console.log('OK — check-kamar-luas: 11 blok assertion lulus')
