// app/api/tagihan/[id]/bayar/route.ts
//
// Catat pembayaran satu tagihan: status LUNAS + baris Pembayaran, satu transaksi.
//
// Kenapa perlu: tagihan BELUM_BAYAR pada sewa yang sudah SELESAI tak punya
// jalan keluar dari UI — checkout hanya menawarkan "lunasi semua" SEBELUM sewa
// ditutup. Kalau dilewati (paksa), tagihan menggantung selamanya. Ini tombol
// penghapusnya, dari tab Keuangan, per tagihan.
//
// status WAJIB diubah ke LUNAS (bukan cuma baris Pembayaran): laporan pemasukan
// (app/api/keuangan/route.ts) menjumlahkan Tagihan berstatus LUNAS — tanpa ini
// uangnya tak muncul di laporan. Konsisten dengan blok `lunasi` di checkout.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { z } from 'zod'

const bayarSchema = z.object({
  // Pembayaran sebagian belum didukung (keputusan produk, sama dengan
  // checkout): lunas atau tidak sama sekali.
  metodeBayar: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']).default('TUNAI'),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id as string
  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = bayarSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  const tagihan = await prisma.tagihan.findUnique({
    where: { id },
    include: { sewa: { include: { kamar: true } } },
  })
  // 404 untuk tagihan properti lain (bukan 403) — jangan konfirmasi ke penebak
  // bahwa id itu ada di properti orang lain.
  if (!tagihan || tagihan.sewa.kamar.propertiId !== properti.id) {
    return NextResponse.json({ error: 'Tagihan tidak ditemukan.' }, { status: 404 })
  }

  if (tagihan.status === 'LUNAS') {
    return NextResponse.json({ error: 'Tagihan ini sudah lunas.' }, { status: 409 })
  }
  if (tagihan.status === 'DIBATALKAN') {
    return NextResponse.json({ error: 'Tagihan ini sudah dibatalkan.' }, { status: 409 })
  }

  const [pembayaran] = await prisma.$transaction([
    prisma.pembayaran.create({
      data: {
        tagihanId: tagihan.id,
        nominal: Number(tagihan.nominal),
        metodeBayar: d.metodeBayar,
        catatan: 'Dibayar dari tab Keuangan',
      },
    }),
    prisma.tagihan.update({
      where: { id: tagihan.id },
      data: { status: 'LUNAS' },
    }),
  ])

  return NextResponse.json({ ok: true, tagihanId: tagihan.id, pembayaranId: pembayaran.id })
}
