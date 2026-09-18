// app/api/penjualan/route.ts
//
// Penjualan barang (minuman/makanan). Jalur uang masuk BERDIRI SENDIRI — tidak
// lewat model Tagihan (lihat catatan di lib/produk.ts).
//
// Dua bentuk:
//   - sewaId kosong -> jual lepas (tamu walk-in / staf), LUNAS saat itu.
//   - sewaId diisi  -> titipan ke kamar, BELUM_BAYAR, ikut dilunasi saat
//     check-out (blok `lunasi` di app/api/sewa/[id]/checkout/route.ts).
//
// Aturan yang mengikat:
//   - Harga SELALU dibaca dari DB saat transaksi, tak pernah dari body. Kalau
//     klien boleh mengirim harga, siapa pun yang bisa memanggil API ini bisa
//     menjual seharga Rp 1.
//   - Stok dipotong di dalam transaksi yang sama dengan insert penjualan.
//   - Stok minus DIIZINKAN, tapi hanya kalau paksaStok=true (disengaja).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { hitungJual, jualSchema, nomorJualBerikut } from '@/lib/produk'

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

  const { searchParams } = new URL(req.url)
  const batas = Math.min(Math.max(Number(searchParams.get('batas')) || 50, 1), 200)
  // 'lepas' = hanya jual lepas, 'kamar' = hanya titipan kamar, selain itu semua.
  const saring = searchParams.get('saring')
  const cari = searchParams.get('cari')?.trim()

  const penjualan = await prisma.penjualan.findMany({
    where: {
      propertiId: k.properti.id,
      ...(saring === 'lepas' ? { sewaId: null } : {}),
      ...(saring === 'kamar' ? { sewaId: { not: null } } : {}),
      ...(cari ? { nomor: { contains: cari, mode: 'insensitive' } } : {}),
    },
    include: {
      item: true,
      sewa: {
        select: {
          id: true,
          kamar: { select: { nomor: true } },
          penyewa: { select: { nama: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: batas,
  })

  // Ringkasan hari ini — dipakai kartu di atas halaman jual.
  const awalHari = new Date()
  awalHari.setHours(0, 0, 0, 0)
  const hariIni = await prisma.penjualan.findMany({
    where: { propertiId: k.properti.id, createdAt: { gte: awalHari }, status: { not: 'BATAL' } },
    include: { item: true },
  })

  const omzetHariIni = hariIni.reduce((s, p) => s + Number(p.total), 0)
  const labaHariIni = hariIni.reduce(
    (s, p) => s + p.item.reduce((t, it) => {
      const beli = it.hargaBeli === null ? 0 : Number(it.hargaBeli)
      return t + (Number(it.hargaSatuan) - beli) * it.jumlah
    }, 0),
    0,
  )

  return NextResponse.json({
    penjualan,
    ringkas: { omzetHariIni, labaHariIni, jumlahHariIni: hariIni.length },
  })
}

export async function POST(req: NextRequest) {
  const k = await konteks()
  if (k.error) return k.error

  const parsed = jualSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: { message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' } }, { status: 400 })
  }
  const d = parsed.data

  // Sewa harus milik properti aktif. Tanpa pemeriksaan ini, penjualan bisa
  // dititipkan ke kamar properti lain hanya dengan menebak sewaId.
  let sewaId: string | null = null
  if (d.sewaId) {
    const sewa = await prisma.sewa.findFirst({
      where: { id: d.sewaId, kamar: { propertiId: k.properti.id } },
      select: { id: true, statusSewa: true },
    })
    if (!sewa) return NextResponse.json({ error: { message: 'Sewa tidak ditemukan.' } }, { status: 404 })
    if (sewa.statusSewa !== 'AKTIF') {
      return NextResponse.json(
        { error: { message: `Sewa sudah berstatus ${sewa.statusSewa} — tidak bisa dititipi barang.` } },
        { status: 400 },
      )
    }
    sewaId = sewa.id
  }

  // Ambil produk dari DB. Produk yang tak ada / bukan milik properti ini /
  // sudah nonaktif ditolak — bukan diam-diam dilewati.
  const idProduk = [...new Set(d.item.map((i) => i.produkId))]
  const produk = await prisma.produk.findMany({
    where: { id: { in: idProduk }, propertiId: k.properti.id, aktif: true },
  })
  if (produk.length !== idProduk.length) {
    return NextResponse.json(
      { error: { message: 'Ada produk yang tidak ditemukan atau sudah tidak aktif. Muat ulang daftar produk.' } },
      { status: 400 },
    )
  }

  const peta = new Map(produk.map((p) => [p.id, p]))
  const baris = d.item.map((i) => {
    const p = peta.get(i.produkId)!
    return {
      produkId: p.id,
      nama: p.nama,
      hargaSatuan: Number(p.hargaJual),
      hargaBeli: p.hargaBeli === null ? null : Number(p.hargaBeli),
      jumlah: i.jumlah,
      stokTersedia: p.stok,
    }
  })

  const { subtotal, kurang } = hitungJual(baris)

  // Stok kurang: tolak kecuali kasir sengaja memaksa (stok minus diizinkan).
  if (kurang.length > 0 && !d.paksaStok) {
    return NextResponse.json(
      {
        error: 'STOK_KURANG',
        pesan: 'Stok tidak cukup untuk: ' +
          kurang.map((x) => `${x.nama} (diminta ${x.diminta}, tersedia ${x.tersedia})`).join('; ') + '.',
        kurang,
      },
      { status: 409 },
    )
  }

  try {
    const hasil = await prisma.$transaction(async (tx) => {
      // Nomor dari NOMOR TERTINGGI yang ada, bukan jumlah baris: penjualan yang
      // dibatalkan tetap menyimpan barisnya, jadi menghitung baris akan memakai
      // ulang nomor yang sudah terpakai dan menabrak `@@unique([propertiId, nomor])`.
      //
      // Diurutkan per PANJANG dulu, baru abjad: `nomor` adalah teks ("PJ-0007"),
      // jadi urutan abjad biasa menaruh "PJ-0010" SEBELUM "PJ-0009" (karena '1'
      // < '9') dan nomor berikutnya jadi 10 berulang. Panjang sama = padding
      // sama, jadi sesama 4 digit urutan abjad = urutan angka.
      const semuaNomor = await tx.penjualan.findMany({
        where: { propertiId: k.properti.id },
        select: { nomor: true },
      })
      const tertinggi = semuaNomor
        .map((p) => p.nomor)
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .at(-1) ?? null
      const nomor = nomorJualBerikut(tertinggi)

      const jual = await tx.penjualan.create({
        data: {
          propertiId: k.properti.id,
          sewaId,
          nomor,
          total: subtotal,
          metodeBayar: d.metodeBayar,
          // Titipan kamar belum dibayar; jual lepas lunas saat itu.
          status: sewaId ? 'BELUM_BAYAR' : 'LUNAS',
          dibayarPada: sewaId ? null : new Date(),
          catatan: d.catatan?.trim() || null,
          item: {
            create: baris.map((b) => ({
              produkId: b.produkId,
              // Nama & harga DISALIN supaya struk lama tak berubah kalau produk
              // nanti diganti harga / nama / dinonaktifkan.
              namaProduk: b.nama,
              hargaSatuan: b.hargaSatuan,
              hargaBeli: b.hargaBeli,
              jumlah: b.jumlah,
              subtotal: b.hargaSatuan * b.jumlah,
            })),
          },
        },
        include: { item: true },
      })

      // Potong stok. Dijumlahkan per produk dulu: keranjang bisa memuat produk
      // yang sama di dua baris, dan `decrement` per baris akan menulis dua kali.
      const perProduk = new Map<string, number>()
      for (const b of baris) perProduk.set(b.produkId, (perProduk.get(b.produkId) ?? 0) + b.jumlah)
      for (const [produkId, jumlah] of perProduk) {
        await tx.produk.update({ where: { id: produkId }, data: { stok: { decrement: jumlah } } })
      }

      return jual
    })

    // Setelah potong stok, laporkan produk yang jadi minus — kasir perlu tahu
    // ada ketidakcocokan hitungan, bukan sekadar "berhasil".
    const minus: string[] = []
    for (const b of baris) {
      const sisa = b.stokTersedia - b.jumlah
      if (sisa < 0 && !minus.includes(b.nama)) minus.push(b.nama)
    }

    return NextResponse.json({
      penjualan: hasil,
      stokMinus: minus,
      pesan: minus.length > 0
        ? `Tersimpan. Stok ${minus.join(', ')} jadi minus — periksa hitungan fisik.`
        : undefined,
    }, { status: 201 })
  } catch (err: unknown) {
    console.error('[penjualan] transaction error:', err)
    const pesan = err instanceof Error ? err.message : 'Terjadi kesalahan server'
    return NextResponse.json({ error: { message: pesan } }, { status: 500 })
  }
}
