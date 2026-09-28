// scripts/pasang-audit-trigger.mjs
//
// Pasang trigger audit pada tabel "Sewa". Menangkap SETIAP INSERT/UPDATE/DELETE
// termasuk dari SQL mentah (psql, terminal Coolify, app lain yang share DB).
//
// Idempoten: DROP TRIGGER IF EXISTS lalu CREATE. `prisma db push` bisa melepas
// trigger saat tabel di-recreate — karena itu script ini dipanggil dari rantai
// `npm start` SETELAH db push, jadi tiap deploy memasang ulang.
//
// Gagal memasang TIDAK mematikan start: audit itu opsional, app tetap harus
// hidup (pesan ke stderr, exit 0).

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// pemanggil뢇$ueryRawUnsafe = prepared statement: SATU perintah per panggilan.
const SQL_FN = `
CREATE OR REPLACE FUNCTION fn_audit_sewa() RETURNS trigger AS $$
BEGIN
  INSERT INTO "AuditSewa" ("id", "sewaId", "aksi", "statusLama", "statusBaru", "kamarNomor", "pengguna", "wktPada")
  VALUES (
    md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text),
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
`

const SQL_DROP = `DROP TRIGGER IF EXISTS trg_audit_sewa ON "Sewa";`

const SQL_CREATE = `CREATE TRIGGER trg_audit_sewa
AFTER INSERT OR UPDATE OR DELETE ON "Sewa"
FOR EACH ROW EXECUTE FUNCTION fn_audit_sewa();`

async function main() {
  try {
    await prisma.$executeRawUnsafe(SQL_FN)
    console.log('· fn_audit_sewa ok')
    await prisma.$executeRawUnsafe(SQL_DROP)
    await prisma.$executeRawUnsafe(SQL_CREATE)
    console.log('· trg_audit_sewa ok')

    // Verifikasi: trigger benar-benar ada di DB (bukan cuma "tak error").
    const ada = await prisma.$queryRawUnsafe(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = '"Sewa"'::regclass`
    )
    console.log('· trigger di DB:', JSON.stringify(ada))

    // Uji tembak: satu UPDATE harus melahirkan satu baris AuditSewa.
    const s = await prisma.sewa.findFirst({ where: { statusSewa: 'AKTIF' }, select: { id: true } })
    if (s) {
      const sebelum = await prisma.auditSewa.count()
      await prisma.sewa.update({ where: { id: s.id }, data: {} })
      const sesudah = await prisma.auditSewa.count()
      console.log(`· uji: ${sebelum} -> ${sesudah} baris ${sesudah > sebelum ? 'OK' : 'GAGAL'}`)
    }
  } catch (e) {
    console.error('· TRIGGER AUDIT GAGAL:', e.message)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
