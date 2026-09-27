// GET /api/log-aktivitas — 50 aksi terbaru properti aktif.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const log = await prisma.logAktivitas.findMany({
    where: { propertiId: properti.id },
    orderBy: { wktPada: 'desc' },
    take: 50,
  })
  return NextResponse.json({ log })
}
