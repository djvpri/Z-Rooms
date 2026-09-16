import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SARAN_FASILITAS } from "@/lib/tipeKamar";

interface SeedResult {
  userId: string;
  propertiId: string;
  kamarIds: string[];
  penyewaIds: string[];
  sewaIds: string[];
  tagihanIds: string[];
}

/**
 * Isi data contoh untuk sebuah properti demo.
 *
 * @param ownerId  Pemilik properti. WAJIB eksplisit — sebelumnya fungsi ini
 *   hardcode `demo@zomet.my.id`, sehingga pemanggil mana pun (termasuk tombol
 *   "Reset Demo" milik user lain) menaruh hasil seed di akun yang bukan
 *   pemiliknya. Data jadi nyasar lintas tenant.
 */
export async function seedDemoData(ownerId: string): Promise<SeedResult> {
  const demoExpiresAt = addDays(new Date(), 30)

  const user = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!user) throw new Error(`seedDemoData: user ${ownerId} tidak ditemukan`)

  // 1. Create demo properti (property)
  const properti = await prisma.properti.create({
    data: {
      nama: "Demo Kos Sejahtera",
      tipe: "KOS",
      alamat: "Jln. Merdeka No. 123",
      kota: "Pontianak",
      provinsi: "Kalimantan Barat",
      deskripsi: "Kos berkualitas dengan fasilitas lengkap untuk demo",
      fasilitas: ["WiFi", "Parkir Gratis", "Kamar Mandi Dalam", "AC"],
      aktif: true,
      isDemo: true,
      demoExpiresAt,
      ownerId: user.id,
    },
  });

  // 2. Tipe kamar master data. Dibuat lebih dulu karena kamar menunjuk ke sini
  //    (Kamar.tipeId NOT NULL saat diisi; di sini semua kamar demo bertipe).
  const tipeDemo = await Promise.all(
    [
      { nama: "Standar", urutan: 0, fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur Queen"] },
      { nama: "Deluxe", urutan: 1, fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur King", "Kursi"] },
      { nama: "VIP", urutan: 2, fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur King", "Sofa", "Mini Bar"] },
    ].map((t) => prisma.tipeKamar.create({ data: { ...t, propertiId: properti.id } }))
  )
  const tipeId = (nama: string) => tipeDemo.find((t) => t.nama === nama)!.id

  // 2b. Master daftar fasilitas (saran di form tipe). Digabung dari fasilitas
  //     tipe demo + saran umum properti, nama kembar dibuang.
  const saranDemo = [
    ...new Set([...tipeDemo.flatMap((t) => t.fasilitas), ...properti.fasilitas, ...SARAN_FASILITAS]),
  ]
  await prisma.fasilitas.createMany({
    data: saranDemo.map((nama, i) => ({ nama, urutan: i, propertiId: properti.id })),
    skipDuplicates: true,
  })

  // 3. Create 5 kamars (rooms)
  const kamarData = [
    { nomor: "A-101", lantai: 1, tipe: "Standar", luas: 12.5 },
    { nomor: "A-102", lantai: 1, tipe: "Standar", luas: 12.5 },
    { nomor: "B-201", lantai: 2, tipe: "Deluxe", luas: 16.0 },
    { nomor: "B-202", lantai: 2, tipe: "Deluxe", luas: 16.0 },
    { nomor: "C-301", lantai: 3, tipe: "VIP", luas: 20.0 },
  ];

  const kamars = await Promise.all(
    kamarData.map((data) =>
      prisma.kamar.create({
        data: {
          // Fasilitas kamar sengaja dikosongkan di demo: yang berlaku adalah
          // fasilitas tipe (warisan), supaya perilaku itu ikut terlihat.
          nomor: data.nomor,
          lantai: data.lantai,
          luas: data.luas,
          tipeId: tipeId(data.tipe),
          propertiId: properti.id,
          status: "TERSEDIA",
        },
      })
    )
  );

  // 4. Harga melekat pada tipe kamar, bukan per kamar — satu baris per tipe.
  const hargaPerTipe: Record<string, number> = { Standar: 1000000, Deluxe: 1200000, VIP: 1500000 }
  await Promise.all(
    Object.entries(hargaPerTipe).map(([nama, harga]) =>
      prisma.hargaTipe.create({
        data: {
          tipeKamarId: tipeId(nama),
          periodeSewa: "BULANAN",
          harga,
          deposit: harga,
          aktif: true,
        },
      })
    )
  );

  // 5. Create 2 penyewas (tenants)
  const penyewas = await Promise.all([
    prisma.penyewa.create({
      data: {
        nama: "Budi Santoso",
        noHp: "081234567890",
        email: "budi@example.com",
        pekerjaan: "Karyawan Swasta",
        alamatAsal: "Jln. Sudirman No. 45, Jakarta",
        tipeEntitas: "INDIVIDU",
      },
    }),
    prisma.penyewa.create({
      data: {
        nama: "Siti Nurhaliza",
        noHp: "082345678901",
        email: "siti@example.com",
        pekerjaan: "Pegawai Negeri",
        alamatAsal: "Jln. Gatot Subroto No. 78, Bandung",
        tipeEntitas: "INDIVIDU",
      },
    }),
  ]);

  // 6. Create 3 sewas (rentals) - 2 active, 1 upcoming
  const today = new Date();
  const sewas = await Promise.all([
    // Active rental 1
    prisma.sewa.create({
      data: {
        kamarId: kamars[0].id,
        penyewaId: penyewas[0].id,
        periodeSewa: "BULANAN",
        tanggalMasuk: new Date(today.getFullYear(), today.getMonth(), 1),
        tanggalKeluar: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        hargaSewa: 1000000,
        deposit: 1000000,
        statusSewa: "AKTIF",
        metodeBayar: "TUNAI",
        catatan: "Rental demo pertama",
      },
    }),
    // Active rental 2
    prisma.sewa.create({
      data: {
        kamarId: kamars[2].id,
        penyewaId: penyewas[1].id,
        periodeSewa: "BULANAN",
        tanggalMasuk: new Date(today.getFullYear(), today.getMonth(), 5),
        tanggalKeluar: new Date(today.getFullYear(), today.getMonth() + 1, 5),
        hargaSewa: 1200000,
        deposit: 1200000,
        statusSewa: "AKTIF",
        metodeBayar: "TRANSFER",
        catatan: "Rental demo kedua",
      },
    }),
    // Upcoming rental
    prisma.sewa.create({
      data: {
        kamarId: kamars[1].id,
        penyewaId: penyewas[0].id,
        periodeSewa: "BULANAN",
        tanggalMasuk: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        tanggalKeluar: new Date(today.getFullYear(), today.getMonth() + 2, 1),
        hargaSewa: 1000000,
        deposit: 1000000,
        statusSewa: "PENDING",
        metodeBayar: "TUNAI",
        catatan: "Rental demo upcoming",
      },
    }),
  ]);

  // 7. Create 5 tagihans (invoices)
  const tagihans = await Promise.all([
    // Invoice 1 - Unpaid
    prisma.tagihan.create({
      data: {
        sewaId: sewas[0].id,
        nominal: 1000000,
        periodeDari: new Date(today.getFullYear(), today.getMonth(), 1),
        periodeHingga: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        jatuhTempo: new Date(today.getFullYear(), today.getMonth(), 5),
        status: "BELUM_BAYAR",
        catatan: "Tagihan bulan ini",
      },
    }),
    // Invoice 2 - Paid
    prisma.tagihan.create({
      data: {
        sewaId: sewas[0].id,
        nominal: 1000000,
        periodeDari: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        periodeHingga: new Date(today.getFullYear(), today.getMonth(), 1),
        jatuhTempo: new Date(today.getFullYear(), today.getMonth() - 1, 5),
        status: "LUNAS",
        catatan: "Tagihan bulan lalu (sudah lunas)",
      },
    }),
    // Invoice 3 - Partial payment
    prisma.tagihan.create({
      data: {
        sewaId: sewas[1].id,
        nominal: 1200000,
        periodeDari: new Date(today.getFullYear(), today.getMonth(), 5),
        periodeHingga: new Date(today.getFullYear(), today.getMonth() + 1, 5),
        jatuhTempo: new Date(today.getFullYear(), today.getMonth(), 10),
        status: "SEBAGIAN",
        catatan: "Tagihan dengan pembayaran sebagian",
      },
    }),
    // Invoice 4 - Overdue
    prisma.tagihan.create({
      data: {
        sewaId: sewas[1].id,
        nominal: 1200000,
        periodeDari: new Date(today.getFullYear(), today.getMonth() - 2, 5),
        periodeHingga: new Date(today.getFullYear(), today.getMonth() - 1, 5),
        jatuhTempo: new Date(today.getFullYear(), today.getMonth() - 1, 10),
        status: "TERLAMBAT",
        catatan: "Tagihan yang sudah terlambat",
      },
    }),
    // Invoice 5 - For upcoming rental
    prisma.tagihan.create({
      data: {
        sewaId: sewas[2].id,
        nominal: 1000000,
        periodeDari: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        periodeHingga: new Date(today.getFullYear(), today.getMonth() + 2, 1),
        jatuhTempo: new Date(today.getFullYear(), today.getMonth() + 1, 5),
        status: "BELUM_BAYAR",
        catatan: "Tagihan untuk rental yang akan datang",
      },
    }),
  ]);

  // 8. Create payments for some invoices
  await Promise.all([
    // Full payment for invoice 2
    prisma.pembayaran.create({
      data: {
        tagihanId: tagihans[1].id,
        nominal: 1000000,
        metodeBayar: "TRANSFER",
        dibayarPada: new Date(today.getFullYear(), today.getMonth() - 1, 3),
        catatan: "Pembayaran penuh via transfer",
      },
    }),
    // Partial payment for invoice 3
    prisma.pembayaran.create({
      data: {
        tagihanId: tagihans[2].id,
        nominal: 600000,
        metodeBayar: "TRANSFER",
        dibayarPada: new Date(today.getFullYear(), today.getMonth(), 8),
        catatan: "Pembayaran sebagian via transfer",
      },
    }),
  ]);

  return {
    userId: user.id,
    propertiId: properti.id,
    kamarIds: kamars.map((k) => k.id),
    penyewaIds: penyewas.map((p) => p.id),
    sewaIds: sewas.map((s) => s.id),
    tagihanIds: tagihans.map((t) => t.id),
  };
}

export async function resetDemoData(propertiId: string): Promise<void> {
  const kamarIds = (await prisma.kamar.findMany({ where: { propertiId } })).map((k) => k.id);

  if (kamarIds.length > 0) {
    const sewas = await prisma.sewa.findMany({
      where: { kamarId: { in: kamarIds } },
      select: { id: true, penyewaId: true },
    });
    const sewaIds = sewas.map((s) => s.id);
    const penyewaIds = Array.from(new Set(sewas.map((s) => s.penyewaId)));

    if (sewaIds.length > 0) {
      const tagihanIds = (await prisma.tagihan.findMany({ where: { sewaId: { in: sewaIds } } })).map((t) => t.id);
      if (tagihanIds.length > 0) {
        await prisma.pembayaran.deleteMany({ where: { tagihanId: { in: tagihanIds } } });
      }
      await prisma.tagihan.deleteMany({ where: { sewaId: { in: sewaIds } } });
      await prisma.sewa.deleteMany({ where: { kamarId: { in: kamarIds } } });
    }

    if (penyewaIds.length > 0) {
      await prisma.penyewa.deleteMany({ where: { id: { in: penyewaIds } } });
    }

    await prisma.kamar.deleteMany({ where: { propertiId } });
  }

  // Tipe kamar menunjuk properti; kamar sudah dihapus di atas, jadi FK aman.
  // HargaTipe menunjuk tipe, jadi harus dihapus lebih dulu.
  await prisma.hargaTipe.deleteMany({ where: { tipeKamar: { propertiId } } });
  await prisma.tipeKamar.deleteMany({ where: { propertiId } });
  // Master fasilitas menunjuk properti dengan onDelete: Cascade, tapi dihapus
  // eksplisit supaya urutannya jelas dan tak bergantung pada perilaku cascade.
  await prisma.fasilitas.deleteMany({ where: { propertiId } });
  await prisma.pengeluaran.deleteMany({ where: { propertiId } });
  await prisma.notifikasi.deleteMany({ where: { propertiId } });
  await prisma.properti.delete({ where: { id: propertiId } });
}
