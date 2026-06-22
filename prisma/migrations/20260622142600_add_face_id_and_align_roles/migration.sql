-- AlterEnum: Change Role values
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MANAGER');

-- Update existing data (map old roles to new)
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
UPDATE "User" SET "role" = 
  CASE 
    WHEN "role"::text = 'PEMILIK' THEN 'ADMIN'
    WHEN "role"::text = 'PENGELOLA' THEN 'MANAGER'
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
    ELSE 'USER'
  END::text::"Role";

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- Add new columns
ALTER TABLE "User" ADD COLUMN "faceId" TEXT;
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Add unique constraint
ALTER TABLE "User" ADD CONSTRAINT "User_faceId_key" UNIQUE ("faceId");
