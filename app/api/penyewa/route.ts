// app/api/penyewa/route.ts
//
// Pencarian penyewa untuk form booking: kasir memilih orang lama alih-alih
// mengetik ulang data. Cakupan sengaja dibatasi ke penyewa yang pernah punya
// sewa di properti aktif — bukan seluruh tabel Penyewa.
//
// Alasan: satu owner bisa punya beberapa properti, dan penyewa properti lain
// bukan urusan kasir ini. Menampilkan semuanya membocorkan daftar penghuni
// lintas properti.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }

  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ data: [] })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ data: [] })

  const penyewa = await prisma.penyewa.findMany({
    where: {
      // Wajib ada sewa di properti ini — tak menampilkan penyewa properti lain.
      sewa: { some: { kamar: { propertiId: properti.id } } },
      OR: [
        { nama: { contains: q, mode: 'insensitive' } },
        { nik: { contains: q } },
        { noHp: { contains: q } },
      ],
    },
    select: {
      id: true, nama: true, nik: true, noHp: true, pekerjaan: true,
      email: true, alamatAsal: true, tipeEntitas: true,
      namaPerusahaan: true, npwp: true,
      _count: { select: { sewa: true } },
    },
    orderBy: { nama: 'asc' },
    take: 10,
  })

  return NextResponse.json({
    data: penyewa.map(p => ({
      id: p.id,
      nama: p.nama,
      nik: p.nik,
      noHp: p.noHp,
      pekerjaan: p.pekerjaan,
      email: p.email,
      alamatAsal: p.alamatAsal,
      tipeEntitas: p.tipeEntitas,
      namaPerusahaan: p.namaPerusahaan,
      npwp: p.npwp,
      jumlahSewa: p._count.sewa,
    })),
  })
}
