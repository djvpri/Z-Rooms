// prisma/seed.ts
import { PrismaClient, TipeProperti, StatusKamar, PeriodeSewa,
  TipeEntitas, StatusSewa, StatusTagihan, MetodeBayar,
  KategoriBeban, TipeNotifikasi, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays, subDays, startOfMonth, endOfMonth } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Z-Rooms database...')

  // ── User pemilik
  const hash = await bcrypt.hash('admin123', 12)
  const user = await prisma.user.upsert({
    where: { email: 'admin@nusasewa.id' },
    update: {},
    create: {
      email: 'admin@nusasewa.id',
      name: 'Andi Admin',
      password: hash,
      role: Role.ADMIN,
      isActive: true,
    },
  })
  console.log('User:', user.email)

  // ── Properti
  const properti = await prisma.properti.upsert({
    where: { id: 'prop-001' },
    update: {},
    create: {
      id: 'prop-001',
      nama: 'Kos Melati Indah',
      tipe: TipeProperti.KOS,
      alamat: 'Jl. Gajah Mada No. 45',
      kota: 'Pontianak',
      provinsi: 'Kalimantan Barat',
      deskripsi: 'Kos nyaman di pusat kota, dekat kampus dan pusat perbelanjaan',
      fasilitas: ['WiFi', 'AC', 'Air Panas', 'Parkir Motor', 'CCTV', 'Laundry'],
      ownerId: user.id,
    },
  })
  console.log('Properti:', properti.nama)

  // ── Tipe kamar (master data, dibuat sebelum kamar)
  const tipeKamar: { nama: string; hariann: number; bulanan: number; tahunan: number; luas: number; fasilitas: string[] }[] = [
    { nama: 'Standar', hariann: 80000, bulanan: 800000, tahunan: 8500000, luas: 12,
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'Kipas Angin'] },
    { nama: 'Deluxe', hariann: 120000, bulanan: 1200000, tahunan: 12000000, luas: 16,
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'AC'] },
    { nama: 'VIP', hariann: 180000, bulanan: 1800000, tahunan: 18000000, luas: 20,
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'AC', 'TV', 'Kulkas'] },
    { nama: 'Suite', hariann: 250000, bulanan: 2500000, tahunan: 25000000, luas: 28,
      fasilitas: ['Kasur', 'Lemari', 'Meja Belajar', 'AC', 'TV', 'Kulkas', 'Kamar Mandi Dalam', 'Sofa'] },
  ]

  const tipeMap: Record<string, string> = {}
  for (const [i, t] of tipeKamar.entries()) {
    const baris = await prisma.tipeKamar.upsert({
      where: { propertiId_nama: { propertiId: properti.id, nama: t.nama } },
      update: {},
      create: {
        nama: t.nama, urutan: i, fasilitas: t.fasilitas, propertiId: properti.id,
        // Harga melekat pada tipe (HargaTipe), bukan per kamar — kamar bertipe
        // sama otomatis memakai tarif ini.
        harga: {
          create: [
            { periodeSewa: PeriodeSewa.HARIAN,  harga: t.hariann, deposit: t.hariann },
            { periodeSewa: PeriodeSewa.BULANAN, harga: t.bulanan, deposit: t.bulanan * 2 },
            { periodeSewa: PeriodeSewa.TAHUNAN, harga: t.tahunan, deposit: t.tahunan },
          ],
        },
      },
    })
    tipeMap[t.nama] = baris.id
  }

  const kamarData = [
    { nomor: 'K.01', tipe: 'Standar', status: StatusKamar.TERISI },
    { nomor: 'K.02', tipe: 'Standar', status: StatusKamar.TERSEDIA },
    { nomor: 'K.03', tipe: 'Deluxe',   status: StatusKamar.TERISI },
    { nomor: 'K.04', tipe: 'Standar', status: StatusKamar.TERSEDIA },
    { nomor: 'K.05', tipe: 'Deluxe',   status: StatusKamar.TERISI },
    { nomor: 'K.06', tipe: 'Standar', status: StatusKamar.TERISI },
    { nomor: 'K.07', tipe: 'VIP',      status: StatusKamar.TERISI },
    { nomor: 'K.08', tipe: 'Standar', status: StatusKamar.TERISI },
    { nomor: 'K.09', tipe: 'Standar', status: StatusKamar.TERSEDIA },
    { nomor: 'K.10', tipe: 'Deluxe',   status: StatusKamar.TERISI },
    { nomor: 'K.11', tipe: 'Standar', status: StatusKamar.TERSEDIA },
    { nomor: 'K.12', tipe: 'Deluxe',   status: StatusKamar.TERISI },
    { nomor: 'K.13', tipe: 'Deluxe',   status: StatusKamar.TERSEDIA },
    { nomor: 'K.14', tipe: 'Suite',    status: StatusKamar.DIPESAN },
    { nomor: 'K.15', tipe: 'Deluxe',   status: StatusKamar.TERISI },
    { nomor: 'K.16', tipe: 'VIP',      status: StatusKamar.TERSEDIA },
    { nomor: 'K.17', tipe: 'Standar', status: StatusKamar.TERISI },
    { nomor: 'K.18', tipe: 'Suite',    status: StatusKamar.TERISI },
    { nomor: 'K.19', tipe: 'Standar', status: StatusKamar.TERISI },
    { nomor: 'K.20', tipe: 'VIP',      status: StatusKamar.TERISI },
  ]

  const kamarMap: Record<string, string> = {}
  for (const k of kamarData) {
    const info = tipeKamar.find(t => t.nama === k.tipe)!
    const kamar = await prisma.kamar.upsert({
      where: { propertiId_nomor: { propertiId: properti.id, nomor: k.nomor } },
      update: { status: k.status },
      create: {
        nomor: k.nomor,
        lantai: parseInt(k.nomor.replace('K.', '')) <= 10 ? 1 : 2,
        tipeId: tipeMap[k.tipe],
        luas: info.luas,
        // Fasilitas kamar dikosongkan: yang berlaku adalah fasilitas tipe
        // (warisan), supaya satu sumber saja untuk properti seed ini.
        fasilitas: [],
        status: k.status,
        propertiId: properti.id,
      },
    })
    kamarMap[k.nomor] = kamar.id
  }
  console.log('20 Kamar dibuat')

  // ── Penyewa
  const penyewaList = [
    { nama: 'Fitri Handayani',  nik: '6171015507010001', noHp: '081234567890', pekerjaan: 'Mahasiswa',      tipe: TipeEntitas.INDIVIDU },
    { nama: 'Budi Wijaya',      nik: '6171015507010002', noHp: '081234567891', pekerjaan: 'Karyawan Swasta', tipe: TipeEntitas.INDIVIDU },
    { nama: 'Hendra Lesmana',   nik: '6171015507010003', noHp: '081234567892', pekerjaan: 'Wirausaha',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Maya Sari',        nik: '6171015507010004', noHp: '081234567893', pekerjaan: 'Mahasiswa',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Sari Putri',       nik: '6171015507010005', noHp: '081234567894', pekerjaan: 'PNS',             tipe: TipeEntitas.INDIVIDU },
    { nama: 'Reza Maulana',     nik: '6171015507010006', noHp: '081234567895', pekerjaan: 'Karyawan Swasta', tipe: TipeEntitas.INDIVIDU },
    { nama: 'Lia Wulandari',    nik: '6171015507010007', noHp: '081234567896', pekerjaan: 'Mahasiswa',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Andi Pratama',     nik: '6171015507010008', noHp: '081234567897', pekerjaan: 'Mahasiswa',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Dewi Rahayu',      nik: '6171015507010009', noHp: '081234567898', pekerjaan: 'Karyawan Swasta', tipe: TipeEntitas.INDIVIDU },
    { nama: 'Yuda Kurniawan',   nik: '6171015507010010', noHp: '081234567899', pekerjaan: 'Mahasiswa',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Pak Eko Susanto',  nik: '6171015507010011', noHp: '081234567800', pekerjaan: 'Wiraswasta',      tipe: TipeEntitas.INDIVIDU },
    { nama: 'Nisa Rahmawati',   nik: '6171015507010012', noHp: '081234567801', pekerjaan: 'Mahasiswa',       tipe: TipeEntitas.INDIVIDU },
    { nama: 'Doni Firmansyah',  nik: '6171015507010013', noHp: '081234567802', pekerjaan: 'Karyawan Swasta', tipe: TipeEntitas.INDIVIDU },
    { nama: 'PT Maju Bersama',  nik: undefined,          noHp: '082112345678', pekerjaan: undefined,          tipe: TipeEntitas.PERUSAHAAN, namaPerusahaan: 'PT Maju Bersama', npwp: '01.234.567.8-901.000' },
  ]

  const penyewaIds: string[] = []
  for (const p of penyewaList) {
    const penyewa = await prisma.penyewa.upsert({
      where: { nik: p.nik ?? `no-nik-${p.nama}` },
      update: {},
      create: {
        nama: p.nama,
        nik: p.nik,
        noHp: p.noHp,
        pekerjaan: p.pekerjaan,
        tipeEntitas: p.tipe,
        namaPerusahaan: p.namaPerusahaan,
        npwp: p.npwp,
      },
    })
    penyewaIds.push(penyewa.id)
  }
  console.log('14 Penyewa dibuat')

  // ── Sewa aktif (kamar terisi)
  const now = new Date()
  const sewaData = [
    { nomor: 'K.01', penyewaIdx: 0,  periode: PeriodeSewa.HARIAN,  masuk: subDays(now,1),  keluar: addDays(now,2),  harga: 80000,   deposit: 80000,   metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.03', penyewaIdx: 1,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-10'), keluar: new Date('2026-07-10'), harga: 1200000, deposit: 2400000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.05', penyewaIdx: 2,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 1200000, deposit: 2400000, metodeBayar: MetodeBayar.TRANSFER },
    { nomor: 'K.06', penyewaIdx: 3,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 800000,  deposit: 1600000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.07', penyewaIdx: 4,  periode: PeriodeSewa.TAHUNAN, masuk: new Date('2026-01-01'), keluar: new Date('2027-01-01'), harga: 18000000,deposit: 18000000,metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.08', penyewaIdx: 5,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 800000,  deposit: 1600000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.10', penyewaIdx: 6,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 1200000, deposit: 2400000, metodeBayar: MetodeBayar.QRIS },
    { nomor: 'K.12', penyewaIdx: 7,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-05-15'), keluar: new Date('2026-06-15'), harga: 1500000, deposit: 3000000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.15', penyewaIdx: 8,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-16'), keluar: new Date('2026-07-16'), harga: 1200000, deposit: 2400000, metodeBayar: MetodeBayar.TRANSFER },
    { nomor: 'K.17', penyewaIdx: 9,  periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 800000,  deposit: 1600000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.18', penyewaIdx: 10, periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 2500000, deposit: 5000000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.19', penyewaIdx: 11, periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 800000,  deposit: 1600000, metodeBayar: MetodeBayar.TUNAI },
    { nomor: 'K.20', penyewaIdx: 12, periode: PeriodeSewa.BULANAN, masuk: new Date('2026-06-01'), keluar: new Date('2026-07-01'), harga: 1800000, deposit: 3600000, metodeBayar: MetodeBayar.TUNAI },
    // K.14 pending
    { nomor: 'K.14', penyewaIdx: 13, periode: PeriodeSewa.BULANAN, masuk: addDays(now,3), keluar: addDays(now,33), harga: 2500000, deposit: 5000000, metodeBayar: MetodeBayar.LAINNYA, status: StatusSewa.PENDING },
  ]

  for (const s of sewaData) {
    const sewa = await prisma.sewa.create({
      data: {
        kamarId: kamarMap[s.nomor],
        penyewaId: penyewaIds[s.penyewaIdx],
        periodeSewa: s.periode,
        tanggalMasuk: s.masuk,
        tanggalKeluar: s.keluar,
        hargaSewa: s.harga,
        deposit: s.deposit,
        statusSewa: (s as any).status ?? StatusSewa.AKTIF,
        metodeBayar: s.metodeBayar,
      },
    })

    // Buat tagihan untuk setiap sewa aktif
    if (((s as any).status ?? StatusSewa.AKTIF) === StatusSewa.AKTIF) {
      const jatuhTempo = s.periode === PeriodeSewa.HARIAN
        ? s.keluar
        : s.periode === PeriodeSewa.TAHUNAN
          ? addDays(s.masuk, 7)
          : addDays(s.masuk, 5)

      const sudahLewat = jatuhTempo < now
      const tagihanStatus: StatusTagihan = s.nomor === 'K.08'
        ? StatusTagihan.LUNAS
        : s.nomor === 'K.01' || s.nomor === 'K.15'
          ? StatusTagihan.LUNAS
          : sudahLewat
            ? StatusTagihan.TERLAMBAT
            : StatusTagihan.BELUM_BAYAR

      const tagihan = await prisma.tagihan.create({
        data: {
          sewaId: sewa.id,
          nominal: s.harga,
          periodeDari: s.masuk,
          periodeHingga: s.keluar,
          jatuhTempo,
          status: tagihanStatus,
        },
      })

      // Pembayaran untuk yang sudah lunas
      if (tagihanStatus === StatusTagihan.LUNAS) {
        await prisma.pembayaran.create({
          data: {
            tagihanId: tagihan.id,
            nominal: s.harga,
            metodeBayar: MetodeBayar.TRANSFER,
            dibayarPada: subDays(now, 1),
          },
        })
      }
    }
  }
  console.log('Sewa & Tagihan dibuat')

  // ── Pengeluaran bulan ini
  const pengeluaranList = [
    { kategori: KategoriBeban.LISTRIK,    deskripsi: 'Tagihan PLN Juni 2026',        nominal: 1200000, tgl: new Date('2026-06-05') },
    { kategori: KategoriBeban.AIR,        deskripsi: 'PDAM Juni 2026',               nominal: 350000,  tgl: new Date('2026-06-05') },
    { kategori: KategoriBeban.INTERNET,   deskripsi: 'Indihome 50Mbps Juni',         nominal: 450000,  tgl: new Date('2026-06-01') },
    { kategori: KategoriBeban.KEBERSIHAN, deskripsi: 'Gaji petugas kebersihan',      nominal: 700000,  tgl: new Date('2026-06-01') },
    { kategori: KategoriBeban.PERAWATAN,  deskripsi: 'Cat ulang K.09',               nominal: 500000,  tgl: new Date('2026-06-10') },
    { kategori: KategoriBeban.PERAWATAN,  deskripsi: 'Servis AC K.07',               nominal: 200000,  tgl: new Date('2026-06-12') },
  ]
  for (const p of pengeluaranList) {
    await prisma.pengeluaran.create({
      data: {
        propertiId: properti.id,
        kategori: p.kategori,
        deskripsi: p.deskripsi,
        nominal: p.nominal,
        tanggal: p.tgl,
      },
    })
  }
  console.log('Pengeluaran dibuat')

  // ── Notifikasi
  const notifList = [
    { tipe: TipeNotifikasi.TAGIHAN_TERLAMBAT, judul: 'Tagihan terlambat', pesan: 'Andi Pratama (K.12) belum membayar. Jatuh tempo 15 Jun.' },
    { tipe: TipeNotifikasi.TAGIHAN_JATUH_TEMPO, judul: 'Tagihan jatuh tempo 3 hari', pesan: 'Sari Putri (K.07) tagihan Rp 18.000.000 jatuh tempo 21 Jun.' },
    { tipe: TipeNotifikasi.CHECKOUT_BESOK, judul: 'Check-out besok', pesan: 'Fitri Handayani (K.01) checkout 18 Jun. Siapkan kamar.' },
    { tipe: TipeNotifikasi.PEMBAYARAN_DITERIMA, judul: 'Pembayaran diterima', pesan: 'Reza Maulana (K.08) membayar Rp 800.000 hari ini.' },
    { tipe: TipeNotifikasi.BOOKING_BARU, judul: 'Booking baru (Booking.com)', pesan: 'Pesanan K.14 menunggu konfirmasi. Balas dalam 2 jam.' },
  ]
  for (const n of notifList) {
    await prisma.notifikasi.create({
      data: { propertiId: properti.id, ...n },
    })
  }
  console.log('Notifikasi dibuat')

  console.log('\nSeed selesai!')
  console.log('   Login: admin@nusasewa.id / admin123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
