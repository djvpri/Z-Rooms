// lib/produk.ts
//
// Aturan produk jualan (minuman/makanan) & penjualannya. Satu sumber untuk
// /pengaturan/produk, /penjualan-barang, dan kedua route API-nya.
//
// Kenapa penjualan TIDAK lewat model Tagihan: `Tagihan.sewaId` wajib, jadi
// setiap barisnya selalu milik satu kontrak sewa. Menitipkan penjualan botol
// air ke sana berarti membuat Sewa palsu per transaksi. Jadi Penjualan berdiri
// sendiri, dengan `sewaId` OPSIONAL yang cuma menandai "milik kamar mana".
import { z } from 'zod'

export const NAMA_PRODUK_MAKS = 60
export const SATUAN_MAKS = 12
export const KATEGORI_MAKS = 24
/** Batas harga jual & modal (rupiah). Guard bodoh terhadap salah ketik. */
export const HARGA_PRODUK_MAKS = 9_999_999_999
/** Batas stok sekali isi/edit — menahan salah ketik "2000" jadi "200000". */
export const STOK_MAKS = 1_000_000
/** Batas jumlah per baris keranjang dalam satu transaksi. */
export const JUMLAH_MAKS = 1000

/**
 * Nomor penjualan berikutnya untuk satu properti: "PJ-0007".
 *
 * Masukan = nomor TERTINGGI yang ada saat ini (atau null kalau belum ada), bukan
 * jumlah baris: penjualan yang dibatalkan tetap menyimpan barisnya, jadi
 * menghitung baris akan memakai ulang nomor lama dan menabrak
 * `@@unique([propertiId, nomor])`.
 *
 * Angkanya dibaca dengan `match(/(\d+)$/)` — BUKAN `replace(/\D/g,'')`, yang
 * akan menelan semua digit kalau format nomor berubah. Perbandingan angka
 * (bukan teks) juga wajib: `'PJ-0010' < 'PJ-0009'` secara leksikografis.
 */
export function nomorJualBerikut(nomorTertinggi: string | null | undefined): string {
  const angka = Number(nomorTertinggi?.match(/(\d+)$/)?.[1] ?? 0)
  const naik = Number.isFinite(angka) ? angka + 1 : 1
  return `PJ-${String(naik).padStart(4, '0')}`
}

/** Kategori yang ditawarkan sebagai saran. Pemilik tetap bisa ketik sendiri. */
export const SARAN_KATEGORI = ['Minuman', 'Makanan', 'Snack', 'Rokok', 'Lainnya']

/**
 * CATATAN: `piutangBarang()` sengaja TIDAK di sini walau tampak sekampung.
 * File ini murni (tanpa Prisma) supaya `scripts/check-penjualan-barang.mjs`
 * bisa mengimpornya langsung dengan Node polos — begitu ia menarik `@/lib/prisma`,
 * impor `@/...` tak bisa di-resolve di luar Next dan seluruh uji mati.
 * Query-nya ada di `lib/piutang.ts`.
 */

/**
 * Benih produk bawaan untuk properti baru — sekali klik dapat daftar siap pakai,
 * bukan halaman kosong. Harga sengaja angka bulat pasaran, pemilik tinggal ubah.
 */
export const PRODUK_BAWAAN = [
  { nama: 'Air Mineral 600ml', hargaJual: 4000, hargaBeli: 2500, satuan: 'botol', kategori: 'Minuman' },
  { nama: 'Air Mineral Galon', hargaJual: 20000, hargaBeli: 17000, satuan: 'pcs', kategori: 'Minuman' },
  { nama: 'Teh Kotak', hargaJual: 5000, hargaBeli: 3500, satuan: 'pcs', kategori: 'Minuman' },
  { nama: 'Kopi Sachet', hargaJual: 3000, hargaBeli: 1500, satuan: 'sachet', kategori: 'Minuman' },
  { nama: 'Mie Instan', hargaJual: 5000, hargaBeli: 3000, satuan: 'bungkus', kategori: 'Makanan' },
  { nama: 'Telur (per butir)', hargaJual: 3000, hargaBeli: 2200, satuan: 'pcs', kategori: 'Makanan' },
  { nama: 'Roti Kemasan', hargaJual: 6000, hargaBeli: 4500, satuan: 'pcs', kategori: 'Makanan' },
] as const

/** Normalisasi nama produk untuk perbandingan unik: "Teh Kotak " == "teh kotak". */
export function kunciNama(nama: string) {
  return nama.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ───────────────────────────────────────────────
// SKEMA ZOD
// ───────────────────────────────────────────────

export const produkSchema = z.object({
  nama: z.string().trim().min(1, 'Nama produk wajib diisi.').max(NAMA_PRODUK_MAKS,
    `Nama produk maksimal ${NAMA_PRODUK_MAKS} karakter.`),
  hargaJual: z.number().int('Harga jual harus bilangan bulat.')
    .min(0, 'Harga jual tidak boleh negatif.').max(HARGA_PRODUK_MAKS),
  // Modal boleh kosong: pemilik sering belum tahu HPP saat baru menambah produk.
  hargaBeli: z.number().int('Harga beli harus bilangan bulat.')
    .min(0, 'Harga beli tidak boleh negatif.').max(HARGA_PRODUK_MAKS).nullish(),
  stok: z.number().int('Stok harus bilangan bulat.')
    .min(-STOK_MAKS).max(STOK_MAKS).optional(),
  satuan: z.string().trim().min(1).max(SATUAN_MAKS).optional(),
  kategori: z.string().trim().max(KATEGORI_MAKS).nullish(),
  aktif: z.boolean().optional(),
  urutan: z.number().int().optional(),
})

/**
 * Satu baris keranjang. `hargaSatuan` SENGAJA TIDAK ADA di sini — harga selalu
 * dibaca dari DB saat transaksi. Kalau klien boleh mengirim harga, siapa pun
 * yang bisa memanggil API bisa menjual seharga Rp 1.
 */
export const itemJualSchema = z.object({
  produkId: z.string().min(1, 'produkId wajib diisi.'),
  jumlah: z.number().int('Jumlah harus bilangan bulat.')
    .min(1, 'Jumlah minimal 1.').max(JUMLAH_MAKS, `Jumlah maksimal ${JUMLAH_MAKS}.`),
})

export const jualSchema = z.object({
  item: z.array(itemJualSchema).min(1, 'Keranjang kosong — belum ada barang dijual.'),
  // NULL/absen = jual lepas (tunai langsung). Diisi = titipan ke kamar.
  sewaId: z.string().min(1).nullish(),
  metodeBayar: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']).default('TUNAI'),
  catatan: z.string().trim().max(200).nullish(),
  /**
   * Set true untuk menjual walaupun stok sistem tak cukup (akan jadi minus).
   * Stok minus sengaja DIIZINKAN (keputusan produk: hitungan fisik warung selalu
   * selisih), tapi harus disengaja supaya kasir sadar ada ketidakcocokan.
   */
  paksaStok: z.boolean().default(false),
})

// ───────────────────────────────────────────────
// HITUNGAN & PENGURUTAN
// ───────────────────────────────────────────────

export type BarisHitung = {
  produkId: string
  nama: string
  hargaSatuan: number
  hargaBeli: number | null
  jumlah: number
  stokTersedia: number
}

export type HasilHitung = {
  subtotal: number
  /** Produk yang stoknya tak cukup; dipakai route untuk 409 saat paksaStok=false. */
  kurang: { nama: string; diminta: number; tersedia: number }[]
}

/**
 * Hitung subtotal & cari produk yang stoknya kurang. Fungsi murni (tanpa DB)
 * supaya bisa diuji langsung — perhitungan uang tak boleh hanya terbukti lewat
 * pemanggilan HTTP.
 *
 * Beberapa baris dengan produkId sama dijumlahkan dulu: keranjang bisa memuat
 * produk yang sama dua kali (kasir menambah lagi), dan menilai tiap baris
 * sendiri-sendiri akan meloloskan stok yang sebenarnya kurang.
 */
export function hitungJual(baris: BarisHitung[]): HasilHitung {
  let subtotal = 0
  const dimintaPerProduk = new Map<string, { nama: string; jumlah: number; tersedia: number }>()

  for (const b of baris) {
    subtotal += b.hargaSatuan * b.jumlah
    const ada = dimintaPerProduk.get(b.produkId)
    if (ada) {
      ada.jumlah += b.jumlah
    } else {
      dimintaPerProduk.set(b.produkId, { nama: b.nama, jumlah: b.jumlah, tersedia: b.stokTersedia })
    }
  }

  const kurang = [...dimintaPerProduk.values()]
    .filter(p => p.jumlah > p.tersedia)
    .map(p => ({ nama: p.nama, diminta: p.jumlah, tersedia: p.tersedia }))

  return { subtotal, kurang }
}

/** Laba kotor satu penjualan: total − modal. Baris tanpa modal dihitung modal 0. */
export function labaJual(items: { hargaSatuan: unknown; hargaBeli: unknown; jumlah: number }[]): number {
  return items.reduce((s, it) => {
    const jual = Number(it.hargaSatuan)
    const beli = it.hargaBeli === null || it.hargaBeli === undefined ? 0 : Number(it.hargaBeli)
    return s + (jual - beli) * it.jumlah
  }, 0)
}
