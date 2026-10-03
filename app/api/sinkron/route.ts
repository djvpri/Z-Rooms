// app/api/sinkron/route.ts
//
// Terima operasi yang dibuat OFFLINE (halaman /offline di APK, disimpan di
// localStorage perangkat, dikirim saat online kembali).
//
// IDEMPOTENSI = kunci seluruh route ini: klien membuat `idOperasi` (UUID) saat
// transaksi dibuat, offline. Kirim ulang (jaringan putus saat kirim, app mati,
// tombol ditekan dua kali) dengan idOperasi sama → dibalas KIRIMAN_LAMA dengan
// hasil semula, TIDAK dibuat dua kali. `@@unique([propertiId, idOperasi])`
// menegakkan di level DB — dua kiriman paralel pun hanya satu yang lolos.
//
// Validasi ulang penuh saat sync: data offline sudah basi (stok berubah di
// perangkat lain, tagihan dibayar kasir lain, booking dibatalkan). Yang gagal
// VALIDASI tersimpan di SinkronLog berstatus GAGAL — terlihat di daftar sync,
// bukan hilang diam-diam. Uang tunai kasir tak pernah lenyap dari catatan.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { hitungJual, nomorJualBerikut } from '@/lib/produk'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'

const skemaItem = z.object({
  produkId: z.string().min(1),
  jumlah: z.number().int().min(1).max(999),
})

const skemaOperasi = z.discriminatedUnion('jenis', [
  z.object({
    jenis: z.literal('BAYAR_TAGIHAN'),
    idOperasi: z.string().min(8).max(64),
    tagihanId: z.string().min(1),
    metodeBayar: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']).default('TUNAI'),
    dibuatKlien: z.string().datetime().optional(),
  }),
  z.object({
    jenis: z.literal('PENJUALAN'),
    idOperasi: z.string().min(8).max(64),
    item: z.array(skemaItem).min(1).max(50),
    sewaId: z.string().min(1).nullish(),
    metodeBayar: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'LAINNYA']).default('TUNAI'),
    // Offline tanpa data stok segar → kasir offline selalu "memaksa";
    // ketidakcocokan stok tetap tercatat (stok minus) & dilaporkan hasil.
    paksaStok: z.boolean().default(true),
    dibuatKlien: z.string().datetime().optional(),
  }),
  z.object({
    jenis: z.literal('CHECKIN'),
    idOperasi: z.string().min(8).max(64),
    sewaId: z.string().min(1),
    dibuatKlien: z.string().datetime().optional(),
  }),
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const daftar = z.array(skemaOperasi).safeParse(Array.isArray(body) ? body : [body])
  if (!daftar.success) {
    return NextResponse.json({ error: 'Data operasi tidak valid.' }, { status: 400 })
  }

  const hasil: { idOperasi: string; jenis: string; status: string; pesan: string }[] = []

  for (const op of daftar.data) {
    try {
      const r = await prosesSatu(op, properti.id, session.user.id as string, session.user.email ?? null)
      hasil.push({ idOperasi: op.idOperasi, jenis: op.jenis, ...r })
    } catch (err) {
      const pesan = err instanceof Error ? err.message : 'Kesalahan tak diketahui'
      await catat(properti.id, op, 'GAGAL', pesan, op.dibuatKlien)
      hasil.push({ idOperasi: op.idOperasi, jenis: op.jenis, status: 'GAGAL', pesan })
    }
  }

  return NextResponse.json({ hasil })
}

// ───────────────────────────────────────────────

type Operasi = z.infer<typeof skemaOperasi>

async function catat(
  propertiId: string, op: Operasi, status: string, hasil: string,
  dibuatKlien?: string, detail?: Prisma.InputJsonValue,
) {
  // upsert: kiriman ulang yang lolos di balapan pertama tetap menimpa barisnya
  // sendiri, bukan membuat baris kedua (unique di level DB sebagai pengaman).
  await prisma.sinkronLog.upsert({
    where: { propertiId_idOperasi: { propertiId, idOperasi: op.idOperasi } },
    create: {
      propertiId, idOperasi: op.idOperasi, jenis: op.jenis,
      status, hasil, detail, dibuatKlien: dibuatKlien ? new Date(dibuatKlien) : null,
    },
    update: { status, hasil, detail },
  })
}

/** Jenis apa pun: cek dulu apakah idOperasi sudah pernah diproses. */
async function sudahDiproses(propertiId: string, op: Operasi) {
  const lama = await prisma.sinkronLog.findUnique({
    where: { propertiId_idOperasi: { propertiId, idOperasi: op.idOperasi } },
  })
  if (!lama) return null
  // GAGAL boleh dicoba lagi (mis. stok sudah diisi sebelum sync ulang).
  if (lama.status === 'GAGAL') return null
  return lama // OK / KIRIMAN_LAMA → balas hasil lama, jangan proses ulang
}

async function prosesSatu(op: Operasi, propertiId: string, userId: string, userEmail: string | null) {
  const lama = await sudahDiproses(propertiId, op)
  if (lama) {
    return { status: 'KIRIMAN_LAMA', pesan: lama.hasil ?? 'Sudah pernah diproses.' }
  }

  switch (op.jenis) {
    case 'BAYAR_TAGIHAN': return bayarTagihan(op, propertiId, userId, userEmail)
    case 'PENJUALAN': return penjualan(op, propertiId, userId, userEmail)
    case 'CHECKIN': return checkin(op, propertiId, userId, userEmail)
  }
}

// ── BAYAR_TAGIHAN ──────────────────────────────
// Sama dengan /api/tagihan/[id]/bayar: status WAJIB ikut LUNAS — laporan
// pemasukan menjumlahkan Tagihan LUNAS, bukan baris Pembayaran.
async function bayarTagihan(
  op: Extract<Operasi, { jenis: 'BAYAR_TAGIHAN' }>,
  propertiId: string, userId: string, userEmail: string | null,
) {
  const tagihan = await prisma.tagihan.findUnique({
    where: { id: op.tagihanId },
    include: { sewa: { include: { kamar: { select: { nomor: true, propertiId: true } } } } },
  })
  if (!tagihan || tagihan.sewa.kamar.propertiId !== propertiId) {
    throw new Error(`Tagihan ${op.tagihanId} tidak ditemukan di properti ini.`)
  }
  if (tagihan.status === 'DIBATALKAN') {
    throw new Error(`Tagihan kamar ${tagihan.sewa.kamar.nomor} sudah dibatalkan — uang jangan dicatat.`)
  }
  if (tagihan.status === 'LUNAS') {
    // Sudah dibayar kasir lain → uang kasir ini nyata, tapi jangan dobel.
    // Tercatat KIRIMAN_LAMA: terlihat di daftar sync, penyebabnya jelas.
    const hasil = `Tagihan kamar ${tagihan.sewa.kamar.nomor} ternyata sudah lunas (dibayar pihak lain).`
    await catat(propertiId, op, 'KIRIMAN_LAMA', hasil, op.dibuatKlien)
    return { status: 'KIRIMAN_LAMA', pesan: hasil }
  }

  await prisma.$transaction([
    prisma.pembayaran.create({
      data: {
        tagihanId: tagihan.id,
        nominal: Number(tagihan.nominal),
        metodeBayar: op.metodeBayar,
        catatan: 'Dibayar OFFLINE, disinkron setelah online',
      },
    }),
    prisma.tagihan.update({ where: { id: tagihan.id }, data: { status: 'LUNAS' } }),
  ])

  const hasil = `Bayar tagihan kamar ${tagihan.sewa.kamar.nomor} Rp ${Number(tagihan.nominal).toLocaleString('id-ID')} (${op.metodeBayar}).`
  await catat(propertiId, op, 'OK', hasil, op.dibuatKlien, {
    tagihanId: tagihan.id, nominal: Number(tagihan.nominal), metodeBayar: op.metodeBayar,
  })
  return { status: 'OK', pesan: hasil }
}

// ── PENJUALAN ──────────────────────────────────
// Sama dengan POST /api/penjualan: nama & harga DISALIN ke item (struk lama
// tak berubah), nomor PJ dari nomor tertinggi (batal tetap memakai nomor),
// stok dipotong per produk (keranjang bisa memuat produk sama dua baris).
async function penjualan(
  op: Extract<Operasi, { jenis: 'PENJUALAN' }>,
  propertiId: string, userId: string, userEmail: string | null,
) {
  let sewaId: string | null = null
  if (op.sewaId) {
    const sewa = await prisma.sewa.findFirst({
      where: { id: op.sewaId, kamar: { propertiId } },
      include: { kamar: { select: { nomor: true } } },
    })
    if (!sewa) throw new Error('Sewa titipan tidak ditemukan di properti ini.')
    if (sewa.statusSewa !== 'AKTIF') {
      // Offline, sewa bisa saja sudah check-out sebelum sync.
      throw new Error(`Sewa kamar ${sewa.kamar.nomor} sudah ${sewa.statusSewa} saat sync — titipan tak bisa dicatat, catat sebagai jual lepas.`)
    }
    sewaId = sewa.id
  }

  const idProduk = [...new Set(op.item.map((i) => i.produkId))]
  const produk = await prisma.produk.findMany({
    where: { id: { in: idProduk }, propertiId, aktif: true },
  })
  if (produk.length !== idProduk.length) {
    throw new Error('Ada produk yang sudah dihapus/dinonaktifkan saat offline. Jual lepas saja (tanpa titipan kamar) bila produk tak ada lagi.')
  }
  const peta = new Map(produk.map((p) => [p.id, p]))
  const baris = op.item.map((i) => {
    const p = peta.get(i.produkId)!
    return {
      produkId: p.id, nama: p.nama,
      hargaSatuan: Number(p.hargaJual),
      hargaBeli: p.hargaBeli === null ? null : Number(p.hargaBeli),
      jumlah: i.jumlah, stokTersedia: p.stok,
    }
  })

  const { subtotal } = hitungJual(baris)

  const jual = await prisma.$transaction(async (tx) => {
    const semuaNomor = await tx.penjualan.findMany({
      where: { propertiId }, select: { nomor: true },
    })
    const tertinggi = semuaNomor
      .map((p) => p.nomor)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .at(-1) ?? null
    const nomor = nomorJualBerikut(tertinggi)

    const j = await tx.penjualan.create({
      data: {
        propertiId, sewaId, nomor, total: subtotal,
        metodeBayar: op.metodeBayar,
        status: sewaId ? 'BELUM_BAYAR' : 'LUNAS',
        dibayarPada: sewaId ? null : new Date(),
        catatan: 'Dibuat OFFLINE, disinkron setelah online',
        item: {
          create: baris.map((b) => ({
            produkId: b.produkId, namaProduk: b.nama,
            hargaSatuan: b.hargaSatuan, hargaBeli: b.hargaBeli,
            jumlah: b.jumlah, subtotal: b.hargaSatuan * b.jumlah,
          })),
        },
      },
    })

    const perProduk = new Map<string, number>()
    for (const b of baris) perProduk.set(b.produkId, (perProduk.get(b.produkId) ?? 0) + b.jumlah)
    for (const [produkId, jumlah] of perProduk) {
      await tx.produk.update({ where: { id: produkId }, data: { stok: { decrement: jumlah } } })
    }
    return j
  })

  // Stok minus dilaporkan (hitungan fisik vs sistem), bukan menghentikan.
  const minus: string[] = []
  for (const b of baris) {
    if (b.stokTersedia - b.jumlah < 0 && !minus.includes(b.nama)) minus.push(b.nama)
  }
  const hasil = `Penjualan ${jual.nomor} Rp ${subtotal.toLocaleString('id-ID')}${sewaId ? ' (titipan kamar)' : ''}${minus.length ? ` — stok ${minus.join(', ')} minus.` : '.'}`
  await catat(propertiId, op, 'OK', hasil, op.dibuatKlien, {
    penjualanId: jual.id, nomor: jual.nomor, total: subtotal,
  })
  return { status: 'OK', pesan: hasil, nomor: jual.nomor }
}

// ── CHECKIN ────────────────────────────────────
// Sama dengan /api/booking/[id]/checkin: PENDING → AKTIF, tanggalMasuk ke
// sekarang, tolak bila kamar masih dihuni sewa AKTIF lain.
async function checkin(
  op: Extract<Operasi, { jenis: 'CHECKIN' }>,
  propertiId: string, userId: string, userEmail: string | null,
) {
  const sewa = await prisma.sewa.findFirst({
    where: { id: op.sewaId, kamar: { propertiId } },
    include: { kamar: { select: { nomor: true } }, penyewa: { select: { nama: true } } },
  })
  if (!sewa) throw new Error('Booking tidak ditemukan di properti ini.')
  if (sewa.statusSewa === 'AKTIF') {
    const hasil = `Kamar ${sewa.kamar.nomor} ternyata sudah check-in (oleh kasir lain).`
    await catat(propertiId, op, 'KIRIMAN_LAMA', hasil, op.dibuatKlien)
    return { status: 'KIRIMAN_LAMA', pesan: hasil }
  }
  if (sewa.statusSewa !== 'PENDING') {
    throw new Error(`Booking kamar ${sewa.kamar.nomor} sudah ${sewa.statusSewa} saat sync — check-in tak bisa diproses.`)
  }

  const sekarang = new Date()
  await prisma.$transaction(async (tx) => {
    const lain = await tx.sewa.findFirst({
      where: { kamarId: sewa.kamarId, statusSewa: 'AKTIF', id: { not: sewa.id } },
      select: { id: true },
    })
    if (lain) throw new Error(`Kamar ${sewa.kamar.nomor} masih dihuni sewa aktif lain — selesaikan dulu.`)
    await tx.sewa.update({
      where: { id: sewa.id },
      data: { statusSewa: 'AKTIF', tanggalMasuk: sekarang },
    })
  })

  const nama = sewa.penyewa?.nama ?? 'tanpa nama'
  const hasil = `Check-in kamar ${sewa.kamar.nomor}: ${nama}.`
  await catat(propertiId, op, 'OK', hasil, op.dibuatKlien, {
    sewaId: sewa.id, tanggalMasuk: sekarang.toISOString(),
  })
  return { status: 'OK', pesan: hasil }
}
