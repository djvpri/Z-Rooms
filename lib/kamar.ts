// lib/kamar.ts
//
// Validasi data kamar, dipakai bersama oleh POST /api/kamar (tambah) dan
// PATCH /api/kamar/[id] (ubah). Sebelumnya dua skema terpisah — dan memang
// sudah menyimpang: yang satu mewajibkan `nomor` tanpa memangkas spasi, yang
// lain tidak memeriksa `lantai` sama sekali. Satu berkas supaya aturannya
// hanya ada di satu tempat.
//
// `status` TIDAK ada di kedua skema. Status kamar adalah cerminan alur sewa
// (TERSEDIA/TERISI/DIPESAN diatur booking & check-out); mengizinkannya di sini
// membuat kamar "TERSEDIA" padahal penyewanya masih aktif. Karena Zod membuang
// field tak dikenal, kiriman `status` dari klien diabaikan, bukan ditolak —
// pemanggil lama tidak putus.
import { z } from 'zod'

const nomor = z.string().trim().min(1, 'Nomor kamar wajib diisi.')
// Lantai dasar pun ditulis 1 di properti ini, jadi 0 dan negatif ditolak.
const lantai = z.number().int().min(1, 'Lantai minimal 1.')
const luas = z.number().positive('Luas harus lebih dari 0.')
const fasilitas = z.array(z.string())

export const createKamarSchema = z.object({
  nomor,
  lantai: lantai.default(1),
  // Tipe kini master data (model TipeKamar) dan WAJIB: kamar tanpa tipe tak
  // punya tarif, jadi tak bisa disewakan.
  tipeId: z.string().min(1, 'Tipe kamar wajib dipilih.'),
  luas: luas.optional(),
  fasilitas: fasilitas.default([]),
})

// Semua opsional — pemanggil boleh mengirim sebagian saja. `luas: null` berarti
// hapus luasnya, `undefined` berarti jangan diubah.
//
// Ditulis ulang dari `createKamarSchema.partial()`, bukan memakainya: `.partial()`
// ikut membuang `.nullable()`, sehingga `luas: null` jadi ditolak dan pemilik
// tak bisa mengosongkan luas kamar. Setiap field di sini HARUS `.optional()`.
export const updateKamarSchema = z.object({
  nomor: nomor.optional(),
  lantai: lantai.optional(),
  tipeId: z.string().min(1, 'Tipe kamar wajib dipilih.').optional(),
  luas: luas.nullable().optional(),
  fasilitas: fasilitas.optional(),
})
