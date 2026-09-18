// app/api/properti/pref-cetak/route.ts
//
// Setelan cetak nota: ukuran kertas, jenis koneksi, printer terakhir.
//
// Dipisah dari PATCH /api/properti dengan alasan yang sama seperti
// pref-tabel-kamar: ini bukan field yang diisi pemilik lewat form properti,
// melainkan setelan perangkat yang ditulis halaman Pengaturan → Cetak.
// Menggabungkannya akan membuat form properti ikut menyimpan setelan printer.
//
// Per-PROPERTI, bukan per-user: satu meja kasir satu printer, dan semua staf
// properti itu harus mencetak dengan setelan yang sama.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { PREF_CETAK_BAWAAN, bacaPrefCetak, bacaPrefCetakMentah, keStringPrefCetak, NAMA_PRINTER_MAKS } from '@/lib/cetak'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  // Selalu mengembalikan objek LENGKAP. Halaman tak perlu tahu bedanya "belum
  // diatur" dan "diatur ke nilai bawaan" — kedua kasus menghasilkan cetakan
  // yang sama, jadi membedakannya cuma menambah cabang di UI.
  return NextResponse.json({ pref: bacaPrefCetakMentah(p.prefCetak) })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { message: 'Data tidak valid' } }, { status: 400 })
  }

  // `bacaPrefCetak` membuang field tak dikenal dan menggantinya dengan bawaan.
  // Jadi kiriman yang mengada-ada tak pernah masuk DB — yang tersimpan selalu
  // berbentuk sama, dan halaman berikutnya tak perlu menangani kejutan.
  const pref = bacaPrefCetak(body.pref)

  // Nama printer dipotong di `bacaPrefCetak`, tapi periksa di sini juga supaya
  // pesannya jelas ke pengguna, bukan diam-diam terpotong.
  if (pref.printer.length >= NAMA_PRINTER_MAKS) {
    return NextResponse.json(
      { error: { message: `Nama printer maksimal ${NAMA_PRINTER_MAKS} karakter.` } },
      { status: 400 },
    )
  }

  await prisma.properti.update({ where: { id: p.id }, data: { prefCetak: keStringPrefCetak(pref) } })
  return NextResponse.json({ ok: true, pref })
}

/** Kembali ke bawaan. NULL, bukan JSON bawaan — halaman membedakan "belum
 *  pernah diatur" dari "diatur", dan reset harus benar-benar melepas. */
export async function DELETE() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  await prisma.properti.update({ where: { id: p.id }, data: { prefCetak: null } })
  return NextResponse.json({ ok: true, pref: PREF_CETAK_BAWAAN })
}
