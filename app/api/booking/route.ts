// app/api/booking/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { tglJamJadiDate } from '@/lib/utils'
import { z } from 'zod'
import { addDays } from 'date-fns'
import { tanggalKeluar } from '@/lib/sewa'
import { bolehDipesan, statusUntuk } from '@/lib/jadwalKamar'

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
  // Jam masuk "HH:mm" 24 jam, dipilih kasir dari dropdown. Opsional supaya
  // pemanggil lama (mis. skrip/uji) yang hanya mengirim tanggal tetap jalan —
  // tanpa jam, dianggap 00:00 WIB.
  jamMasuk: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Jam masuk harus format 24 jam, contoh 14:30').optional(),
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

  // Tarif kini milik tipe kamar — ambil lewat relasi, bukan dari kamar langsung.
  // Sewa AKTIF (penghuni sekarang) DAN PENDING (sudah memesan setelahnya) ikut
  // diambil: kamar yang terisi tetap boleh dibooking untuk tanggal setelah
  // penghuninya keluar, TETAPI tanggal itu harus setelah SEMUA sewa yang masih
  // memegang kamar berakhir. Dulu hanya AKTIF yang diambil, sehingga dua
  // booking bisa sama-sama tersimpan PENDING untuk kamar yang sama.
  const kamar = await prisma.kamar.findFirst({
    where: { id: d.kamarId, propertiId: properti.id },
    include: {
      tipe: { include: { harga: { where: { periodeSewa: d.periodeSewa, aktif: true } } } },
      sewa: {
        where: { statusSewa: { in: ['AKTIF', 'PENDING'] } },
        select: { statusSewa: true, tanggalMasuk: true, tanggalKeluar: true },
      },
    },
  })
  if (!kamar) return NextResponse.json({ error: 'Kamar tidak ditemukan' }, { status: 404 })
  // Kamar PEMELIHARAAN tetap ditolak — itu bukan "sedang dihuni", itu sengaja
  // ditarik dari peredaran. Terisi & dipesan dibolehkan; bentroknya dihitung.
  if (kamar.status === 'PEMELIHARAAN') {
    return NextResponse.json({ error: 'Kamar sedang dalam pemeliharaan' }, { status: 400 })
  }

  // Gabung tanggal + jam masuk jadi satu Date pada jam WIB. Sebelumnya hanya
  // `new Date(d.tanggalMasuk)`: `<input type="date">` mengirim "2026-09-16"
  // tanpa zona, dan bakunya tengah malam UTC — jam 7 pagi WIB, bukan tengah
  // malam. Jam masuk yang dipilih kasir dulu juga tak pernah sampai ke sini.
  const masuk = tglJamJadiDate(d.tanggalMasuk, d.jamMasuk)
  if (isNaN(masuk.getTime())) {
    return NextResponse.json({ error: 'Tanggal masuk tidak valid' }, { status: 400 })
  }
  const keluar = tanggalKeluar(masuk, d.periodeSewa, d.durasi)

  // Aturan properti diperlukan untuk tahu kapan kamar benar-benar dilepas
  // penghuni sekarang (jam check-out + toleransi), bukan tanggalKeluar mentah.
  const aturan = { jamCheckout: properti.jamCheckout, toleransiCheckout: properti.toleransiCheckout }
  // Validasi lawan SELURUH sewa non-selesai kamar ini (AKTIF + PENDING), pakai
  // RENTANG baru (masuk..keluar) — bukan cuma tanggal masuknya. Boleh booking
  // sebelum jam masuk penghuni berikutnya, dan setelah jam keluar penghuni
  // sebelumnya; yang dilarang hanya rentang yang beririsan.
  const izin = bolehDipesan({ mulai: masuk, selesai: keluar }, kamar.sewa, aturan)
  if (!izin.boleh) {
    return NextResponse.json({ error: izin.pesan }, { status: 400 })
  }
  // Kamar masih dipegang orang lain -> sewa MENUNGGU, bukan menempati. Kamarnya
  // tetap TERISI sampai penghuni sekarang checkout; tanpa ini kamar tampak
  // kosong padahal masih ada orang di dalamnya.
  const statusSewaBaru = statusUntuk(masuk, kamar.sewa, aturan)

  const harga = Number(kamar.tipe?.harga[0]?.harga ?? 0)

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
        statusSewa: statusSewaBaru,
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
      kamar: { select: { nomor: true, tipe: { select: { nama: true } } } },
      penyewa: { select: { nama: true, noHp: true, tipeEntitas: true } },
      tagihan: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(sewa)
}
