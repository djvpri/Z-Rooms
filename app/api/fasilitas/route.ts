// app/api/fasilitas/route.ts
//
// Master data daftar fasilitas per properti. Sebelumnya saran fasilitas
// hardcoded di lib/tipeKamar.ts (SARAN_FASILITAS) — semua properti terpaksa
// menawarkan daftar yang sama dan ejaannya gampang beda ("WiFi" vs "Wifi").
//
// Menghapus baris di sini JUGA mencabut nama tersebut dari `TipeKamar.fasilitas`
// dan `Kamar.fasilitas` yang memakainya. Itu keputusan pemilik proyek, diambil
// saat data masih dummy; kalau nanti ada kamar yang sudah disewa, ganti jadi
// nonaktif (`aktif:false`) saja — menyembunyikan tanpa menyentuh data.
// Ganti nama (PATCH) tetap TIDAK menyentuh tipe/kamar.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { NAMA_FASILITAS_MAKS, kunciNama, SARAN_FASILITAS } from '@/lib/tipeKamar'
import { z } from 'zod'

const fasilitasSchema = z.object({
  nama: z.string().trim().min(1, 'Nama fasilitas wajib diisi.').max(NAMA_FASILITAS_MAKS),
  urutan: z.number().int().optional(),
  aktif: z.boolean().optional(),
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

  const fasilitas = await prisma.fasilitas.findMany({
    where: { propertiId: k.properti.id },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
  })
  return NextResponse.json({ fasilitas })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)

  // Tanpa body, isi daftar dari saran bawaan. Dipakai properti lama yang baru
  // membuka tab Fasilitas: sekali klik langsung dapat daftar siap pakai,
  // bukan halaman kosong.
  if (body === null || body?.isiBawaan === true) {
    const ada = await prisma.fasilitas.findMany({
      where: { propertiId: k.properti.id },
      select: { nama: true },
    })
    const sudah = new Set(ada.map((f) => kunciNama(f.nama)))
    const baru = SARAN_FASILITAS.filter((n) => !sudah.has(kunciNama(n)))
    if (baru.length === 0) {
      return NextResponse.json({ dibuat: 0, pesan: 'Daftar sudah terisi.' })
    }
    await prisma.fasilitas.createMany({
      data: baru.map((nama, i) =>
        ({ nama, urutan: ada.length + i, propertiId: k.properti.id })),
      skipDuplicates: true,
    })
    return NextResponse.json({ dibuat: baru.length }, { status: 201 })
  }

  const parsed = fasilitasSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }

  const nama = parsed.data.nama.trim()
  const ada = await prisma.fasilitas.findMany({
    where: { propertiId: k.properti.id },
    select: { nama: true, urutan: true },
  })
  if (ada.some((f) => kunciNama(f.nama) === kunciNama(nama))) {
    return NextResponse.json({ error: { message: `Fasilitas "${nama}" sudah ada.` } }, { status: 409 })
  }

  const baris = await prisma.fasilitas.create({
    data: {
      nama,
      urutan: parsed.data.urutan ?? (ada.length ? Math.max(...ada.map((f) => f.urutan ?? 0)) + 1 : 0),
      aktif: parsed.data.aktif ?? true,
      propertiId: k.properti.id,
    },
  })
  return NextResponse.json({ fasilitas: baris }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.fasilitas.findFirst({ where: { id, propertiId: k.properti.id } })
  if (!lama) return NextResponse.json({ error: { message: 'Fasilitas tidak ditemukan.' } }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (body.nama !== undefined) {
    const parsed = fasilitasSchema.shape.nama.safeParse(body.nama)
    if (!parsed.success) {
      return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Nama tidak valid.' } }, { status: 400 })
    }
    const nama = parsed.data.trim()
    const sama = await prisma.fasilitas.findMany({
      where: { propertiId: k.properti.id, NOT: { id } },
      select: { nama: true },
    })
    if (sama.some((f) => kunciNama(f.nama) === kunciNama(nama))) {
      return NextResponse.json({ error: { message: `Fasilitas "${nama}" sudah ada.` } }, { status: 409 })
    }
    data.nama = nama
    // Catatan: ganti nama di sini TIDAK menulis ulang `TipeKamar.fasilitas` /
    // `Kamar.fasilitas`. Keduanya String[] bebas, dan menuliskannya massal
    // berisiko mengubah kamar yang sudah disewa. Kalau memang mau seragam,
    // hapus lalu tambah ulang di tipe yang bersangkutan.
  }

  if (body.urutan !== undefined && Number.isInteger(body.urutan)) data.urutan = body.urutan
  if (body.aktif !== undefined) data.aktif = Boolean(body.aktif)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { message: 'Tak ada yang diubah.' } }, { status: 400 })
  }

  const baris = await prisma.fasilitas.update({ where: { id }, data })
  return NextResponse.json({ fasilitas: baris })
}

export async function DELETE(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: { message: 'id wajib diisi.' } }, { status: 400 })

  const lama = await prisma.fasilitas.findFirst({ where: { id, propertiId: k.properti.id } })
  if (!lama) return NextResponse.json({ error: { message: 'Fasilitas tidak ditemukan.' } }, { status: 404 })

  // Cabut sekalian dari tipe & kamar (pemilik memilih ini: datanya masih
  // dummy dan tak mau "WiFi" yatim menempel di kamar).
  //
  // `has: lama.nama` TIDAK dipakai: Postgres membandingkan elemen array
  // secara case-sensitive, jadi "wifi" akan lolos dan tertinggal. Kita saring
  // sendiri dengan kunciNama supaya cocoknya sama dengan aturan saat menambah.
  const kunci = kunciNama(lama.nama)

  const [tipeDipakai, kamarDipakai] = await Promise.all([
    prisma.tipeKamar.findMany({
      where: { propertiId: k.properti.id },
      select: { id: true, fasilitas: true },
    }),
    prisma.kamar.findMany({
      where: { propertiId: k.properti.id },
      select: { id: true, fasilitas: true },
    }),
  ])

  const tipeKena = tipeDipakai.filter((t) => t.fasilitas.some((f) => kunciNama(f) === kunci))
  const kamarKena = kamarDipakai.filter((r) => r.fasilitas.some((f) => kunciNama(f) === kunci))

  // Transaksi: kalau salah satu gagal, jangan tinggalkan saran terhapus
  // sementara kamar masih menyebutnya.
  await prisma.$transaction([
    ...tipeKena.map((t) =>
      prisma.tipeKamar.update({
        where: { id: t.id },
        data: { fasilitas: t.fasilitas.filter((f) => kunciNama(f) !== kunci) },
      }),
    ),
    ...kamarKena.map((r) =>
      prisma.kamar.update({
        where: { id: r.id },
        data: { fasilitas: r.fasilitas.filter((f) => kunciNama(f) !== kunci) },
      }),
    ),
    prisma.fasilitas.delete({ where: { id } }),
  ])

  return NextResponse.json({
    ok: true,
    dicabut: { tipe: tipeKena.length, kamar: kamarKena.length },
  })
}
