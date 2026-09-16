// app/api/properti/route.ts
//
// Kelola properti milik sendiri: daftar, tambah, edit, nonaktifkan/aktifkan.
//
// Tidak ada DELETE — nonaktifkan (aktif=false) adalah satu-satunya cara
// "menghapus". Properti menampung kamar, sewa, tagihan, dan pengeluaran, jadi
// hapus permanen berarti kehilangan riwayat keuangan. Soft delete menjaga itu.
//
// Semua akses difilter `ownerId: userId` — properti tenant lain selalu 404.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const TIPE = ['KOS', 'KONTRAKAN', 'HOTEL', 'APARTEMEN'] as const

const propertiSchema = z.object({
  nama: z.string().trim().min(1, 'Nama properti wajib diisi'),
  tipe: z.enum(TIPE),
  alamat: z.string().trim().min(1, 'Alamat wajib diisi'),
  kota: z.string().trim().min(1, 'Kota wajib diisi'),
  provinsi: z.string().trim().min(1).default('Kalimantan Barat'),
  deskripsi: z.string().trim().optional(),
  fasilitas: z.array(z.string()).default([]),
  // Kontak & catatan nota. Batas panjang dijaga supaya nota cetak tak meluber
  // keluar kertas; nomor HP bukan email jadi tak divalidasi format ketat.
  noHp: z.string().trim().max(30, 'Nomor HP maksimal 30 karakter').optional(),
  teksNota: z.string().trim().max(500, 'Teks nota maksimal 500 karakter').optional(),
})

// Zod `.optional()` lolos string kosong — normalkan supaya tak tersimpan ""
// (kolom jadi NULL, bukan string kosong yang bikin tampilan blank).
const kosongJadiNull = (v?: string) => (v && v.length > 0 ? v : null)

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const properti = await prisma.properti.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, nama: true, tipe: true, alamat: true, kota: true, provinsi: true,
      deskripsi: true, fasilitas: true, noHp: true, teksNota: true,
      aktif: true, isDemo: true, createdAt: true,
      _count: { select: { kamar: true } },
    },
  })

  return NextResponse.json({ properti })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json().catch(() => null)
  const parsed = propertiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid' } },
      { status: 400 },
    )
  }

  const d = parsed.data
  const properti = await prisma.properti.create({
    data: {
      nama: d.nama,
      tipe: d.tipe,
      alamat: d.alamat,
      kota: d.kota,
      provinsi: d.provinsi,
      deskripsi: kosongJadiNull(d.deskripsi),
      fasilitas: d.fasilitas,
      noHp: kosongJadiNull(d.noHp),
      teksNota: kosongJadiNull(d.teksNota),
      ownerId: userId,
    },
  })

  return NextResponse.json({ properti }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json().catch(() => null)
  const id = body?.id
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: { message: 'id wajib diisi' } }, { status: 400 })
  }

  // Pastikan properti ini milik pemanggil — id tenant lain => 404.
  const ada = await prisma.properti.findFirst({ where: { id, ownerId: userId }, select: { id: true } })
  if (!ada) return NextResponse.json({ error: { message: 'Properti tidak ditemukan' } }, { status: 404 })

  // Dua mode: toggle aktif saja, atau edit data lengkap.
  if (typeof body?.aktif === 'boolean' && Object.keys(body).length === 2) {
    const properti = await prisma.properti.update({ where: { id }, data: { aktif: body.aktif } })
    return NextResponse.json({ properti })
  }

  const parsed = propertiSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid' } },
      { status: 400 },
    )
  }

  const d = parsed.data
  const properti = await prisma.properti.update({
    where: { id },
    data: {
      ...(d.nama !== undefined && { nama: d.nama }),
      ...(d.tipe !== undefined && { tipe: d.tipe }),
      ...(d.alamat !== undefined && { alamat: d.alamat }),
      ...(d.kota !== undefined && { kota: d.kota }),
      ...(d.provinsi !== undefined && { provinsi: d.provinsi }),
      ...(d.deskripsi !== undefined && { deskripsi: kosongJadiNull(d.deskripsi) }),
      ...(d.fasilitas !== undefined && { fasilitas: d.fasilitas }),
      // Kosong -> NULL, bukan "", supaya nota kembali ke teks bawaan tanpa
      // harus menebak apakah "" berarti "sengaja dikosongkan".
      ...(d.noHp !== undefined && { noHp: kosongJadiNull(d.noHp) }),
      ...(d.teksNota !== undefined && { teksNota: kosongJadiNull(d.teksNota) }),
    },
  })

  return NextResponse.json({ properti })
}
