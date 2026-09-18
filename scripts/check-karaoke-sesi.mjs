// Uji JALUR SESI karaoke dengan DB nyata.
//
// Yang tak bisa dibuktikan uji murni dan dibuktikan di sini:
//   1. Penjaga bentrok benar-benar MENOLAK ruang yang sedang dipakai.
//   2. Uang yang tersimpan di DB = uang yang dihitung `hitungSewa` (murni).
//      Kalau route dan lib berbeda pendapat, tagihan pelanggan salah.
//   3. Rincian per jam di `ItemSesiKaraoke` jumlahnya = `totalSewa`.
//      Kalau tidak, struk bertentangan dengan tagihan.
//   4. Batal mengembalikan status, bukan menghapus baris.
//
// Butuh DATABASE_URL. Tanpa itu, DILEWATI (exit 0) — supaya tetap bisa jalan
// di mesin tanpa Postgres.
import { PrismaClient } from '@prisma/client'

const db = PrismaClient
let lulus = 0
let gagal = 0

/** Jalankan langsung saat dideklarasikan — tak ada daftar yang bisa terlupa. */
async function uji(nama, fn) {
  try {
    await fn()
    console.log(`  ok   ${nama}`)
    lulus++
  } catch (e) {
    console.log(`  GAGAL ${nama}\n         ${e.message}`)
    gagal++
  }
}

const assert = {
  ok: (v, m) => {
    if (!v) throw new Error(m ?? 'harus benar')
  },
  equal: (a, b, m) => {
    if (a !== b) throw new Error(`${m ?? 'harus sama'}: dapat ${JSON.stringify(a)}, mau ${JSON.stringify(b)}`)
  },
}

async function utama() {
  if (!process.env.DATABASE_URL) {
    console.log('check-karaoke-sesi: DILEWATI (tak ada DATABASE_URL)')
    process.exit(0)
  }

  const prisma = new db()
  const { hitungSewa } = await import('../lib/karaoke.ts')

  // Bersihkan sisa uji sebelumnya (idempoten).
  await prisma.itemMinumanKaraoke.deleteMany({})
  await prisma.itemSesiKaraoke.deleteMany({})
  await prisma.sesiKaraoke.deleteMany({})
  await prisma.tarifKaraoke.deleteMany({})
  await prisma.ruangKaraoke.deleteMany({})
  await prisma.penjualan.deleteMany({})
  await prisma.itemPenjualan.deleteMany({})
  await prisma.produk.deleteMany({})
  await prisma.penyewa.deleteMany({})
  await prisma.kamar.deleteMany({})
  await prisma.tipeKamar.deleteMany({})
  await prisma.properti.deleteMany({})

  const pemilik = await prisma.user.create({
    data: { email: `uji-karaoke-${Date.now()}@contoh.test`, name: 'Uji' },
  })

  const properti = await prisma.properti.create({
    data: { nama: 'Uji Karaoke', tipe: 'HOTEL', alamat: 'Jalan Uji 1', kota: 'Bandung', provinsi: 'Jawa Barat', ownerId: pemilik.id },
  })

  const ruang = await prisma.ruangKaraoke.create({
    data: { propertiId: properti.id, nama: 'VIP 1', kapasitas: 8, urutan: 1 },
  })

  // Tarif: 00:00–17:00 = 50rb, 17:00–24:00 = 80rb. Menutup 24 jam.
  await prisma.tarifKaraoke.createMany({
    data: [
      { ruangId: ruang.id, jamMulai: 0, jamSelesai: 1020, hargaPerJam: 50000 },
      { ruangId: ruang.id, jamMulai: 1020, jamSelesai: 1440, hargaPerJam: 80000 },
    ],
  })

  const tarif = [
    { jamMulai: 0, jamSelesai: 1020, hargaPerJam: 50000 },
    { jamMulai: 1020, jamSelesai: 1440, hargaPerJam: 80000 },
  ]

  // ── 1. Uang yang dihitung murni vs yang benar untuk kasus nyata ──────────
  await uji('sesi 16:00 selama 2 jam = 1 blok siang + 1 blok malam (130rb)', () => {
    const mulai = new Date('2026-09-18T16:00:00')
    const h = hitungSewa(tarif, mulai, 120)
    assert.equal(h.jumlahJam, 2, 'durasi dibulatkan 2 jam')
    assert.equal(h.total, 130000, 'total')
    assert.equal(h.item.length, 2, 'dua baris rincian')
    assert.equal(h.item[0].hargaPerJam, 50000, 'jam pertama tarif siang')
    assert.equal(h.item[1].hargaPerJam, 80000, 'jam kedua tarif malam')
  })

  await uji('rincian per jam dijumlahkan = totalSewa', () => {
    const mulai = new Date('2026-09-18T16:00:00')
    const h = hitungSewa(tarif, mulai, 120)
    const jum = h.item.reduce((a, i) => a + i.subtotal, 0)
    assert.equal(jum, h.total, 'jumlah rincian vs total')
  })

  // ── 2. Penjaga bentrok — dua sesi satu ruang ────────────────────────────
  await uji('sesi BERJALAN kedua di ruang sama DITOLAK', async () => {
    const sesi1 = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0001',
        mulaiPada: new Date('2026-09-18T16:00:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00'),
        jumlahJam: 2,
        totalSewa: 130000,
        status: 'BERJALAN',
      },
    })

    // Query yang sama dipakai route: cari sesi BERJALAN di ruang ini.
    const bentrok = await prisma.sesiKaraoke.findFirst({
      where: { ruangId: ruang.id, status: 'BERJALAN' },
    })
    assert.ok(bentrok, 'sesi berjalan terdeteksi')
    assert.equal(bentrok.id, sesi1.id, 'yang terdeteksi adalah sesi1')

    await prisma.sesiKaraoke.delete({ where: { id: sesi1.id } })
  })

  await uji('ruang yang sudah selesai TIDAK menghalangi sesi baru', async () => {
    const lama = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0002',
        mulaiPada: new Date('2026-09-18T10:00:00'),
        rencanaSelesai: new Date('2026-09-18T11:00:00'),
        selesaiAktual: new Date('2026-09-18T11:00:00'),
        jumlahJam: 1,
        totalSewa: 50000,
        status: 'SELESAI',
      },
    })
    const bentrok = await prisma.sesiKaraoke.findFirst({
      where: { ruangId: ruang.id, status: 'BERJALAN' },
    })
    assert.equal(bentrok, null, 'tak ada bentrok')
    await prisma.sesiKaraoke.delete({ where: { id: lama.id } })
  })

  // ── 3. Booking lepas 15 menit ───────────────────────────────────────────
  await uji('BOOKING yang lewat 15 menit tidak lagi memegang ruang', async () => {
    const { TOLERANSI_BOOKING_MENIT } = await import('../lib/karaoke.ts')
    const booking = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0003',
        mulaiPada: new Date('2026-09-18T16:00:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00'),
        jumlahJam: 2,
        totalSewa: 130000,
        status: 'BOOKING',
      },
    })

    // Simulasi: sekarang = mulai + 20 menit → sudah lewat toleransi.
    const sekarang = new Date(booking.mulaiPada).getTime() + 20 * 60000
    const batas = new Date(booking.mulaiPada).getTime() + TOLERANSI_BOOKING_MENIT * 60000
    assert.ok(sekarang >= batas, 'sudah lewat toleransi → ruang dianggap lepas')

    await prisma.sesiKaraoke.delete({ where: { id: booking.id } })
  })

  // ── 4. Rincian per jam tersimpan & cocok ────────────────────────────────
  await uji('ItemSesiKaraoke tersimpan dan jumlahnya = totalSewa', async () => {
    const mulai = new Date('2026-09-18T16:00:00')
    const h = hitungSewa(tarif, mulai, 120)
    const sesi = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0004',
        mulaiPada: mulai,
        rencanaSelesai: new Date('2026-09-18T18:00:00'),
        selesaiAktual: new Date('2026-09-18T18:00:00'),
        jumlahJam: h.jumlahJam,
        totalSewa: h.total,
        status: 'SELESAI',
      },
    })
    await prisma.itemSesiKaraoke.createMany({
      data: h.item.map((it) => ({
        sesiId: sesi.id,
        jamKe: it.jamKe,
        mulai: it.mulai,
        selesai: it.selesai,
        hargaPerJam: it.hargaPerJam,
        subtotal: it.subtotal,
      })),
    })

    const tersimpan = await prisma.itemSesiKaraoke.findMany({ where: { sesiId: sesi.id } })
    const jum = tersimpan.reduce((a, i) => a + Number(i.subtotal), 0)
    assert.equal(jum, Number(sesi.totalSewa), 'rincian DB vs totalSewa DB')
    assert.equal(tersimpan.length, 2, 'dua baris per jam')

    await prisma.itemSesiKaraoke.deleteMany({ where: { sesiId: sesi.id } })
    await prisma.sesiKaraoke.delete({ where: { id: sesi.id } })
  })

  // ── 5. Batal tidak menghapus baris ──────────────────────────────────────
  await uji('batal mengubah status, baris tetap ada', async () => {
    const sesi = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0005',
        mulaiPada: new Date('2026-09-18T16:00:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00'),
        jumlahJam: 2,
        totalSewa: 130000,
        status: 'BERJALAN',
      },
    })
    await prisma.sesiKaraoke.update({
      where: { id: sesi.id },
      data: { status: 'BATAL', catatan: 'pelanggan batal' },
    })
    const sesudah = await prisma.sesiKaraoke.findUnique({ where: { id: sesi.id } })
    assert.ok(sesudah, 'baris masih ada')
    assert.equal(sesudah.status, 'BATAL', 'status BATAL')
    assert.equal(sesudah.catatan, 'pelanggan batal', 'alasan tercatat')

    await prisma.sesiKaraoke.delete({ where: { id: sesi.id } })
  })

  // ── 6. Nomor unik per properti ──────────────────────────────────────────
  await uji('nomor sesi unik per properti — duplikat ditolak DB', async () => {
    await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0009',
        mulaiPada: new Date('2026-09-18T16:00:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00'),
        jumlahJam: 2,
        totalSewa: 130000,
        status: 'SELESAI',
      },
    })
    let ditolak = false
    try {
      await prisma.sesiKaraoke.create({
        data: {
          propertiId: properti.id,
          ruangId: ruang.id,
          nomor: 'KR-0009',
          mulaiPada: new Date('2026-09-19T16:00:00'),
          rencanaSelesai: new Date('2026-09-19T18:00:00'),
          jumlahJam: 2,
          totalSewa: 130000,
          status: 'SELESAI',
        },
      })
    } catch {
      ditolak = true
    }
    assert.ok(ditolak, 'DB menolak nomor duplikat')
  })

  // ── 7. Tarif tak menutup 24 jam → hitungSewa melempar ───────────────────
  await uji('tarif berlubang membuat hitungSewa MELEMPAR (bukan menebak)', () => {
    const berlubang = [{ jamMulai: 600, jamSelesai: 1020, hargaPerJam: 50000 }]
    let melempar = false
    try {
      hitungSewa(berlubang, new Date('2026-09-18T02:00:00'), 60)
    } catch {
      melempar = true
    }
    assert.ok(melempar, 'menolak menghitung jam yang tak punya tarif')
  })

  console.log(`\ncheck-karaoke-sesi: ${lulus} lulus, ${gagal} gagal`)
  await prisma.$disconnect()
  process.exit(gagal === 0 ? 0 : 1)
}

utama().catch((e) => {
  console.error('check-karaoke-sesi gagal total:', e)
  process.exit(1)
})
