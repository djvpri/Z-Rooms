// app/api/produk/route.ts
//
// Master data produk jualan (minuman/makanan) per properti. Pola sama dengan
// `fasilitas/route.ts`.
//
// Menghapus produk: kalau produk pernah terjual, barisnya TIDAK dihapus —
// di-nonaktifkan (`aktif:false`). ItemPenjualan menyimpan `produkId` sebagai
// relasi, jadi menghapus produk yang pernah terjual akan memutus riwayat struk.
// Produk yang belum pernah terjual boleh dihapus betulan.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { PRODUK_BAWAAN, kunciNama, produkSchema } from '@/lib/produk'
import { z } from 'zod'

// Kolom yang boleh diubah lewat PATCH. Semua opsional: kiriman sebagian
// (kasir cuma menyesuaikan stok) tak boleh menolak karena kolom lain kosong.
const ubahSchema = z.object({
  nama: produkSchema.shape.nama.optional(),
  hargaJual: produkSchema.shape.hargaJual.optional(),
  // nullish, bukan optional: null = kosongkan modal (memang boleh tak diketahui).
  hargaBeli: produkSchema.shape.hargaBeli,
  stok: produkSchema.shape.stok,
  satuan: produkSchema.shape.satuan,
  kategori: produkSchema.shape.kategori,
  aktif: produkSchema.shape.aktif,
  urutan: produkSchema.shape.urutan,
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

  const produk = await prisma.produk.findMany({
    where: { propertiId: k.properti.id, ...(hanyaAktif ? { aktif: true } : {}) },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
  })
  return NextResponse.json({ produk })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)

  // Tanpa body, isi dari daftar bawaan — sekali klik dapat produk siap pakai.
  if (body === null || body?.isiBawaan === true) {
    const ada = await prisma.produk.findMany({
      where: { propertiId: k.properti.id },
      select: { nama: true },
    })
    const sudah = new Set(ada.map((p) => kunciNama(p.nama)))
    const baru = PRODUK_BAWAAN.filter((p) => !sudah.has(kunciNama(p.nama)))
    if (baru.length === 0) {
      return NextResponse.json({ dibuat: 0, pesan: 'Daftar sudah terisi.' })
    }
    await prisma.produk.createMany({
      data: baru.map((p, i) => ({
        propertiId: k.properti.id,
        nama: p.nama,
        hargaJual: p.hargaJual,
        hargaBeli: p.hargaBeli,
        satuan: p.satuan,
        kategori: p.kategori,
        // Stok awal 0: pemilik mengisi hitungan fisiknya sendiri. Menebak angka
        // stok bawaan lebih berbahaya daripada mulai dari 0 — kasir akan
        // mempercayai angka yang tak pernah dihitung.
        stok: 0,
        urutan: ada.length + i,
      })),
      skipDuplicates: true,
    })
    return NextResponse.json({ dibuat: baru.length }, { status: 201 })
  }

  const parsed = produkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data
  const nama = d.nama.trim()

  const ada = await prisma.produk.findMany({
    where: { propertiId: k.properti.id },
    select: { nama: true, urutan: true },
  })
  if (ada.some((p) => kunciNama(p.nama) === kunciNama(nama))) {
    return NextResponse.json({ error: { message: `Produk "${nama}" sudah ada.` } }, { status: 409 })
  }

  const baris = await prisma.produk.create({
    data: {
      propertiId: k.properti.id,
      nama,
      hargaJual: d.hargaJual,
      hargaBeli: d.hargaBeli ?? null,
      stok: d.stok ?? 0,
      satuan: d.satuan?.trim() || 'pcs',
      kategori: d.kategori?.trim() || null,
      aktif: d.aktif ?? true,
      urutan: d.urutan ?? (ada.length ? Math.max(...ada.map((p) => p.urutan)) + 1 : 0),
    },
  })
  return NextResponse.json({ produk: baris }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.produk.findFirst({ where: { id, propertiId: k.properti.id } })
  if (!lama) return NextResponse.json({ error: { message: 'Produk tidak ditemukan.' } }, { status: 404 })

  const parsed = ubahSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  const data: Record<string, unknown> = {}

  if (d.nama !== undefined) {
    const nama = d.nama.trim()
    const sama = await prisma.produk.findMany({
      where: { propertiId: k.properti.id, NOT: { id } },
      select: { nama: true },
    })
    if (sama.some((p) => kunciNama(p.nama) === kunciNama(nama))) {
      return NextResponse.json({ error: { message: `Produk "${nama}" sudah ada.` } }, { status: 409 })
    }
    data.nama = nama
  }

  if (d.hargaJual !== undefined) data.hargaJual = d.hargaJual
  // `null` eksplisit = kosongkan modal. `undefined` = jangan diubah.
  if (d.hargaBeli !== undefined) data.hargaBeli = d.hargaBeli ?? null
  if (d.stok !== undefined) data.stok = d.stok
  if (d.satuan !== undefined) data.satuan = d.satuan.trim() || 'pcs'
  if (d.kategori !== undefined) data.kategori = d.kategori?.trim() || null
  if (d.aktif !== undefined) data.aktif = d.aktif
  if (d.urutan !== undefined) data.urutan = d.urutan

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { message: 'Tak ada yang diubah.' } }, { status: 400 })
  }

  const baris = await prisma.produk.update({ where: { id }, data })
  return NextResponse.json({ produk: baris })
}

export async function DELETE(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.produk.findFirst({
    where: { id, propertiId: k.properti.id },
    include: { _count: { select: { item: true } } },
  })
  if (!lama) return NextResponse.json({ error: { message: 'Produk tidak ditemukan.' } }, { status: 404 })

  // Sudah pernah terjual -> jangan putus riwayat struk. Nonaktifkan saja.
  if (lama._count.item > 0) {
    const baris = await prisma.produk.update({ where: { id }, data: { aktif: false } })
    return NextResponse.json({
      ok: true,
      dinonaktifkan: true,
      produk: baris,
      pesan: `"${lama.nama}" pernah terjual ${lama._count.item} kali — dinonaktifkan, bukan dihapus, supaya riwayat penjualan tetap utuh.`,
    })
  }

  await prisma.produk.delete({ where: { id } })
  return NextResponse.json({ ok: true, dihapus: true })
}
