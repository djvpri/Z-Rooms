// app/api/properti/aktif/route.ts
//
// Identitas properti yang sedang dibuka — dipakai client component untuk
// kepala & kaki nota cetak (mis. nota booking di halaman Booking). Halaman
// Booking adalah client component, jadi tak bisa memanggil propertiAktif()
// langsung seperti server component.
//
// Hanya field yang aman untuk nota; jangan perluas jadi endpoint properti penuh.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = await propertiAktif(session.user.id as string)
  if (!p) return NextResponse.json({ properti: null })

  return NextResponse.json({
    properti: {
      nama: p.nama,
      alamat: p.alamat,
      kota: p.kota,
      provinsi: p.provinsi,
      noHp: p.noHp,
      teksNota: p.teksNota,
    },
  })
}
