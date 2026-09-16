// app/api/tipe-kamar/route.ts
//
// Kelola tipe kamar per properti. Tipe adalah master data — kamar menunjuk ke
// salah satu baris di sini. Fasilitas pada tipe = bawaan (dipakai kamar yang
// belum diisi fasilitas sendiri).
//
// Hapus tidak menghapus kamar: relasi memakai onDelete: SetNull, jadi kamar
// yang memakai tipe itu menjadi "Tanpa tipe". Karena itu hapus selalu diizinkan
// selama tipenya milik properti yang sedang aktif.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import {
  NAMA_TIPE_MAKS, KETERANGAN_MAKS,
  rapikanFasilitas, kunciNama,
} from '@/lib/tipeKamar'
import { z } from 'zod'

const tipeSchema = z.object({
  nama: z.string().trim().min(1, 'Nama tipe wajib diisi.').max(NAMA_TIPE_MAKS),
  keterangan: z.string().trim().max(KETERANGAN_MAKS).optional(),
  fasilitas: z.array(z.string()).default([]),
  urutan: z.number().int().optional(),
})

async function konteks() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  return { properti }
}

export async function GET() {
  const k = await konteks()
  if (k.error) return k.error

  const tipe = await prisma.tipeKamar.findMany({
    where: { propertiId: k.properti.id },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    include: { _count: { select: { kamar: true } } },
  })
  return NextResponse.json({ tipe })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const parsed = tipeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }

  const { nama, keterangan, urutan } = parsed.data
  const fasilitas = rapikanFasilitas(parsed.data.fasilitas)

  // Unik per properti — tapi perbandingannya lewat kunci ternormalisasi supaya
  // "VIP" dan "vip " tak jadi dua baris berbeda di mata kasir.
  const ada = await prisma.tipeKamar.findMany({
    where: { propertiId: k.properti.id },
    select: { id: true, nama: true, urutan: true },
  })
  if (ada.some((t) => kunciNama(t.nama) === kunciNama(nama))) {
    return NextResponse.json({ error: { message: `Tipe "${nama}" sudah ada.` } }, { status: 409 })
  }

  const baris = await prisma.tipeKamar.create({
    data: {
      nama: nama.trim(),
      keterangan: keterangan?.trim() || null,
      fasilitas,
      // Tanpa urutan eksplisit, taruh di akhir daftar.
      urutan: urutan ?? (ada.length ? Math.max(...ada.map((t) => t.urutan ?? 0)) + 1 : 0),
      propertiId: k.properti.id,
    },
  })
  return NextResponse.json({ tipe: baris }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  // Tipe harus milik properti aktif — cegah ubah tipe properti lain lewat id.
  const lama = await prisma.tipeKamar.findFirst({ where: { id, propertiId: k.properti.id } })
  if (!lama) return NextResponse.json({ error: { message: 'Tipe tidak ditemukan.' } }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (body.nama !== undefined) {
    const parsed = tipeSchema.shape.nama.safeParse(body.nama)
    if (!parsed.success) {
      return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Nama tidak valid.' } }, { status: 400 })
    }
    const sama = await prisma.tipeKamar.findMany({
      where: { propertiId: k.properti.id, NOT: { id } },
      select: { nama: true },
    })
    if (sama.some((t) => kunciNama(t.nama) === kunciNama(parsed.data))) {
      return NextResponse.json({ error: { message: `Tipe "${parsed.data}" sudah ada.` } }, { status: 409 })
    }
    data.nama = parsed.data.trim()
  }

  if (body.keterangan !== undefined) {
    const ket = String(body.keterangan ?? '').trim()
    if (ket.length > KETERANGAN_MAKS) {
      return NextResponse.json({ error: { message: `Keterangan maksimal ${KETERANGAN_MAKS} karakter.` } }, { status: 400 })
    }
    data.keterangan = ket || null
  }

  // Fasilitas boleh dikosongkan (array kosong) — artinya tipe tak punya bawaan,
  // dan kamar yang belum diisi tampil tanpa fasilitas.
  if (body.fasilitas !== undefined) data.fasilitas = rapikanFasilitas(body.fasilitas)

  if (body.urutan !== undefined && Number.isInteger(body.urutan)) data.urutan = body.urutan

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { message: 'Tak ada yang diubah.' } }, { status: 400 })
  }

  const baris = await prisma.tipeKamar.update({ where: { id }, data })
  return NextResponse.json({ tipe: baris })
}

export async function DELETE(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.tipeKamar.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { _count: { select: { kamar: true } } },
  })
  if (!lama) return NextResponse.json({ error: { message: 'Tipe tidak ditemukan.' } }, { status: 404 })

  // Kamar tidak ikut terhapus (SetNull) — tapi kasir harus tahu berapa kamar
  // yang akan jadi "Tanpa tipe", supaya itu keputusan sadar, bukan kejutan.
  await prisma.tipeKamar.delete({ where: { id } })
  return NextResponse.json({ ok: true, kamarTerdampak: lama._count.kamar })
}
