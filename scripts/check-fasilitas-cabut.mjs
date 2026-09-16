// Uji jalur DELETE /api/fasilitas yang kini MENCABUT dari tipe & kamar.
// Dijalankan terhadap Postgres sungguhan (bukan mock).
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
let lulus = 0, gagal = 0
function cek(nama, syarat, info = '') {
  if (syarat) { lulus++; console.log('  ok  ' + nama) }
  else { gagal++; console.log('  GAGAL ' + nama + ' ' + info) }
}
const kunci = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const prop = await p.properti.findFirstOrThrow({ where: { nama: 'Kos Melati Indah' } })

// Siapkan: saran + tipe/kamar yang memakainya, termasuk ejaan beda huruf.
await p.fasilitas.deleteMany({ where: { propertiId: prop.id, nama: 'UjiCabut' } })
const saran = await p.fasilitas.create({
  data: { nama: 'UjiCabut', urutan: 90, propertiId: prop.id },
})
const tipeA = await p.tipeKamar.create({
  data: { nama: 'UJI-A', fasilitas: ['UjiCabut', 'AC'], urutan: 91, propertiId: prop.id },
})
// Sengaja beda huruf besar/kecil: `has:` case-sensitive akan melewatkan ini.
const tipeB = await p.tipeKamar.create({
  data: { nama: 'UJI-B', fasilitas: ['ujicabut', 'TV'], urutan: 92, propertiId: prop.id },
})
const tipeC = await p.tipeKamar.create({
  data: { nama: 'UJI-C', fasilitas: ['AC'], urutan: 93, propertiId: prop.id },
})
const kamarA = await p.kamar.create({
  data: { nomor: 'UJI-901', lantai: 9, fasilitas: ['UjiCabut'], propertiId: prop.id, tipeId: tipeA.id },
})

// ── Jalankan logika jalur DELETE yang sama dengan route.
const k = kunci(saran.nama)
const [allTipe, allKamar] = await Promise.all([
  p.tipeKamar.findMany({ where: { propertiId: prop.id }, select: { id: true, fasilitas: true } }),
  p.kamar.findMany({ where: { propertiId: prop.id }, select: { id: true, fasilitas: true } }),
])
const tipeKena = allTipe.filter((t) => t.fasilitas.some((f) => kunci(f) === k))
const kamarKena = allKamar.filter((r) => r.fasilitas.some((f) => kunci(f) === k))
await p.$transaction([
  ...tipeKena.map((t) => p.tipeKamar.update({
    where: { id: t.id },
    data: { fasilitas: t.fasilitas.filter((f) => kunci(f) !== k) },
  })),
  ...kamarKena.map((r) => p.kamar.update({
    where: { id: r.id },
    data: { fasilitas: r.fasilitas.filter((f) => kunci(f) !== k) },
  })),
  p.fasilitas.delete({ where: { id: saran.id } }),
])

// ── Periksa
cek('saran terhapus', await p.fasilitas.count({ where: { id: saran.id } }) === 0)
cek('2 tipe kena (termasuk beda huruf)', tipeKena.length === 2, 'dapat ' + tipeKena.length)
cek('1 kamar kena', kamarKena.length === 1, 'dapat ' + kamarKena.length)

const a = await p.tipeKamar.findUniqueOrThrow({ where: { id: tipeA.id } })
const b = await p.tipeKamar.findUniqueOrThrow({ where: { id: tipeB.id } })
const c = await p.tipeKamar.findUniqueOrThrow({ where: { id: tipeC.id } })
const r = await p.kamar.findUniqueOrThrow({ where: { id: kamarA.id } })

cek('UJI-A: UjiCabut dicabut, AC tetap', JSON.stringify(a.fasilitas) === '["AC"]', JSON.stringify(a.fasilitas))
cek('UJI-B: ejaan "ujicabut" ikut dicabut', JSON.stringify(b.fasilitas) === '["TV"]', JSON.stringify(b.fasilitas))
cek('UJI-C: tak tersentuh', JSON.stringify(c.fasilitas) === '["AC"]', JSON.stringify(c.fasilitas))
cek('kamar: UjiCabut dicabut', JSON.stringify(r.fasilitas) === '[]', JSON.stringify(r.fasilitas))

// Bersihkan
await p.kamar.delete({ where: { id: kamarA.id } })
await p.tipeKamar.deleteMany({ where: { id: { in: [tipeA.id, tipeB.id, tipeC.id] } } })
await p.$disconnect()

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
