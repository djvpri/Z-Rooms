-- Add demo fields to Properti table
ALTER TABLE "Properti" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Properti" ADD COLUMN "demoExpiresAt" TIMESTAMP(3);
