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
 * Fasilitas yang benar-benar berlaku untuk sebuah kamar.
 *
 * Kamar yang sudah diisi fasilitas sendiri dipakai apa adanya. Kamar yang
 * kosong mewarisi fasilitas tipe-nya. Kamar tanpa tipe dan tanpa fasilitas
 * menghasilkan daftar kosong — ditampilkan sebagai '-' oleh pemanggil.
 *
 * Menerima objek kamar hasil `include: { tipe: ... }` langsung, supaya
 * pemanggil tak perlu merobek relasinya dulu.
 */
export function fasilitasEfektif(kamar: KamarFasilitas): string[] {
  const sendiri = rapikanFasilitas(kamar?.fasilitas)
  if (sendiri.length > 0) return sendiri
  return rapikanFasilitas(kamar?.tipe?.fasilitas)
}

/** Nama tipe untuk ditampilkan; kamar tanpa tipe jadi 'Tanpa tipe'. */
export function namaTipe(tipe: { nama?: string | null } | null | undefined): string {
  const nama = tipe?.nama?.trim()
  return nama && nama.length > 0 ? nama : 'Tanpa tipe'
}
