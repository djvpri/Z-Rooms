// app/api/sewa/[id]/checkout/route.ts
//
// Check-out: tutup satu sewa aktif, kosongkan kamar, selesaikan deposit.
//
// Deposit diperlakukan sebagai titipan, bukan pendapatan, sampai saat check-out:
//   - dikembalikan  -> catat sebagai Pengeluaran (uang keluar)
//   - hangus        -> catat sebagai Tagihan LUNAS + Pembayaran (uang masuk)
// Tanpa pencatatan ini, uang titipan ikut terhitung pendapatan sejak check-in.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { z } from 'zod'

const checkoutSchema = z.object({
  // 'PENUH' | 'SEBAGIAN' | 'HANGUS'
  deposit: z.enum(['PENUH', 'SEBAGIAN', 'HANGUS']).default('PENUH'),
  // Wajib kalau SEBAGIAN/HANGUS — nominal yang dikembalikan ke penyewa.
  depositKembali: z.number().min(0).default(0),
  tanggalKeluarAktual: z.string().optional(),
  catatan: z.string().optional(),
  // Set true kalau masih ada tagihan belum lunas tapi user tetap mau check-out.
  paksa: z.boolean().default(false),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id as string

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  // Sewa harus milik properti aktif si pemanggil. Tanpa filter ini, siapa pun
  // yang tahu id sewa bisa check-out sewa tenant lain. 404 (bukan 403) supaya
  // keberadaan sewa tidak bocor.
  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Sewa tidak ditemukan' }, { status: 404 })

  const sewa = await prisma.sewa.findFirst({
    where: { id, kamar: { propertiId: properti.id } },
    include: {
      kamar: { select: { id: true, nomor: true, propertiId: true } },
      penyewa: { select: { nama: true } },
      tagihan: { where: { status: { in: ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'] } } },
    },
  })
  if (!sewa) return NextResponse.json({ error: 'Sewa tidak ditemukan' }, { status: 404 })
  if (sewa.statusSewa !== 'AKTIF') {
    return NextResponse.json({ error: `Sewa sudah berstatus ${sewa.statusSewa}` }, { status: 400 })
  }

  const deposit = Number(sewa.deposit)
  const sisaTagihan = sewa.tagihan.reduce((s, t) => s + Number(t.nominal), 0)

  // Tagihan belum lunas tidak memblokir (keputusan produk), tapi harus disengaja.
  if (sisaTagihan > 0 && !d.paksa) {
    return NextResponse.json(
      {
        error: 'MASIH_ADA_TAGIHAN',
        pesan: `Masih ada ${sewa.tagihan.length} tagihan belum lunas (Rp ${sisaTagihan.toLocaleString('id-ID')}).`,
        sisaTagihan,
        jumlahTagihan: sewa.tagihan.length,
      },
      { status: 409 },
    )
  }

  // Normalisasi: PENUH selalu mengembalikan seluruh deposit; HANGUS nol;
  // SEBAGIAN memakai nominal dari form, dijepit ke rentang deposit.
  let kembali: number
  if (d.deposit === 'PENUH') kembali = deposit
  else if (d.deposit === 'HANGUS') kembali = 0
  else kembali = Math.min(Math.max(d.depositKembali, 0), deposit)

  if (d.deposit === 'SEBAGIAN' && (d.depositKembali <= 0 || d.depositKembali >= deposit)) {
    return NextResponse.json(
      { error: `Nominal sebagian harus di antara 1 dan ${deposit - 1}` },
      { status: 400 },
    )
  }
  const hangus = deposit - kembali
  const keluarAktual = d.tanggalKeluarAktual ? new Date(d.tanggalKeluarAktual) : new Date()
  if (Number.isNaN(keluarAktual.getTime())) {
    return NextResponse.json({ error: 'tanggalKeluarAktual tidak valid' }, { status: 400 })
  }

  const labelDeposit = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.sewa.update({
        where: { id: sewa.id },
        data: {
          statusSewa: 'SELESAI',
          tanggalKeluarAktual: keluarAktual,
          ...(d.catatan ? { catatan: d.catatan } : {}),
        },
      })

      await tx.kamar.update({ where: { id: sewa.kamar.id }, data: { status: 'TERSEDIA' } })

      // Deposit dikembalikan -> uang keluar, catat di Pengeluaran (bukan
      // potong pendapatan) supaya laporan laba tetap bersih.
      if (kembali > 0) {
        await tx.pengeluaran.create({
          data: {
            propertiId: sewa.kamar.propertiId,
            kategori: 'LAINNYA',
            deskripsi: `Pengembalian deposit — ${sewa.kamar.nomor} — ${sewa.penyewa?.nama ?? 'Tanpa nama'}`,
            nominal: kembali,
            tanggal: keluarAktual,
          },
        })
      }

      // Deposit hangus -> uang masuk. Dibuat sebagai Tagihan LUNAS (bukan
      // ditandai di Sewa) supaya ikut terhitung di laporan keuangan yang
      // menjumlahkan Tagihan berstatus LUNAS. Paired dengan Pembayaran
      // supaya konsisten dengan tagihan sewa biasa.
      if (hangus > 0) {
        const tagihanDeposit = await tx.tagihan.create({
          data: {
            sewaId: sewa.id,
            nominal: hangus,
            periodeDari: sewa.tanggalMasuk,
            periodeHingga: keluarAktual,
            jatuhTempo: keluarAktual,
            status: 'LUNAS',
            catatan: 'Deposit hangus (tidak dikembalikan)',
          },
        })
        await tx.pembayaran.create({
          data: {
            tagihanId: tagihanDeposit.id,
            nominal: hangus,
            metodeBayar: 'LAINNYA',
            catatan: 'Deposit hangus saat check-out',
            dibayarPada: keluarAktual,
          },
        })
      }

      await tx.notifikasi.create({
        data: {
          propertiId: sewa.kamar.propertiId,
          tipe: 'INFO',
          judul: 'Check-out',
          pesan:
            `${sewa.penyewa?.nama ?? 'Penyewa'} keluar dari ${sewa.kamar.nomor}. ` +
            `Deposit ${labelDeposit(deposit)}: kembali ${labelDeposit(kembali)}` +
            `${hangus > 0 ? `, hangus ${labelDeposit(hangus)}` : ''}.` +
            `${sisaTagihan > 0 ? ` Tagihan belum lunas ${labelDeposit(sisaTagihan)}.` : ''}`,
        },
      })

      return { deposit, kembali, hangus, sisaTagihan }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[checkout] transaction error:', err)
    return NextResponse.json({ error: err?.message ?? 'Terjadi kesalahan server' }, { status: 500 })
  }
}
