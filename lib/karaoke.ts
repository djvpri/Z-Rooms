// lib/karaoke.ts
//
// Aturan sewa ruang karaoke — MURNI, tanpa Prisma, tanpa I/O.
//
// Sengaja pisah dari query DB (lihat `lib/karaokeDb.ts`) supaya aritmetika yang
// paling mudah salah dan paling mahal akibatnya bisa diuji dengan Node polos:
//   - berapa jam yang ditagih (pembulatan),
//   - tarif mana dipakai tiap jam (blok),
//   - apakah dua sesi boleh memakai ruang yang sama.
// Pola sama dengan `lib/produk.ts` ↔ `lib/piutang.ts`.
//
// Waktu: SEMUA waktu dinding lokal (WIB di repo ini). Blok tarif disimpan
// sebagai menit sejak 00:00 karena berulang tiap hari dan tak punya tanggal.

import { z } from 'zod'

/** Satu blok tarif: rentang menit sejak 00:00 dan harga per jam di blok itu. */
export interface BlokTarif {
  jamMulai: number // 0-1439, menit sejak 00:00
  jamSelesai: number // 1-1440, menit sejak 00:00 (1440 = tengah malam)
  hargaPerJam: number
}

/** Satu jam yang ditagih dalam sebuah sesi. */
export interface ItemJam {
  jamKe: number
  mulai: Date
  selesai: Date
  hargaPerJam: number
  subtotal: number
}

export interface HasilSewa {
  jumlahJam: number
  item: ItemJam[]
  total: number
}

export interface SesiRingkas {
  status: string
  mulaiPada: Date | string
  rencanaSelesai: Date | string
  selesaiAktual?: Date | string | null
}

export interface HasilBentrok {
  bentrok: boolean
  penghalang?: SesiRingkas
}

/** Menit sebelum booking dianggap lepas kalau pelanggan tak datang. */
export const TOLERANSI_BOOKING_MENIT = 15

/** Sisa waktu (menit) di mana kartu ruang mulai berkedip kuning. */
export const AMBANG_MENDESAK_MENIT = 10

const MS_MENIT = 60 * 1000
const MS_JAM = 60 * MS_MENIT
const SEHARI_MENIT = 24 * 60

/**
 * Jam yang ditagih dari durasi menit. Bulat KE ATAS ke jam penuh, minimum 1 jam.
 * 90 menit → 2 jam. 61 menit → 2 jam. 0 menit → 1 jam (minimum tetap berlaku).
 */
export function jumlahJamDari(menit: number): number {
  if (!Number.isFinite(menit) || menit <= 0) return 1
  return Math.max(1, Math.ceil(menit / 60))
}

/** Menit sejak 00:00 untuk sebuah Date (jam dinding lokal). */
export function menitSejakTengahMalam(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Blok tarif yang berlaku untuk satu titik menit (sejak 00:00).
 *
 * Batas: blok `[jamMulai, jamSelesai)`. 600 masuk blok yang MULAI di 600, bukan
 * yang berakhir di 600 — supaya batas jam tak dihitung dua kali.
 * Melempar kalau tak ada blok yang cocok: itu berarti blok tarif berlubang dan
 * menebak tarifnya sama saja menagih angka karangan.
 */
export function blokUntukMenit(tarif: BlokTarif[], menit: number): BlokTarif {
  const m = ((menit % SEHARI_MENIT) + SEHARI_MENIT) % SEHARI_MENIT
  const blok = tarif.find(t => m >= t.jamMulai && m < t.jamSelesai)
  if (!blok) throw new Error(`Tak ada tarif untuk menit ${m} — blok tarif berlubang`)
  return blok
}

/**
 * Hitung sewa satu sesi.
 *
 * ATURAN PENTING: tarif satu jam dipatok dari JAM MULAI jam itu, bukan dari
 * seluruh rentangnya. Jam 16:59-17:59 seluruhnya tarif blok yang memuat 16:59,
 * walau 59 menitnya jatuh di blok mahal. Disengaja: satu tarif per jam tanpa
 * hitungan menit berarti kasir bisa menjelaskannya di depan tamu dan hasilnya
 * bisa ditebak pelanggan.
 *
 * Sesi yang melewati tengah malam tetap benar: jam ke-2 mulai 00:30 → menit 30
 * → masuk blok dini hari.
 */
export function hitungSewa(tarif: BlokTarif[], mulai: Date, durasiMenit: number): HasilSewa {
  const jumlahJam = jumlahJamDari(durasiMenit)
  const item: ItemJam[] = []
  let total = 0

  for (let i = 0; i < jumlahJam; i++) {
    const awal = new Date(mulai.getTime() + i * MS_JAM)
    const akhir = new Date(awal.getTime() + MS_JAM)
    const blok = blokUntukMenit(tarif, menitSejakTengahMalam(awal))
    item.push({
      jamKe: i + 1,
      mulai: awal,
      selesai: akhir,
      hargaPerJam: blok.hargaPerJam,
      subtotal: blok.hargaPerJam,
    })
    total += blok.hargaPerJam
  }

  return { jumlahJam, item, total }
}

/**
 * Periksa blok tarif satu ruang menutup 24 jam: tanpa lubang, tanpa tumpang
 * tindih, mulai dari 00:00 dan berakhir di 24:00.
 *
 * Ini WAJIB ditolak saat Pengaturan menyimpan, bukan dibiarkan lewat:
 * - lubang → sesi di jam itu tak bisa dihargai, kasir mentok di depan tamu;
 * - tumpang tindih → harga ambigu (satu jam cocok di dua blok).
 */
export function periksaBlok(tarif: BlokTarif[]): { ok: boolean; pesan?: string } {
  if (tarif.length === 0) return { ok: false, pesan: 'Belum ada blok tarif.' }

  for (const t of tarif) {
    if (!Number.isFinite(t.jamMulai) || !Number.isFinite(t.jamSelesai)) {
      return { ok: false, pesan: 'Ada blok dengan jam tidak valid.' }
    }
    if (t.jamMulai < 0 || t.jamMulai >= SEHARI_MENIT) {
      return { ok: false, pesan: `Jam mulai ${t.jamMulai} di luar 00:00-24:00.` }
    }
    if (t.jamSelesai <= t.jamMulai || t.jamSelesai > SEHARI_MENIT) {
      return { ok: false, pesan: 'Ada blok yang jam selesainya sebelum/berimpit jam mulai.' }
    }
  }

  const urut = [...tarif].sort((a, b) => a.jamMulai - b.jamMulai)

  if (urut[0].jamMulai !== 0) {
    return {
      ok: false,
      pesan: `Jam 00:00 belum tertutup tarif — tarif pertama mulai ${menitKeJam(urut[0].jamMulai)}.`,
    }
  }

  for (let i = 1; i < urut.length; i++) {
    const sebelumnya = urut[i - 1]
    const ini = urut[i]
    if (ini.jamMulai < sebelumnya.jamSelesai) {
      const pesan =
        `Blok ${menitKeJam(sebelumnya.jamMulai)}-${menitKeJam(sebelumnya.jamSelesai)} ` +
        `tumpang tindih dengan ${menitKeJam(ini.jamMulai)}-${menitKeJam(ini.jamSelesai)} — ` +
        `harga jam itu jadi ambigu.`
      return { ok: false, pesan }
    }
    if (ini.jamMulai > sebelumnya.jamSelesai) {
      const pesan =
        `Ada lubang tarif antara ${menitKeJam(sebelumnya.jamSelesai)} dan ` +
        `${menitKeJam(ini.jamMulai)} — sesi di jam itu tak bisa dihargai.`
      return { ok: false, pesan }
    }
  }

  const terakhir = urut[urut.length - 1]
  if (terakhir.jamSelesai !== SEHARI_MENIT) {
    return {
      ok: false,
      pesan: `Tarif berhenti di ${menitKeJam(terakhir.jamSelesai)} — jam setelahnya belum tertutup.`,
    }
  }

  return { ok: true }
}

/** 1020 → "17:00". 1440 → "24:00". */
export function menitKeJam(menit: number): string {
  const j = Math.floor(menit / 60)
  const m = menit % 60
  return `${String(j).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Nomor sesi berikutnya dari daftar nomor yang sudah ada.
 * Diambil dari nomor TERTINGGI secara NUMERIK, bukan urutan teks: "KR-0009"
 * lalu "KR-0010" — urutan teks akan salah begitu lewat 9.
 */
export function nomorBerikut(nomorAda: string[], awalan = 'KR'): string {
  let tertinggi = 0
  for (const n of nomorAda) {
    const m = /(\d+)\s*$/.exec(n ?? '')
    if (!m) continue
    const angka = Number.parseInt(m[1], 10)
    if (Number.isFinite(angka) && angka > tertinggi) tertinggi = angka
  }
  return `${awalan}-${String(tertinggi + 1).padStart(4, '0')}`
}

/**
 * Apakah sebuah sesi MASIH memegang ruangnya.
 *
 * `BOOKING` dan `BERJALAN` memegang. `BERJALAN` dianggap TAK TERBATAS: sesi yang
 * jalan boleh lewat dari rencana (pelanggan nambah lagu), jadi memakai
 * `rencanaSelesai` sebagai patokan akan mengizinkan sesi berikutnya masuk ke
 * ruang yang masih dipakai.
 *
 * `BOOKING` yang sudah lewat `TOLERANSI_BOOKING_MENIT` dari jadwal mulai
 * dianggap LEPAS — pelanggan tak datang. Dihitung saat dibaca (lazy), bukan
 * dengan cron: repo ini tak punya scheduler dan 15 menit itu toleransi, bukan
 * jadwal. Kalau tak ada yang membuka halaman, tak ada yang perlu tahu.
 */
export function memegangRuang(s: SesiRingkas, sekarang: Date): boolean {
  if (s.status === 'BERJALAN') return true
  if (s.status !== 'BOOKING') return false
  const mulai = new Date(s.mulaiPada)
  const batas = mulai.getTime() + TOLERANSI_BOOKING_MENIT * MS_MENIT
  return sekarang.getTime() < batas
}

/**
 * Apakah rentang [mulai, selesai) boleh dipakai di ruang yang punya sesi
 * tertentu. Beririsan dengan sesi yang masih memegang ruang → bentrok.
 *
 * `selesai` boleh null untuk sesi tanpa batas — tapi sesi baru selalu punya
 * rencana selesai, jadi pemanggil mengirim Date.
 */
export function bentrok(
  sesiAda: SesiRingkas[],
  mulai: Date,
  selesai: Date,
  sekarang: Date | null,
): HasilBentrok {
  const kini = sekarang ?? new Date()
  for (const s of sesiAda) {
    if (!memegangRuang(s, kini)) continue

    const sMulai = new Date(s.mulaiPada)
    // Sesi BERJALAN memegang sampai tak terbatas.
    const sSelesai = s.status === 'BERJALAN' ? null : new Date(s.rencanaSelesai)

    // Beririsan kalau mulai baru < selesai lama DAN selesai baru > mulai lama.
    // Berurutan tepat (habis 21:00, mulai 21:00) TIDAK beririsan.
    const beririsan = sSelesai === null ? mulai.getTime() < Infinity : mulai.getTime() < sSelesai.getTime()
    if (beririsan && selesai.getTime() > sMulai.getTime()) {
      return { bentrok: true, penghalang: s }
    }
  }
  return { bentrok: false }
}

/** Sisa menit sampai `rencanaSelesai`. Negatif kalau sudah lewat. */
export function sisaMenit(mulai: Date, rencanaSelesai: Date, sekarang: Date): number {
  return Math.floor((rencanaSelesai.getTime() - sekarang.getTime()) / MS_MENIT)
}

/** Sudah waktunya diingatkan (10 menit terakhir atau sudah lewat). */
export function mendesak(sisa: number): boolean {
  return sisa <= AMBANG_MENDESAK_MENIT
}

/** 90 → "1 jam 30 menit". Untuk ditampilkan ke kasir, bukan ditagihkan. */
export function formatDurasi(menit: number): string {
  const m = Math.max(0, Math.floor(menit))
  const j = Math.floor(m / 60)
  const sisa = m % 60
  if (j === 0) return `${sisa} menit`
  if (sisa === 0) return `${j} jam`
  return `${j} jam ${sisa} menit`
}

// ───────────────────────────────────────────────
// Skema masukan (zod) — satu tempat, dipakai route API + halaman Pengaturan.
// ───────────────────────────────────────────────

export const NAMA_RUANG_MAKS = 40
export const NAMA_PELANGGAN_MAKS = 60
export const HARGA_KARAOKE_MAKS = 9_999_999_999

export const ruangSchema = z.object({
  nama: z.string().trim().min(1, 'Nama ruang wajib diisi.').max(NAMA_RUANG_MAKS, `Nama ruang maks ${NAMA_RUANG_MAKS} huruf.`),
  kapasitas: z.number().int('Kapasitas harus bilangan bulat.').positive('Kapasitas harus lebih dari 0.').nullish(),
  aktif: z.boolean().optional(),
  urutan: z.number().int().optional(),
})

export const blokTarifSchema = z.object({
  jamMulai: z.number().int('Jam mulai harus bilangan bulat.').min(0).max(1439),
  jamSelesai: z.number().int('Jam selesai harus bilangan bulat.').min(1).max(1440),
  hargaPerJam: z
    .number()
    .int('Harga harus bilangan bulat (rupiah, tanpa sen).')
    .min(0, 'Harga tak boleh negatif.')
    .max(HARGA_KARAOKE_MAKS, 'Harga terlalu besar.'),
})

// Seluruh blok dikirim sekaligus (bukan satu per satu) supaya validasi "menutup
// 24 jam" bisa ditegakkan saat menyimpan. Mengirim satu blok membuat aturan itu
// mustahil diperiksa — keadaan antara selalu berlubang.
export const tarifRuangSchema = z.object({
  ruangId: z.string().min(1, 'ruangId wajib diisi.'),
  blok: z.array(blokTarifSchema).min(1, 'Minimal satu blok tarif.'),
})

export const bukaSesiSchema = z.object({
  ruangId: z.string().min(1, 'ruangId wajib diisi.'),
  namaPelanggan: z.string().trim().max(NAMA_PELANGGAN_MAKS).nullish(),
  telepon: z.string().trim().max(24).nullish(),
  // Durasi yang DIINGINKAN pelanggan, dalam menit. Dibulatkan ke atas di server.
  durasiMenit: z.number().int('Durasi harus bilangan bulat.').min(1, 'Durasi minimal 1 menit.').max(24 * 60, 'Durasi maksimal 24 jam.'),
  jaminan: z.number().int('Jaminan harus bilangan bulat.').min(0).max(HARGA_KARAOKE_MAKS).optional(),
  catatan: z.string().trim().max(200).nullish(),
})

export const tutupSesiSchema = z.object({
  // Durasi AKTUAL dalam menit; boleh beda dari rencana (pelanggan nambah lagu).
  durasiMenit: z.number().int('Durasi harus bilangan bulat.').min(1).max(24 * 60).optional(),
  catatan: z.string().trim().max(200).nullish(),
  // BOOKING → BERJALAN. Waktu mulai di-reset ke sekarang supaya waktu tunggu
  // tak ikut ditagih. Ditolak kalau sesi bukan BOOKING.
  mulaiSekarang: z.boolean().optional(),
})
