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

/** Sewa yang masih memegang kamar: sedang dihuni (AKTIF) atau sudah memesan
 *  (PENDING). Sewa SELESAI/DIBATALKAN tidak ikut.
 *
 *  Tanggal menerima string juga: di server nilainya `Date` dari Prisma, tapi
 *  lewat JSON API jadi string ISO — dan halaman booking memanggil aturan ini
 *  dari data hasil fetch. */
export type SewaNonSelesai = {
  statusSewa: string
  tanggalMasuk: Date | string
  tanggalKeluar: Date | string
}

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
 * Kapan kamar benar-benar bebas, dihitung dari SELURUH sewa non-selesai
 * (AKTIF + PENDING), bukan cuma penghuni sekarang.
 *
 * Kenapa bukan `sewaAktif` saja: kamar bisa punya 2+ sewa berurutan yang
 * tersimpan sebagai PENDING. Kalau yang dibandingkan hanya penghuni sekarang,
 * booking ketiga lolos begitu tanggalnya lewat batas sewa PERTAMA — padahal
 * sewa PENDING di antaranya masih memegang kamar. Akibatnya satu kamar
 * terpesan dua kali (terbukti nyata: dua PENDING tumpang tindih tersimpan).
 *
 * PENDING memakai `tanggalKeluar` PENDING itu sendiri, tanpa toleransi
 * dihitung dua kali — batasCheckout() sudah memasukkan toleransi properti.
 * Kamar tanpa sewa non-selesai -> null.
 */
export function lepasTerakhir(sewa: SewaNonSelesai[], aturan: AturanCheckout): Date | null {
  if (sewa.length === 0) return null
  let akhir = 0
  let ada = false
  for (const s of sewa) {
    const b = batasCheckout(new Date(s.tanggalKeluar), aturan).getTime()
    if (!ada || b > akhir) { akhir = b; ada = true }
  }
  return ada ? new Date(akhir) : null
}

/**
 * Boleh tidaknya mencatat sewa baru yang masuk pada `masuk`.
 *
 * Aturan (diputuskan owner): kamar yang sedang terisi TETAP bisa dibooking,
 * asal tanggal masuknya tidak mendahului saat SELURUH sewa yang masih memegang
 * kamar berakhir — termasuk pesanan yang sudah mengantre (PENDING). Satu kamar
 * hanya untuk satu orang: jam masuk yang sama persis pun bentrok.
 *
 * Toleransi sengaja TIDAK diikutkan di sini: kasir butuh tanggal aman yang
 * tak bisa disalahkan, dan batasCheckout sudah memasukkan toleransi properti.
 */
export function bolehDipesan(
  masuk: Date,
  sewa: SewaNonSelesai[] | SewaJadwal,
  aturan: AturanCheckout,
): { boleh: true; pesan: null; lepas: Date | null } | { boleh: false; pesan: string; lepas: Date } {
  // Pemanggil lama boleh mengirim satu sewa (atau null) — dinormalkan di sini.
  const daftar: SewaNonSelesai[] = Array.isArray(sewa) ? sewa : sewa ? [sewa] : []
  const lepas = lepasTerakhir(daftar, aturan)
  if (!lepas) return { boleh: true, pesan: null, lepas: null }

  if (masuk.getTime() < lepas.getTime()) {
    return {
      boleh: false,
      lepas,
      pesan:
        `Kamar masih terpakai sampai ${tglJamSingkat(lepas)}. ` +
        `Tanggal masuk paling awal ${tglJamSingkat(lepas)}.`,
    }
  }
  return { boleh: true, pesan: null, lepas }
}

/**
 * Status sewa untuk catatan baru: PENDING kalau kamar masih terpakai, AKTIF
 * kalau kamar kosong.
 *
 * Selalu dinilai relatif ke penghuni SEKARANG (`sewaAktif`), bukan ke antrean:
 * pesanan yang masuk saat kamar kosong memang LANGSUNG menempati (AKTIF),
 * walaupun antreannya panjang.
 */
export function statusUntuk(masuk: Date, sewaAktif: SewaJadwal, aturan: AturanCheckout): 'AKTIF' | 'PENDING' {
  const sewaSekarang = sewaAktif ? [sewaAktif] : []
  return bolehDipesan(masuk, sewaSekarang, aturan).boleh && sewaAktif ? 'PENDING' : 'AKTIF'
}
