-- AlterTable
ALTER TABLE "Properti" ADD COLUMN "pinBatal" TEXT;

-- CreateTable
CREATE TABLE "LogAktivitas" (
    "id" TEXT NOT NULL,
    "propertiId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "aksi" TEXT NOT NULL,
    "referensiId" TEXT,
    "alasan" TEXT NOT NULL,
    "detail" TEXT,
    "wktPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAktivitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogAktivitas_propertiId_wktPada_idx" ON "LogAktivitas"("propertiId", "wktPada");