// app/api/sewa/[id]/pindah-kamar/route.ts
//
// Pindah kamar: tutup sewa lama, buka sewa baru untuk penyewa yang sama, dan
// pindahkan deposit sebagai titipan — bukan transaksi keluar-masuk uang.
//
// Kenapa bukan sekadar "check-out lalu booking ulang": pola itu mencatat
// pengembalian deposit (Pengeluaran) lalu deposit baru masuk (Pembayaran) padahal
// uang fisik tidak pernah berpindah. Laporan laba jadi salah dua kali. Di sini
// deposit disalin langsung ke sewa baru, jadi tidak ada baris keuangan palsu.
//
// Keputusan produk (dikonfirmasi pemilik):
//   - Tagihan belum lunas TETAP di sewa lama — kewajiban periode itu, tidak
//     dialihkan. Tagihan belum lunas tidak memblokir, tapi harus disengaja (409).
//   - Kekurangan deposit ditagih sekarang sebagai Tagihan BELUM_BAYAR di sewa baru.
//   - Periode sewa baru mulai penuh dari awal (tanggalMasuk = tanggal pindah).
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { addDays, addMonths, addYears } from 'date-fns'
import { z } from 'zod'

const pindahSchema = z.object({
  kamarTujuanId: z.string().min(1),
  tanggalPindah: z.string().optional(),
  // Durasi sewa baru, dalam satuan periodeSewa kamar tujuan.
  durasi: z.number().int().min(1).default(1),
  // Set true kalau masih ada tagihan belum lunas tapi user tetap mau pindah.
  paksa: z.boolean().default(false),
  catatan: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = pindahSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  // Sama seperti check-out: filter lewat properti aktif, dan 404 (bukan 403)
  // supaya keberadaan sewa tenant lain tidak bocor.
  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Sewa tidak ditemukan' }, { status: 404 })

  if (d.kamarTujuanId === id) {
    return NextResponse.json({ error: 'Kamar tujuan sama dengan kamar asal' }, { status: 400 })
  }

  const sewa = await prisma.sewa.findFirst({
    where: { id, kamar: { propertiId: properti.id } },
    include: {
      kamar: { select: { id: true, nomor: true, propertiId: true } },
      penyewa: { select: { id: true, nama: true } },
      tagihan: { where: { status: { in: ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'] } } },
    },
  })
  if (!sewa) return NextResponse.json({ error: 'Sewa tidak ditemukan' }, { status: 404 })
  if (sewa.statusSewa !== 'AKTIF') {
    return NextResponse.json({ error: `Sewa sudah berstatus ${sewa.statusSewa}` }, { status: 400 })
  }

  const tujuan = await prisma.kamar.findFirst({
    where: { id: d.kamarTujuanId, propertiId: properti.id },
    include: { harga: { where: { aktif: true } } },
  })
  if (!tujuan) return NextResponse.json({ error: 'Kamar tujuan tidak ditemukan' }, { status: 404 })
  if (tujuan.id === sewa.kamar.id) {
    return NextResponse.json({ error: 'Kamar tujuan sama dengan kamar asal' }, { status: 400 })
  }
  // Cek status di luar transaksi cuma untuk pesan cepat; pengecekan yang
  // mengikat tetap di dalam transaksi (bisa berubah di antara dua query).
  if (tujuan.status !== 'TERSEDIA') {
    return NextResponse.json({ error: `Kamar ${tujuan.nomor} sedang ${tujuan.status}` }, { status: 400 })
  }

  const sisaTagihan = sewa.tagihan.reduce((s, t) => s + Number(t.nominal), 0)
  if (sisaTagihan > 0 && !d.paksa) {
    return NextResponse.json(
      {
        error: 'MASIH_ADA_TAGIHAN',
        pesan: `Masih ada ${sewa.tagihan.length} tagihan belum lunas (Rp ${sisaTagihan.toLocaleString('id-ID')}). Tagihan tetap tercatat di kamar lama.`,
        sisaTagihan,
        jumlahTagihan: sewa.tagihan.length,
      },
      { status: 409 },
    )
  }

  const pindah = d.tanggalPindah ? new Date(d.tanggalPindah) : new Date()
  if (Number.isNaN(pindah.getTime())) {
    return NextResponse.json({ error: 'tanggalPindah tidak valid' }, { status: 400 })
  }

  const label = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Kunci baris kamar tujuan: dua kasir memindahkan penyewa berbeda ke kamar
      // yang sama nyaris bersamaan akan lolos dari cek status di atas. Update
      // bersyarat ini yang menentukan — hanya berhasil kalau masih TERSEDIA.
      const klaim = await tx.kamar.updateMany({
        where: { id: tujuan.id, status: 'TERSEDIA' },
        data: { status: 'TERISI' },
      })
      if (klaim.count === 0) {
        throw new Error(`Kamar ${tujuan.nomor} baru saja terisi orang lain. Muat ulang halaman.`)
      }

      await tx.sewa.update({
        where: { id: sewa.id },
        data: {
          statusSewa: 'SELESAI',
          tanggalKeluarAktual: pindah,
          ...(d.catatan ? { catatan: d.catatan } : {}),
        },
      })

      await tx.kamar.update({ where: { id: sewa.kamar.id }, data: { status: 'TERSEDIA' } })

      // Kamar tujuan pakai periodeSewa sendiri (bisa beda dari kamar asal),
      // jadi tanggalKeluar dihitung dari harga kamar tujuan.
      const hargaTujuan = tujuan.harga[0]?.harga ?? sewa.hargaSewa
      const periode = tujuan.harga[0]?.periodeSewa ?? sewa.periodeSewa
      const keluarBaru =
        periode === 'HARIAN' ? addDays(pindah, d.durasi)
          : periode === 'MINGGUAN' ? addDays(pindah, d.durasi * 7)
            : periode === 'BULANAN' ? addMonths(pindah, d.durasi)
              : addYears(pindah, d.durasi)

      // Deposit pindah apa adanya — tanpa baris Pengeluaran/Pembayaran, karena
      // uangnya tidak berpindah tangan.
      const depositLama = Number(sewa.deposit)
      const depositDiminta = tujuan.harga[0]?.deposit != null ? Number(tujuan.harga[0].deposit) : depositLama
      const kurangDeposit = Math.max(depositDiminta - depositLama, 0)

      const sewaBaru = await tx.sewa.create({
        data: {
          kamarId: tujuan.id,
          penyewaId: sewa.penyewaId,
          periodeSewa: periode,
          tanggalMasuk: pindah,
          tanggalKeluar: keluarBaru,
          hargaSewa: Number(hargaTujuan),
          deposit: depositLama,
          statusSewa: 'AKTIF',
          metodeBayar: sewa.metodeBayar,
          catatan: `Pindah dari ${sewa.kamar.nomor}`,
        },
      })

      await tx.tagihan.create({
        data: {
          sewaId: sewaBaru.id,
          nominal: Number(hargaTujuan),
          periodeDari: pindah,
          periodeHingga: keluarBaru,
          jatuhTempo: addDays(pindah, 3),
          status: 'BELUM_BAYAR',
        },
      })

      // Kekurangan deposit jadi tagihan tersendiri supaya terlihat jelas di
      // daftar tagihan sebagai "kekurangan deposit", bukan menempel di sewa.
      if (kurangDeposit > 0) {
        await tx.tagihan.create({
          data: {
            sewaId: sewaBaru.id,
            nominal: kurangDeposit,
            periodeDari: pindah,
            periodeHingga: pindah,
            jatuhTempo: addDays(pindah, 3),
            status: 'BELUM_BAYAR',
            catatan: `Kekurangan deposit kamar ${tujuan.nomor} (titipan ${label(depositLama)} dari ${sewa.kamar.nomor}, diminta ${label(depositDiminta)})`,
          },
        })
      }

      await tx.notifikasi.create({
        data: {
          propertiId: properti.id,
          tipe: 'INFO',
          judul: 'Pindah kamar',
          pesan:
            `${sewa.penyewa?.nama ?? 'Penyewa'} pindah dari ${sewa.kamar.nomor} ke ${tujuan.nomor}. ` +
            `Deposit ${label(depositLama)} ikut pindah` +
            `${kurangDeposit > 0 ? `, kurang ${label(kurangDeposit)} ditagih` : ''}.` +
            `${sisaTagihan > 0 ? ` Tagihan lama belum lunas ${label(sisaTagihan)}.` : ''}`,
        },
      })

      return {
        sewaBaruId: sewaBaru.id,
        kamarAsal: sewa.kamar.nomor,
        kamarTujuan: tujuan.nomor,
        depositPindah: depositLama,
        kurangDeposit,
        tagihanBaru: Number(hargaTujuan) + kurangDeposit,
        sisaTagihanLama: sisaTagihan,
        tanggalKeluar: keluarBaru,
      }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[pindah-kamar] transaction error:', err)
    return NextResponse.json({ error: err?.message ?? 'Terjadi kesalahan server' }, { status: 500 })
  }
}
