// app/api/shift/[id]/tutup/route.ts
//
// Tutup shift milik sendiri: input uang fisik (hitungan laci kasir) +
// catatan opsional. Selisih = uangFisik − (modalAwal + tunaiSistem) dihitung
// server dari rekap lib/shift.ts — kasir tak bisa menuliskan selisihnya
// sendiri. Shift orang lain ditolak (403): laci kasir itu tanggung jawab
// pribadi.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rekapShift } from '@/lib/shift'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string
  const { id } = await params

  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift || shift.userId !== userId) {
    return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 })
  }
  if (shift.status === 'TUTUP') {
    return NextResponse.json({ error: 'Shift sudah ditutup.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const uangFisik = Math.max(0, Math.round(Number(body?.uangFisik) || 0))
  const catatan = typeof body?.catatan === 'string' ? body.catatan.slice(0, 500) || null : null

  const rekap = await rekapShift(shift.propertiId, {
    gte: shift.mulaiPada,
    lte: new Date(),
  })
  const selisih = uangFisik - (Number(shift.modalAwal) + rekap.tunaiSistem)

  const updated = await prisma.shift.update({
    where: { id },
    data: { status: 'TUTUP', selesaiPada: new Date(), uangFisik, selisih, catatan },
  })
  return NextResponse.json({ shift: updated, rekap })
}
