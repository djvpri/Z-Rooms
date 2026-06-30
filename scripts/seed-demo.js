// Seed data DEMO untuk ZRooms — mengisi properti milik akun demo (owner) dengan
// kamar, harga, penyewa, sewa (kontrak), tagihan bulanan, pembayaran, dan
// pengeluaran realistis untuk ~3 bulan terakhir.
//
// IDEMPOTENT / RESET MANUAL: tiap dijalankan, properti milik user demo beserta
// turunannya (kamar/sewa/tagihan/pembayaran/pengeluaran) DIHAPUS lalu diisi
// ulang; penyewa demo ditandai nik prefix "DEMO-" dan ikut direset. User TIDAK
// dihapus. Reset:  node scripts/seed-demo.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@zomet.my.id'
const now = new Date()
const base = Date.now()
const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
const monthsAgo = (n) => addMonths(now, -n)
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

const NAMA = ['Budi Santoso', 'Sari Dewi', 'Andi Pratama', 'Rina Wijaya', 'Eko Nugroho', 'Maya Putri',
  'Hendra Saputra', 'Lia Anggraini', 'Dimas Permana', 'Nadia Sari', 'Rizky Hidayat', 'Wulan Maharani',
  'Bayu Setiawan', 'Citra Lestari', 'Fajar Ramadhan']
const TIPE_HARGA = { STANDAR: 1200000, DELUXE: 1800000, VIP: 2500000 }

async function main() {
  const owner = (await prisma.user.findFirst({ where: { email: DEMO_EMAIL } })) || (await prisma.user.findFirst())
  if (!owner) throw new Error('Tidak ada user di ZRooms. Buat user dulu.')
  console.log(`Owner demo: ${owner.name || owner.email}`)

  // RESET
  const props = await prisma.properti.findMany({ where: { ownerId: owner.id }, select: { id: true } })
  const propIds = props.map((p) => p.id)
  const kamars = await prisma.kamar.findMany({ where: { propertiId: { in: propIds } }, select: { id: true } })
  const kamarIds = kamars.map((k) => k.id)
  const sewas = await prisma.sewa.findMany({ where: { kamarId: { in: kamarIds } }, select: { id: true } })
  const sewaIds = sewas.map((s) => s.id)
  await prisma.pembayaran.deleteMany({ where: { tagihan: { sewaId: { in: sewaIds } } } })
  await prisma.tagihan.deleteMany({ where: { sewaId: { in: sewaIds } } })
  await prisma.sewa.deleteMany({ where: { kamarId: { in: kamarIds } } })
  await prisma.hargaKamar.deleteMany({ where: { kamarId: { in: kamarIds } } })
  await prisma.kamar.deleteMany({ where: { propertiId: { in: propIds } } })
  await prisma.pengeluaran.deleteMany({ where: { propertiId: { in: propIds } } })
  await prisma.notifikasi.deleteMany({ where: { propertiId: { in: propIds } } })
  await prisma.properti.deleteMany({ where: { ownerId: owner.id } })
  await prisma.penyewa.deleteMany({ where: { nik: { startsWith: 'DEMO-' } } })
  console.log('Data demo lama dibersihkan.')

  // Properti
  const properti = await prisma.properti.create({
    data: {
      nama: 'Kos Zomet Demo', tipe: 'KOS', alamat: 'Jl. Ahmad Yani No. 1', kota: 'Pontianak',
      provinsi: 'Kalimantan Barat', ownerId: owner.id,
      fasilitas: ['WiFi', 'Parkir Motor', 'Dapur Bersama', 'Laundry', 'CCTV'],
    },
  })

  // Kamar + harga bulanan
  const kamar = []
  for (let i = 1; i <= 12; i++) {
    const tipe = i <= 7 ? 'STANDAR' : i <= 10 ? 'DELUXE' : 'VIP'
    const harga = TIPE_HARGA[tipe]
    const k = await prisma.kamar.create({
      data: {
        propertiId: properti.id, nomor: String(100 + i), lantai: i <= 6 ? 1 : 2, tipe,
        luas: tipe === 'STANDAR' ? 12 : tipe === 'DELUXE' ? 16 : 24,
        fasilitas: tipe === 'STANDAR' ? ['Kasur', 'Lemari', 'Kipas'] : ['Kasur', 'Lemari', 'AC', 'Kamar Mandi Dalam'],
        status: 'TERSEDIA',
      },
    })
    await prisma.hargaKamar.create({ data: { kamarId: k.id, periodeSewa: 'BULANAN', harga, deposit: harga } })
    kamar.push({ ...k, harga })
  }

  // Penyewa
  const penyewa = []
  for (let i = 0; i < NAMA.length; i++) {
    penyewa.push(await prisma.penyewa.create({
      data: {
        nama: NAMA[i], nik: `DEMO-${base}-${i}`, noHp: `0813${String(rint(10000000, 99999999))}`,
        email: `penyewa${i + 1}@demo.id`, pekerjaan: pick(['Karyawan', 'Mahasiswa', 'Wiraswasta', 'PNS']),
      },
    }))
  }

  // Sewa aktif untuk 8 kamar pertama + isi tagihan bulanan
  let sewaCount = 0, tagihanCount = 0, bayarCount = 0, omzet = 0
  const occupied = kamar.slice(0, 8)
  for (let i = 0; i < occupied.length; i++) {
    const k = occupied[i]
    const p = penyewa[i]
    const masukBulan = rint(1, 6)
    const tanggalMasuk = monthsAgo(masukBulan); tanggalMasuk.setDate(rint(1, 5))
    const tanggalKeluar = addMonths(tanggalMasuk, 12)
    const sewa = await prisma.sewa.create({
      data: {
        kamarId: k.id, penyewaId: p.id, periodeSewa: 'BULANAN',
        tanggalMasuk, tanggalKeluar, hargaSewa: k.harga, deposit: k.harga,
        statusSewa: 'AKTIF', sumber: pick(['LANGSUNG', 'LANGSUNG', 'MAMIKOS', 'TRAVELOKA']),
      },
    })
    await prisma.kamar.update({ where: { id: k.id }, data: { status: 'TERISI' } })
    sewaCount++

    // Tagihan bulanan: dari maksimal 3 bulan lalu s/d bulan ini
    let cursor = new Date(Math.max(tanggalMasuk.getTime(), monthsAgo(3).getTime()))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    while (cursor <= now) {
      const periodeDari = new Date(cursor)
      const periodeHingga = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const jatuhTempo = new Date(cursor.getFullYear(), cursor.getMonth(), 5)
      const isCurrent = sameMonth(cursor, now)
      let status, paid
      if (!isCurrent) { status = 'LUNAS'; paid = true }
      else { const r = Math.random(); if (r < 0.6) { status = 'LUNAS'; paid = true } else if (r < 0.85) { status = 'BELUM_BAYAR'; paid = false } else { status = 'TERLAMBAT'; paid = false } }
      const tagihan = await prisma.tagihan.create({
        data: { sewaId: sewa.id, nominal: k.harga, periodeDari, periodeHingga, jatuhTempo, status },
      })
      tagihanCount++
      if (paid) {
        await prisma.pembayaran.create({
          data: {
            tagihanId: tagihan.id, nominal: k.harga,
            metodeBayar: pick(['TRANSFER', 'TRANSFER', 'QRIS', 'TUNAI', 'VA_BCA']),
            dibayarPada: new Date(jatuhTempo.getTime() + rint(-2, 3) * 86400000),
          },
        })
        bayarCount++
        omzet += k.harga
      }
      cursor = addMonths(cursor, 1)
    }
  }

  // Beberapa sewa SELESAI (riwayat) untuk 2 kamar berikutnya
  for (let i = 0; i < 2; i++) {
    const k = kamar[8 + i]
    const p = penyewa[8 + occupied.length + i] || penyewa[occupied.length + i]
    const tanggalMasuk = monthsAgo(rint(10, 14)); tanggalMasuk.setDate(2)
    const tanggalKeluar = monthsAgo(rint(4, 8))
    await prisma.sewa.create({
      data: {
        kamarId: k.id, penyewaId: p.id, periodeSewa: 'BULANAN',
        tanggalMasuk, tanggalKeluar, hargaSewa: k.harga, deposit: k.harga,
        statusSewa: 'SELESAI', sumber: 'LANGSUNG',
      },
    })
    sewaCount++
  }

  // Pengeluaran ~3 bulan
  const beban = [['LISTRIK', 'Token listrik bulanan', 850000], ['AIR', 'Tagihan PDAM', 320000],
    ['INTERNET', 'WiFi Indihome', 450000], ['KEBERSIHAN', 'Gaji petugas kebersihan', 600000],
    ['PERAWATAN', 'Perbaikan kran & lampu', 275000]]
  let pengeluaranCount = 0
  for (let m = 0; m < 3; m++) {
    for (const [kat, desk, nom] of beban) {
      if (kat === 'PERAWATAN' && Math.random() < 0.5) continue
      await prisma.pengeluaran.create({
        data: {
          propertiId: properti.id, kategori: kat, deskripsi: desk,
          nominal: nom + rint(-50, 50) * 1000, tanggal: monthsAgo(m),
        },
      })
      pengeluaranCount++
    }
  }

  console.log('✅ Seed demo ZRooms selesai:')
  console.log(`   properti=1 (${kamar.length} kamar), penyewa=${penyewa.length}, sewa=${sewaCount}`)
  console.log(`   tagihan=${tagihanCount}, pembayaran=${bayarCount} (pemasukan Rp${omzet.toLocaleString('id-ID')}), pengeluaran=${pengeluaranCount}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
