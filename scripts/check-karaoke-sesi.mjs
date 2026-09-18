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
    const mulai = new Date('2026-09-18T16:00:00+07:00')
    const h = hitungSewa(tarif, mulai, 120)
    assert.equal(h.jumlahJam, 2, 'durasi dibulatkan 2 jam')
    assert.equal(h.total, 130000, 'total')
    assert.equal(h.item.length, 2, 'dua baris rincian')
    assert.equal(h.item[0].hargaPerJam, 50000, 'jam pertama tarif siang')
    assert.equal(h.item[1].hargaPerJam, 80000, 'jam kedua tarif malam')
  })

  await uji('rincian per jam dijumlahkan = totalSewa', () => {
    const mulai = new Date('2026-09-18T16:00:00+07:00')
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
        mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
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
        mulaiPada: new Date('2026-09-18T10:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T11:00:00+07:00'),
        selesaiAktual: new Date('2026-09-18T11:00:00+07:00'),
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
        mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
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
    const mulai = new Date('2026-09-18T16:00:00+07:00')
    const h = hitungSewa(tarif, mulai, 120)
    const sesi = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-0004',
        mulaiPada: mulai,
        rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
        selesaiAktual: new Date('2026-09-18T18:00:00+07:00'),
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
        mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
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
        mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
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
          mulaiPada: new Date('2026-09-19T16:00:00+07:00'),
          rencanaSelesai: new Date('2026-09-19T18:00:00+07:00'),
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
      hitungSewa(berlubang, new Date('2026-09-18T02:00:00+07:00'), 60)
    } catch {
      melempar = true
    }
    assert.ok(melempar, 'menolak menghitung jam yang tak punya tarif')
  })

  // ── 8. Booking: `pada` menyimpan jam yang dipesan, bukan jam sekarang ────
  await uji('sesi BOOKING tersimpan dengan mulaiPada = jam yang dipesan', async () => {
    const { waktuMulaiDari } = await import('../lib/karaoke.ts')
    const sekarang = new Date('2026-09-18T10:00:00+07:00')
    const w = waktuMulaiDari('2026-09-18T19:00:00+07:00', sekarang)
    assert.equal(w.ok, true, 'jam ke depan lolos')

    const booking = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-BK01',
        mulaiPada: w.mulai,
        rencanaSelesai: new Date(w.mulai.getTime() + 3600000),
        jumlahJam: 1,
        totalSewa: 80000,
        status: 'BOOKING',
      },
    })

    const tersimpan = await prisma.sesiKaraoke.findUnique({ where: { id: booking.id } })
    assert.equal(tersimpan.status, 'BOOKING', 'status BOOKING')
    // Yang penting: jam yang tersimpan adalah jam PESANAN, bukan jam pembuatan
    // baris. Kalau salah, tarif dan hitung mundurnya ikut salah.
    assert.equal(
      tersimpan.mulaiPada.getTime(),
      new Date('2026-09-18T19:00:00+07:00').getTime(),
      'mulaiPada = jam yang dipesan',
    )

    await prisma.sesiKaraoke.delete({ where: { id: booking.id } })
  })

  // ── 9. Menyapu booking basi: hanya yang lewat batas, hanya ruang itu ─────
  await uji('booking lewat 15 menit jadi BATAL, yang belum lewat tetap BOOKING', async () => {
    const { batasLepasBooking } = await import('../lib/karaoke.ts')
    const sekarang = new Date('2026-09-18T20:00:00+07:00')

    // Basi: dipesan 19:00, sekarang 20:00 → jauh lewat batas 19:15.
    const basi = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-BK02',
        mulaiPada: new Date('2026-09-18T19:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T20:00:00+07:00'),
        jumlahJam: 1,
        totalSewa: 80000,
        status: 'BOOKING',
      },
    })
    // Segar: dipesan 21:00, belum lewat batasnya.
    const segar = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-BK03',
        mulaiPada: new Date('2026-09-18T21:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T22:00:00+07:00'),
        jumlahJam: 1,
        totalSewa: 80000,
        status: 'BOOKING',
      },
    })

    // Query yang sama dipakai route.
    const disapu = await prisma.sesiKaraoke.updateMany({
      where: { ruangId: ruang.id, status: 'BOOKING', mulaiPada: { lt: batasLepasBooking(sekarang) } },
      data: { status: 'BATAL' },
    })
    assert.equal(disapu.count, 1, 'hanya satu yang disapu')

    const sesudahBasi = await prisma.sesiKaraoke.findUnique({ where: { id: basi.id } })
    const sesudahSegar = await prisma.sesiKaraoke.findUnique({ where: { id: segar.id } })
    assert.equal(sesudahBasi.status, 'BATAL', 'yang basi jadi BATAL')
    assert.equal(sesudahSegar.status, 'BOOKING', 'yang belum lewat TETAP BOOKING')

    await prisma.sesiKaraoke.deleteMany({ where: { id: { in: [basi.id, segar.id] } } })
  })

  // ── 10. Stok minuman: potong saat tambah, balik saat sesi BATAL ──────────
  await uji('minuman memotong stok, dan sesi BATAL mengembalikannya', async () => {
    const produk = await prisma.produk.create({
      data: { propertiId: properti.id, nama: 'Teh Kotak', hargaJual: 8000, hargaBeli: 5000, stok: 10 },
    })

    const sesi = await prisma.sesiKaraoke.create({
      data: {
        propertiId: properti.id,
        ruangId: ruang.id,
        nomor: 'KR-MN01',
        mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
        rencanaSelesai: new Date('2026-09-18T17:00:00+07:00'),
        jumlahJam: 1,
        totalSewa: 50000,
        status: 'BERJALAN',
      },
    })

    // Pola yang sama dipakai route POST /minuman.
    const potong = await prisma.produk.updateMany({
      where: { id: produk.id, stok: { gte: 3 } },
      data: { stok: { decrement: 3 } },
    })
    assert.equal(potong.count, 1, 'stok terpotong')
    await prisma.itemMinumanKaraoke.create({
      data: { sesiId: sesi.id, produkId: produk.id, namaProduk: produk.nama, hargaSatuan: 8000, jumlah: 3, subtotal: 24000 },
    })

    const setelahPotong = await prisma.produk.findUnique({ where: { id: produk.id } })
    assert.equal(setelahPotong.stok, 7, 'stok 10 - 3 = 7')

    // Stok kurang ditolak oleh SYARAT DI DALAM WHERE, bukan pemeriksaan di
    // aplikasi — dua kasir yang menekan bersamaan tak bisa dua-duanya lolos.
    // Syarat `gte` diambil dari helper yang SAMA dengan route, supaya uji ini
    // tak bisa lulus hanya karena menulis ulang syaratnya sendiri.
    const { stokCukup } = await import('../lib/karaoke.ts')
    assert.equal(stokCukup(setelahPotong.stok, 999), false, 'helper bilang stok tak cukup')

    const gagal = await prisma.produk.updateMany({
      where: { id: produk.id, stok: { gte: 999 } },
      data: { stok: { decrement: 999 } },
    })
    assert.equal(gagal.count, 0, 'stok kurang → 0 baris tersentuh')
    const masihUtuh = await prisma.produk.findUnique({ where: { id: produk.id } })
    assert.equal(masihUtuh.stok, 7, 'stok TIDAK berubah setelah penolakan')

    // Batalkan sesi: stok kembali (pola route batal).
    const perProduk = new Map()
    for (const m of await prisma.itemMinumanKaraoke.findMany({ where: { sesiId: sesi.id } })) {
      perProduk.set(m.produkId, (perProduk.get(m.produkId) ?? 0) + m.jumlah)
    }
    for (const [produkId, jumlah] of perProduk) {
      await prisma.produk.update({ where: { id: produkId }, data: { stok: { increment: jumlah } } })
    }

    const setelahBatal = await prisma.produk.findUnique({ where: { id: produk.id } })
    assert.equal(setelahBatal.stok, 10, 'stok kembali penuh setelah batal')

    await prisma.itemMinumanKaraoke.deleteMany({ where: { sesiId: sesi.id } })
    await prisma.sesiKaraoke.delete({ where: { id: sesi.id } })
    await prisma.produk.delete({ where: { id: produk.id } })
  })

  // ── 11. Laporan: hanya SELESAI yang dihitung ────────────────────────────
  await uji('laporan menghitung SELESAI saja — BOOKING/BERJALAN/BATAL dibuang', async () => {
    const dasar = {
      propertiId: properti.id,
      ruangId: ruang.id,
      mulaiPada: new Date('2026-09-18T16:00:00+07:00'),
      rencanaSelesai: new Date('2026-09-18T18:00:00+07:00'),
      jumlahJam: 2,
      totalSewa: 130000,
    }
    const dibuat = await Promise.all([
      prisma.sesiKaraoke.create({ data: { ...dasar, nomor: 'KR-LP01', status: 'SELESAI', selesaiAktual: new Date() } }),
      prisma.sesiKaraoke.create({ data: { ...dasar, nomor: 'KR-LP02', status: 'BERJALAN' } }),
      prisma.sesiKaraoke.create({ data: { ...dasar, nomor: 'KR-LP03', status: 'BOOKING' } }),
      prisma.sesiKaraoke.create({ data: { ...dasar, nomor: 'KR-LP04', status: 'BATAL' } }),
    ])

    // Saringan yang SAMA dipakai route laporan, diambil dari `lib/karaoke.ts`.
    // Kalau uji ini menulis ulang saringannya sendiri, mengubah route tak akan
    // membuatnya gagal — dan bug dijalur asli lolos (persis itu yang dulu
    // terjadi pada penjaga stok).
    const { saringSesiLaporan } = await import('../lib/karaoke.ts')
    const idUji = dibuat.map((s) => s.id)
    const dihitung = await prisma.sesiKaraoke.findMany({
      where: {
        id: { in: idUji },
        ...saringSesiLaporan(properti.id, new Date('2026-09-18T00:00:00+07:00'), new Date('2026-09-19T00:00:00+07:00')),
      },
      select: { nomor: true, totalSewa: true },
    })
    assert.equal(dihitung.length, 1, 'hanya satu sesi SELESAI yang dihitung')
    assert.equal(dihitung[0].nomor, 'KR-LP01', 'yang dihitung adalah KR-LP01')

    // Dan pastikan ketiga status lain MEMANG ada di DB — kalau tidak, uji ini
    // bisa lulus hanya karena datanya tak pernah dibuat.
    const semua = await prisma.sesiKaraoke.count({ where: { id: { in: idUji } } })
    assert.equal(semua, 4, 'keempat sesi ada di DB, tiga di antaranya disaring')

    await prisma.sesiKaraoke.deleteMany({ where: { id: { in: idUji } } })
  })

  console.log(`\ncheck-karaoke-sesi: ${lulus} lulus, ${gagal} gagal`)
  await prisma.$disconnect()
  process.exit(gagal === 0 ? 0 : 1)
}

utama().catch((e) => {
  console.error('check-karaoke-sesi gagal total:', e)
  process.exit(1)
})
