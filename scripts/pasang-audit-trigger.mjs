// scripts/pasang-audit-trigger.mjs
//
// Pasang trigger audit pada tabel "Sewa". Menangkap INSERT/UPDATE/DELETE
// termasuk dari SQL mentah (psql, terminal Coolify, app lain yang share DB).
// Di sinilah jejak pelaku "7 PENDING lenyap" akan muncul ke depan.
//
// Idempoten: DROP TRIGGER IF EXISTS lalu CREATE. `prisma db push` bisa
// melepas trigger saat tabel di-recreate, karena itu script ini dipanggil
// di rantai `npm start` SETELAH db push — tiap deploy memasang ulang.
//
// Gagal memasang TIDAK mematikan start: jejak audit opsional, app tetap
// harus hidup (exit 0 + pesan stderr).

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SQL = `
CREATE OR REPLACE FUNCTION fn_audit_sewa() RETURNS trigger AS $$
BEGIN
  INSERT INTO "AuditSewa" ("id", "sewaId", "aksi", "statusLama", "statusBaru", "kamarNomor", "pengguna", "wktPada")
  VALUES (
    replace(cast(gen_random_uuid() as text), '-', '') || replace(cast(gen_random_uuid() as text), '-', ''),
    COALESCE(NEW."id", OLD."id"),
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."statusSewa" END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."statusSewa" END,
    CASE WHEN TG_OP = 'INSERT' THEN NEW."kamarId" ELSE OLD."kamarId" END,
    (SELECT session_user),
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_sewa ON "Sewa";
CREATE TRIGGER trg_audit_sewa
AFTER INSERT OR UPDATE OR DELETE ON "Sewa"
FOR EACH ROW EXECUTE FUNCTION fn_audit_sewa();
`

async function main() {
  try {
    await prisma.$executeRawUnsafe(SQL)
    console.log('✓ Trigger audit Sewa terpasang (AuditSewa)')
  } catch (e) {
    console.error('⚠ Trigger audit Sewa GAGAL dipasang:', e.message)
    console.error('  Audit level DB nonaktif — periksa manual bila diperlukan.')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
