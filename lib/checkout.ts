// lib/checkout.ts
//
// Satu-satunya sumber kebenaran untuk "sewa ini sudah lewat durasi?".
//
// Aturan (diputuskan user):
//   - Sewa habis jam `Properti.jamCheckout` pada hari terakhir, BUKAN jam
//     masuk + 24 jam. Orang masuk jam 15:00 tetap habis jam 12:00 besok.
//     Dipilih supaya checkout serempak dan kasir bisa keliling sekali.
//   - BERLAKU UNTUK SEMUA PERIODE, bukan cuma HARIAN: BULANAN/TAHUNAN juga
//     habis pada jam check-out di tanggal terakhirnya. Nota booking mencetak
//     jam yang sama, jadi satu sewa tak pernah terbaca berbeda di dua tempat.
//     (Catatan lama di sini bilang periode lain memakai jam masuk — itu tak
//     pernah cocok dengan perilaku layar kamar, yang memakai batasCheckout()
//     untuk semua periode. Yang benar adalah yang ini.)
//   - Setelah habis masih ada kelonggaran `toleransiCheckout` menit sebelum
//     ditandai LEWAT. Toleransi IKUT dihitung batasCheckout(), jadi nota dan
//     layar kamar selalu menyebut angka yang persis sama.
//
// Ini sengaja murni: tak sentuh DB, tak lihat jam sekarang sendiri. Pemanggil
// yang menyuntik `sekarang`, jadi bisa diuji tanpa memalsukan waktu.
import type { PeriodeSewa } from '@prisma/client'

export interface AturanCheckout {
  jamCheckout: string      // "HH:mm"
  toleransiCheckout: number // menit
}

/** "12:00" -> 720 menit sejak tengah malam. Input tak valid -> fallback 12:00. */
export function jamKeMenit(jam: string): number {
  const cocok = /^(\d{1,2}):(\d{2})$/.exec((jam ?? '').trim())
  if (!cocok) return 12 * 60
  const h = Number(cocok[1])
  const m = Number(cocok[2])
  if (h > 23 || m > 59) return 12 * 60
  return h * 60 + m
}

/** Offset WIB terhadap UTC, menit. WIB tak punya DST, jadi konstan. */
const WIB_MENIT = 7 * 60

/**
 * Kapan sewa berakhir: hari terakhir pada jam `jamCheckout` + toleransi, WIB.
 *
 * Ini SATU-SATUNYA angka check-out, dipakai nota booking ("Keluar 17 Sep pukul
 * 14.00") dan layar kamar ("Kosong 17 Sep, 14:00"). Dulu nota mencetak jam
 * MASUK, jadi satu sewa terbaca "Keluar 19.00" di nota sementara kamar bilang
 * "Kosong 14.00". Toleransi ikut dihitung supaya kedua tempat menyebut angka
 * yang persis sama.
 *
 * Jamnya dipasang lewat UTC, bukan setHours/setMinutes. Container produksi
 * jalan dengan TZ=UTC, jadi setHours memasang jam UTC — "12:00" jadi 12:00 UTC
 * (19:00 WIB) dan kasir melihat batas 7 jam lebih lambat dari seharusnya.
 * Dihitung di UTC supaya hasilnya sama di mesin mana pun.
 */
export function batasCheckout(
  tanggalKeluar: Date,
  aturan: AturanCheckout,
): Date {
  // `tanggalKeluar` disimpan apa adanya dari tanggal masuk (jamnya ikut jam
  // masuk), jadi komponen UTC-nya BUKAN hari yang dimaksud. Masuk 17 Sep
  // pukul 00:00 WIB tersimpan "16 Sep 17:00 UTC" — dibaca sebagai tanggal UTC,
  // hari terakhirnya jadi 16 Sep, sehari terlalu cepat. Geser ke WIB dulu.
  const wib = new Date(tanggalKeluar.getTime() + WIB_MENIT * 60000)
  const hari = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())
  const menit = jamKeMenit(aturan.jamCheckout) + Math.max(0, aturan.toleransiCheckout)
  return new Date(hari - WIB_MENIT * 60000 + menit * 60000)
}

export interface StatusLewat {
  lewat: boolean
  /** Menit keterlambatan (0 kalau belum lewat). */
  menitLebih: number
}

/** Apakah sewa sudah melewati batas check-out pada `sekarang`. */
export function cekLewat(
  tanggalKeluar: Date,
  aturan: AturanCheckout,
  sekarang: Date,
): StatusLewat {
  const batas = batasCheckout(tanggalKeluar, aturan)
  const selisih = sekarang.getTime() - batas.getTime()
  return selisih <= 0
    ? { lewat: false, menitLebih: 0 }
    : { lewat: true, menitLebih: Math.floor(selisih / 60000) }
}

/** "2 hari 3 jam" / "45 menit" — untuk label peringatan. */
export function labelLewat(menit: number): string {
  if (menit < 60) return `${menit} menit`
  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam`
  const hari = Math.floor(jam / 24)
  const sisaJam = jam % 24
  return sisaJam === 0 ? `${hari} hari` : `${hari} hari ${sisaJam} jam`
}

/**
 * Hari terakhir sewa menurut periode. Dipakai form booking untuk mengisi
 * `tanggalKeluar` — sebelumnya `tanggalKeluar` diisi apa adanya oleh kasir
 * sehingga durasi HARIAN bisa jadi 1 hari atau 30 hari tanpa pola.
 */
export function tambahPeriode(dari: Date, periode: PeriodeSewa): Date {
  const hasil = new Date(dari)
  switch (periode) {
    case 'HARIAN':   hasil.setDate(hasil.getDate() + 1); break
    case 'MINGGUAN': hasil.setDate(hasil.getDate() + 7); break
    case 'BULANAN':  hasil.setMonth(hasil.getMonth() + 1); break
    case 'TAHUNAN':  hasil.setFullYear(hasil.getFullYear() + 1); break
  }
  return hasil
}
