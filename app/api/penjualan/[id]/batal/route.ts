// app/api/penjualan/[id]/batal/route.ts
//
// Batalkan penjualan. Barisnya TIDAK dihapus — statusnya jadi BATAL.
//
// Kenapa tak dihapus: laporan uang tak boleh berubah diam-diam di belakang.
// Penjualan yang hilang tanpa jejak membuat rekening kas tak bisa dicocokkan
// ("kok setoran beda Rp 5.000?") dan tak ada yang tahu siapa yang membatalkan.
//
// Stok dikembalikan saat batal. Tanpa itu, membatalkan penjualan akan
// meninggalkan stok terpotong untuk barang yang tak pernah keluar.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const alasan = typeof body?.alasan === 'string' ? body.alasan.trim().slice(0, 200) : ''

  const jual = await prisma.penjualan.findFirst({
    where: { id, propertiId: properti.id },
    include: { item: true },
  })
  if (!jual) return NextResponse.json({ error: { message: 'Penjualan tidak ditemukan.' } }, { status: 404 })
  if (jual.status === 'BATAL') {
    return NextResponse.json({ error: { message: 'Penjualan ini sudah dibatalkan.' } }, { status: 400 })
  }
  // Penjualan titipan kamar yang sudah dilunasi saat check-out tak boleh
  // dibatalkan di sini — uangnya sudah masuk dan tersambung ke nota sewa.
  if (jual.status === 'LUNAS' && jual.sewaId && jual.dibayarPada) {
    return NextResponse.json(
      { error: { message: 'Penjualan ini sudah dilunasi lewat check-out — koreksi lewat nota sewa, bukan dibatalkan di sini.' } },
      { status: 400 },
    )
  }

  try {
    const hasil = await prisma.$transaction(async (tx) => {
      const ubah = await tx.penjualan.update({
        where: { id },
        data: {
          status: 'BATAL',
          // Alasan disimpan di catatan supaya jejaknya terbaca di riwayat.
          catatan: alasan
            ? `${jual.catatan ? jual.catatan + ' | ' : ''}DIBATALKAN: ${alasan}`
            : `${jual.catatan ? jual.catatan + ' | ' : ''}DIBATALKAN`,
        },
        include: { item: true },
      })

      // Kembalikan stok, dijumlahkan per produk (keranjang bisa memuat produk
      // sama di dua baris).
      const perProduk = new Map<string, number>()
      for (const it of jual.item) perProduk.set(it.produkId, (perProduk.get(it.produkId) ?? 0) + it.jumlah)
      for (const [produkId, jumlah] of perProduk) {
        await tx.produk.update({ where: { id: produkId }, data: { stok: { increment: jumlah } } })
      }

      return ubah
    })

    return NextResponse.json({ penjualan: hasil, pesan: 'Penjualan dibatalkan, stok dikembalikan.' })
  } catch (err: unknown) {
    console.error('[penjualan/batal] error:', err)
    const pesan = err instanceof Error ? err.message : 'Terjadi kesalahan server'
    return NextResponse.json({ error: { message: pesan } }, { status: 500 })
  }
}
