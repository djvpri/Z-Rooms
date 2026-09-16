// lib/tipeKamar.ts
//
// Aturan tipe kamar & fasilitasnya. Satu sumber untuk /pengaturan, /kamar,
// dan /api/tipe-kamar.
//
// Latar: dulu `Kamar.tipe` enum Prisma (STANDAR/DELUXE/VIP/SUITE), jadi pemilik
// tak bisa menambah tipe sendiri — dan `STUDIO` sudah terlanjur ada di form
// kamar & validasi API padahal enum tak punya nilainya, sehingga menambah kamar
// Studio selalu gagal 500. Tipe kini master data per properti.
//
// Fasilitas: yang tersimpan di `TipeKamar.fasilitas` adalah BAWAAN tipe. Kamar
// yang sudah punya fasilitas sendiri tidak ditimpa — di prod, kamar bertipe
// sama memang beda isinya (A 101 ada Dapur, A 102 tidak). Jadi warisan hanya
// untuk kamar yang fasilitasnya kosong.

/** Fasilitas yang ditawarkan sebagai saran di UI. Kasir tetap bisa ketik sendiri. */
export const SARAN_FASILITAS = [
  'AC', 'Kipas Angin', 'Kamar Mandi Dalam', 'Kamar Mandi Luar',
  'Kasur Queen', 'Kasur King', 'Kasur Single', 'Lemari', 'Meja',
  'WiFi', 'TV', 'Kulkas', 'Dapur', 'Balkon', 'Air Panas', 'Sofa',
]

export const NAMA_TIPE_MAKS = 40
export const KETERANGAN_MAKS = 120
export const FASILITAS_MAKS = 30
export const NAMA_FASILITAS_MAKS = 40

/**
 * Benih tipe kamar bawaan untuk properti baru. Fasilitasnya mengikuti apa yang
 * sudah dipakai data lama (STANDAR: AC + KM dalam; DELUXE: + TV + Kulkas;
 * VIP: + Sofa + Balkon) supaya properti baru tak mulai dari nol.
 *
 * `urutan` menentukan urutan tampil — STANDAR dulu, termahal terakhir.
 */
export const TIPE_BAWAAN = [
  { nama: 'Standar', urutan: 0, fasilitas: ['AC', 'Kamar Mandi Dalam'] },
  { nama: 'Deluxe', urutan: 1, fasilitas: ['AC', 'Kamar Mandi Dalam', 'TV', 'Kulkas'] },
  { nama: 'VIP', urutan: 2, fasilitas: ['AC', 'Kamar Mandi Dalam', 'TV', 'Kulkas', 'Sofa', 'Balkon'] },
  { nama: 'Suite', urutan: 3, fasilitas: ['AC', 'Kamar Mandi Dalam', 'TV', 'Kulkas', 'Sofa', 'Balkon'] },
] as const

/** Normalisasi nama tipe untuk perbandingan unik: "VIP " == "vip". */
export function kunciNama(nama: string) {
  return nama.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Bersihkan daftar fasilitas dari input user: buang kosong, rapikan spasi,
 * buang duplikat (tanpa peduli huruf besar/kecil), batasi jumlah.
 */
export function rapikanFasilitas(daftar: unknown): string[] {
  if (!Array.isArray(daftar)) return []
  const keluar: string[] = []
  const terlihat = new Set<string>()
  for (const item of daftar) {
    if (typeof item !== 'string') continue
    const bersih = item.trim().replace(/\s+/g, ' ')
    if (!bersih || bersih.length > NAMA_FASILITAS_MAKS) continue
    const kunci = bersih.toLowerCase()
    if (terlihat.has(kunci)) continue
    terlihat.add(kunci)
    keluar.push(bersih)
    if (keluar.length >= FASILITAS_MAKS) break
  }
  return keluar
}

type KamarFasilitas = { fasilitas?: string[] | null; tipe?: TipeFasilitas }
type TipeFasilitas = { fasilitas?: string[] | null } | null | undefined

/**
 * Fasilitas yang benar-benar berlaku untuk sebuah kamar: SELALU milik tipenya.
 *
 * Dulu kamar yang punya daftar sendiri dipakai apa adanya, sehingga 15 dari 15
 * kamar produksi menampilkan sisa data pra-migrasi dan tak satu pun mengikuti
 * fasilitas tipenya — fitur "fasilitas per tipe" praktis tak berpengaruh. Kasir
 * melihat kamar 001/002 tanpa "Kasur King" walau tipenya punya.
 *
 * Kolom `Kamar.fasilitas` kini tak dibaca; `lib/kamar.ts` juga sudah menolak
 * kiriman `fasilitas` dari klien. Dibiarkan ada di skema supaya tak perlu
 * migrasi kolom, dan `fasilitasSendiri` disediakan kalau suatu saat perlu
 * menampilkan sisa data lama.
 *
 * Menerima objek kamar hasil `include: { tipe: ... }` langsung, supaya
 * pemanggil tak perlu merobek relasinya dulu.
 */
export function fasilitasEfektif(kamar: KamarFasilitas): string[] {
  return rapikanFasilitas(kamar?.tipe?.fasilitas)
}

/**
 * Fasilitas yang tertulis di kamar itu sendiri — bukan yang berlaku.
 *
 * Tak dipakai UI. Ada supaya sisa data pra-migrasi masih bisa diperiksa
 * sebelum dikosongkan, dan supaya tak ada yang memanggil `kamar.fasilitas`
 * langsung dengan mengira itu fasilitas yang tampil.
 */
export function fasilitasSendiri(kamar: KamarFasilitas): string[] {
  return rapikanFasilitas(kamar?.fasilitas)
}

/** Nama tipe untuk ditampilkan; kamar tanpa tipe jadi 'Tanpa tipe'. */
export function namaTipe(tipe: { nama?: string | null } | null | undefined): string {
  const nama = tipe?.nama?.trim()
  return nama && nama.length > 0 ? nama : 'Tanpa tipe'
}

// ───────────────────────────────────────────────
// HARGA
// ───────────────────────────────────────────────
//
// Harga sewa melekat pada TIPE kamar (model HargaTipe), bukan per kamar. Dulu
// tiap kamar punya baris HargaKamar sendiri, jadi menaikkan tarif Standar
// berarti mengedit 12 kamar satu per satu — dan rawan tak sinkron. Sekarang
// kamar mewarisi harga tipe-nya.

export const PERIODE_SEWA = ['HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN'] as const
export type PeriodeSewa = (typeof PERIODE_SEWA)[number]

/** Label Indonesia untuk tiap periode, dipakai di form & tabel. */
export const LABEL_PERIODE: Record<PeriodeSewa, string> = {
  HARIAN: 'Harian',
  MINGGUAN: 'Mingguan',
  BULANAN: 'Bulanan',
  TAHUNAN: 'Tahunan',
}

/** Batas atas harga & deposit (rupiah). Guard bodoh terhadap salah ketik. */
export const HARGA_MAKS = 9_999_999_999

type BarisHarga = { periodeSewa?: string | null; harga?: unknown; aktif?: boolean | null }
type KamarHarga = { tipe?: { harga?: BarisHarga[] | null } | null } | null | undefined

/**
 * Harga satu periode untuk sebuah kamar, diambil dari tipe kamarnya.
 * Mengembalikan 0 kalau tipe kamar belum punya tarif untuk periode itu —
 * pemanggil menampilkannya sebagai '-' atau menghalangi booking.
 *
 * Hanya baris `aktif` yang dihitung; baris nonaktif dianggap tak ada supaya
 * tarif lama bisa disimpan tanpa ikut terpakai.
 */
export function hargaEfektif(kamar: KamarHarga, periode: PeriodeSewa): number {
  const baris = kamar?.tipe?.harga?.find(h => h.periodeSewa === periode && h.aktif !== false)
  if (!baris) return 0
  const angka = Number(baris.harga)
  return Number.isFinite(angka) && angka > 0 ? angka : 0
}

/** Deposit satu periode, 0 kalau tak diisi. */
export function depositEfektif(kamar: KamarHarga, periode: PeriodeSewa): number {
  const baris = kamar?.tipe?.harga?.find(h => h.periodeSewa === periode && h.aktif !== false)
  if (!baris) return 0
  const angka = Number((baris as { deposit?: unknown }).deposit)
  return Number.isFinite(angka) && angka > 0 ? angka : 0
}

/**
 * Semua periode yang punya tarif aktif untuk kamar ini, urut PERIODE_SEWA.
 * Dipakai /kamar untuk memilih kolom harga mana yang ditampilkan.
 */
export function periodeTersedia(kamar: KamarHarga): PeriodeSewa[] {
  const daftar = kamar?.tipe?.harga ?? []
  return PERIODE_SEWA.filter(p => daftar.some(h => h.periodeSewa === p && h.aktif !== false))
}

/**
 * Bentuk harga yang dikirim ke klien (booking & /kamar). Sengaja array datar
 * dengan nama `harga` supaya bentuknya sama seperti tipe yang di-`include`,
 * hanya saja rasa harganya sudah diwarisi dari tipe.
 */
export type HargaRingkas = { periodeSewa: PeriodeSewa; harga: number; deposit: number }

export function hargaRingkas(kamar: KamarHarga): HargaRingkas[] {
  return periodeTersedia(kamar).map(p => ({
    periodeSewa: p,
    harga: hargaEfektif(kamar, p),
    deposit: depositEfektif(kamar, p),
  }))
}
