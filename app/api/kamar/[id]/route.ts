// app/api/kamar/[id]/route.ts
//
// Ubah data kamar yang sudah ada: nomor, lantai, tipe, luas.
//
// `status` sengaja tidak ada di skemanya — lihat lib/kamar.ts.
//
// `propertiId` juga tidak ikut pindah: kamar milik properti tempat ia dibuat.
// Semua kueri disaring propertiId si pemanggil supaya id milik properti lain
// berakhir 404, bukan 403 yang membocorkan keberadaannya.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { updateKamarSchema } from '@/lib/kamar'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = updateKamarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Data kamar tidak valid.' } },
      { status: 400 },
    )
  }

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const lama = await prisma.kamar.findFirst({
    where: { id, propertiId: properti.id },
    select: { id: true, nomor: true },
  })
  if (!lama) {
    return NextResponse.json({ error: { message: 'Kamar tidak ditemukan.' } }, { status: 404 })
  }

  const { tipeId, ...sisa } = parsed.data

  // Tipe harus milik properti ini. Tanpa cek ini, tipeId properti lain akan
  // tersimpan dan kamar menampilkan tarif yang bukan miliknya.
  if (tipeId !== undefined) {
    const tipe = await prisma.tipeKamar.findFirst({
      where: { id: tipeId, propertiId: properti.id },
      select: { id: true },
    })
    if (!tipe) {
      return NextResponse.json(
        { error: { message: 'Tipe kamar tidak ditemukan di properti ini.' } },
        { status: 400 },
      )
    }
  }

  // Nomor unik per properti (@@unique([propertiId, nomor])). Cek kecuali dirinya
  // sendiri, supaya menyimpan tanpa mengubah nomor tidak ditolak sendiri.
  if (sisa.nomor !== undefined && sisa.nomor !== lama.nomor) {
    const bentrok = await prisma.kamar.findFirst({
      where: { propertiId: properti.id, nomor: sisa.nomor, id: { not: id } },
      select: { nomor: true },
    })
    if (bentrok) {
      return NextResponse.json(
        { error: { message: `Kamar ${sisa.nomor} sudah terdaftar di properti ini.` } },
        { status: 409 },
      )
    }
  }

  const kamar = await prisma.kamar.update({
    where: { id },
    data: {
      ...(tipeId !== undefined ? { tipeId } : {}),
      ...sisa,
    },
    include: { tipe: { select: { id: true, nama: true } } },
  })

  return NextResponse.json(kamar)
}
