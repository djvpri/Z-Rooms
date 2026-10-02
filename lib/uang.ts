// lib/uang.ts
//
// SATU sumber penghitungan uang masuk (pendapatan) untuk dashboard & tab
// keuangan. Keputusan pemilik (2026-10-02): basis = UANG FISIK.
//   - Sewa    : baris Pembayaran (dibayarPada) — uang benar-benar diterima.
//   - Barang  : Penjualan LUNAS, tanggal = COALESCE(dibayarPada, createdAt)
//               (dibayarPada diisi checkout untuk titipan; jual lepas isi
//               createdAt = saat dibayar).
// Tagihan BELUM_BAYAR/TERLAMBAT/SEBAGIAN BUKAN pendapatan — piutang dilaporkan
// terpisah lewat "Belum terkumpul" (lihat piutangSewa di bawah).
//
// Konsekuensi yang disengaja: tagihan dilunasi telat muncul sbg pendapatan
// BULAN DIBAYAR, bukan bulan tempo. Angka bulan lampau tidak pernah berubah
// mundur oleh pembayaran yang datang kemudian.
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/** Rentang tanggal mentah utk query uang. */
export type Rentang = { gte: Date; lte: Date }

const barangTanggal = (rentang: Rentang): Prisma.PenjualanWhereInput => ({
  // Tanggal uang = dibayarPada (titipan dilunasi di checkout), fallback createdAt
  // (jual lepas tercatat LUNAS saat jual). Dua cabang krn Prisma tak punya COALESCE.
  OR: [
    { dibayarPada: rentang },
    { dibayarPada: null, createdAt: rentang },
  ],
})

/**
 * Uang masuk sewa dalam rentang: jumlah baris Pembayaran (dibayarPada).
 * Semua jalur pembayaran WAJIB membuat Pembayaran dalam $transaction yang sama
 * dgn set LUNAS (aturan di zxroom skill) — jadi ini = seluruh uang sewa masuk.
 */
export async function pendapatanSewa(propertiId: string, rentang: Rentang): Promise<number> {
  const r = await prisma.pembayaran.aggregate({
    where: {
      dibayarPada: rentang,
      tagihan: { sewa: { kamar: { propertiId } } },
    },
    _sum: { nominal: true },
  })
  return Number(r._sum.nominal ?? 0)
}

/** Uang masuk penjualan barang LUNAS dalam rentang (uang fisik). */
export async function pendapatanBarang(propertiId: string, rentang: Rentang): Promise<number> {
  const r = await prisma.penjualan.aggregate({
    where: {
      propertiId,
      status: 'LUNAS',
      ...barangTanggal(rentang),
    },
    _sum: { total: true },
  })
  return Number(r._sum.total ?? 0)
}

/**
 * Piutang sewa: tagihan yang uangnya belum masuk penuh.
 * SEBAGIAN dihitung sisa nominal − pembayaran yang sudah masuk; tanpa itu
 * tagihan 1jt yg dibayar 200rb tampil sbg piutang 1jt.
 */
export async function piutangSewa(propertiId: string): Promise<number> {
  const tagihan = await prisma.tagihan.findMany({
    where: {
      status: { in: ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'] },
      sewa: { kamar: { propertiId } },
    },
    select: { nominal: true, pembayaran: { select: { nominal: true } } },
  })
  return tagihan.reduce((sum, t) => {
    const dibayar = t.pembayaran.reduce((a, p) => a + Number(p.nominal), 0)
    return sum + Math.max(Number(t.nominal) - dibayar, 0)
  }, 0)
}
