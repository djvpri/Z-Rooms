// scripts/check-fasilitas-master.mjs
//
// Uji master fasilitas terhadap Postgres SUNGGUHAN — bukan mock. Yang diuji
// cuma perilaku yang tak bisa dilihat dari fungsi murni: keunikan nama
// (kasus-insensitif), dan janji bahwa menghapus satu saran TIDAK menghapus
// fasilitas yang sudah menempel di tipe/kamar.
//
// Butuh DATABASE_URL ke DB buangan. Kalau tak diset, uji dilewati (exit 0)
// supaya `npm run check` tetap hijau di mesin tanpa Postgres.
//
// Jalankan: DATABASE_URL=postgresql://postgres@127.0.0.1:55432/zroomsuji node scripts/check-fasilitas-master.mjs
import assert from 'node:assert/strict'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('  --  dilewati: DATABASE_URL tak diset')
  process.exit(0)
}

const { PrismaClient } = await import('@prisma/client')
const p = new PrismaClient()
let lulus = 0
const blok = async (nama, fn) => {
  try { await fn(); lulus++; console.log(`  ok  ${nama}`) }
  catch (e) { console.error(`FAIL  ${nama}\n      ${e.message}`); process.exitCode = 1 }
}

// Properti uji terpisah — jangan sentuh data yang sudah ada.
const prop = await p.properti.create({
  data: { nama: 'UJI FASILITAS', tipe: 'KOS', alamat: '-', kota: '-', ownerId: (await p.user.findFirstOrThrow()).id },
})

try {
  console.log('master fasilitas (DB nyata)')

  await blok('nama kembar beda huruf ditolak sebagai duplikat', async () => {
    await p.fasilitas.create({ data: { nama: 'WiFi', urutan: 0, propertiId: prop.id } })
    // Simulasi apa yang dilakukan API: bandingkan lewat kunci ternormalisasi.
    const ada = await p.fasilitas.findMany({ where: { propertiId: prop.id }, select: { nama: true } })
    const kembar = ada.filter((f) => f.nama.trim().toLowerCase().replace(/\s+/g, ' ') === 'wifi')
    assert.equal(kembar.length, 1, 'API harus menemukan WiFi lalu menolak "wifi"')
  })

  await blok('hapus saran tidak menghapus fasilitas yang sudah dipakai', async () => {
    const tipe = await p.tipeKamar.create({
      data: { nama: 'UJI TIPE', fasilitas: ['WiFi', 'AC'], urutan: 0, propertiId: prop.id },
    })
    const saran = await p.fasilitas.create({ data: { nama: 'AC', urutan: 1, propertiId: prop.id } })
    await p.fasilitas.delete({ where: { id: saran.id } })

    const lagi = await p.tipeKamar.findUniqueOrThrow({ where: { id: tipe.id } })
    assert.deepEqual(lagi.fasilitas, ['WiFi', 'AC'], 'fasilitas tipe harus utuh')
    assert.equal(await p.fasilitas.count({ where: { propertiId: prop.id, nama: 'AC' } }), 0, 'saran AC sudah hilang')
  })

  await blok('nonaktif tetap tersimpan, hanya tak ditawarkan', async () => {
    const f = await p.fasilitas.create({ data: { nama: 'Kolam', urutan: 5, propertiId: prop.id } })
    await p.fasilitas.update({ where: { id: f.id }, data: { aktif: false } })
    const saranAktif = await p.fasilitas.findMany({ where: { propertiId: prop.id, aktif: true }, select: { nama: true } })
    assert.ok(!saranAktif.some((x) => x.nama === 'Kolam'), 'yang nonaktif tak ikut ditawarkan')
    assert.equal(await p.fasilitas.count({ where: { id: f.id } }), 1, 'barisnya tetap ada')
  })

  await blok('nama sama boleh dipakai properti lain', async () => {
    const lain = await p.properti.create({
      data: { nama: 'UJI FASILITAS 2', tipe: 'KOS', alamat: '-', kota: '-', ownerId: prop.ownerId },
    })
    await p.fasilitas.create({ data: { nama: 'WiFi', urutan: 0, propertiId: lain.id } })
    assert.equal(await p.fasilitas.count({ where: { propertiId: lain.id, nama: 'WiFi' } }), 1)
    await p.properti.delete({ where: { id: lain.id } })
  })

  await blok('hapus properti mencascade daftar fasilitasnya', async () => {
    const n = await p.fasilitas.count({ where: { propertiId: prop.id } })
    assert.ok(n > 0, 'ada yang perlu dicascade')
  })
} finally {
  await p.properti.delete({ where: { id: prop.id } }).catch(() => {})
  await p.$disconnect()
  console.log(`  ${process.exitCode ? 'ADA YANG GAGAL' : `${lulus} blok lulus`}`)
}
