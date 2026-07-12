import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SECRET_PREFIX = "zrooms-demo-";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth" }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!token.startsWith(SECRET_PREFIX)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Ensure demo columns exist
    await prisma.$queryRaw`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Properti' AND column_name='isDemo') THEN ALTER TABLE "Properti" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false; ALTER TABLE "Properti" ADD COLUMN "demoExpiresAt" TIMESTAMP(3); END IF; END $$;`.catch(() => {});

    // Clear existing demo data
    await prisma.$queryRaw`DELETE FROM "User" WHERE email = 'demo@zomet.my.id'`;
    await prisma.$queryRaw`DELETE FROM "Notifikasi" WHERE "sewaId" IN (SELECT id FROM "Sewa" WHERE "penyewaId" IN (SELECT id FROM "Penyewa" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true)))`;
    await prisma.$queryRaw`DELETE FROM "Pembayaran" WHERE "tagihanId" IN (SELECT id FROM "Tagihan" WHERE "sewaId" IN (SELECT id FROM "Sewa" WHERE "penyewaId" IN (SELECT id FROM "Penyewa" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true))))`;
    await prisma.$queryRaw`DELETE FROM "Tagihan" WHERE "sewaId" IN (SELECT id FROM "Sewa" WHERE "penyewaId" IN (SELECT id FROM "Penyewa" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true)))`;
    await prisma.$queryRaw`DELETE FROM "Sewa" WHERE "penyewaId" IN (SELECT id FROM "Penyewa" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true))`;
    await prisma.$queryRaw`DELETE FROM "Penyewa" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true)`;
    await prisma.$queryRaw`DELETE FROM "Kamar" WHERE "propertiId" IN (SELECT id FROM "Properti" WHERE "isDemo" = true)`;
    await prisma.$queryRaw`DELETE FROM "Properti" WHERE "isDemo" = true`;


    // Seed via Prisma client
    const user = await prisma.user.create({
      data: { email: "demo@zomet.my.id", name: "Demo User", role: "USER" }
    });

    const properti = await prisma.properti.create({
      data: {
        nama: "Demo Kos Sejahtera", tipe: "KOS",
        alamat: "Jln. Merdeka No. 123", kota: "Pontianak",
        provinsi: "Kalimantan Barat",
        deskripsi: "Kos berkualitas dengan fasilitas lengkap untuk demo",
        fasilitas: ["WiFi", "Parkir Gratis", "Kamar Mandi Dalam", "AC"],
        aktif: true, isDemo: true,
        demoExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        ownerId: user.id,
      }
    });

    const kamarData = [
      { nama: "Kamar A1", tipe: "Standar", harga: 1000000, kapasitas: 1, luas: "3x4", status: "TERSEDIA", fasilitas: ["Kasur", "Lemari", "Meja"] },
      { nama: "Kamar A2", tipe: "Standar", harga: 1000000, kapasitas: 1, luas: "3x4", status: "TERSEDIA", fasilitas: ["Kasur", "Lemari", "Meja"] },
      { nama: "Kamar B1", tipe: "Deluxe", harga: 1200000, kapasitas: 1, luas: "4x4", status: "TERSEDIA", fasilitas: ["Kasur", "Lemari", "Meja", "TV"] },
      { nama: "Kamar B2", tipe: "Deluxe", harga: 1200000, kapasitas: 1, luas: "4x4", status: "TERSEDIA", fasilitas: ["Kasur", "Lemari", "Meja", "TV"] },
      { nama: "Kamar VIP", tipe: "VIP", harga: 1500000, kapasitas: 2, luas: "5x5", status: "TERSEDIA", fasilitas: ["Kasur", "Lemari", "Meja", "TV", "AC", "Sofa"] },
    ];
    const kamars = [];
    for (const k of kamarData) {
      const kamar = await prisma.kamar.create({ data: { ...k, propertiId: properti.id } });
      kamars.push(kamar.id);
    }

    const penyewa1 = await prisma.penyewa.create({
      data: { nama: "Budi Santoso", noTelp: "081234567890", email: "budi@mail.com", alamat: "Jln. Ahmad Yani", propertiId: properti.id }
    });
    const penyewa2 = await prisma.penyewa.create({
      data: { nama: "Siti Nurhaliza", noTelp: "081234567891", email: "siti@mail.com", alamat: "Jln. Diponegoro", propertiId: properti.id }
    });

    const sewa1 = await prisma.sewa.create({
      data: { penyewaId: penyewa1.id, kamarId: kamars[0], propertiId: properti.id, tglMasuk: new Date("2026-07-01"), tglKeluar: new Date("2026-08-01"), status: "AKTIF", biayaSewa: 1000000, deposit: 500000 }
    });
    const sewa2 = await prisma.sewa.create({
      data: { penyewaId: penyewa2.id, kamarId: kamars[2], propertiId: properti.id, tglMasuk: new Date("2026-07-05"), tglKeluar: new Date("2026-08-05"), status: "AKTIF", biayaSewa: 1200000, deposit: 600000 }
    });
    const sewa3 = await prisma.sewa.create({
      data: { penyewaId: penyewa1.id, kamarId: kamars[1], propertiId: properti.id, tglMasuk: new Date("2026-08-01"), tglKeluar: new Date("2026-09-01"), status: "PENDING", biayaSewa: 1000000, deposit: 500000 }
    });

    await prisma.tagihan.createMany({
      data: [
        { sewaId: sewa1.id, propertiId: properti.id, bulan: 7, tahun: 2026, jumlah: 1000000, status: "LUNAS", tglJatuhTempo: new Date("2026-07-10"), tglBayar: new Date("2026-07-08"), denda: 0 },
        { sewaId: sewa2.id, propertiId: properti.id, bulan: 8, tahun: 2026, jumlah: 1200000, status: "BELUM_BAYAR", tglJatuhTempo: new Date("2026-08-10"), denda: 0 },
        { sewaId: sewa1.id, propertiId: properti.id, bulan: 8, tahun: 2026, jumlah: 1000000, status: "BELUM_BAYAR", tglJatuhTempo: new Date("2026-08-10"), denda: 0 },
        { sewaId: sewa3.id, propertiId: properti.id, bulan: 8, tahun: 2026, jumlah: 1000000, status: "BELUM_BAYAR", tglJatuhTempo: new Date("2026-08-10"), denda: 0 },
        { sewaId: sewa2.id, propertiId: properti.id, bulan: 7, tahun: 2026, jumlah: 1200000, status: "LUNAS", tglJatuhTempo: new Date("2026-07-10"), tglBayar: new Date("2026-07-09"), denda: 0 },
      ]
    });

    return NextResponse.json({ success: true, properti: { id: properti.id, nama: properti.nama } });
  } catch (error) {
    console.error("Demo setup error:", error);
    return NextResponse.json({ error: "Failed: " + String(error) }, { status: 500 });
  }
}
