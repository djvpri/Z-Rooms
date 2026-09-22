// lib/logError.ts
//
// Penangkap error sisi peramban untuk fitur "Kirim Log Error" di tab Pengaturan.
//
// Kenapa disimpan di memori, bukan langsung dikirim: kasir tak boleh diganggu
// popup saat aplikasi sedang dipakai. Error dikumpulkan diam-diam, dan baru
// dikirim saat kasir menekan tombol — biasanya karena ada yang aneh dan ia
// mau melapor. Log yang terkirim otomatis tanpa diminta juga tak pernah dibaca
// siapa pun.
//
// Sengaja TIDAK menangkap console.log biasa: itu bukan error, dan menampungnya
// membuat log penuh sampah sehingga yang penting justru tenggelam.

export type BarisLog = { ts: string; jenis: string; pesan: string; tempat?: string }

/** Batas baris yang disimpan. Peramban kasir dibiarkan terbuka berhari-hari;
 *  tanpa batas, memori tumbuh terus dan halaman jadi berat. */
const MAKS_BARIS = 200

/** Batas panjang satu baris. Pesan error bisa memuat seluruh isi DOM. */
const MAKS_PESAN = 2_000

const baris: BarisLog[] = []
let terpasang = false

/** Penanda perangkat per peramban. Bukan identitas pengguna — ZXRoom berbasis
 *  web dan satu akun bisa dibuka dari beberapa perangkat, jadi yang perlu
 *  dibedakan adalah perambannya, bukan orangnya. */
export function perangkatId(): string {
  const KUNCI = 'zxroom.perangkat'
  try {
    const ada = localStorage.getItem(KUNCI)
    if (ada) return ada
    const baru = `web-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(KUNCI, baru)
    return baru
  } catch {
    // localStorage bisa diblokir (mode privat/kebijakan). Log tetap berguna
    // walau penanda perangkat tak menetap antar kunjungan.
    return 'web-anonim'
  }
}

function rapikan(v: unknown, batas = MAKS_PESAN): string {
  let s: string
  if (v instanceof Error) {
    s = `${v.name}: ${v.message}`
    if (v.stack) s += `\n${v.stack}`
  } else if (typeof v === 'string') {
    s = v
  } else {
    // JSON.stringify mengembalikan undefined untuk Symbol/function/undefined,
    // DAN melempar untuk nilai bersiklus. Dua-duanya pernah lolos ke sini:
    // `undefined.length` melempar, jadi penangkap error ikut mati justru saat
    // sedang dipakai. String(v) sebagai jaring terakhir tak pernah melempar.
    try {
      const j = JSON.stringify(v)
      s = j === undefined ? String(v) : j
    } catch {
      s = String(v)
    }
  }
  return s.length > batas ? s.slice(0, batas) + '…[dipotong]' : s
}

export function catat(jenis: string, pesan: unknown, tempat?: string) {
  baris.push({
    ts: new Date().toISOString(),
    jenis,
    pesan: rapikan(pesan),
    tempat,
  })
  if (baris.length > MAKS_BARIS) baris.splice(0, baris.length - MAKS_BARIS)
}

/** Pasang penangkap. Aman dipanggil berkali-kali — React memasang ulang saat
 *  komponen dilepas-pasang, dan tanpa penjaga ini tiap error tercatat berkali. */
export function pasangPenangkap() {
  if (terpasang || typeof window === 'undefined') return
  terpasang = true

  window.addEventListener('error', (e) => {
    // Sumber daya gagal (gambar, font) memicu 'error' tanpa objek error —
    // dicatat sebagai kejadian terpisah supaya tak tertukar dengan crash kode.
    catat('resource', e.message || 'gagal memuat sumber daya',
      e.filename ? `${e.filename}:${e.lineno}` : undefined)
  })

  window.addEventListener('unhandledrejection', (e) => {
    catat('promise', e.reason)
  })

  const asli = console.error
  console.error = (...a: unknown[]) => {
    catat('console', a.map((x) => rapikan(x, 500)).join(' '))
    asli.apply(console, a)
  }
}

// `cetak.ts` diimpor hanya untuk `NAMA_JEMBATAN` — diagnosa tombol cetak
// dibaca langsung dari `window` supaya tak bergantung pada bentuk penuh
// jembatan (APK lama bisa punya objek tanpa `cetak`/`versi`).
import { NAMA_JEMBATAN } from './cetak'

/** Diagnosa kenapa tombol cetak bisa/tidak diklik. Ringkas, satu baris. */
function diagnosaCetak(): string {
  if (typeof window === 'undefined') return '-'
  const j = (window as unknown as Record<string, unknown>)[NAMA_JEMBATAN]
  if (!j || typeof j !== 'object') return 'peramban (tak ada jembatan APK)'
  // ZXR_APK ada — cek apakah punya `cetak` (APK cukup baru) atau tidak.
  const v = typeof (j as { versi?: () => string }).versi === 'function'
    ? safeVersi((j as { versi: () => string }).versi)
    : '?'
  if (typeof (j as { cetak?: unknown }).cetak !== 'function')
    return `APK lama (versi ${v}, tanpa cetak)`
  return `siap (versi APK ${v})`
}

/** Ambil versi APK tanpa lempar walau jembatan error. */
function safeVersi(f: () => string): string {
  try { return f() } catch { return '(gagal baca)' }
}

/** Isi log siap kirim. `info` dulu: tanpa itu, log "kamar X salah" tak bisa
 *  ditelusuri — kasir biasanya tidak menyebut halaman mana yang dibuka. */
export function isiLog(info: { versi?: string; halaman?: string } = {}): string {
  const kepala = [
    `ZXRoom — laporan kasir`,
    `waktu    : ${new Date().toISOString()}`,
    `perangkat: ${perangkatId()}`,
    `versi    : ${info.versi ?? '-'}`,
    `halaman  : ${info.halaman ?? (typeof location !== 'undefined' ? location.pathname : '-')}`,
    // Layar penting: banyak keluhan ZXRoom cuma muncul di lebar HP tertentu.
    `layar    : ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x` : '-'}`,
    `agen     : ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
    `zona     : ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    // Versi APK + status tombol cetak: paling sering jadi alasan laporan
    // "tombol cetak tak bisa diklik". Tanpa baris ini, log tak menjawab
    // pertanyaan dasar pengembang: APK mana dan kenapa tombol mati?
    `apk      : ${diagnosaCetak()}`,
    '',
    `--- ${baris.length} kejadian ---`,
  ]
  const isi = baris.map((b) =>
    `[${b.ts}] ${b.jenis}${b.tempat ? ` (${b.tempat})` : ''}: ${b.pesan}`)
  if (isi.length === 0) isi.push('(tak ada error tercatat sejak halaman dibuka)')
  return [...kepala, ...isi].join('\n')
}

/** Buang isi setelah terkirim — supaya kiriman kedua tidak mengulang yang lama
 *  (server juga dedup 30 menit, tapi ini menghemat kuota kasir). */
export function kosongkan() {
  baris.length = 0
}

export function jumlahBaris(): number {
  return baris.length
}

/** N baris log terakhir sebagai teks siap tempel. */
export function barisTerakhir(n = 5): string {
  return baris.slice(-n).map((b) =>
    `[${b.ts}] ${b.jenis}${b.tempat ? ` (${b.tempat})` : ''}: ${b.pesan}`,
  ).join('\n')
}
