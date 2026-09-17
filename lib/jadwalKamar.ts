// lib/jadwalKamar.ts
//
// Aturan satu kamar satu orang pada satu waktu: sewa boleh berurutan, tapi
// rentang waktunya tidak boleh beririsan.
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
 *  (PENDING). Sewa SELESAI/DIBATALKAN tidak lagi memegang kamar.
 *
 *  Tanggal menerima string juga: di server nilainya `Date` dari Prisma, tapi
 *  lewat JSON API jadi string ISO — dan halaman booking memanggil aturan ini
 *  dari data hasil fetch. */
export type SewaNonSelesai = {
  statusSewa: string
  tanggalMasuk: Date | string
  tanggalKeluar: Date | string
}

/** Rentang waktu satu sewa: kapan orangnya menempati, sampai kapan. */
export interface RentangSewa {
  mulai: Date
  selesai: Date
}

/** Satu sewa yang menghalangi booking baru, dipakai untuk menyusun pesan. */
export interface Penghalang {
  mulai: Date
  lepas: Date
  statusSewa: string
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

/** Rentang waktu satu sewa non-selesai. Mulai = tanggal & jam masuk apa adanya;
 *  selesai = batas check-out properti (jam check-out + toleransi), BUKAN
 *  tanggalKeluar mentah. */
export function rentangSewa(s: SewaNonSelesai, aturan: AturanCheckout): RentangSewa {
  return {
    mulai: new Date(s.tanggalMasuk),
    selesai: batasCheckout(new Date(s.tanggalKeluar), aturan),
  }
}

/**
 * Sewa mana saja yang beririsan dengan `baru` — artinya booking baru TIDAK
 * boleh dicatat.
 *
 * Dua rentang tidak beririsan kalau salah satu benar: yang baru selesai
 * SEBELUM yang lama mulai, atau yang baru mulai SETELAH kamar dilepas.
 *
 * Aturan (diputuskan owner): "kamar ada jam masuk dan jam keluarnya — kalau
 * dibooking sebelum jam masuk harusnya bisa, dan setelah jam keluar juga
 * harusnya bisa." Karena itu yang dibandingkan adalah rentang, BUKAN satu
 * batas tunggal: memakai batas tunggal (sewa terakhir) akan ikut menolak
 * booking yang tanggalnya jatuh di celah kosong sebelum sebuah pesanan.
 *
 * Sisi yang dibandingkan sengaja sejenis: `baru.mulai` vs `lama.selesai`
 * (dua-duanya momen "kapan boleh menempati") dan `baru.selesai` vs
 * `lama.mulai` (dua-duanya momen "kapan orang datang").
 *
 * Batasnya inklusif di kedua ujung: masuk tepat pada jam check-out boleh
 * (kamar sudah kosong saat itu), dan keluar tepat saat penghuni berikutnya
 * masuk juga boleh (tidak ada yang bertumpuk).
 */
export function penghalangUntuk(
  baru: RentangSewa,
  sewa: SewaNonSelesai[],
  aturan: AturanCheckout,
): Penghalang[] {
  const halangan: Penghalang[] = []
  for (const s of sewa) {
    const r = rentangSewa(s, aturan)
    const selesaiSebelum = baru.selesai.getTime() <= r.mulai.getTime()
    const mulaiSetelahLepas = baru.mulai.getTime() >= r.selesai.getTime()
    if (!selesaiSebelum && !mulaiSetelahLepas) {
      halangan.push({ mulai: r.mulai, lepas: r.selesai, statusSewa: s.statusSewa })
    }
  }
  return halangan.sort((a, b) => a.mulai.getTime() - b.mulai.getTime())
}

/**
 * Rentang kosong yang menganggur di antara sewa-sewa kamar ini, dibatasi
 * `dari`–`sampai`. Dipakai halaman booking untuk memberi tahu kasir KAPAN
 * kamar benar-benar kosong, bukan cuma sampai kapan terpakai.
 *
 * Hanya celah yang masih berguna yang dikembalikan: sewa yang sudah lewat
 * seluruhnya diabaikan, dan celah berdurasi nol (sekadar bersinggungan) tidak
 * dilaporkan — menampilkan "kosong dari sini sampai sini" yang justru terbalik
 * atau kosong hanya membingungkan kasir.
 */
export function celahKosong(
  sewa: SewaNonSelesai[],
  aturan: AturanCheckout,
  dari: Date,
  sampai: Date,
): RentangSewa[] {
  // Jendela terbalik atau kosong -> memang tak ada yang bisa dilaporkan.
  if (sampai.getTime() <= dari.getTime()) return []

  const terpakai = sewa
    .map(s => rentangSewa(s, aturan))
    // Sewa yang berakhir sebelum jendela mulai tak menyisakan celah apa pun.
    .filter(r => r.selesai.getTime() > dari.getTime())
    .sort((a, b) => a.mulai.getTime() - b.mulai.getTime())

  const celah: RentangSewa[] = []
  let kursor = dari
  for (const r of terpakai) {
    // Celah nol (bersinggungan persis) tidak dilaporkan: tak ada ruang untuk
    // siapa pun di situ.
    if (r.mulai.getTime() > kursor.getTime()) {
      celah.push({ mulai: kursor, selesai: r.mulai })
    }
    // Sewa boleh tumpang tindih (data lama memang begitu) — kursor hanya maju.
    if (r.selesai.getTime() > kursor.getTime()) kursor = r.selesai
  }
  if (kursor.getTime() < sampai.getTime()) celah.push({ mulai: kursor, selesai: sampai })
  return celah.filter(c => c.selesai.getTime() > c.mulai.getTime())
}

/**
 * Boleh tidaknya mencatat sewa baru pada rentang `baru`.
 *
 * Kamar kosong selalu boleh. Kalau ada sewa yang masih memegang kamar, booking
 * hanya boleh kalau rentangnya tidak beririsan dengan salah satu pun — jadi
 * boleh SEBELUM jam masuk penghuni berikutnya, dan boleh SETELAH jam keluar
 * penghuni sebelumnya.
 *
 * Satu kamar satu orang: jam masuk yang identik pun bentrok.
 */
export function bolehDipesan(
  baru: RentangSewa,
  sewa: SewaNonSelesai[] | SewaJadwal,
  aturan: AturanCheckout,
): { boleh: true; pesan: null; halangan: [] } | { boleh: false; pesan: string; halangan: Penghalang[] } {
  // Pemanggil lama boleh mengirim satu sewa (atau null) — dinormalkan di sini.
  const daftar: SewaNonSelesai[] = Array.isArray(sewa) ? sewa : sewa ? [sewa] : []
  const halangan = penghalangUntuk(baru, daftar, aturan)
  if (halangan.length === 0) return { boleh: true, pesan: null, halangan: [] }

  const pertama = halangan[0]
  // Pesan menyebut rentang sewa yang menghalangi, supaya kasir tahu KAPAN
  // kamar terpakai dan bisa memilih tanggal yang benar tanpa menebak.
  const lanjutan = halangan.length > 1 ? ` (dan ${halangan.length - 1} sewa lain)` : ''
  return {
    boleh: false,
    halangan,
    pesan:
      `Kamar sudah terpakai ${tglJamSingkat(pertama.mulai)} sampai ${tglJamSingkat(pertama.lepas)}${lanjutan}. ` +
      `Pilih tanggal masuk setelah ${tglJamSingkat(pertama.lepas)}, atau tanggal keluar sebelum ${tglJamSingkat(pertama.mulai)}.`,
  }
}

/**
 * Status catatan baru: AKTIF kalau dia yang menempati kamar lebih dulu,
 * PENDING kalau masih ada sewa yang mendahuluinya.
 *
 * Yang menentukan BUKAN "ada penghuni sekarang atau tidak", tapi urutan
 * `tanggalMasuk` di antara seluruh sewa non-selesai kamar itu. Contoh yang
 * bikin beda: kamar kosong tapi sudah ada pesanan 20 Sep, lalu kasir booking
 * 17 Sep — sewa 17 Sep yang menempati lebih dulu, jadi AKTIF; yang 20 Sep
 * tetap PENDING. Sebaliknya booking 22 Sep di antara pesanan 20 & 25 Sep
 * ditolak lebih awal, jadi tak pernah sampai ke sini.
 */
export function statusUntuk(
  masuk: Date,
  sewa: SewaNonSelesai[] | SewaJadwal,
  aturan: AturanCheckout,
): 'AKTIF' | 'PENDING' {
  const daftar: SewaNonSelesai[] = Array.isArray(sewa) ? sewa : sewa ? [sewa] : []
  if (daftar.length === 0) return 'AKTIF'
  // Ada sewa yang mulai lebih dulu (atau tepat bersamaan) -> masih mengantre.
  const didahului = daftar.some(s => new Date(s.tanggalMasuk).getTime() <= masuk.getTime())
  return didahului ? 'PENDING' : 'AKTIF'
}
