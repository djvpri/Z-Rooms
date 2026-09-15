// app/api/booking/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { z } from 'zod'
import { addDays, addMonths, addYears } from 'date-fns'

const bookingSchema = z.object({
  // Penyewa — nama & noHp opsional (penyewa boleh dicatat dulu tanpa data
  // lengkap, mis. booking cepat saat calon penyewa belum memberi identitas).
  penyewaId: z.string().optional(), // pilih penyewa lama; identitas by id
  nama: z.string().trim().optional(),
  nik: z.string().trim().optional(),
  noHp: z.string().trim().optional(),
  alamatAsal: z.string().trim().optional(),
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
  metodeBayar: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']).default('TUNAI'),
  // Bayar penuh saat booking. false = tagihan BELUM_BAYAR (jatuh tempo +3 hari).
  bayarSekarang: z.boolean().default(false),
  catatan: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const body = await req.json()
  const parsed = bookingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data

  // Cek kamar tersedia — SEKALIGUS pastikan kamar ini milik properti si pemanggil.
  // Tanpa filter properti, siapa pun yang tahu kamarId bisa membooking kamar
  // tenant lain (sewa/tagihan/notifikasi ikut nyasar ke properti korban).
  // Dikembalikan 404 (bukan 403) supaya tidak membocorkan keberadaan kamar.
  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Kamar tidak ditemukan' }, { status: 404 })

  const kamar = await prisma.kamar.findFirst({
    where: { id: d.kamarId, propertiId: properti.id },
    include: { harga: { where: { periodeSewa: d.periodeSewa, aktif: true } } },
  })
  if (!kamar) return NextResponse.json({ error: 'Kamar tidak ditemukan' }, { status: 404 })
  if (kamar.status !== 'TERSEDIA' && kamar.status !== 'DIPESAN') {
    return NextResponse.json({ error: 'Kamar tidak tersedia' }, { status: 400 })
  }

  const masuk = new Date(d.tanggalMasuk)
  if (isNaN(masuk.getTime())) {
    return NextResponse.json({ error: 'Tanggal masuk tidak valid' }, { status: 400 })
  }
  const keluar = d.periodeSewa === 'HARIAN'
    ? addDays(masuk, d.durasi)
    : d.periodeSewa === 'BULANAN'
      ? addMonths(masuk, d.durasi)
      : addYears(masuk, d.durasi)

  const harga = kamar.harga[0]?.harga ?? 0

  // Buat / temukan penyewa. Kosong -> null supaya kolom nullable terisi null,
  // bukan string kosong ('' bikin UI tampil blank dan upsert by nik tak akurat).
  const kosongJadiNull = (v?: string) => (v && v.trim() ? v.trim() : null)
  const nama = kosongJadiNull(d.nama)
  const noHp = kosongJadiNull(d.noHp)
  const nik = kosongJadiNull(d.nik)

  // Data penyewa yang boleh diperbarui. Dipakai di dua jalur supaya penyewa
  // lama tidak menyimpan versi data yang sudah dikoreksi di form.
  const dataPenyewa = {
    nama, noHp, nik,
    alamatAsal: kosongJadiNull(d.alamatAsal),
    pekerjaan: d.pekerjaan,
    tipeEntitas: d.tipeEntitas,
    namaPerusahaan: d.namaPerusahaan,
    npwp: d.npwp,
  }

  let penyewa
  if (d.penyewaId) {
    // Jalur pilih-dari-daftar: identitas by id, bukan by nik. Menutup lubang
    // penyewa tanpa NIK yang selalu bikin baris baru, dan NIK salah ketik yang
    // bikin orang yang sama tercatat dua kali.
    const lama = await prisma.penyewa.findUnique({ where: { id: d.penyewaId } })
    if (!lama) return NextResponse.json({ error: 'Penyewa tidak ditemukan' }, { status: 404 })
    penyewa = await prisma.penyewa.update({ where: { id: d.penyewaId }, data: dataPenyewa })
  } else if (nik) {
    // NIK milik penyewa lain -> tolak, jangan diam-diam pindahkan identitas.
    const pemilikNik = await prisma.penyewa.findUnique({ where: { nik } })
    if (pemilikNik) {
      return NextResponse.json(
        { error: `NIK ${nik} sudah terdaftar atas nama ${pemilikNik.nama ?? 'penyewa lain'}. Pilih penyewa itu, atau kosongkan NIK.` },
        { status: 409 },
      )
    }
    penyewa = await prisma.penyewa.create({ data: dataPenyewa })
  } else {
    penyewa = await prisma.penyewa.create({ data: { ...dataPenyewa, nik: null } })
  }

  // Transaksi: buat sewa + update status kamar + buat tagihan
  let result
  try {
  result = await prisma.$transaction(async (tx) => {
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
        metodeBayar: d.metodeBayar,
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
        status: d.bayarSekarang ? 'LUNAS' : 'BELUM_BAYAR',
      },
    })

    // Bayar saat booking: tulis Pembayaran DAN set status LUNAS di transaksi yang
    // sama. Status wajib, bukan opsional — app/api/keuangan/route.ts menjumlahkan
    // Tagihan berstatus LUNAS, jadi Pembayaran tanpa LUNAS = uang tak muncul di
    // laporan dan tagihan tetap tampil belum bayar.
    if (d.bayarSekarang) {
      await tx.pembayaran.create({
        data: {
          tagihanId: tagihan.id,
          nominal: Number(harga),
          metodeBayar: d.metodeBayar,
          catatan: 'Dibayar saat booking',
        },
      })
    }

    // Notifikasi — pakai properti milik kamar yang dibooking, BUKAN findFirst.
    // Kalau owner punya >1 properti, findFirst bisa menaruh notifikasi di
    // properti yang salah.
    await tx.notifikasi.create({
      data: {
        propertiId: kamar.propertiId,
        tipe: 'CHECKIN_BARU',
        judul: 'Check-in baru',
        pesan: `${nama ?? 'Penyewa baru'} masuk ke ${kamar.nomor}. ` +
          (d.bayarSekarang
            ? `Lunas Rp ${Number(harga).toLocaleString('id-ID')} saat booking.`
            : `Tagihan Rp ${Number(harga).toLocaleString('id-ID')} jatuh tempo ${jatuhTempo.toLocaleDateString('id-ID')}.`),
      },
    })

    return { sewa, tagihan, masuk: masuk.toISOString(), keluar: keluar.toISOString() }
  })
  } catch (err: any) {
    console.error('[booking] transaction error:', err)
    return NextResponse.json({ error: err?.message ?? 'Terjadi kesalahan server' }, { status: 500 })
  }

  return NextResponse.json(result, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const properti = await propertiAktif(userId)
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
