// lib/bayar.ts
//
// Satu sumber aturan "sudah bayar atau belum" untuk sebuah sewa.
// Dipakai /kamar (badge) dan bisa dipakai halaman lain.
//
// PENTING soal zona: `jatuhTempo` di DB tersimpan 00:00 UTC (pola repo ini —
// input `type="date"` selalu 00:00), sedangkan jam check-out properti ber-WIB.
// Karena itu jatuh tempo digeser +7 jam dulu supaya batas "terlambat" jatuh di
// akhir hari WIB, bukan 07:00 WIB. Sama kelasnya dengan `lib/checkout.ts`.

export type StatusBayar = 'LUNAS' | 'SEBAGIAN' | 'BELUM_BAYAR' | 'TERLAMBAT'
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const SEHARI_MS = 24 * 60 * 60 * 1000

export type TagihanRingkas = { nominal: unknown; status: string; jatuhTempo?: Date | null }

export type RingkasBayar = {
  status: StatusBayar
  /** Total nominal seluruh tagihan, dalam rupiah. */
  total: number
  /** Total nominal tagihan yang sudah LUNAS. */
  lunas: number
  /** total - lunas. Ini yang ditagih kalau kasir mau melunasi. */
  sisa: number
  jumlahTagihan: number
}

/**
 * Ringkas status bayar sebuah sewa.
 *
 * Aturan (dikonfirmasi user 2026-09-16):
 * - Tak ada tagihan sama sekali → **LUNAS**. Jalur `bayarSekarang` di booking
 *   selalu menulis tagihan, jadi sewa tanpa tagihan = memang tak menagih apa pun
 *   (mis. sewa gratis). Menandainya "Belum Bayar" akan mengeluh tanpa dasar.
 * - Semua tagihan LUNAS → LUNAS.
 * - Ada tagihan ber-status `SEBAGIAN` (dibayar sebagian) → SEBAGIAN. Ini
 *   berlaku walau tagihannya sudah lewat jatuh tempo: "sebagian" lebih
 *   informatif daripada "terlambat", dan kasir tetap melihat sisanya di
 *   `sisa`. (Temuan uji data prod: tagihan B 201 ber-status SEBAGIAN dengan
 *   jatuh tempo lewat — asumsi awal bahwa SEBAGIAN hanya berarti "sebagian
 *   tagihan lunas" ternyata salah.)
 * - Ada campuran LUNAS + BELUM_BAYAR → SEBAGIAN, karena sebagian uang sudah
 *   masuk. Ini menang atas TERLAMBAT: satu sewa tak bisa dua status sekaligus.
 * - Semua tagihan BELUM_BAYAR dan ada yang lewat jatuh tempo → TERLAMBAT.
 * - Sisanya → BELUM_BAYAR.
 *
 * `DIBATALKAN` diabaikan: tagihan yang dibatalkan bukan kewajiban, jadi ia tak
 * memaksa status jadi SEBAGIAN dan tak menambah `sisa`.
 *
 * @param sekarang dipakai untuk uji deterministik. Halaman harus mengambil
 *   `new Date()` SEKALI lalu menilai semua kamar pada titik waktu yang sama.
 */
export function ringkasBayar(
  tagihan: TagihanRingkas[],
  sekarang: Date = new Date(),
): RingkasBayar {
  const hidup = tagihan.filter(t => t.status !== 'DIBATALKAN')
  const total = hidup.reduce((a, t) => a + Number(t.nominal), 0)
  const bayar = hidup.filter(t => t.status === 'LUNAS')
  const lunas = bayar.reduce((a, t) => a + Number(t.nominal), 0)

  const dasar = { total, lunas, sisa: total - lunas, jumlahTagihan: hidup.length }

  if (hidup.length === 0 || bayar.length === hidup.length) {
    return { ...dasar, status: 'LUNAS' }
  }
  // SEBAGIAN di baris tagihan (dibayar sebagian), atau sebagian tagihan lunas.
  if (hidup.some(t => t.status === 'SEBAGIAN') || bayar.length > 0) {
    return { ...dasar, status: 'SEBAGIAN' }
  }
  // Semua tagihan di sini BELUM_BAYAR (LUNAS/SEBAGIAN sudah tersaring di atas).
  const lewat = hidup.some(
    t => t.jatuhTempo instanceof Date && batasHari(t.jatuhTempo) < sekarang.getTime(),
  )
  return { ...dasar, status: lewat ? 'TERLAMBAT' : 'BELUM_BAYAR' }
}

/**
 * Akhir hari (23:59:59.999 WIB) dari sebuah tanggal jatuh tempo.
 *
 * Hitungannya HARUS di kerangka WIB dulu, baru dikembalikan ke UTC — kalau
 * `+SEHARI_MS` dikenakan pada nilai UTC, batasnya geser 7 jam ke depan (jatuh
 * di ~07:00 WIB hari berikutnya), dan tagihan dicap TERLAMBAT sehari terlambat.
 * Kelas bug yang sama dengan `lib/checkout.ts` (lihat `0a0d55b`).
 */
function batasHari(jatuhTempo: Date) {
  const wib = jatuhTempo.getTime() + WIB_OFFSET_MS
  const awalHariWib = Math.floor(wib / SEHARI_MS) * SEHARI_MS
  const akhirHariWib = awalHariWib + SEHARI_MS - 1
  return akhirHariWib - WIB_OFFSET_MS
}
