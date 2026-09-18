// app/api/karaoke/sesi/[id]/batal/route.ts
//
// Batalkan sesi. Dua hal yang dilakukan:
//   1. Status jadi BATAL — baris TIDAK dihapus, riwayat uang harus tetap ada.
//   2. Stok minuman yang sudah ditebus DIKEMBALIKAN (increment), dalam transaksi
//      yang sama. Pola sama dengan `penjualan/[id]/batal/route.ts`.
//
// Sesi yang sudah SELESAI tak bisa dibatalkan di sini: uangnya sudah masuk dan
// struknya sudah tercetak. Koreksi sesi selesai dilakukan lewat catatan, bukan
// dengan menghapus riwayat. (Jalur koreksi uang yang benar belum ada di repo ini
// untuk jalur mana pun — karaoke mengikuti aturan yang sama, bukan bikin
// pengecualian.)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (k.error) return k.error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const alasan = typeof body?.catatan === 'string' ? body.catatan.trim().slice(0, 200) : ''

  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { minuman: true },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })
  if (sesi.status === 'BATAL') return NextResponse.json({ error: { message: 'Sesi sudah dibatalkan.' } }, { status: 409 })
  if (sesi.status === 'SELESAI') {
    return NextResponse.json(
      { error: { message: 'Sesi sudah selesai dan uangnya sudah masuk — tak bisa dibatalkan. Catat koreksinya di catatan.' } },
      { status: 409 },
    )
  }

  // Jumlahkan per produk dulu: satu produk bisa muncul di dua baris, dan
  // increment dua kali terpisah tetap benar, tapi digabung lebih mudah dibaca
  // dan menjaga pola yang sama dengan jalur penjualan.
  const perProduk = new Map<string, number>()
  for (const m of sesi.minuman) {
    perProduk.set(m.produkId, (perProduk.get(m.produkId) ?? 0) + m.jumlah)
  }

  const hasil = await prisma.$transaction(async (tx) => {
    for (const [produkId, jumlah] of perProduk) {
      await tx.produk.update({ where: { id: produkId }, data: { stok: { increment: jumlah } } })
    }
    return tx.sesiKaraoke.update({
      where: { id },
      data: {
        status: 'BATAL',
        catatan: alasan ? `DIBATALKAN: ${alasan}` : 'DIBATALKAN',
      },
    })
  })

  return NextResponse.json({
    sesi: hasil,
    stokDikembalikan: perProduk.size,
    pesan: perProduk.size
      ? `Sesi dibatalkan. Stok ${perProduk.size} produk dikembalikan.`
      : 'Sesi dibatalkan.',
  })
}
