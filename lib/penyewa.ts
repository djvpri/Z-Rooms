// lib/penyewa.ts
//
// Validasi data penyewa untuk PATCH /api/penyewa/[id] (ubah penyewa).
//
// `nik` unik di DB. Bentrok NIK ditolak di route dengan pesan yang menyebut
// pemiliknya — bukan dibiarkan jadi error Prisma mentah, dan bukan diam-diam
// memindahkan identitas ke orang lain.
import { z } from 'zod'

/** Teks opsional: '' dan spasi jadi null, supaya kolom nullable tak berisi ''. */
export const teksOpsional = z
  .string()
  .transform((v) => (v.trim() ? v.trim() : null))
  .nullable()
  .optional()

export const updatePenyewaSchema = z.object({
  nama: z.string().trim().min(1, 'Nama penyewa wajib diisi.').optional(),
  nik: teksOpsional,
  noHp: teksOpsional,
  email: teksOpsional,
  pekerjaan: teksOpsional,
  alamatAsal: teksOpsional,
  tipeEntitas: z.enum(['INDIVIDU', 'PERUSAHAAN']).optional(),
  namaPerusahaan: teksOpsional,
  npwp: teksOpsional,
})

/** Riwayat nama: satu baris per penggantian. Dipakai UI untuk jejak dokumen lama. */
export const riwayatNamaSchema = z.array(
  z.object({ nama: z.string(), digantiPada: z.string() }),
)
