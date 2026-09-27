// POST /api/booking/[id]/batal
//
// Batalkan booking PENDING — kamar kembali TERSEDIA. Dalam transaksi yang
// sama, tagihan yang belum dibayar dari booking ini jadi BATAL juga supaya
// laporan keuangan tak menghitung tagihan hantu.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { cekPinBatal, catatAktivitas } from '@/lib/pinBatal'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  // PIN & alasan wajib (kalau PIN sudah diatur di Pengaturan).
  const validasi = await cekPinBatal({ id: properti.id, pinBatal: properti.pinBatal }, body)
  if (!validasi.ok) return validasi.res

  const sewa = await prisma.sewa.findFirst({
    where: { id, kamar: { propertiId: properti.id } },
    select: { id: true, statusSewa: true, kamarId: true, kamar: { select: { nomor: true } } },
  })
  if (!sewa) return NextResponse.json({ error: 'Booking tidak ditemukan.' }, { status: 404 })
  if (sewa.statusSewa !== 'PENDING') {
    return NextResponse.json({ error: 'Hanya booking menunggu yang bisa dibatalkan.' }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.tagihan.updateMany({
      where: { sewaId: sewa.id, status: { in: ['BELUM_BAYAR', 'TERLAMBAT'] } },
      data: { status: 'DIBATALKAN' },
    })
    await tx.sewa.update({ where: { id }, data: { statusSewa: 'DIBATALKAN' } })
    const masihAktif = await tx.sewa.findFirst({
      where: { kamarId: sewa.kamarId, statusSewa: 'AKTIF' },
      select: { id: true },
    })
    if (!masihAktif) {
      await tx.kamar.update({ where: { id: sewa.kamarId }, data: { status: 'TERSEDIA' } })
    }
  })

  await catatAktivitas({
    propertiId: properti.id,
    userId: session.user.id as string,
    userEmail: session.user.email ?? null,
    aksi: 'BATAL_BOOKING',
    referensiId: sewa.id,
    alasan: validasi.alasan,
    detail: `Kamar ${sewa.kamar.nomor}`,
  })

  return NextResponse.json({ pesan: 'Booking dibatalkan.' })
}