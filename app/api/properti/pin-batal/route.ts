// POST /api/properti/pin-batal
//
// Atur PIN pembatalan (karaoke & booking) untuk properti aktif.
// - { pin: '1234' }          -> set/ubah (4-8 digit)
// - { pin: null }            -> hapus (batal tak lagi minta PIN)
// - { pin, pinLama }         -> ubah butuh PIN lama kalau sudah ada
//
// Hash bcrypt 10 putaran — sama seperti password user. GET hanya melaporkan
// ADA/TIDAK (nomor PIN tak pernah dikirim balik ke klien).
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })
  return NextResponse.json({ adaPin: !!properti.pinBatal })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)

  // Hapus PIN.
  if (body?.pin === null) {
    // Wajib PIN lama supaya tablet yang terbuka tak bisa diam-diam melepas
    // pengaman.
    if (properti.pinBatal) {
      const okLama = typeof body.pinLama === 'string' && await bcrypt.compare(body.pinLama, properti.pinBatal)
      if (!okLama) return NextResponse.json({ error: 'PIN lama salah.' }, { status: 403 })
    }
    await prisma.properti.update({ where: { id: properti.id }, data: { pinBatal: null } })
    return NextResponse.json({ pesan: 'PIN pembatalan dihapus.' })
  }

  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN harus 4-8 digit angka.' }, { status: 400 })
  }

  // Ubah PIN butuh PIN lama (kalau sudah ada PIN).
  if (properti.pinBatal) {
    const okLama = typeof body.pinLama === 'string' && await bcrypt.compare(body.pinLama, properti.pinBatal)
    if (!okLama) return NextResponse.json({ error: 'PIN lama salah.' }, { status: 403 })
  }

  const hash = await bcrypt.hash(pin, 10)
  await prisma.properti.update({ where: { id: properti.id }, data: { pinBatal: hash } })
  return NextResponse.json({ pesan: properti.pinBatal ? 'PIN pembatalan diganti.' : 'PIN pembatalan disimpan.' })
}
