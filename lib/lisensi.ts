// lib/plans.ts
//
// Lisensi properti: nama plan, label, dan status masa berlakunya.
//
// Semua fungsi di sini MURNI (tak menyentuh DB, tak membaca jam mesin kecuali
// lewat argumen `sekarang`) supaya bisa diuji tanpa database dan tanpa
// bergantung zona waktu mesin yang menjalankannya.
//
// Bedanya dengan ZGym: di sana plan juga menentukan kuota (maxMembers,
// maxInstructors, maxClasses) yang benar-benar ditegakkan. ZXRoom tak punya
// padanannya, jadi di sini plan hanya menentukan label dan HARGA — sengaja
// tidak ada kolom kuota supaya tak ada batas yang ditampilkan tapi tak berlaku.

export const PLANS = {
  free:     { label: 'Free',     harga: 0 },
  basic:    { label: 'Basic',    harga: 100000 },
  pro:      { label: 'Pro',      harga: 500000 },
  // Nama plan SENGAJA sama dengan ZGym dan tombol di hub ZOne
  // (ManageContent.tsx: PLANS = ['free','basic','pro','enterprise']).
  // Dari sana tak ada tombol "business" — kalau di sini tetap "business",
  // klik Enterprise di hub akan ditolak 409 dan lisensi tak pernah tersimpan.
  enterprise: { label: 'Enterprise', harga: 1000000 },
} as const

export type NamaPlan = keyof typeof PLANS

export const DAFTAR_PLAN = Object.keys(PLANS) as NamaPlan[]

/** Benar kalau string ini nama plan yang dikenal. Dipakai validasi input. */
export function planDikenal(plan: unknown): plan is NamaPlan {
  return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLANS, plan)
}

/** Label tampil sebuah plan. Plan tak dikenal -> 'FREE', bukan blank. */
export function labelPlan(plan: string | null | undefined): string {
  return planDikenal(plan) ? PLANS[plan].label : PLANS.free.label
}

/** Harga plan per bulan, rupiah. Plan tak dikenal -> 0. */
export function hargaPlan(plan: string | null | undefined): number {
  return planDikenal(plan) ? PLANS[plan].harga : PLANS.free.harga
}

/** Berapa hari lagi berakhir. Negatif = sudah lewat. */
const SEHARI_MS = 24 * 60 * 60 * 1000

/**
 * Status lisensi dari tanggal berakhir. Dipakai halaman Lisensi untuk memilih
 * warna dan kalimat, jadi keputusannya satu tempat.
 *
 * `belum-diatur` dipisah dari `aktif`: tanggal kosong berarti pemilik belum
 * mengisi apa pun, dan itu bukan hal yang sama dengan "aktif selamanya".
 */
export type StatusLisensi = 'belum-diatur' | 'habis' | 'segera-habis' | 'aktif'

/** Ambang "segera habis", dalam hari. Sama dengan ZGym (14). */
export const AMBANG_SEGERA_HABIS = 14

export function sisaHari(planExpires: Date | string | null | undefined, sekarang: Date = new Date()): number | null {
  if (!planExpires) return null
  const akhir = planExpires instanceof Date ? planExpires : new Date(planExpires)
  if (isNaN(akhir.getTime())) return null
  const selisih = akhir.getTime() - sekarang.getTime()
  if (selisih === 0) return 0
  // Dibulatkan menjauhi nol, bukan Math.ceil apa adanya: sisa 3 jam harus jadi
  // 1 ("masih berlaku hari ini"), dan lewat 1 jam harus jadi -1, bukan -0.
  // Math.ceil(-0.04) = -0, dan -0 < 0 itu FALSE — lisensi yang baru saja habis
  // akan salah terbaca "segera habis", bukan "habis".
  return Math.ceil(Math.abs(selisih) / SEHARI_MS) * Math.sign(selisih)
}

export function statusLisensi(
  planExpires: Date | string | null | undefined,
  sekarang: Date = new Date(),
): StatusLisensi {
  const sisa = sisaHari(planExpires, sekarang)
  if (sisa === null) return 'belum-diatur'
  if (sisa < 0) return 'habis'
  if (sisa <= AMBANG_SEGERA_HABIS) return 'segera-habis'
  return 'aktif'
}

/**
 * Kalimat status untuk ditampilkan. Dipisah dari komponen supaya bisa diuji
 * dan supaya halaman tak penuh percabangan teks.
 */
export function kalimatStatus(status: StatusLisensi, sisa: number | null): string {
  switch (status) {
    case 'belum-diatur':
      return 'Tanggal berakhir belum diatur.'
    case 'habis':
      return `Langganan sudah berakhir ${Math.abs(sisa as number)} hari lalu`
    case 'segera-habis':
      return `Sisa ${sisa} hari — segera perpanjang`
    default:
      return `Aktif — sisa ${sisa} hari`
  }
}

/**
 * Tambah bulan ke tanggal berakhir, untuk tombol perpanjang.
 *
 * Dihitung dari tanggal yang SEDANG berlaku kalau masih aktif (supaya
 * perpanjangan menyambung, bukan memotong sisa), atau dari sekarang kalau
 * sudah habis/belum diatur.
 *
 * Tanggalnya dijepit ke akhir bulan: 31 Januari + 1 bulan = 28/29 Februari,
 * bukan meluber ke 3 Maret seperti `setMonth` pada JavaScript.
 */
export function perpanjang(
  bulan: number,
  planExpires: Date | string | null | undefined,
  sekarang: Date = new Date(),
): Date {
  const sisa = sisaHari(planExpires, sekarang)
  const dasar = sisa !== null && sisa >= 0 && planExpires ? new Date(planExpires) : new Date(sekarang)

  // Pakai komponen UTC supaya penjumlahan bulan tak bergeser oleh zona waktu
  // mesin. Nilai yang disimpan tetap tengah malam UTC, sama seperti tanggal
  // lain di aplikasi ini.
  const y = dasar.getUTCFullYear()
  const m = dasar.getUTCMonth()
  const d = dasar.getUTCDate()
  const target = new Date(Date.UTC(y, m + bulan, 1))
  // Hari terakhir bulan tujuan, supaya 31 -> 30/28 tak meluber.
  const hariTerakhir = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, hariTerakhir))
  return target
}
