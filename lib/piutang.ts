// lib/piutang.ts
//
// Query piutang barang. Dipisah dari lib/produk.ts dengan sengaja: file itu
// murni (tanpa Prisma) supaya bisa diimpor langsung oleh uji Node polos.
import { prisma } from '@/lib/prisma'

/**
 * Total piutang barang sebuah properti — penjualan yang dititipkan ke kamar dan
 * belum dilunasi. Dipakai halaman Keuangan: tanpa ini "Belum terkumpul"
 * terlihat lebih kecil dari uang yang sebenarnya masih harus ditagih.
 */
export async function piutangBarang(propertiId: string): Promise<number> {
  const r = await prisma.penjualan.aggregate({
    where: { propertiId, status: 'BELUM_BAYAR' },
    _sum: { total: true },
  })
  return Number(r._sum.total ?? 0)
}
