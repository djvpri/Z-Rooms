// app/api/karaoke/laporan/route.ts
//
// Laporan pendapatan karaoke. Terpisah dari `api/keuangan` SENGAJA: keuangan
// adalah laporan usaha hotel (tagihan sewa, pengeluaran, piutang kamar) dan
// karaoke adalah unit usaha yang berdiri sendiri. Menggabungkan keduanya berarti
// setiap perubahan bentuk laporan karaoke menyentuh berkas yang menghitung uang
// sewa kamar — risiko yang tak sebanding.
//
// ATURAN UANG:
//   - Hanya sesi SELESAI yang dihitung. Uang karaoke masuk saat sesi ditutup,
//     bukan saat booking dibuat. BATAL tidak pernah jadi pendapatan; BOOKING dan
//     BERJALAN belum tentu jadi uang (masih bisa batal).
//   - Sewa diambil dari `totalSewa` yang TERSIMPAN, bukan dihitung ulang dari
//     tarif. Tarif ruang boleh berubah besok; laporan bulan lalu tak ikut berubah.
//   - Minuman diambil dari `ItemMinumanKaraoke.subtotal` yang tersimpan — harga
//     yang benar-benar dibayar, bukan harga katalog hari ini.
//   - `jaminan` hanya DILAPORKAN, tidak dikurangkan dari total. Jaminan adalah
//     uang muka, bukan diskon: uang yang diterima sudah utuh di sewa + minuman.
import { NextRequest, NextResponse } from 'next/server'
import { startOfMonth, endOfMonth } from 'date-fns'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { saringSesiLaporan } from '@/lib/karaoke'

/** Kunci hari menurut waktu LOKAL server. */
function kunciHari(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Properti tidak ditemukan' }, { status: 404 })

  const sp = new URL(req.url).searchParams
  const dari = sp.get('dari')
  const sampai = sp.get('sampai')

  // Rentang default: bulan berjalan, sama dengan halaman keuangan.
  const awal = dari ? new Date(dari) : startOfMonth(new Date())
  const akhir = sampai ? new Date(sampai) : endOfMonth(new Date())
  if (Number.isNaN(awal.getTime()) || Number.isNaN(akhir.getTime())) {
    return NextResponse.json({ error: 'Tanggal tidak valid.' }, { status: 400 })
  }

  const sesi = await prisma.sesiKaraoke.findMany({
    // Saringan dari `lib/karaoke.ts` — dipakai bersama uji, supaya uji menjaga
    // saringan yang benar-benar dipakai produksi.
    where: saringSesiLaporan(properti.id, awal, akhir),
    include: {
      ruang: { select: { id: true, nama: true } },
      minuman: { select: { namaProduk: true, jumlah: true, subtotal: true } },
    },
    orderBy: { mulaiPada: 'asc' },
  })

  const perRuang = new Map<string, { ruangId: string; nama: string; sesi: number; jam: number; sewa: number; minuman: number }>()
  const perHari = new Map<string, { tanggal: string; sesi: number; sewa: number; minuman: number }>()
  const perProduk = new Map<string, { nama: string; jumlah: number; subtotal: number }>()

  let totalSewa = 0
  let totalMinuman = 0
  let totalJaminan = 0
  let totalJam = 0

  for (const s of sesi) {
    const sewa = Number(s.totalSewa)
    const minuman = s.minuman.reduce((a, m) => a + Number(m.subtotal), 0)

    totalSewa += sewa
    totalMinuman += minuman
    totalJaminan += Number(s.jaminan)
    totalJam += s.jumlahJam

    const r = perRuang.get(s.ruangId) ?? { ruangId: s.ruangId, nama: s.ruang.nama, sesi: 0, jam: 0, sewa: 0, minuman: 0 }
    r.sesi += 1
    r.jam += s.jumlahJam
    r.sewa += sewa
    r.minuman += minuman
    perRuang.set(s.ruangId, r)

    // Dikelompokkan menurut `mulaiPada`, bukan `selesaiAktual`: sesi 23:00–01:00
    // adalah penghasilan hari saat ia MULAI. Memakai selesaiAktual memindahkan
    // penghasilan malam ke hari berikutnya, dan laporan harian jadi tak cocok
    // dengan setoran kasir.
    const tanggal = kunciHari(new Date(s.mulaiPada))
    const h = perHari.get(tanggal) ?? { tanggal, sesi: 0, sewa: 0, minuman: 0 }
    h.sesi += 1
    h.sewa += sewa
    h.minuman += minuman
    perHari.set(tanggal, h)

    for (const m of s.minuman) {
      const p = perProduk.get(m.namaProduk) ?? { nama: m.namaProduk, jumlah: 0, subtotal: 0 }
      p.jumlah += m.jumlah
      p.subtotal += Number(m.subtotal)
      perProduk.set(m.namaProduk, p)
    }
  }

  return NextResponse.json({
    dari: awal,
    sampai: akhir,
    ringkasan: {
      totalSewa,
      totalMinuman,
      total: totalSewa + totalMinuman,
      totalJaminan,
      jumlahSesi: sesi.length,
      totalJam,
      // Rata-rata per sesi: memperlihatkan tarif efektif, bukan cuma total.
      rataPerSesi: sesi.length > 0 ? Math.round((totalSewa + totalMinuman) / sesi.length) : 0,
    },
    perRuang: [...perRuang.values()].sort((a, b) => b.sewa + b.minuman - (a.sewa + a.minuman)),
    perHari: [...perHari.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    perProduk: [...perProduk.values()].sort((a, b) => b.subtotal - a.subtotal),
    // Daftar sesi ikut dikirim supaya angka yang janggal bisa ditelusuri sampai
    // sesinya, bukan cuma dipercaya.
    sesi: sesi.map((s) => ({
      id: s.id,
      nomor: s.nomor,
      ruang: s.ruang.nama,
      namaPelanggan: s.namaPelanggan,
      mulaiPada: s.mulaiPada,
      selesaiAktual: s.selesaiAktual,
      jumlahJam: s.jumlahJam,
      totalSewa: Number(s.totalSewa),
      totalMinuman: s.minuman.reduce((a, m) => a + Number(m.subtotal), 0),
      jaminan: Number(s.jaminan),
      lunas: s.lunas,
    })),
  })
}
