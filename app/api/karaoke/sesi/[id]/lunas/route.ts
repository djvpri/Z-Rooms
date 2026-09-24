// app/api/karaoke/sesi/[id]/lunas/route.ts
//
// Tandai sesi karaoke yang belum lunas (piutang) sebagai sudah dibayar.
// Dipakai dari panel piutang di papan karaoke — kasir menagih pelanggan
// yang pulang dulu.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const { id } = await params

  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId: properti.id },
  })
  if (!sesi) return NextResponse.json({ error: { message: 'Sesi tidak ditemukan.' } }, { status: 404 })
  if (sesi.status !== 'SELESAI') {
    return NextResponse.json({ error: { message: 'Hanya sesi selesai yang bisa ditandai lunas.' } }, { status: 409 })
  }
  if (sesi.lunas) {
    return NextResponse.json({ error: { message: 'Sesi sudah lunas.' } }, { status: 409 })
  }

  const sekarang = new Date()
  const diperbarui = await prisma.sesiKaraoke.update({
    where: { id },
    data: { lunas: true, dibayarPada: sekarang },
    include: { ruang: { select: { id: true, nama: true } } },
  })

  return NextResponse.json({ sesi: diperbarui })
}