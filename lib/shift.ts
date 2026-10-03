// lib/shift.ts
//
// Hitungan uang satu shift. Pola sama dgn lib/uang.ts (uang fisik):
//   - sewa  = baris Pembayaran.dibayarPada dalam rentang shift
//   - barang = Penjualan LUNAS, tanggal uang = dibayarPada fallback createdAt
//     (sama dgn barangTanggal di lib/uang.ts — titipan dilunasi saat checkout)
//
// Transaksi TIDAK bertanda shiftId: rentang waktu shift yang membatasi.
// Data lama sebelum fitur shift tetap terhitung di shift pertama.
import { prisma } from '@/lib/prisma'
import type { Rentang } from '@/lib/uang'

export type RekapShift = {
  // Uang sewa masuk, dipisah tunai vs lainnya (transfer/QRIS/VA tidak lewat laci).
  sewaTunai: number
  sewaLainnya: number
  barangTunai: number
  barangLainnya: number
  // Tunai sistem = sewaTunai + barangTunai — pembanding hitungan laci kasir.
  tunaiSistem: number
  totalMasuk: number
  jumlahTransaksi: number
}

const bukanTunai = { not: 'TUNAI' as const }

export async function rekapShift(propertiId: string, rentang: Rentang): Promise<RekapShift> {
  const [sewa, barang] = await Promise.all([
    prisma.pembayaran.groupBy({
      by: ['metodeBayar'],
      where: { dibayarPada: rentang, tagihan: { sewa: { kamar: { propertiId } } } },
      _sum: { nominal: true },
      _count: true,
    }),
    // Tanggal uang barang = dibayarPada fallback createdAt (dua cabang, krn
    // Prisma tak punya COALESCE) — sama dgn lib/uang.ts.
    prisma.penjualan.groupBy({
      by: ['metodeBayar'],
      where: {
        propertiId,
        status: 'LUNAS',
        OR: [
          { dibayarPada: rentang },
          { dibayarPada: null, createdAt: rentang },
        ],
      },
      _sum: { total: true },
      _count: true,
    }),
  ])

  let sewaTunai = 0, sewaLainnya = 0, barangTunai = 0, barangLainnya = 0, jumlahTransaksi = 0
  for (const g of sewa) {
    const n = Number(g._sum.nominal ?? 0)
    if (g.metodeBayar === 'TUNAI') sewaTunai += n
    else sewaLainnya += n
    jumlahTransaksi += g._count
  }
  for (const g of barang) {
    const n = Number(g._sum.total ?? 0)
    if (g.metodeBayar === 'TUNAI') barangTunai += n
    else barangLainnya += n
    jumlahTransaksi += g._count
  }

  return {
    sewaTunai,
    sewaLainnya,
    barangTunai,
    barangLainnya,
    tunaiSistem: sewaTunai + barangTunai,
    totalMasuk: sewaTunai + sewaLainnya + barangTunai + barangLainnya,
    jumlahTransaksi,
  }
}

// Guard ringan: enum metode non-tunai (LAINNYA mis. transfer manual) tetap
// masuk "lainnya" — bukan hilang. ponytail: sekarang grup by metode lalu
// bagi dua; kalau nanti butuh rincian per metode (QRIS vs VA), tampilkan
// langsung dari hasil groupBy tanpa ubah bentuk data.
export const _metodeNonTunai = bukanTunai
