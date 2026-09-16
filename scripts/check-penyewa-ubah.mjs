// scripts/check-penyewa-ubah.mjs
//
// Aturan ubah penyewa. Diuji di skema validasi (lib/penyewa.ts), bukan di route,
// supaya tak perlu memuat auth()/Prisma.
//
// Yang dijaga di sini adalah hal yang mudah rusak tanpa terlihat: membedakan
// "kosongkan field" (`null`) dari "jangan ubah" (`undefined`). Kalau keduanya
// disamakan, mengosongkan NIK atau alamat akan diam-diam tidak tersimpan.
import assert from 'node:assert/strict'
import { updatePenyewaSchema, riwayatNamaSchema } from '../lib/penyewa.ts'

let lulus = 0
function blok(nama, fn) {
  try { fn(); console.log(`  ok  ${nama}`); lulus++ }
  catch (e) { console.error(`  GAGAL  ${nama}\n        ${e.message}`); process.exitCode = 1 }
}

function ok(schema, data) {
  const r = schema.safeParse(data)
  assert.ok(r.success, `seharusnya lolos: ${JSON.stringify(r.error?.issues)}`)
  return r.data
}

function tolak(schema, data, kunci) {
  const r = schema.safeParse(data)
  assert.equal(r.success, false, 'seharusnya ditolak')
  if (kunci) assert.ok(r.error.issues.some(i => i.path.includes(kunci)), `isue harus di ${kunci}`)
}

blok('nama kosong ditolak — penyewa tanpa nama tak bisa dibedakan di daftar', () => {
  tolak(updatePenyewaSchema, { nama: '   ' }, 'nama')
})

blok('nama spasi dirapikan', () => {
  assert.equal(ok(updatePenyewaSchema, { nama: '  Budi Santoso  ' }).nama, 'Budi Santoso')
})

blok('field tak dikirim tetap undefined — berarti jangan diubah', () => {
  const d = ok(updatePenyewaSchema, { noHp: '0812' })
  assert.equal(d.noHp, '0812')
  assert.equal(Object.hasOwn(d, 'nama'), false, 'nama tak boleh muncul kalau tak dikirim')
  assert.equal(d.nik, undefined)
})

blok('string kosong jadi null — artinya kosongkan, bukan jangan diubah', () => {
  const d = ok(updatePenyewaSchema, { nik: '', alamatAsal: '   ' })
  assert.equal(d.nik, null)
  assert.equal(d.alamatAsal, null)
  assert.notEqual(d.nik, undefined, 'null dan undefined harus berbeda')
})

blok('null eksplisit tetap null — mengosongkan alamat tersimpan', () => {
  const d = ok(updatePenyewaSchema, { nik: null, alamatAsal: null })
  assert.equal(d.nik, null)
  assert.equal(d.alamatAsal, null)
})

blok('nilai berisi dirapikan spasinya', () => {
  const d = ok(updatePenyewaSchema, { noHp: '  08123  ', pekerjaan: ' Karyawan ' })
  assert.equal(d.noHp, '08123')
  assert.equal(d.pekerjaan, 'Karyawan')
})

blok('bentuk entitas hanya INDIVIDU atau PERUSAHAAN', () => {
  assert.equal(ok(updatePenyewaSchema, { tipeEntitas: 'PERUSAHAAN' }).tipeEntitas, 'PERUSAHAAN')
  tolak(updatePenyewaSchema, { tipeEntitas: 'YAYASAN' }, 'tipeEntitas')
})

blok('field asing diabaikan, tak ikut tersimpan', () => {
  const d = ok(updatePenyewaSchema, { nama: 'Ani', statusSewa: 'AKTIF', niatJahat: true })
  assert.equal(d.nama, 'Ani')
  assert.equal(Object.hasOwn(d, 'statusSewa'), false)
  assert.equal(Object.hasOwn(d, 'niatJahat'), false)
})

blok('riwayat nama kosong dianggap daftar kosong, bukan gagal', () => {
  for (const kosong of [null, undefined, 'bukan array', 42, {}]) {
    assert.deepEqual(riwayatNamaSchema.safeParse(kosong).data ?? [], [])
  }
})

blok('riwayat nama sah terbaca utuh', () => {
  const r = ok(riwayatNamaSchema, [{ nama: 'Budi', digantiPada: '2026-01-05T00:00:00.000Z' }])
  assert.equal(r.length, 1)
  assert.equal(r[0].nama, 'Budi')
})

blok('riwayat rusak sebagian ditolak, tidak disimpan setengah', () => {
  assert.equal(riwayatNamaSchema.safeParse([{ nama: 'Budi' }]).success, false, 'digantiPada wajib ada')
  assert.equal(riwayatNamaSchema.safeParse([{ digantiPada: '2026-01-05' }]).success, false, 'nama wajib ada')
})

console.log(`\n${lulus} blok lulus`)
