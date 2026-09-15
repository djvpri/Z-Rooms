// lib/checkout.ts
//
// Satu-satunya sumber kebenaran untuk "sewa ini sudah lewat durasi?".
//
// Aturan (diputuskan user):
//   - Sewa HARIAN habis jam `Properti.jamCheckout` pada hari terakhir, BUKAN
//     jam masuk + 24 jam. Orang masuk jam 15:00 tetap habis jam 12:00 besok.
//     Dipilih supaya checkout serempak dan kasir bisa keliling sekali.
//   - Periode lain (MINGGUAN/BULANAN/TAHUNAN) habis di tanggal `tanggalKeluar`
//     pada jam yang sama, agar tak ada sewa yang "habis jam 23:59".
//   - Setelah habis masih ada kelonggaran `toleransiCheckout` menit sebelum
//     ditandai LEWAT. Jam check-out sungguhan dihitung dari jam ini.
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

/**
 * Batas waktu check-out: kapan sewa ini mulai dianggap lewat.
 * = hari terakhir pada jam jamCheckout + toleransi.
 */
export function batasCheckout(
  tanggalKeluar: Date,
  aturan: AturanCheckout,
): Date {
  const batas = new Date(tanggalKeluar)
  // Jam dinding lokal, bukan UTC — tanggalKeluar disimpan sebagai tengah malam.
  batas.setHours(0, 0, 0, 0)
  batas.setMinutes(jamKeMenit(aturan.jamCheckout) + Math.max(0, aturan.toleransiCheckout))
  return batas
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
