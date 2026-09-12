// app/api/properti/aktif/route.ts
// Pilih properti aktif (disimpan di cookie). Hanya boleh memilih properti
// milik sendiri — id properti orang lain ditolak, bukan diam-diam diterima.
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COOKIE_PROPERTI } from '@/lib/properti'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json().catch(() => null)
  const propertiId = body?.propertiId
  if (typeof propertiId !== 'string' || !propertiId) {
    return NextResponse.json({ error: 'propertiId wajib diisi' }, { status: 400 })
  }

  // Cek kepemilikan — jangan pernah percaya propertiId dari klien.
  const properti = await prisma.properti.findFirst({ where: { id: propertiId, ownerId: userId } })
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  ;(await cookies()).set(COOKIE_PROPERTI, properti.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ success: true, properti: { id: properti.id, nama: properti.nama } })
}
