// app/(dashboard)/penjualan-barang/page.tsx
//
// Halaman kasir penjualan barang (minuman/makanan). Server component: memuat
// produk & penjualan bulan ini, lalu menyerahkan interaksinya ke KasirJual.
//
// Ini jalur uang KEDUA di samping Keuangan (sewa). Penjualan tak lewat model
// Tagihan — lihat catatan di lib/produk.ts.
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { endOfMonth, startOfMonth } from 'date-fns'
import KasirJual from './KasirJual'

export const dynamic = 'force-dynamic'

export default async function PenjualanBarangPage({
  searchParams,
}: { searchParams: Promise<{ sewa?: string }> }) {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>
  const { sewa: sewaAwal } = await searchParams

  const now = new Date()
  const bulanIni = { gte: startOfMonth(now), lte: endOfMonth(now) }

  const [produk, penjualan, kamarTerisi] = await Promise.all([
    // Hanya yang aktif: produk nonaktif tak boleh muncul di kasir.
    prisma.produk.findMany({
      where: { propertiId: properti.id, aktif: true },
      orderBy: [{ kategori: 'asc' }, { urutan: 'asc' }, { nama: 'asc' }],
      select: {
        id: true, nama: true, hargaJual: true, stok: true,
        satuan: true, kategori: true,
      },
    }),

    prisma.penjualan.findMany({
      where: { propertiId: properti.id, createdAt: bulanIni },
      include: {
        item: { select: { id: true, namaProduk: true, jumlah: true, hargaSatuan: true } },
        sewa: { select: { kamar: { select: { nomor: true } }, penyewa: { select: { nama: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),

    // Kamar berpenghuni — tujuan titipan barang. Hanya sewa AKTIF: menitipkan
    // ke booking yang belum check-in tak punya alamat penagihan yang jelas.
    prisma.sewa.findMany({
      where: { statusSewa: 'AKTIF', kamar: { propertiId: properti.id } },
      select: {
        id: true,
        kamar: { select: { nomor: true } },
        penyewa: { select: { nama: true } },
      },
      orderBy: { kamar: { nomor: 'asc' } },
    }),
  ])

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Penjualan Barang</h1>
        <p className="text-sm text-gray-400">Jual minuman, makanan, dan kebutuhan harian</p>
      </div>

      <KasirJual
        notaProperti={{
          nama: properti.nama,
          alamat: properti.alamat,
          kota: properti.kota,
          noHp: properti.noHp,
        }}
        produk={produk.map(p => ({
          id: p.id,
          nama: p.nama,
          hargaJual: Number(p.hargaJual),
          stok: p.stok,
          satuan: p.satuan,
          kategori: p.kategori,
        }))}
        kamar={kamarTerisi.map(s => ({
          sewaId: s.id,
          nomor: s.kamar.nomor,
          penyewa: s.penyewa?.nama ?? null,
        }))}
        riwayat={penjualan.map(p => ({
          id: p.id,
          nomor: p.nomor,
          total: Number(p.total),
          status: p.status,
          metodeBayar: p.metodeBayar,
          tanggal: p.createdAt.toISOString(),
          kamar: p.sewa?.kamar.nomor ?? null,
          penyewa: p.sewa?.penyewa?.nama ?? null,
          item: p.item.map(it => ({
            id: it.id,
            nama: it.namaProduk,
            jumlah: it.jumlah,
            hargaSatuan: Number(it.hargaSatuan),
          })),
        }))}
        tujuanAwal={sewaAwal ?? ''}
      />
    </div>
  )
}
