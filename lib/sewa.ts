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

/** Periode yang dikenal sistem (nilai enum `PeriodeSewa`). Semuanya
 *  dihitung `tanggalKeluar` supaya sewa LAMA tetap akurat.
 *
 *  Booking baru menawarkan HARIAN, MINGGUAN, BULANAN, dan TAHUNAN. */
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

// ─── KREDIT PINDAH KAMAR ───────────────────────────────
//
// Pindah kamar bisa terjadi di tengah periode yang SUDAH dibayar penuh. Tanpa
// kredit, penyewa kehilangan sisa hari itu diam-diam dan kasir harus hitung
// manual (refund tunai di luar sistem, tanpa jejak).
//
// Model: nilai yang "dipakai" = tarif harian sewa lama × hari ditempati
// (tanggalMasuk → tanggalPindah). Sisa pembayaran di atas nilai pakai itu
// jadi kredit yang diterapkan ke tagihan pertama kamar tujuan — uang tidak
// berpindah tangan, konsisten dengan deposit yang ikut sebagai titipan.

export interface KreditPindah {
  /** Lama periode kontrak lama, dalam hari (pembagi tarif harian). */
  hariPeriode: number
  /** Hari ditempati sampai tanggal pindah, dijepit ke [0, hariPeriode]. */
  hariDipakai: number
  /** tarif harian × hariDipakai, dibulatkan ke bawah (uang integer). */
  nilaiPakai: number
  /** totalDibayar − nilaiPakai, minimal 0. Bisa dipakai penuh atau terpotong
   *  oleh harga tagihan baru yang lebih murah — sisanya dicatat di notifikasi. */
  kredit: number
}

/** Semua murni dari parameter — tak lihat DB/jam sekarang (pola hitungDeposit). */
export function kreditPindahKamar(p: {
  tanggalMasuk: Date
  tanggalPindah: Date
  tanggalKeluar: Date
  hargaSewa: number
  totalDibayar: number
}): KreditPindah {
  const MS_HARI = 86_400_000
  const hariAntara = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_HARI))
  const hariPeriode = Math.max(1, hariAntara(p.tanggalMasuk, p.tanggalKeluar))
  // Pindah di hari yang sama dgn masuk tetap 1 hari ditempati — floor murni
  // menghasilkan 0 padahal hari itu terpakai (sewa harian). Pindah sebelum
  // masuk (data aneh) tetap 0.
  const hariDipakai = p.tanggalPindah.getTime() < p.tanggalMasuk.getTime()
    ? 0
    : Math.min(hariPeriode, hariAntara(p.tanggalMasuk, p.tanggalPindah) + 1)
  const nilaiPakai = Math.floor((p.hargaSewa / hariPeriode) * hariDipakai)
  return { hariPeriode, hariDipakai, nilaiPakai, kredit: Math.max(0, p.totalDibayar - nilaiPakai) }
}
