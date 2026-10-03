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
import { kekuranganDeposit } from '@/lib/deposit'
import { addDays } from 'date-fns'
import { tanggalKeluar, kreditPindahKamar } from '@/lib/sewa'
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
      // Semua tagihan (bukan cuma belum lunas): pembayaran perlu dijumlah
      // untuk hitung kredit sisa bayar. DIBATALKAN disaring di bawah.
      tagihan: { include: { pembayaran: true } },
    },
  })
  if (!sewa) return NextResponse.json({ error: 'Sewa tidak ditemukan' }, { status: 404 })
  if (sewa.statusSewa !== 'AKTIF') {
    return NextResponse.json({ error: `Sewa sudah berstatus ${sewa.statusSewa}` }, { status: 400 })
  }

  const hidup = sewa.tagihan.filter(t => t.status !== 'DIBATALKAN')
  const sisaTagihan = hidup
    .filter(t => t.status === 'BELUM_BAYAR' || t.status === 'TERLAMBAT' || t.status === 'SEBAGIAN')
    .reduce((s, t) => s + Number(t.nominal), 0)
  // Total yang benar-benar masuk untuk sewa lama. Deposit sengaja di luar —
  // jalur uang masuk sendiri, bukan Tagihan/Pembayaran (lihat schema).
  const totalDibayar = hidup.reduce(
    (s, t) => s + t.pembayaran.reduce((a, b) => a + Number(b.nominal), 0),
    0,
  )

  const tujuan = await prisma.kamar.findFirst({
    where: { id: d.kamarTujuanId, propertiId: properti.id, arsip: false },
    include: { tipe: { include: { harga: { where: { aktif: true } } } } },
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

  // Kredit sisa bayar: selisih antara yang sudah dibayar penyewa untuk sewa
  // lama dan nilai hari yang benar-benar ditempati sampai tanggal pindah.
  const { kredit, hariDipakai, hariPeriode, nilaiPakai } = kreditPindahKamar({
    tanggalMasuk: sewa.tanggalMasuk,
    tanggalPindah: pindah,
    tanggalKeluar: sewa.tanggalKeluar,
    hargaSewa: Number(sewa.hargaSewa),
    totalDibayar,
  })

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
      //
      // Jangan ambil harga[0]: urutannya tak dijamin. Periode dipilih dari tarif
      // PERTAMA YANG ADA pada kamar tujuan — kamar yang hanya disewakan bulanan
      // tetap bisa dituju, dan sewa pindahannya ikut bulanan. HARIAN diutamakan
      // kalau ada, karena itu yang paling umum di properti ini.
      const tarifTujuan = tujuan.tipe?.harga ?? []
      const dipilih = tarifTujuan.find(h => h.periodeSewa === 'HARIAN') ?? tarifTujuan[0]
      const periodeBaru = (dipilih?.periodeSewa ?? sewa.periodeSewa) as typeof sewa.periodeSewa
      const hargaBaru = Number(dipilih?.harga ?? sewa.hargaSewa)
      const keluarBaru = tanggalKeluar(pindah, periodeBaru, d.durasi)

      // Deposit pindah apa adanya — tanpa baris Pengeluaran/Pembayaran, karena
      // uangnya tidak berpindah tangan.
      const depositLama = Number(sewa.deposit)
      const depositDiminta = tujuan.tipe?.harga[0]?.deposit != null ? Number(tujuan.tipe.harga[0].deposit) : depositLama
      const kurangDeposit = kekuranganDeposit(depositLama, depositDiminta)

      const sewaBaru = await tx.sewa.create({
        data: {
          kamarId: tujuan.id,
          penyewaId: sewa.penyewaId,
          periodeSewa: periodeBaru,
          tanggalMasuk: pindah,
          tanggalKeluar: keluarBaru,
          hargaSewa: hargaBaru,
          deposit: depositLama,
          statusSewa: 'AKTIF',
          metodeBayar: sewa.metodeBayar,
          catatan: `Pindah dari ${sewa.kamar.nomor}`,
        },
      })

      // Kredit sisa bayar dari sewa lama (periode sudah dibayar penuh, pindah
      // di tengah): POTONG nominal tagihan pertama — bukan baris Pembayaran.
      // Alasan: laporan keuangan menjumlahkan Tagihan LUNAS berdasar nominal;
      // uang kredit ini sudah terhitung sbg pendapatan saat tagihan lama
      // dilunasi, jadi tagihan baru harus lebih kecil, bukan lunas dgn
      // "pembayaran" fiktif (yang mendobel pendapatan).
      // Sisa kredit yang tak muat di tagihan pertama (kamar baru lebih murah)
      // dicatat di notifikasi + catatan sewa — ponytail: belum otomatis masuk
      // tagihan periode berikutnya; tambahkan saat generator tagihan ada.
      // Uang diputuskan SATU ARAH di sini (keputusan pemilik):
      //   - harga kamar baru > kredit → penyewa MENAMBAH bayar, lewat tagihan
      //     BELUM_BAYAR di bawah (dikasih di modal saat pindah);
      //   - harga kamar baru < kredit → sisa uang KEMBALI ke penyewa: dicatat
      //     sbg Pengeluaran (pola pengembalian deposit di checkout — uang keluar
      //     adalah beban, BUKAN potong pendapatan) dan kasir menyerahkan
      //     kembaliannya; nominalnya tampil di respons + nota pindah.
      const kreditEfektif = Math.min(kredit, hargaBaru)
      const kembalian = kredit - kreditEfektif
      const nominalTagihanBaru = hargaBaru - kreditEfektif
      if (nominalTagihanBaru > 0) {
        await tx.tagihan.create({
          data: {
            sewaId: sewaBaru.id,
            nominal: nominalTagihanBaru,
            periodeDari: pindah,
            periodeHingga: keluarBaru,
            jatuhTempo: addDays(pindah, 3),
            status: 'BELUM_BAYAR',
            ...(kreditEfektif > 0 ? { catatan: `Sudah dikredit ${label(kreditEfektif)} dari sisa bayar kamar ${sewa.kamar.nomor}` } : {}),
          },
        })
      }

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

      // Kembalian tunai ke penyewa — dicatat sbg Pengeluaran supaya muncul
      // di laporan keuangan dan kasir punya jejak uang yang diserahkan.
      if (kembalian > 0) {
        await tx.pengeluaran.create({
          data: {
            propertiId: properti.id,
            kategori: 'LAINNYA',
            deskripsi: `Pengembalian selisih pindah kamar ${sewa.kamar.nomor} → ${tujuan.nomor} — ${sewa.penyewa?.nama ?? 'Tanpa nama'}`,
            nominal: kembalian,
            tanggal: pindah,
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
            `${sisaTagihan > 0 ? ` Tagihan lama belum lunas ${label(sisaTagihan)}.` : ''}` +
            `${kredit > 0 ? ` Kredit sisa bayar ${label(kredit)} (terpakai ${label(kreditEfektif)}` +
              `${kembalian > 0 ? `, kembalian ${label(kembalian)} dikembalikan ke penyewa` : ''}).` : ''}`,
        },
      })

      return {
        sewaBaruId: sewaBaru.id,
        kamarAsal: sewa.kamar.nomor,
        kamarTujuan: tujuan.nomor,
        penyewa: sewa.penyewa?.nama ?? null,
        tanggalPindah: pindah.toISOString(),
        tanggalKeluar: keluarBaru.toISOString(),
        periodeBaru,
        durasi: d.durasi,
        hargaLama: Number(sewa.hargaSewa),
        hargaBaru,
        periodeLama: sewa.periodeSewa as string,
        hariDipakai,
        nilaiPakai,
        totalDibayar,
        kredit,
        kreditTerpakai: kreditEfektif,
        kembalian,
        kurangBayar: nominalTagihanBaru,
        depositPindah: depositLama,
        kurangDeposit,
        tagihanBaru: nominalTagihanBaru + kurangDeposit,
        sisaTagihanLama: sisaTagihan,
      }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[pindah-kamar] transaction error:', err)
    return NextResponse.json({ error: err?.message ?? 'Terjadi kesalahan server' }, { status: 500 })
  }
}
