// app/api/booking/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { addDays, addMonths, addYears } from 'date-fns'

const bookingSchema = z.object({
  // Penyewa
  nama: z.string().min(2),
  nik: z.string().optional(),
  noHp: z.string().min(10),
  pekerjaan: z.string().optional(),
  tipeEntitas: z.enum(['INDIVIDU', 'PERUSAHAAN']).default('INDIVIDU'),
  namaPerusahaan: z.string().optional(),
  npwp: z.string().optional(),
  // Sewa
  kamarId: z.string(),
  periodeSewa: z.enum(['HARIAN', 'BULANAN', 'TAHUNAN']),
  tanggalMasuk: z.string(),
  durasi: z.number().min(1).default(1), // jumlah hari/bulan/tahun
  deposit: z.number().default(0),
  sumber: z.enum(['LANGSUNG', 'MAMIKOS', 'TRAVELOKA', 'BOOKING_COM', 'TOKOPEDIA', 'ONLINE_LAIN']).default('LANGSUNG'),
  catatan: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bookingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  // Cek kamar tersedia
  const kamar = await prisma.kamar.findUnique({
    where: { id: d.kamarId },
    include: { harga: { where: { periodeSewa: d.periodeSewa, aktif: true } } },
  })
  if (!kamar) return NextResponse.json({ error: 'Kamar tidak ditemukan' }, { status: 404 })
  if (kamar.status !== 'TERSEDIA' && kamar.status !== 'DIPESAN') {
    return NextResponse.json({ error: 'Kamar tidak tersedia' }, { status: 400 })
  }

  const masuk = new Date(d.tanggalMasuk)
  const keluar = d.periodeSewa === 'HARIAN'
    ? addDays(masuk, d.durasi)
    : d.periodeSewa === 'BULANAN'
      ? addMonths(masuk, d.durasi)
      : addYears(masuk, d.durasi)

  const harga = kamar.harga[0]?.harga ?? 0

  // Buat / temukan penyewa
  const penyewa = d.nik
    ? await prisma.penyewa.upsert({
        where: { nik: d.nik },
        update: { nama: d.nama, noHp: d.noHp },
        create: { nama: d.nama, nik: d.nik, noHp: d.noHp, pekerjaan: d.pekerjaan, tipeEntitas: d.tipeEntitas, namaPerusahaan: d.namaPerusahaan, npwp: d.npwp },
      })
    : await prisma.penyewa.create({
        data: { nama: d.nama, noHp: d.noHp, pekerjaan: d.pekerjaan, tipeEntitas: d.tipeEntitas, namaPerusahaan: d.namaPerusahaan, npwp: d.npwp },
      })

  // Transaksi: buat sewa + update status kamar + buat tagihan
  const result = await prisma.$transaction(async (tx) => {
    const sewa = await tx.sewa.create({
      data: {
        kamarId: d.kamarId,
        penyewaId: penyewa.id,
        periodeSewa: d.periodeSewa,
        tanggalMasuk: masuk,
        tanggalKeluar: keluar,
        hargaSewa: Number(harga),
        deposit: d.deposit,
        statusSewa: 'AKTIF',
        sumber: d.sumber,
        catatan: d.catatan,
      },
    })

    await tx.kamar.update({
      where: { id: d.kamarId },
      data: { status: 'TERISI' },
    })

    const jatuhTempo = addDays(masuk, 3)
    const tagihan = await tx.tagihan.create({
      data: {
        sewaId: sewa.id,
        nominal: Number(harga),
        periodeDari: masuk,
        periodeHingga: keluar,
        jatuhTempo,
        status: 'BELUM_BAYAR',
      },
    })

    // Notifikasi
    const properti = await tx.properti.findFirst({ where: { ownerId: session.user.id } })
    if (properti) {
      await tx.notifikasi.create({
        data: {
          propertiId: properti.id,
          tipe: 'CHECKIN_BARU',
          judul: 'Check-in baru',
          pesan: `${penyewa.nama} masuk ke ${kamar.nomor}. Tagihan Rp ${Number(harga).toLocaleString('id-ID')} jatuh tempo ${jatuhTempo.toLocaleDateString('id-ID')}.`,
        },
      })
    }

    return { sewa, tagihan }
  })

  return NextResponse.json(result, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const properti = await prisma.properti.findFirst({ where: { ownerId: session.user.id } })
  if (!properti) return NextResponse.json([], { status: 200 })

  const sewa = await prisma.sewa.findMany({
    where: {
      kamar: { propertiId: properti.id },
      ...(status ? { statusSewa: status as any } : {}),
    },
    include: {
      kamar: { select: { nomor: true, tipe: true } },
      penyewa: { select: { nama: true, noHp: true, tipeEntitas: true } },
      tagihan: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(sewa)
}
