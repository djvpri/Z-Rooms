// lib/jadwalKamar.ts
//
// Aturan satu kamar dua penghuni berurutan: penghuni sekarang + penyewa
// berikutnya yang sudah memesan.
//
// Dipisah ke sini supaya bisa diuji tanpa DB — aturan "bentrok atau tidak" ini
// yang paling mudah salah dan paling mahal akibatnya (dua orang diklaim kamar
// yang sama).
import { batasCheckout, type AturanCheckout } from './checkout'
import { tglJamSingkat } from './utils'

export type SewaJadwal = {
  statusSewa: string
  tanggalMasuk: Date
  tanggalKeluar: Date
} | null

/**
 * Kapan sewa yang sedang AKTIF benar-benar melepas kamarnya.
 *
 * Bukan `tanggalKeluar` mentah: sewa berakhir jam check-out properti, jadi
 * tanggalKeluar dari DB (jam ikut jam masuk) bukan saat kamar kosong.
 * Mengembalikan null kalau kamar memang kosong.
 */
export function lepasPada(sewaAktif: SewaJadwal, aturan: AturanCheckout): Date | null {
  if (!sewaAktif) return null
  return batasCheckout(sewaAktif.tanggalKeluar, aturan)
}

/**
 * Boleh tidaknya mencatat sewa baru yang masuk pada `masuk`.
 *
 * Aturan (diputuskan owner): kamar yang sedang terisi TETAP bisa dibooking,
 * asal tanggal masuknya tidak mendahului saat penghuni sekarang keluar. Sewa
 * seperti itu disimpan sebagai PENDING — menunggu, bukan menempati.
 *
 * Toleransi sengaja TIDAK diikutkan di sini: kasir butuh tanggal aman yang
 * tak bisa disalahkan, dan batasCheckout sudah memasukkan toleransi properti.
 */
export function bolehDipesan(
  masuk: Date,
  sewaAktif: SewaJadwal,
  aturan: AturanCheckout,
): { boleh: true; pesan: null } | { boleh: false; pesan: string } {
  if (!sewaAktif) return { boleh: true, pesan: null }

  const lepas = lepasPada(sewaAktif, aturan)!
  if (masuk.getTime() < lepas.getTime()) {
    return {
      boleh: false,
      pesan:
        `Kamar masih dihuni sampai ${tglJamSingkat(lepas)}. ` +
        `Tanggal masuk paling awal ${tglJamSingkat(lepas)}.`,
    }
  }
  return { boleh: true, pesan: null }
}

/**
 * Status sewa untuk catatan baru: PENDING kalau kamar masih dihuni, AKTIF
 * kalau kamar kosong.
 */
export function statusUntuk(masuk: Date, sewaAktif: SewaJadwal, aturan: AturanCheckout): 'AKTIF' | 'PENDING' {
  return bolehDipesan(masuk, sewaAktif, aturan).boleh && sewaAktif ? 'PENDING' : 'AKTIF'
}
