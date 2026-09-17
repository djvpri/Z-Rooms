// lib/jadwalGrid.ts
//
// Jadwal 14 hari satu kamar sebagai grid jam: kolom = tanggal, baris = 24 jam,
// sel terpakai = kamar tak bisa dihuni pada jam itu.
//
// Dipisah dari komponennya supaya bisa diuji tanpa React maupun DB — pewarnaan
// sel yang salah bikin kasir menolak/menerima penyewa berdasarkan bacaan yang
// keliru, dan itu kesalahan yang paling mahal di sini.
import { rentangSewa, type SewaNonSelesai } from './jadwalKamar'
import type { AturanCheckout } from './checkout'

/** Owner minta "hingga 14 hari kedepan". */
export const HARI = 14

/** Offset WIB dalam menit. Dipakai untuk membandingkan momen UTC dengan jam
 *  dinding WIB tanpa bergantung TZ mesin. */
export const WIB_MENIT = 7 * 60

/** Momen UTC -> menit dinding WIB, dihitung dari tengah malam UTC hari itu.
 *  Selisih dua momen tak terpengaruh titik acuan, jadi aman dipakai
 *  dibandingkan dengan jam lokal apa pun zona mesinnya. */
function menitWib(d: Date): number {
  return d.getTime() / 60000 + WIB_MENIT
}

/** "YYYY-MM-DD" dari komponen UTC — pasangan `daftarHari`, karena nilai yang
 *  dioper sudah digeser ke WIB dan ditambah hari dalam UTC. */
function kunciTanggalWib(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** "08:00" dari index jam 0..23. */
export function labelJam(j: number): string {
  return `${String(j).padStart(2, '0')}:00`
}

/** Kunci tanggal mulai hari ini sampai H+13, dalam WIB.
 *
 *  Hari dihitung pada kalender WIB, bukan kalender mesin: container produksi
 *  jalan TZ=UTC, jadi pukul 00:00–06:59 WIB masih terbaca "kemarin" dan
 *  seluruh jendela 14 hari bergeser sehari. Kasir di Indonesia melihat jadwal
 *  mulai dari hari ini menurut kalendernya, bukan menurut UTC.
 *
 *  Digeser ke WIB dulu, lalu ditambah hari memakai UTC supaya penambahan hari
 *  tak diganggu pergantian DST/offset mesin. */
export function daftarHari(sekarang: Date, jumlah = HARI): string[] {
  const hasil: string[] = []
  const dasar = new Date(sekarang.getTime() + WIB_MENIT * 60000)
  for (let i = 0; i < jumlah; i++) {
    const d = new Date(Date.UTC(dasar.getUTCFullYear(), dasar.getUTCMonth(), dasar.getUTCDate() + i))
    hasil.push(kunciTanggalWib(d))
  }
  return hasil
}

/**
 * Peta "YYYY-MM-DD" -> set index jam (0..23) yang terpakai.
 *
 * Satu jam dianggap terpakai kalau rentang sewa bertumpuk dengannya — tak
 * peduli sewa mulai di tengah jam. Sewa yang mulai 14:30 tetap mengunci jam
 * 14:00: pada jam itu kamar memang belum bisa dihuni, dan menampilkannya bebas
 * akan membuat kasir menjanjikan kamar yang masih ditempati.
 *
 * Jam dibandingkan pada WIB, bukan zona mesin. `batasCheckout` mengembalikan
 * momen dalam UTC (12:00 WIB = 05:00 UTC), sedangkan jam grid mewakili jam
 * dinding WIB. Tanpa konversi, container yang jalan TZ=UTC menandai jam 5..11
 * pada hari check-out sebagai BEBAS — tujuh jam terakhir sebelum kamar benar-
 * benar dilepas tampil hijau, dan kasir bisa menjanjikan kamar yang masih
 * dihuni. Dibuktikan: TZ=UTC -> 19 Sep terpakai 0..4, TZ=Asia/Jakarta -> 0..11.
 */
export function petaTerpakai(
  sewa: SewaNonSelesai[],
  aturan: AturanCheckout,
  hari: string[],
): Map<string, Set<number>> {
  const peta = new Map<string, Set<number>>()
  for (const t of hari) peta.set(t, new Set())

  for (const s of sewa) {
    const { mulai, selesai } = rentangSewa(s, aturan)
    const a = menitWib(mulai)
    const b = menitWib(selesai)
    for (const t of hari) {
      const [y, m, d] = t.split('-').map(Number)
      const set = peta.get(t)!
      // Menit tengah malam UTC tanggal t — acuan yang sama dengan menitWib.
      const dasar = Date.UTC(y, m - 1, d) / 60000
      for (let j = 0; j < 24; j++) {
        if (dasar + j * 60 < b && dasar + (j + 1) * 60 > a) set.add(j)
      }
    }
  }
  return peta
}
