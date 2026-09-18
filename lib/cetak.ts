// lib/cetak.ts
//
// Setelan cetak nota — ukuran kertas, jenis koneksi, dan jejak printer terakhir.
//
// MURNI tanpa Prisma (aturan yang sama dengan `lib/karaoke.ts`): berkas ini
// hanya mengubah nilai, tak menyentuh DB. Route dan halaman yang memanggilnya.
//
// KENAPA PENGATURAN INI ADA
// Aplikasi ini dipakai banyak usaha dengan printer berbeda-beda. Printer
// thermal 58mm dan 80mm TIDAK bisa saling menggantikan: keduanya memakai
// jumlah KOLOM KARAKTER yang berbeda per baris (32 vs 48). Nota yang ditulis
// untuk 48 kolom lalu dicetak di kertas 58mm akan berlipat di tengah kalimat —
// dan yang salah bukan printernya, tapi setelannya. Karena itu ukuran kertas
// harus bisa diatur pemilik, bukan dipatok di kode.
//
// Catatan penting soal garis: garis pemisah dibuat dari KARAKTER ULANG (`'-'.repeat(n)`),
// bukan CSS. Printer thermal mencetak teks mentah; tak ada CSS di sana.

/** Ukuran kertas yang didukung. Tambah di sini = muncul di halaman pengaturan. */
export const UKURAN_KERTAS = {
  '58': { label: '58 mm (struk kecil)', kolom: 32 },
  '80': { label: '80 mm (struk lebar)', kolom: 48 },
} as const

export type KunciKertas = keyof typeof UKURAN_KERTAS

export const KERTAS_BAWAAN: KunciKertas = '58'

/** Koneksi printer. Bluetooth paling umum untuk kasir bergerak. */
export const JENIS_KONEKSI = {
  bluetooth: 'Bluetooth',
  usb: 'USB / kabel',
  jaringan: 'Jaringan (IP)',
} as const

export type KunciKoneksi = keyof typeof JENIS_KONEKSI

export const KONEKSI_BAWAAN: KunciKoneksi = 'bluetooth'

/** Lebar kertas fisik, dipakai halaman setup untuk kalimat panduan. */
export const NAMA_PRINTER_MAKS = 60

export type PrefCetak = {
  /** Kunci ukuran kertas — menentukan jumlah kolom per baris. */
  kertas: KunciKertas
  koneksi: KunciKoneksi
  /**
   * Nama/alamat printer terakhir yang berhasil dipakai, mis. MAC Bluetooth
   * atau IP. Dipakai untuk memilih ulang otomatis; kosong = belum pernah.
   */
  printer: string
  /** Cetak salinan kedua untuk pelanggan. */
  salinan: boolean
  /** Cetak baris "Terima kasih" + kontak dari data properti. */
  kakiNota: boolean
}

export const PREF_CETAK_BAWAAN: PrefCetak = {
  kertas: KERTAS_BAWAAN,
  koneksi: KONEKSI_BAWAAN,
  printer: '',
  salinan: false,
  // Bawaan ON: nota tanpa kalimat penutup terasa menggantung, dan pemilik yang
  // tak ingin bisa mematikannya. Bawaan OFF akan membuat nota kehilangan
  // kontak usaha hanya karena setelan tak pernah dibuka.
  kakiNota: true,
}

/** Jumlah kolom karakter untuk sebuah kunci kertas. Bentuk aman dari luar. */
export function kolomKertas(kertas: string | null | undefined): number {
  const k = kertas as KunciKertas
  return UKURAN_KERTAS[k]?.kolom ?? UKURAN_KERTAS[KERTAS_BAWAAN].kolom
}

/**
 * Baca preferensi cetak dari JSON tersimpan.
 *
 * Selalu mengembalikan objek LENGKAP. Setiap field yang tak dikenali dibuang
 * dan diganti bawaan — jadi preferensi lama yang dibuat versi aplikasi
 * sebelumnya tetap terbaca, bukan membuat halaman gagal render.
 *
 * Menerima `unknown` (hasil `JSON.parse`), bukan string: parsing dan validasi
 * dipisah supaya pemanggil bisa menangani JSON rusak sendiri.
 */
export function bacaPrefCetak(simpan: unknown): PrefCetak {
  const p: PrefCetak = { ...PREF_CETAK_BAWAAN }
  if (!simpan || typeof simpan !== 'object') return p
  const s = simpan as Record<string, unknown>

  if (typeof s.kertas === 'string' && s.kertas in UKURAN_KERTAS) p.kertas = s.kertas as KunciKertas
  if (typeof s.koneksi === 'string' && s.koneksi in JENIS_KONEKSI) p.koneksi = s.koneksi as KunciKoneksi
  if (typeof s.salinan === 'boolean') p.salinan = s.salinan
  if (typeof s.kakiNota === 'boolean') p.kakiNota = s.kakiNota
  if (typeof s.printer === 'string') p.printer = s.printer.trim().slice(0, NAMA_PRINTER_MAKS)

  return p
}

/** Sama seperti di atas, tapi menerima string JSON mentah dari DB (boleh rusak). */
export function bacaPrefCetakMentah(mentah: string | null | undefined): PrefCetak {
  if (!mentah) return { ...PREF_CETAK_BAWAAN }
  try {
    return bacaPrefCetak(JSON.parse(mentah))
  } catch {
    // JSON rusak (pernah tersimpan separuh / diketik tangan) diperlakukan sama
    // dengan belum diatur. Menolak render hanya karena setelan cetak akan
    // mematikan halaman yang tak ada hubungannya dengan cetak.
    return { ...PREF_CETAK_BAWAAN }
  }
}

/** Bentuk untuk disimpan (string JSON). Dipakai route setelah validasi. */
export function keStringPrefCetak(p: PrefCetak): string {
  return JSON.stringify(bacaPrefCetak(p))
}

/**
 * Potong teks agar muat satu baris pada kertas ini.
 *
 * Teks PANJANG dipotong, bukan dibungkus: nama produk dan nomor nota yang
 * dibungkus jadi dua baris membuat kolom angka di bawahnya berantakan.
 */
export function potongKolom(teks: string, kertas: string | null | undefined): string {
  return teks.slice(0, kolomKertas(kertas))
}

/**
 * Baris dua kolom (label kiri, nilai kanan) dengan titik-titik pengisi.
 *
 * Inilah alasan jumlah kolom harus tepat: kalau total melebihi lebar kertas,
 * printer thermal MEMOTONG bagian kanan — dan yang hilang justru angkanya.
 * Kalau kurang, barisnya tampak miring. Karena itu nilai kanan diprioritaskan:
 * label yang dipotong lebih dulu kalau tak cukup ruang.
 */
export function barisDuaKolom(label: string, nilai: string, kertas: string | null | undefined): string {
  const lebar = kolomKertas(kertas)
  const kanan = nilai.slice(0, lebar)
  // 1 karakter untuk spasi pemisah minimal. Kalau nilai sudah memenuhi baris,
  // label dibuang seluruhnya — menambahkan pengisi saat ruang sudah habis akan
  // membuat baris MELEBIHI lebar kertas dan berlipat di printer.
  const sisaUntukLabel = Math.max(0, lebar - kanan.length - 1)
  const kiri = label.slice(0, sisaUntukLabel)
  const pengisi = lebar - kiri.length - kanan.length
  if (pengisi <= 0) return kiri + kanan
  return kiri + '.'.repeat(pengisi) + kanan
}

/** Garis pemisah penuh selebar kertas. */
export function garisKertas(kertas: string | null | undefined, karakter = '-'): string {
  return karakter.repeat(kolomKertas(kertas))
}

/** Nota dua kolom (kiri/kanan) tanpa titik pengisi, mis. header tanggal. */
export function barisKiriKanan(kiri: string, kanan: string, kertas: string | null | undefined): string {
  const lebar = kolomKertas(kertas)
  const kananPotong = potongKolom(kanan, kertas)
  const ruangKiri = Math.max(0, lebar - kananPotong.length)
  // Kiri dipotong ke ruangKiri, lalu DIPAD ke lebar itu — tanpa pad, sisipan
  // spasi hilang dan kolom kanan bergeser ke kiri.
  const kiriPotong = potongKolom(kiri, kertas).slice(0, ruangKiri)
  return kiriPotong.padEnd(ruangKiri) + kananPotong
}

/** Baris rata tengah, mis. nama usaha di kepala nota. */
export function barisTengah(teks: string, kertas: string | null | undefined): string {
  const lebar = kolomKertas(kertas)
  const t = potongKolom(teks, kertas)
  const kiri = Math.floor((lebar - t.length) / 2)
  return ' '.repeat(Math.max(0, kiri)) + t
}

/**
 * Nama printer yang layak ditampilkan. Dipakai halaman pengaturan supaya
 * "belum dipilih" terlihat sengaja, bukan kolom kosong yang ambigu.
 */
export function labelPrinter(printer: string): string {
  const p = printer.trim()
  return p === '' ? 'Belum dipilih' : p
}
