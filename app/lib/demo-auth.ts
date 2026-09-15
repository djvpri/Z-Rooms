import { timingSafeEqual } from "crypto";

/**
 * Auth untuk endpoint demo (server-to-server, dipanggil cron/ZOne).
 *
 * Sebelumnya tiap route cuma cek `token.startsWith("zrooms-demo-")`, sehingga
 * siapa pun bisa mengirim `Bearer zrooms-demo-x` untuk memicu seed + hapus
 * properti demo. Sekarang wajib cocok penuh dengan DEMO_SECRET dari env, dan
 * perbandingannya constant-time.
 */
export function cekDemoSecret(request: Request): boolean {
  const secret = process.env.DEMO_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = Buffer.from(authHeader.slice(7));
  const expected = Buffer.from(secret);
  return token.length === expected.length && timingSafeEqual(token, expected);
}
