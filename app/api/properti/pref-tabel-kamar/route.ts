// app/api/properti/pref-tabel-kamar/route.ts
//
// Preferensi tampilan tabel kamar (kolom yang tampil + urutan), per properti.
//
// Dipisah dari PATCH /api/properti karena bentuk datanya beda: ini bukan field
// properti yang diisi pemilik lewat form, melainkan setelan tampilan yang
// ditulis tabel sendiri tiap kali kasir mengubah kolom/urutan. Menggabungkannya
// akan membuat form properti ikut menyimpan setelan tabel (dan sebaliknya).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

/** Batas panjang. Preferensi ini daftar kunci kolom, bukan data bebas. */
const MAKS = 500

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ pref: null })

  return NextResponse.json({ pref: p.prefTabelKamar ?? null })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  const body = await req.json().catch(() => null)
  const pref = body?.pref
  if (typeof pref !== 'string' || pref.length > MAKS) {
    return NextResponse.json({ error: { message: 'Preferensi tidak valid' } }, { status: 400 })
  }

  await prisma.properti.update({ where: { id: p.id }, data: { prefTabelKamar: pref } })
  return NextResponse.json({ ok: true })
}

/** Kembali ke tampilan bawaan. NULL, bukan string kosong — halaman membedakan
 *  "belum pernah diatur" dari "diatur ke kosong". */
export async function DELETE() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  await prisma.properti.update({ where: { id: p.id }, data: { prefTabelKamar: null } })
  return NextResponse.json({ ok: true })
}
