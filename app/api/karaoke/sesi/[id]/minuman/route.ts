// app/api/karaoke/sesi/[id]/minuman/route.ts
//
// Tambah / hapus minuman pada sesi karaoke yang SEDANG BERJALAN.
//
// Kenapa hanya BERJALAN: sesi BOOKING belum didatangi pelanggannya — mencatat
// minuman di situ berarti mencatat penjualan yang belum tentu terjadi, dan
// stoknya sudah terpotong padahal barangnya belum keluar dari kulkas. Sesi
// SELESAI/BATAL sudah lewat jalur uangnya.
//
// ATURAN STOK (sama dengan jalur penjualan barang):
//   - Menambah  → `decrement` stok, di dalam transaksi yang sama dengan baris
//                 minumannya. Stok kurang → 409 STOK_KURANG, BUKAN minus diam-
//                 diam. (Jalur penjualan mengizinkan minus lewat `paksaStok`
//                 karena ada hitungan fisik yang meleset; di karaoke tak ada
//                 layar untuk memaksa, jadi lebih baik menolak daripada
//                 diam-diam menulis stok negatif.)
//   - Menghapus → `increment` stok balik.
//   - Membatalkan sesi → dikembalikan di route `batal`, bukan di sini.
//
// Harga & nama produk DISALIN saat ditambahkan. Struk yang sudah tercetak tak
// boleh berubah kalau besok harga produknya naik.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { stokCukup, subtotalMinuman, tambahMinumanSchema } from '@/lib/karaoke'

/**
 * Properti aktif milik pemanggil.
 *
 * Bentuk `{ ok }` dipakai supaya TypeScript bisa menyempitkan hasilnya di
 * pemanggil: `if (!k.ok) return k.error` lalu `k.properti` pasti ada. Bentuk
 * `if (k.error)` gagal disempitkan karena `NextResponse` selalu dianggap
 * truthy, sehingga `k.properti` tetap dianggap mungkin tidak ada.
 */
async function konteks() {
  const session = await auth()
  if (!session?.user) {
    return { ok: false as const, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) {
    return { ok: false as const, error: NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 }) }
  }
  return { ok: true as const, properti }
}

/**
 * Sesi milik properti ini, atau pesan penolakan yang sudah siap dikirim.
 *
 * Bentuk bertanda `ok` dipakai supaya TypeScript bisa menyempitkan hasilnya:
 * `if (!cek.ok) return ...` lalu `cek.sesi` pasti ada. Union yang dibedakan
 * lewat `'pesan' in cek` TIDAK menyempit di sini dan membuat `tsc` mengeluh di
 * setiap pemakaian.
 */
async function ambilSesi(id: string, propertiId: string) {
  const sesi = await prisma.sesiKaraoke.findFirst({
    where: { id, propertiId },
    include: { minuman: true },
  })
  if (!sesi) return { ok: false as const, pesan: 'Sesi tidak ditemukan.', status: 404 }
  if (sesi.status !== 'BERJALAN') {
    const pesan =
      sesi.status === 'BOOKING'
        ? 'Pelanggan belum datang — minuman dicatat setelah sesi dimulai.'
        : `Sesi sudah ${sesi.status.toLowerCase()}, minumannya tak bisa diubah lagi.`
    return { ok: false as const, pesan, status: 409 }
  }
  return { ok: true as const, sesi }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (!k.ok) return k.error
  const propertiId = k.properti.id

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = tambahMinumanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  const cek = await ambilSesi(id, propertiId)
  if (!cek.ok) return NextResponse.json({ error: { message: cek.pesan } }, { status: cek.status })

  const produk = await prisma.produk.findFirst({ where: { id: d.produkId, propertiId: propertiId } })
  if (!produk) return NextResponse.json({ error: { message: 'Produk tidak ditemukan.' } }, { status: 404 })
  if (!produk.aktif) {
    return NextResponse.json({ error: { message: `Produk "${produk.nama}" sedang nonaktif.` } }, { status: 409 })
  }
  // Penjagaan awal, sebelum menyentuh DB. Syarat `stok >= jumlah` di dalam
  // WHERE `updateMany` di bawah tetap wajib: itu penjaga terakhir terhadap dua
  // kasir yang menekan bersamaan.
  if (!stokCukup(produk.stok, d.jumlah)) {
    return NextResponse.json(
      {
        error: 'STOK_KURANG',
        pesan: `Stok ${produk.nama} tinggal ${produk.stok}, diminta ${d.jumlah}.`,
        kurang: [{ nama: produk.nama, diminta: d.jumlah, tersedia: produk.stok }],
      },
      { status: 409 },
    )
  }

  const hargaSatuan = Number(produk.hargaJual)
  const subtotal = subtotalMinuman(hargaSatuan, d.jumlah)

  const hasil = await prisma.$transaction(async (tx) => {
    // Potong stok dengan syarat `stok >= jumlah` di dalam WHERE. Kalau syarat
    // ini ditaruh di aplikasi saja, dua kasir yang menekan bersamaan bisa
    // dua-duanya lolos dan stok jadi minus — pemeriksaan di luar transaksi
    // tak menutup celah itu.
    // Potong stok dengan syarat `stok >= jumlah` di dalam WHERE. Kalau syarat
    // ini ditaruh di aplikasi saja, dua kasir yang menekan bersamaan bisa
    // dua-duanya lolos dan stok jadi minus — pemeriksaan di luar transaksi
    // tak menutup celah itu.
    const potong = await tx.produk.updateMany({
      where: { id: produk.id, stok: { gte: d.jumlah } },
      data: { stok: { decrement: d.jumlah } },
    })
    if (potong.count === 0) throw new StokKurangError(produk.nama, d.jumlah)

    const baris = await tx.itemMinumanKaraoke.create({
      data: {
        sesiId: id,
        produkId: produk.id,
        namaProduk: produk.nama,
        hargaSatuan,
        jumlah: d.jumlah,
        subtotal,
      },
    })

    const semua = await tx.itemMinumanKaraoke.findMany({ where: { sesiId: id } })
    const totalMinuman = semua.reduce((a, m) => a + Number(m.subtotal), 0)

    return { baris, totalMinuman, stokSisa: produk.stok - d.jumlah }
  })

  const sesi = await prisma.sesiKaraoke.findUnique({
    where: { id },
    include: { minuman: true },
  })

  return NextResponse.json(
    {
      baris: hasil.baris,
      sesi,
      totalMinuman: hasil.totalMinuman,
      total: Number(cek.sesi.totalSewa) + hasil.totalMinuman,
      stokSisa: hasil.stokSisa,
      // Peringatan, BUKAN larangan: pelanggan umum tanpa jaminan bisa kabur
      // setelah pesan. Pengambilan keputusan tetap milik kasir.
      peringatanJaminan:
        Number(cek.sesi.jaminan) === 0 && !cek.sesi.namaPelanggan
          ? 'Pelanggan umum tanpa jaminan bisa kabur setelah pesan. Isi jaminannya?'
          : null,
    },
    { status: 201 },
  )
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const k = await konteks()
  if (!k.ok) return k.error
  const propertiId = k.properti.id

  const { id } = await params
  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: { message: 'itemId wajib diisi.' } }, { status: 400 })

  const cek = await ambilSesi(id, propertiId)
  if (!cek.ok) return NextResponse.json({ error: { message: cek.pesan } }, { status: cek.status })

  const baris = cek.sesi.minuman.find((m) => m.id === itemId)
  if (!baris) return NextResponse.json({ error: { message: 'Baris minuman tidak ditemukan di sesi ini.' } }, { status: 404 })

  const hasil = await prisma.$transaction(async (tx) => {
    await tx.itemMinumanKaraoke.delete({ where: { id: itemId } })
    await tx.produk.update({ where: { id: baris.produkId }, data: { stok: { increment: baris.jumlah } } })

    const semua = await tx.itemMinumanKaraoke.findMany({ where: { sesiId: id } })
    const totalMinuman = semua.reduce((a, m) => a + Number(m.subtotal), 0)
    return { totalMinuman }
  })

  const sesi = await prisma.sesiKaraoke.findUnique({
    where: { id },
    include: { minuman: true },
  })

  return NextResponse.json({
    sesi,
    totalMinuman: hasil.totalMinuman,
    total: Number(cek.sesi.totalSewa) + hasil.totalMinuman,
    pesan: `Satu baris dihapus, stok ${baris.namaProduk} dikembalikan ${baris.jumlah}.`,
  })
}

/** Dilempar di dalam transaksi supaya transaksi batal; ditangkap di luar. */
class StokKurangError extends Error {
  constructor(
    public nama: string,
    public diminta: number,
  ) {
    super('STOK_KURANG')
  }
}
