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

/** "2026-09-17" dari komponen LOKAL.
 *
 *  Bukan `toISOString()`: itu mengonversi ke UTC, dan untuk WIB (UTC+7) jam
 *  00:00–06:59 tanggalnya mundur sehari. Kunci tanggal yang salah = kolom
 *  tanggalnya meleset satu hari. */
export function kunciTanggal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Kunci tanggal mulai hari ini sampai H+13. */
export function daftarHari(sekarang: Date, jumlah = HARI): string[] {
  const hasil: string[] = []
  for (let i = 0; i < jumlah; i++) {
    hasil.push(kunciTanggal(new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() + i)))
  }
  return hasil
}

/** "08:00" dari index jam 0..23. */
export function labelJam(j: number): string {
  return `${String(j).padStart(2, '0')}:00`
}

/**
 * Peta "YYYY-MM-DD" -> set index jam (0..23) yang terpakai.
 *
 * Satu jam dianggap terpakai kalau rentang sewa bertumpuk dengannya — tak
 * peduli sewa mulai di tengah jam. Sewa yang mulai 14:30 tetap mengunci jam
 * 14:00: pada jam itu kamar memang belum bisa dihuni, dan menampilkannya bebas
 * akan membuat kasir menjanjikan kamar yang masih ditempati.
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
    for (const t of hari) {
      const [y, m, d] = t.split('-').map(Number)
      const set = peta.get(t)!
      for (let j = 0; j < 24; j++) {
        const jamMulai = new Date(y, m - 1, d, j, 0, 0, 0)
        const jamSelesai = new Date(y, m - 1, d, j + 1, 0, 0, 0)
        if (jamMulai.getTime() < selesai.getTime() && jamSelesai.getTime() > mulai.getTime()) {
          set.add(j)
        }
      }
    }
  }
  return peta
}
