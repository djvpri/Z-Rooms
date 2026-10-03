// app/api/snapshot/route.ts
//
// Data ringkas untuk MODE OFFLINE (APK): kamar + penghuni, booking menunggu,
// tagihan belum lunas, produk aktif. Disimpan klien ke localStorage tiap kali
// berhasil dimuat; saat jaringan mati, halaman /offline merender dari sini.
//
// Sengaja SATU endpoint (bukan pakai endpoint dashboard yang ada): bentuknya
// dirancang untuk transaksi offline (butuh id & harga, bukan agregat), dan
// harus tetap stabil — halaman offline di APK lama membaca struktur ini.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const [kamar, produk, tagihan] = await Promise.all([
    // Semua kamar non-arsip + sewa yang "menghuni"nya (AKTIF) atau akan
    // datang (PENDING) — dua-duanya perlu di layar offline: AKTIF untuk
    // jual titipan/bayar, PENDING untuk check-in.
    prisma.kamar.findMany({
      where: { propertiId: properti.id, arsip: false },
      orderBy: [{ lantai: 'asc' }, { nomor: 'asc' }],
      select: {
        id: true, nomor: true, lantai: true, status: true,
        sewa: {
          where: { statusSewa: { in: ['AKTIF', 'PENDING'] } },
          select: {
            id: true, statusSewa: true, tanggalMasuk: true, hargaSewa: true, deposit: true,
            penyewa: { select: { id: true, nama: true, noHp: true } },
            tagihan: {
              where: { status: { in: ['BELUM_BAYAR', 'SEBAGIAN', 'TERLAMBAT'] } },
              select: { id: true, nominal: true, jatuhTempo: true, status: true },
            },
            penjualan: {
              where: { status: 'BELUM_BAYAR' },
              select: { total: true },
            },
          },
        },
      },
    }),

    // Produk aktif: harga DISALIN ke klien — offline tak boleh menebak harga.
    prisma.produk.findMany({
      where: { propertiId: properti.id, aktif: true },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true, hargaJual: true, stok: true, satuan: true },
    }),

    // Tagihan belum lunas lintas sewa (semua kamar, termasuk yang sewanya
    // sudah SELESAI tapi tagihannya masih menggantung — bisa dibayar offline).
    prisma.tagihan.findMany({
      where: {
        status: { in: ['BELUM_BAYAR', 'SEBAGIAN', 'TERLAMBAT'] },
        sewa: { kamar: { propertiId: properti.id } },
      },
      select: {
        id: true, nominal: true, jatuhTempo: true, status: true,
        sewa: {
          select: {
            id: true, statusSewa: true,
            kamar: { select: { nomor: true } },
            penyewa: { select: { nama: true } },
          },
        },
      },
      orderBy: { jatuhTempo: 'asc' },
      take: 200,
    }),
  ])

  return NextResponse.json({
    // Stempel waktu: halaman offline menampilkan "data terakhir jam HH:mm".
    diambilPada: new Date().toISOString(),
    properti: {
      id: properti.id,
      nama: properti.nama,
      jamCheckout: properti.jamCheckout,
      toleransiCheckout: properti.toleransiCheckout,
    },
    kamar: kamar.map((k) => ({
      id: k.id,
      nomor: k.nomor,
      lantai: k.lantai,
      status: k.status,
      sewa: k.sewa.map((s) => ({
        id: s.id,
        statusSewa: s.statusSewa,
        tanggalMasuk: s.tanggalMasuk,
        hargaSewa: Number(s.hargaSewa),
        deposit: Number(s.deposit),
        penyewa: s.penyewa,
        tagihan: s.tagihan.map((t) => ({ ...t, nominal: Number(t.nominal) })),
        sisaBarang: s.penjualan.reduce((a, p) => a + Number(p.total), 0),
      })),
    })),
    produk: produk.map((p) => ({ ...p, hargaJual: Number(p.hargaJual) })),
    tagihan: tagihan.map((t) => ({
      id: t.id,
      nominal: Number(t.nominal),
      jatuhTempo: t.jatuhTempo,
      status: t.status,
      statusSewa: t.sewa.statusSewa,
      kamarNomor: t.sewa.kamar.nomor,
      penyewaNama: t.sewa.penyewa?.nama ?? null,
    })),
  })
}
