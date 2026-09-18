// app/api/karaoke/ruang/route.ts
//
// Master data ruang karaoke per properti. Pola sama dengan `produk/route.ts`.
//
// Bedanya: ruang TIDAK boleh dihapus kalau punya riwayat sesi — riwayat struk
// memuat nomor ruang. Ruang yang pernah dipakai dinonaktifkan; yang belum
// pernah dipakai boleh dihapus betulan (blok tarifnya ikut via onDelete: Cascade).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { ruangSchema } from '@/lib/karaoke'
import { z } from 'zod'

const ubahSchema = z.object({
  nama: ruangSchema.shape.nama.optional(),
  kapasitas: ruangSchema.shape.kapasitas,
  aktif: z.boolean().optional(),
  urutan: z.number().int().optional(),
})

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

export async function GET(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const hanyaAktif = new URL(req.url).searchParams.get('aktif') !== 'semua'

  const ruang = await prisma.ruangKaraoke.findMany({
    where: { propertiId: k.properti.id, ...(hanyaAktif ? { aktif: true } : {}) },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    include: { tarif: { orderBy: { jamMulai: 'asc' } } },
  })
  return NextResponse.json({ ruang })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const parsed = ruangSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data
  const nama = d.nama.trim()

  const ada = await prisma.ruangKaraoke.findMany({
    where: { propertiId: k.properti.id },
    select: { nama: true, urutan: true },
  })
  if (ada.some((r) => r.nama.trim().toLowerCase() === nama.toLowerCase())) {
    return NextResponse.json({ error: { message: `Ruang "${nama}" sudah ada.` } }, { status: 409 })
  }

  const baris = await prisma.ruangKaraoke.create({
    data: {
      propertiId: k.properti.id,
      nama,
      kapasitas: d.kapasitas ?? null,
      aktif: d.aktif ?? true,
      urutan: d.urutan ?? (ada.length ? Math.max(...ada.map((r) => r.urutan)) + 1 : 0),
    },
    include: { tarif: true },
  })
  return NextResponse.json({ ruang: baris }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.ruangKaraoke.findFirst({ where: { id, propertiId: k.properti.id } })
  if (!lama) return NextResponse.json({ error: { message: 'Ruang tidak ditemukan.' } }, { status: 404 })

  const parsed = ubahSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data
  const data: Record<string, unknown> = {}

  if (d.nama !== undefined) {
    const nama = d.nama.trim()
    const sama = await prisma.ruangKaraoke.findMany({
      where: { propertiId: k.properti.id, NOT: { id } },
      select: { nama: true },
    })
    if (sama.some((r) => r.nama.trim().toLowerCase() === nama.toLowerCase())) {
      return NextResponse.json({ error: { message: `Ruang "${nama}" sudah ada.` } }, { status: 409 })
    }
    data.nama = nama
  }

  if (d.kapasitas !== undefined) data.kapasitas = d.kapasitas ?? null
  if (d.aktif !== undefined) data.aktif = d.aktif
  if (d.urutan !== undefined) data.urutan = d.urutan

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { message: 'Tak ada yang diubah.' } }, { status: 400 })
  }

  const baris = await prisma.ruangKaraoke.update({ where: { id }, data })
  return NextResponse.json({ ruang: baris })
}

export async function DELETE(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.ruangKaraoke.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { _count: { select: { sesi: true } } },
  })
  if (!lama) return NextResponse.json({ error: { message: 'Ruang tidak ditemukan.' } }, { status: 404 })

  // Pernah dipakai -> nonaktifkan, jangan putus riwayat sesi & struk.
  if (lama._count.sesi > 0) {
    const baris = await prisma.ruangKaraoke.update({ where: { id }, data: { aktif: false } })
    return NextResponse.json({
      ok: true,
      dinonaktifkan: true,
      ruang: baris,
      pesan: `"${lama.nama}" pernah dipakai ${lama._count.sesi} sesi — dinonaktifkan, bukan dihapus, supaya riwayat struk tetap utuh.`,
    })
  }

  await prisma.ruangKaraoke.delete({ where: { id } })
  return NextResponse.json({ ok: true, dihapus: true })
}
