// lib/sewa.ts
//
// Hitungan tanggal sewa yang dipakai bersama oleh booking baru dan pindah
// kamar — dua tempat yang harus menghasilkan tanggal keluar PERSIS sama.
//
// Sebelum ini keduanya menulis rantai `addDays/addMonths/addYears` sendiri,
// dan tak ada satu pun yang benar-benar diuji: test struk menyalin ulang
// perhitungannya, jadi tesnya tetap hijau walau kode produksi dirusak.

import { addDays, addMonths, addYears } from 'date-fns'
import type { PeriodeSewa } from '@prisma/client'

/** Periode yang bisa dipilih saat booking. MINGGUAN ada di enum tapi tak
 *  ditawarkan di form — dan karena itu tak punya harga per tipe kamar. */
export type PeriodeDikenal = 'HARIAN' | 'MINGGUAN' | 'BULANAN' | 'TAHUNAN'

/**
 * Tanggal keluar dari tanggal masuk + durasi, mengikuti periode.
 *
 * Jamnya SELALU ikut jam masuk — penyewa masuk 19:00, keluar 19:00 di hari
 * terakhir. Jam 12:00 sengaja tidak dipakai: itu hanya acuan batas check-out
 * di layar kamar, bukan waktu yang tercetak di nota.
 */
export function tanggalKeluar(masuk: Date, periode: PeriodeSewa | PeriodeDikenal, durasi: number): Date {
  switch (periode) {
    case 'HARIAN':
      return addDays(masuk, durasi)
    case 'MINGGUAN':
      return addDays(masuk, durasi * 7)
    case 'BULANAN':
      return addMonths(masuk, durasi)
    case 'TAHUNAN':
      return addYears(masuk, durasi)
  }
}
