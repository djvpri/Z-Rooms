import { addHours } from "date-fns";
import { prisma } from "@/lib/prisma";

interface SeedResult {
  userId: string;
  propertiId: string;
  kamarIds: string[];
  penyewaIds: string[];
  sewaIds: string[];
  tagihanIds: string[];
}

export async function seedDemoData(): Promise<SeedResult> {
  const demoEmail = "demo@zomet.my.id";
  const demoExpiresAt = addHours(new Date(), 2);

  // 1. Create or get demo user
  let user = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: demoEmail,
        name: "Demo User",
        role: "USER",
      },
    });
  }

  // 2. Create demo properti (property)
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

  // 3. Create 5 kamars (rooms)
  const kamarData = [
    {
      nomor: "A-101",
      lantai: 1,
      tipe: "STANDAR" as const,
      luas: 12.5,
      fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur Queen"],
    },
    {
      nomor: "A-102",
      lantai: 1,
      tipe: "STANDAR" as const,
      luas: 12.5,
      fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur Queen"],
    },
    {
      nomor: "B-201",
      lantai: 2,
      tipe: "DELUXE" as const,
      luas: 16.0,
      fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur King", "Kursi"],
    },
    {
      nomor: "B-202",
      lantai: 2,
      tipe: "DELUXE" as const,
      luas: 16.0,
      fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur King", "Kursi"],
    },
    {
      nomor: "C-301",
      lantai: 3,
      tipe: "VIP" as const,
      luas: 20.0,
      fasilitas: ["AC", "Kamar Mandi Dalam", "Kasur King", "Sofa", "Mini Bar"],
    },
  ];

  const kamars = await Promise.all(
    kamarData.map((data) =>
      prisma.kamar.create({
        data: {
          ...data,
          propertiId: properti.id,
          status: "TERSEDIA",
        },
      })
    )
  );

  // 4. Create pricing for each kamar
  await Promise.all(
    kamars.map((kamar) =>
      prisma.hargaKamar.create({
        data: {
          kamarId: kamar.id,
          periodeSewa: "BULANAN",
          harga: kamar.tipe === "VIP" ? 1500000 : kamar.tipe === "DELUXE" ? 1200000 : 1000000,
          deposit: kamar.tipe === "VIP" ? 1500000 : kamar.tipe === "DELUXE" ? 1200000 : 1000000,
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
        sumber: "LANGSUNG",
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
        sumber: "ONLINE_LAIN",
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
        sumber: "LANGSUNG",
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
  // Get all kamar IDs for this properti
  const kamarIds = (await prisma.kamar.findMany({ where: { propertiId } })).map((k) => k.id);

  if (kamarIds.length > 0) {
    // Get all sewa IDs for cascade
    const sewaIds = (await prisma.sewa.findMany({ where: { kamarId: { in: kamarIds } } })).map((s) => s.id);

    if (sewaIds.length > 0) {
      // Get all tagihan IDs
      const tagihanIds = (await prisma.tagihan.findMany({ where: { sewaId: { in: sewaIds } } })).map((t) => t.id);

      if (tagihanIds.length > 0) {
        // 1. Delete pembayaran first
        await prisma.pembayaran.deleteMany({ where: { tagihanId: { in: tagihanIds } } });
      }

      // 2. Delete tagihan
      await prisma.tagihan.deleteMany({ where: { sewaId: { in: sewaIds } } });

      // 3. Delete sewa
      await prisma.sewa.deleteMany({ where: { kamarId: { in: kamarIds } } });
    }

    // 4. Delete harga kamar
    await prisma.hargaKamar.deleteMany({ where: { kamarId: { in: kamarIds } } });

    // 5. Delete kamar
    await prisma.kamar.deleteMany({ where: { propertiId } });
  }

  // 6. Delete pengeluaran linked to this properti
  await prisma.pengeluaran.deleteMany({ where: { propertiId } });

  // 7. Delete notifikasi linked to this properti
  await prisma.notifikasi.deleteMany({ where: { propertiId } });

  // 8. Delete properti
  await prisma.properti.delete({ where: { id: propertiId } });
}
