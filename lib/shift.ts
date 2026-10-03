// lib/shift.ts
//
// Hitungan uang satu shift. Pola sama dgn lib/uang.ts (uang fisik):
//   - sewa  = baris Pembayaran.dibayarPada dalam rentang shift
//   - barang = Penjualan LUNAS, tanggal uang = dibayarPada fallback createdAt
//     (sama dgn barangTanggal di lib/uang.ts — titipan dilunasi saat checkout)
//   - karaoke = sesi SELESAI selesaiAktual dalam rentang shift. Uang karaoke
//     TIDAK lewat Pembayaran/Penjualan — ia hidup di SesiKaraoke sendiri
//     (totalSewa + minuman − bayarDiMuka − jaminan), rumus sama dgn `dibayar`
//     di route tutup sesi. Karaoke selalu tunai di kasir.
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
  // Sesi karaoke yang ditutup selama shift (uang diterima kasir saat itu).
  karaokeTunai: number
  // Tunai sistem = sewaTunai + barangTunai + karaokeTunai — pembanding laci.
  tunaiSistem: number
  totalMasuk: number
  jumlahTransaksi: number
}

export async function rekapShift(propertiId: string, rentang: Rentang): Promise<RekapShift> {
  const [sewa, barang, karaoke] = await Promise.all([
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
    // Sesi karaoke: uangnya = totalSewa + Σ minuman.subtotal − bayarDiMuka −
    // jaminan. Dihitung dari baris yang sudah disalin saat tutup sesi
    // (totalSewa DISALIN, tak dihitung ulang). BATAL/BERJALAN tidak ikut.
    prisma.sesiKaraoke.findMany({
      where: { propertiId, status: 'SELESAI', selesaiAktual: rentang },
      select: { totalSewa: true, bayarDiMuka: true, jaminan: true, minuman: { select: { subtotal: true } } },
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
  let karaokeTunai = 0
  for (const s of karaoke) {
    const minuman = s.minuman.reduce((a, m) => a + Number(m.subtotal), 0)
    // Rumus `dibayar` route tutup sesi: total − prepay − jaminan (jaminan
    // dikembalikan ke pelanggan, bukan uang masuk).
    karaokeTunai += Number(s.totalSewa) + minuman - Number(s.bayarDiMuka) - Number(s.jaminan)
  }
  jumlahTransaksi += karaoke.length

  return {
    sewaTunai,
    sewaLainnya,
    barangTunai,
    barangLainnya,
    karaokeTunai,
    tunaiSistem: sewaTunai + barangTunai + karaokeTunai,
    totalMasuk: sewaTunai + sewaLainnya + barangTunai + barangLainnya + karaokeTunai,
    jumlahTransaksi,
  }
}
