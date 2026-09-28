// lib/rentang.ts — murni util, tak ada 'use client'

/** Tanggal YYYY-MM-DD di zona WIB (UTC+7). */
export function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}

/** Rentang cepat untuk filter keuangan. */
export function rentangCepat(kode: string): { dari: string; sampai: string } | null {
  const s = new Date(Date.now() + 7 * 3600_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  switch (kode) {
    case 'hari': {
      const h = iso(s)
      return { dari: h, sampai: h }
    }
    case '7':
    case '30': {
      const n = Number(kode)
      const awal = new Date(s)
      awal.setUTCDate(awal.getUTCDate() - (n - 1))
      return { dari: iso(awal), sampai: iso(s) }
    }
    case 'bulan': {
      const awal = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1))
      return { dari: iso(awal), sampai: iso(s) }
    }
    case 'lalu': {
      const awal = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1))
      const akhir = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 0))
      return { dari: iso(awal), sampai: iso(akhir) }
    }
    default:
      return null
  }
}

/** Default rentang: bulan berjalan (WIB). */
export function defaultRentang(): { dari: string; sampai: string } {
  return rentangCepat('bulan') ?? { dari: hariIniWib(), sampai: hariIniWib() }
}