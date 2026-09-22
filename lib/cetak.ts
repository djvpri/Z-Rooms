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

// ───────────────────────────────────────────────
// Naskah ESC/POS
// ───────────────────────────────────────────────
//
// Perintah ESC/POS dikirim sebagai BYTE, bukan teks tampil. Karena itu naskah
// ditulis di sini sebagai angka, bukan sebagai string biasa — kalau ditulis
// sebagai teks, karakter kontrol akan terlihat di nota sebagai simbol aneh.
//
// Yang dikirim hanyalah perintah yang benar-benar ada di hampir semua printer
// thermal (ESC @, ESC a, GS V). Perintah yang tak dukung sebagian printer
// dihindari — printer yang tak paham perintah akan mencetaknya sebagai teks
// sampah, dan itu lebih buruk daripada tak ada efeknya.

/** Perintah ESC/POS yang dipakai. Angkanya adalah standar, bukan pilihan. */
export const ESC = {
  /** ESC @ — mulai ulang printer ke keadaan awal. Wajib, tiap kali cetak. */
  INISIALISASI: [0x1b, 0x40],
  /** ESC a n — rata teks: 0 kiri, 1 tengah, 2 kanan. */
  RATA_TENGAH: [0x1b, 0x61, 0x01],
  RATA_KIRI: [0x1b, 0x61, 0x00],
  /** ESC E n / GS ! n — tebal dan ukuran huruf ganda. */
  TEBAL_ON: [0x1b, 0x45, 0x01],
  TEBAL_OFF: [0x1b, 0x45, 0x00],
  BESAR_ON: [0x1d, 0x21, 0x11],
  BESAR_OFF: [0x1d, 0x21, 0x00],
  /** GS V m — potong kertas. 66 = potong penuh dengan maju sedikit. */
  POTONG: [0x1d, 0x56, 0x42, 0x00],
  /** ESC d n — maju n baris, supaya potongan tak memotong teks terakhir. */
  MAJU: [0x1b, 0x64, 0x03],
} as const

/** Muatan satu perintah di naskah. Dipisah supaya bisa diuji tanpa printer. */
export type PerintahEscPos =
  | { jenis: 'mentah'; byte: number[] }
  | { jenis: 'baris'; teks: string }

/**
 * Hasilkan naskah nota siap kirim ke printer.
 *
 * `baris` adalah daftar teks yang sudah rapi (dari `barisDuaKolom` dll) —
 * fungsi ini hanya menambahkan perintah, tak mengatur tata letak. Pemisahan
 * itu disengaja: tata letak bisa diuji di layar, perintah tidak.
 */
export function naskahNota(baris: string[], opsi: { potong?: boolean } = {}): PerintahEscPos[] {
  const naskah: PerintahEscPos[] = [
    { jenis: 'mentah', byte: [...ESC.INISIALISASI] },
    { jenis: 'mentah', byte: [...ESC.RATA_KIRI] },
  ]
  for (const b of baris) naskah.push({ jenis: 'baris', teks: b })
  if (opsi.potong !== false) {
    naskah.push({ jenis: 'mentah', byte: [...ESC.MAJU] })
    naskah.push({ jenis: 'mentah', byte: [...ESC.POTONG] })
  }
  return naskah
}

/**
 * Ubah naskah jadi satu string untuk dikirim lewat jembatan APK.
 *
 * Bentuknya sengaja sederhana (`teks` + perintah sebagai penanda dalam kurung
 * siku) karena jembatan `JembatanApk` hanya menerima String — `addJavascriptInterface`
 * tak bisa mengirim byte. Penguraiannya ada di sisi Kotlin, dan harus SAMA.
 *
 * Baris dipisah "\n". Pencetak yang tak mendukung potong tetap dapat teksnya.
 */
export function naskahKeTeks(naskah: PerintahEscPos[]): string {
  return naskah
    .map((p) => (p.jenis === 'baris' ? p.teks : `<${p.byte.join(',')}>`))
    .join('\n')
}

/**
 * Teks nota contoh untuk tombol "Tes cetak".
 *
 * Sengaja memuat SEMUA fitur kertas yang bisa salah: baris penuh selebar
 * kertas (untuk melihat apakah berlipat), baris dua kolom (untuk melihat apakah
 * kolom angka jatuh di tempatnya), dan teks pada batas lebar.
 */
export function notaUji(kertas: string | null | undefined): string[] {
  return [
    barisTengah('TES CETAK', kertas),
    garisKertas(kertas, '='),
    barisDuaKolom('Kertas', `${kolomKertas(kertas)} kolom`, kertas),
    barisDuaKolom('Tanggal', new Date().toLocaleString('id-ID'), kertas),
    garisKertas(kertas),
    potongKolom('X'.repeat(kolomKertas(kertas)), kertas),
    garisKertas(kertas, '='),
    barisTengah('Printer terhubung', kertas),
  ]
}

// ───────────────────────────────────────────────
// Jembatan ke aplikasi Android
// ───────────────────────────────────────────────
//
// Halaman web TIDAK bisa membuka Bluetooth sendiri — itu hanya bisa dilakukan
// aplikasi Android. Jadi cetak langsung bekerja lewat jembatan `ZXR_APK` yang
// dipasang MainActivity untuk host ZXRoom.
//
// Di browser biasa jembatan ini TIDAK ADA. Karena itu setiap pemanggil harus
// memeriksa dulu (`adaJembatanCetak`) dan menyiapkan jalan lain — kalau tidak,
// tombolnya diam tanpa penjelasan, yang terbaca kasir sebagai "aplikasi rusak".

/** Nama jembatan yang dipasang APK. Satu tempat, dipakai web dan diuji. */
export const NAMA_JEMBATAN = 'ZXR_APK'

/** Bentuk jembatan yang diharapkan ada di `window`. */
export type JembatanCetak = {
  cetak?: (naskah: string) => void
  /** Daftar printer Bluetooth yang sudah dipasangkan ke perangkat. */
  daftarPrinter?: () => string
  /** Alamat printer terakhir yang dipakai, "" kalau belum ada. */
  printerTersimpan?: () => string
  /** Kode versi APK, untuk memastikan APK-nya cukup baru. */
  versi?: () => string
}

/** Ambil jembatan dari `window`, atau null kalau halaman dibuka di browser. */
export function ambilJembatan(w: unknown): JembatanCetak | null {
  if (!w || typeof w !== 'object') return null
  const j = (w as Record<string, unknown>)[NAMA_JEMBATAN]
  if (!j || typeof j !== 'object') return null
  const kandidat = j as JembatanCetak
  // Dianggap ada hanya kalau punya `cetak` — APK versi lama punya jembatan ini
  // tanpa kemampuan cetak, dan menganggapnya ada akan membuat tombol diam.
  if (typeof kandidat.cetak !== 'function') return null
  return kandidat
}

/** Apakah halaman sedang berjalan di dalam aplikasi Android yang bisa cetak. */
export function adaJembatanCetak(w: unknown): boolean {
  return ambilJembatan(w) !== null
}

/**
 * Ada objek `ZXR_APK` di `window`, tapi tanpa `cetak` — APK lama.
 *
 * Berguna untuk membedakan dua sebab tombol cetak mati: halaman dibuka di
 * peramban (tak ada `ZXR_APK` sama sekali) vs APK terlalu lama (ada, tapi
 * belum punya kemampuan cetak). Tanpa pembedaan ini, pesannya menyuruh
 * "buka dari aplikasi" kepada kasir yang memang sudah di aplikasi — jalan
 * keluarnya memperbarui APK, bukan pindah peramban.
 */
export function adaJembatanLama(w: unknown): boolean {
  if (!w || typeof w !== 'object') return false
  const j = (w as Record<string, unknown>)[NAMA_JEMBATAN]
  return !!j && typeof j === 'object'
}
