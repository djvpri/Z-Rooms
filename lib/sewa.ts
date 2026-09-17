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

/** Periode yang dikenal sistem (nilai enum `PeriodeSewa`). Semuanya masih
 *  dihitung `tanggalKeluar` supaya sewa LAMA tetap akurat.
 *
 *  Sejak Z-Rooms difokuskan sewa harian, hanya HARIAN yang ditawarkan saat
 *  booking dan diisi tarifnya di pengaturan tipe kamar. Tipe ini tetap
 *  mencakup keempatnya karena data lama berperiode lain masih dibaca dan
 *  ditampilkan (label nota, durasi, tanggal keluar). */
export type PeriodeDikenal = 'HARIAN' | 'MINGGUAN' | 'BULANAN' | 'TAHUNAN'

/**
 * Tanggal keluar dari tanggal masuk + durasi, mengikuti periode.
 *
 * Yang dihasilkan hanya TANGGAL yang benar. Jamnya masih menyalin jam masuk,
 * dan itu bukan jam yang berlaku: sewa berakhir pada jam check-out properti
 * (tab Pengaturan) di hari itu — lihat batasCheckout() di lib/checkout.ts, yang
 * dipakai nota dan layar kamar. Nilai dari fungsi ini disimpan apa adanya ke DB
 * sebagai penanda hari terakhir.
 *
 * Tiga tempat butuh tanggal ini (booking baru, pindah kamar), jadi sengaja
 * satu fungsi — dulu rantai addDays/addMonths/addYears ditulis ulang di tiap
 * tempat, dan perbedaannya tak akan ketahuan.
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
