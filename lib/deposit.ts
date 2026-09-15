// lib/deposit.ts
//
// Keputusan deposit check-out, terpisah dari route supaya bisa diuji langsung
// (scripts/check-checkout-deposit.mjs mengimpor berkas ini, bukan menyalinnya).
//
// Sengaja murni: tak sentuh DB, tak lihat jam sekarang. Route yang menyediakan
// angka deposit/tagihan dari database.

/** Perlakuan deposit yang dipilih kasir di form check-out. */
export type PerlakuanDeposit = 'PENUH' | 'HANGUS' | 'SEBAGIAN'

export interface HasilDeposit {
  /** Bagian deposit yang dikembalikan ke penyewa (uang keluar). */
  kembali: number
  /** Bagian deposit yang ditahan (jadi tagihan LUNAS, uang masuk). */
  hangus: number
}

export type KeputusanDeposit =
  | { ok: true; hasil: HasilDeposit }
  | { ok: false; error: string }

/**
 * Hitung pembagian deposit. SEBAGIAN wajib nominal di antara 1 dan deposit-1 —
 * 0 atau deposit penuh sudah diwakili HANGUS/PENUH, jadi menolaknya di sini
 * mencegah kasir memilih SEBAGIAN lalu tak ada yang benar-benar dibagi.
 *
 * `depositKembali` dijepit ke [0, deposit] supaya nilai di luar rentang tak
 * pernah menghasilkan kembali > deposit (uang keluar melebihi titipan).
 */
export function hitungDeposit(
  deposit: number,
  perlakuan: PerlakuanDeposit,
  depositKembali: number,
): KeputusanDeposit {
  const titipan = Math.max(0, deposit)

  if (perlakuan === 'PENUH') return { ok: true, hasil: { kembali: titipan, hangus: 0 } }
  if (perlakuan === 'HANGUS') return { ok: true, hasil: { kembali: 0, hangus: titipan } }

  if (!Number.isFinite(depositKembali) || depositKembali <= 0 || depositKembali >= titipan) {
    return {
      ok: false,
      error: `Nominal sebagian harus di antara 1 dan ${titipan - 1}`,
    }
  }
  // Dipotong ke bawah karena kolom uang Decimal(12,0). Nilai pecahan di bawah 1
  // (mis. 0.5) akan jadi 0 = sama seperti HANGUS; tolak supaya "SEBAGIAN" tak
  // pernah berarti "tak ada yang dikembalikan" — itu pilihan HANGUS.
  const kembali = Math.floor(depositKembali)
  if (kembali <= 0) {
    return { ok: false, error: 'Nominal sebagian harus minimal Rp 1' }
  }
  return { ok: true, hasil: { kembali, hangus: titipan - kembali } }
}

/**
 * Kekurangan deposit saat pindah kamar. Deposit lama ikut pindah apa adanya
 * (bukan dikembalikan lalu disetor ulang), jadi yang perlu ditagih hanya
 * selisihnya. Deposit kamar tujuan lebih murah -> tidak ada pengembalian
 * otomatis; selisihnya tetap jadi titipan yang ikut pindah.
 */
export function kekuranganDeposit(depositLama: number, depositDiminta: number): number {
  return Math.max((Number.isFinite(depositDiminta) ? depositDiminta : depositLama) - depositLama, 0)
}
