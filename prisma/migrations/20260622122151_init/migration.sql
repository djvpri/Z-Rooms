-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PEMILIK', 'PENGELOLA', 'ADMIN');

-- CreateEnum
CREATE TYPE "TipeProperti" AS ENUM ('KOS', 'KONTRAKAN', 'HOTEL', 'APARTEMEN');

-- CreateEnum
CREATE TYPE "TipeKamar" AS ENUM ('STANDAR', 'DELUXE', 'VIP', 'SUITE', 'STUDIO');

-- CreateEnum
CREATE TYPE "StatusKamar" AS ENUM ('TERSEDIA', 'TERISI', 'PEMELIHARAAN', 'DIPESAN');

-- CreateEnum
CREATE TYPE "PeriodeSewa" AS ENUM ('HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN');

-- CreateEnum
CREATE TYPE "TipeEntitas" AS ENUM ('INDIVIDU', 'PERUSAHAAN');

-- CreateEnum
CREATE TYPE "StatusSewa" AS ENUM ('AKTIF', 'SELESAI', 'DIBATALKAN', 'PENDING');

-- CreateEnum
CREATE TYPE "SumberBooking" AS ENUM ('LANGSUNG', 'MAMIKOS', 'TRAVELOKA', 'BOOKING_COM', 'TOKOPEDIA', 'ONLINE_LAIN');

-- CreateEnum
CREATE TYPE "StatusTagihan" AS ENUM ('BELUM_BAYAR', 'SEBAGIAN', 'LUNAS', 'TERLAMBAT', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "MetodeBayar" AS ENUM ('TUNAI', 'TRANSFER', 'QRIS', 'VA_BCA', 'VA_BRI', 'VA_MANDIRI', 'LAINNYA');

-- CreateEnum
CREATE TYPE "KategoriBeban" AS ENUM ('LISTRIK', 'AIR', 'INTERNET', 'KEBERSIHAN', 'PERAWATAN', 'PAJAK', 'GAJI', 'LAINNYA');

-- CreateEnum
CREATE TYPE "TipeNotifikasi" AS ENUM ('TAGIHAN_JATUH_TEMPO', 'TAGIHAN_TERLAMBAT', 'PEMBAYARAN_DITERIMA', 'CHECKIN_BARU', 'CHECKOUT_BESOK', 'BOOKING_BARU', 'PEMELIHARAAN', 'INFO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PEMILIK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Properti" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tipe" "TipeProperti" NOT NULL,
    "alamat" TEXT NOT NULL,
    "kota" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL DEFAULT 'Kalimantan Barat',
    "deskripsi" TEXT,
    "fasilitas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Properti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kamar" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "lantai" INTEGER NOT NULL DEFAULT 1,
    "tipe" "TipeKamar" NOT NULL,
    "luas" DOUBLE PRECISION,
    "fasilitas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "foto" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "StatusKamar" NOT NULL DEFAULT 'TERSEDIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertiId" TEXT NOT NULL,

    CONSTRAINT "Kamar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HargaKamar" (
    "id" TEXT NOT NULL,
    "kamarId" TEXT NOT NULL,
    "periodeSewa" "PeriodeSewa" NOT NULL,
    "harga" DECIMAL(12,0) NOT NULL,
    "deposit" DECIMAL(12,0),
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HargaKamar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penyewa" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nik" TEXT,
    "noHp" TEXT NOT NULL,
    "email" TEXT,
    "pekerjaan" TEXT,
    "alamatAsal" TEXT,
    "fotoKtp" TEXT,
    "tipeEntitas" "TipeEntitas" NOT NULL DEFAULT 'INDIVIDU',
    "namaPerusahaan" TEXT,
    "npwp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Penyewa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sewa" (
    "id" TEXT NOT NULL,
    "kamarId" TEXT NOT NULL,
    "penyewaId" TEXT NOT NULL,
    "periodeSewa" "PeriodeSewa" NOT NULL,
    "tanggalMasuk" TIMESTAMP(3) NOT NULL,
    "tanggalKeluar" TIMESTAMP(3) NOT NULL,
    "hargaSewa" DECIMAL(12,0) NOT NULL,
    "deposit" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "statusSewa" "StatusSewa" NOT NULL DEFAULT 'AKTIF',
    "sumber" "SumberBooking" NOT NULL DEFAULT 'LANGSUNG',
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sewa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tagihan" (
    "id" TEXT NOT NULL,
    "sewaId" TEXT NOT NULL,
    "nominal" DECIMAL(12,0) NOT NULL,
    "periodeDari" TIMESTAMP(3) NOT NULL,
    "periodeHingga" TIMESTAMP(3) NOT NULL,
    "jatuhTempo" TIMESTAMP(3) NOT NULL,
    "status" "StatusTagihan" NOT NULL DEFAULT 'BELUM_BAYAR',
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tagihan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pembayaran" (
    "id" TEXT NOT NULL,
    "tagihanId" TEXT NOT NULL,
    "nominal" DECIMAL(12,0) NOT NULL,
    "metodeBayar" "MetodeBayar" NOT NULL,
    "buktiTransfer" TEXT,
    "catatan" TEXT,
    "dibayarPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pembayaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pengeluaran" (
    "id" TEXT NOT NULL,
    "propertiId" TEXT NOT NULL,
    "kategori" "KategoriBeban" NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "nominal" DECIMAL(12,0) NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "bukti" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pengeluaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifikasi" (
    "id" TEXT NOT NULL,
    "propertiId" TEXT NOT NULL,
    "tipe" "TipeNotifikasi" NOT NULL,
    "judul" TEXT NOT NULL,
    "pesan" TEXT NOT NULL,
    "dibaca" BOOLEAN NOT NULL DEFAULT false,
    "referensiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Kamar_propertiId_nomor_key" ON "Kamar"("propertiId", "nomor");

-- CreateIndex
CREATE UNIQUE INDEX "HargaKamar_kamarId_periodeSewa_key" ON "HargaKamar"("kamarId", "periodeSewa");

-- CreateIndex
CREATE UNIQUE INDEX "Penyewa_nik_key" ON "Penyewa"("nik");

-- CreateIndex
CREATE INDEX "Pengeluaran_propertiId_tanggal_idx" ON "Pengeluaran"("propertiId", "tanggal");

-- CreateIndex
CREATE INDEX "Notifikasi_propertiId_dibaca_idx" ON "Notifikasi"("propertiId", "dibaca");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Properti" ADD CONSTRAINT "Properti_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kamar" ADD CONSTRAINT "Kamar_propertiId_fkey" FOREIGN KEY ("propertiId") REFERENCES "Properti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HargaKamar" ADD CONSTRAINT "HargaKamar_kamarId_fkey" FOREIGN KEY ("kamarId") REFERENCES "Kamar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sewa" ADD CONSTRAINT "Sewa_kamarId_fkey" FOREIGN KEY ("kamarId") REFERENCES "Kamar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sewa" ADD CONSTRAINT "Sewa_penyewaId_fkey" FOREIGN KEY ("penyewaId") REFERENCES "Penyewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagihan" ADD CONSTRAINT "Tagihan_sewaId_fkey" FOREIGN KEY ("sewaId") REFERENCES "Sewa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_tagihanId_fkey" FOREIGN KEY ("tagihanId") REFERENCES "Tagihan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
