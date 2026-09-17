// app/api/tipe-kamar/route.ts
//
// Kelola tipe kamar per properti. Tipe adalah master data — kamar menunjuk ke
// salah satu baris di sini. Dua hal melekat pada tipe:
//
//   - FASILITAS: bawaan tipe, dipakai kamar yang belum diisi fasilitas sendiri.
//   - HARGA: tarif sewa per periode (HargaTipe). Kamar tak punya harga sendiri
//     lagi, jadi menaikkan tarif Standar cukup di sini.
//
// Hapus tipe TIDAK menghapus kamar: kamar yang memakainya dipindahkan ke tipe
// lain milik properti yang sama dulu (relasi `tipeId` wajib). Tipe terakhir
// tidak boleh dihapus — properti harus selalu punya minimal satu tipe.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import {
  NAMA_TIPE_MAKS, KETERANGAN_MAKS, HARGA_MAKS, PERIODE_SEWA,
  rapikanFasilitas, kunciNama,
} from '@/lib/tipeKamar'
import { z } from 'zod'

const hargaSchema = z.object({
  periodeSewa: z.enum(PERIODE_SEWA),
  harga: z.number().int().min(0).max(HARGA_MAKS),
  deposit: z.number().int().min(0).max(HARGA_MAKS).optional(),
  aktif: z.boolean().optional(),
})

const tipeSchema = z.object({
  nama: z.string().trim().min(1, 'Nama tipe wajib diisi.').max(NAMA_TIPE_MAKS),
  keterangan: z.string().trim().max(KETERANGAN_MAKS).optional(),
  fasilitas: z.array(z.string()).default([]),
  harga: z.array(hargaSchema).default([]),
  urutan: z.number().int().optional(),
})

/**
 * Tulis ulang daftar harga tipe: baris yang dikirim di-upsert, periode yang
 * tidak ikut dikirim dihapus. Cara ini bikin form harga bisa "kosongkan kolom
 * Bulanan" tanpa perlu endpoint hapus terpisah.
 */

async function simpanHarga(tipeKamarId: string, daftar: z.infer<typeof hargaSchema>[]) {
  const periodeDikirim = new Set(daftar.map(h => h.periodeSewa))
  for (const h of daftar) {
    await prisma.hargaTipe.upsert({
      where: { tipeKamarId_periodeSewa: { tipeKamarId, periodeSewa: h.periodeSewa } },
      create: {
        tipeKamarId,
        periodeSewa: h.periodeSewa,
        harga: h.harga,
        deposit: h.deposit ?? null,
        aktif: h.aktif ?? true,
      },
      update: {
        harga: h.harga,
        deposit: h.deposit ?? null,
        aktif: h.aktif ?? true,
      },
    })
  }
  const takDikirim = PERIODE_SEWA.filter(p => !periodeDikirim.has(p))
  if (takDikirim.length > 0) {
    await prisma.hargaTipe.deleteMany({
      where: { tipeKamarId, periodeSewa: { in: [...takDikirim] } },
    })
  }
}

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
    include: {
      _count: { select: { kamar: true } },
      harga: { orderBy: { periodeSewa: 'asc' } },
    },
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
  if (parsed.data.harga.length > 0) await simpanHarga(baris.id, parsed.data.harga)
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

  let adaHarga = false
  if (body.harga !== undefined) {
    const parsed = z.array(hargaSchema).safeParse(body.harga)
    if (!parsed.success) {
      return NextResponse.json({ error: { message: 'Daftar harga tidak valid.' } }, { status: 400 })
    }
    await simpanHarga(id, parsed.data)
    adaHarga = true
  }

  if (Object.keys(data).length === 0 && !adaHarga) {
    return NextResponse.json({ error: { message: 'Tak ada yang diubah.' } }, { status: 400 })
  }

  const baris = Object.keys(data).length > 0
    ? await prisma.tipeKamar.update({ where: { id }, data })
    : lama
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

  // Kamar yang memakai tipe ini harus pindah dulu — `tipeId` wajib, jadi
  // menghapus tanpa memindahkan akan menabrak foreign key. Tipe pengganti:
  // tipe terdekat milik properti yang sama.
  if (lama._count.kamar > 0) {
    const pengganti = await prisma.tipeKamar.findFirst({
      where: { propertiId: k.properti.id, NOT: { id } },
      orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
      select: { id: true, nama: true },
    })
    if (!pengganti) {
      return NextResponse.json(
        { error: { message: 'Ini satu-satunya tipe kamar. Buat tipe lain dulu sebelum menghapus.' } },
        { status: 409 },
      )
    }
    await prisma.kamar.updateMany({
      where: { tipeId: id, propertiId: k.properti.id },
      data: { tipeId: pengganti.id },
    })
    await prisma.tipeKamar.delete({ where: { id } })
    return NextResponse.json({ ok: true, kamarDipindah: lama._count.kamar, keTipe: pengganti.nama })
  }

  await prisma.tipeKamar.delete({ where: { id } })
  return NextResponse.json({ ok: true, kamarDipindah: 0 })
}
