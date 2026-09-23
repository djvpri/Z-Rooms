// lib/logError.ts
//
// Penangkap error sisi peramban untuk fitur "Kirim Log Error" di tab Pengaturan.
//
// Kenapa dikumpulkan diam-diam, bukan langsung dikirim: kasir tak boleh diganggu
// popup saat aplikasi sedang dipakai. Error dikumpulkan, dan baru dikirim saat
// kasir menekan tombol — biasanya karena ada yang aneh dan ia mau melapor.
// Log yang terkirim otomatis tanpa diminta juga tak pernah dibaca siapa pun.
//
// Kenapa ikut disimpan di localStorage: sebelumnya murni di memori, jadi setiap
// kali halaman dimuat ulang (atau app dibuka-tutup) log ikut hilang dan laporan
// yang dikirim selalu "0 kejadian" — padahal error terjadi sebelum itu. Dengan
// penyimpanan lokal, error yang terjadi di halaman lain tetap terbawa saat
// kasir membuka Pengaturan untuk melapor.
//
// Sengaja TIDAK menangkap console.log biasa: itu bukan error, dan menampungnya
// membuat log penuh sampah sehingga yang penting justru tenggelam.

export type BarisLog = { ts: string; jenis: string; pesan: string; tempat?: string }

/** Batas baris yang disimpan. Peramban kasir dibiarkan terbuka berhari-hari;
 *  tanpa batas, memori tumbuh terus dan halaman jadi berat. */
const MAKS_BARIS = 200

/** Batas panjang satu baris. Pesan error bisa memuat seluruh isi DOM. */
const MAKS_PESAN = 2_000

const KUNCI_SIMPAN = 'zxroom.logerror'

/** Baca log dari kunjungan sebelumnya. Gagal baca (data rusak, localStorage
 *  diblokir) tak boleh mematikan penangkap — log hari ini tetap lebih penting
 *  daripada log kemarin yang tak bisa dibuka. */
function muatTersimpan(): BarisLog[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const mentah = localStorage.getItem(KUNCI_SIMPAN)
    if (!mentah) return []
    const p = JSON.parse(mentah)
    return Array.isArray(p) ? p.filter(
      (b): b is BarisLog => !!b && typeof b.ts === 'string' && typeof b.pesan === 'string',
    ).slice(-MAKS_BARIS) : []
  } catch {
    return []
  }
}

/** Simpan ke localStorage. QuotaExceededError wajar dan sengaja ditelan:
 *  log yang tak tersimpan lebih baik daripada error gara-gara gagal simpan. */
function simpan() {
  try {
    localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(baris.slice(-MAKS_BARIS)))
  } catch { /* abaikan */ }
}

const baris: BarisLog[] = muatTersimpan()
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
  simpan()
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

  // Log sisi APK (Bluetooth, jembatan, pembaruan) datang sebagai event
  // 'zxr-apk-log', bukan console.error: APK mengirimnya lewat evaluateJavascript
  // supaya pesan dengan kutip/baris baru tak merusak skrip. Tanpa pendengar
  // ini, semua kegagalan Bluetooth hilang — log selalu "0 kejadian" walau
  // pemindaian gagal berkali-kali.
  window.addEventListener('zxr-apk-log', (e) => {
    const d = (e as CustomEvent<string>).detail
    if (d) catat('apk', d)
  })

  const asli = console.error
  console.error = (...a: unknown[]) => {
    const teks = a.map((x) => rapikan(x, 500)).join(' ')
    // Gema [APK] dilewat: pesan dari sisi APK dikirim lewat event zxr-apk-log
    // yang diterjemahkan jadi console.error('[APK] …') oleh LogWeb.sambungkan.
    // Tanpa penjaga ini, info startup APK ("versi 1.0.13", "pembaruan: sudah
    // terbaru") ikut tercatat sebagai error — lihat LogKasir produksi 2026-09-22.
    if (teks.startsWith('[APK] ')) return
    catat('console', teks)
    asli.apply(console, a)
  }
}

// `cetak.ts` diimpor hanya untuk `NAMA_JEMBATAN` — diagnosa tombol cetak
// dibaca langsung dari `window` supaya tak bergantung pada bentuk penuh
// jembatan (APK lama bisa punya objek tanpa `cetak`/`versi`).
import { NAMA_JEMBATAN } from './cetak'

/** Cek `window.ZXR_APK` tanpa menerima 'function' sebagai bentuk sah. */
function ambilJembatanRaw(w: Window): unknown {
  return (w as unknown as Record<string, unknown>)[NAMA_JEMBATAN]
}

/** Alasan kenapa tombol Tes cetak tidak bisa diklik — satu string, atau null
 *  kalau tombolnya justru hidup. Dipakai halaman cetak untuk mencatat
 *  kejadian saat halaman dibuka, supaya laporan kasir memuat alasan persis
 *  (bisaCetak=false) dan bukan cuma kesimpulan penangkap yang generik. */
export function alasanTombolMati(): string | null {
  if (typeof window === 'undefined') return null
  const dg = (window as unknown as Record<string, string>).__zxrDiagnosaJembatan
  if (typeof dg === 'string' && dg.includes('typeof=undefined'))
    return 'tak ada ZXR_APK sama sekali — ' + dg
  const j = ambilJembatanRaw(window)
  if (!j) return 'tak ada ZXR_APK sama sekali — halaman di peramban biasa, bukan di APK'
  const t = typeof j
  if (t !== 'object' && t !== 'function')
    return `ZXR_APK ada tapi typeof '${t}' (bukan object/function)`
  if (typeof (j as { cetak?: unknown }).cetak !== 'function')
    return `ZXR_APK ada tanpa cetak — APK lama (typeof '${t}')`
  return null
}

/** Diagnosa kenapa tombol cetak bisa/tidak diklik. Ringkas, satu baris.
 *  Jika APK menulis `window.__zxrDiagnosaJembatan` (v1.0.15+), pakai itu —
 *  jawaban paling akurat karena dibaca saat `onPageFinished`, persis setelah
 *  `addJavascriptInterface`. */
function diagnosaCetak(): string {
  if (typeof window === 'undefined') return '-'
  const dg = (window as unknown as Record<string, unknown>).__zxrDiagnosaJembatan
  if (typeof dg === 'string') return dg
  const j = (window as unknown as Record<string, unknown>)[NAMA_JEMBATAN]
  if (!j || (typeof j !== 'object' && typeof j !== 'function')) return 'peramban (tak ada jembatan APK)'
  // ZXR_APK ada — cek apakah punya `cetak` (APK cukup baru) atau tidak.
  const v = typeof (j as { versi?: () => string }).versi === 'function'
    ? safeVersi((j as { versi: () => string }).versi)
    : '?'
  if (typeof (j as { cetak?: unknown }).cetak !== 'function')
    return `APK lama (versi ${v}, tanpa cetak)`
  return `siap (versi APK ${v})`
}

/** Versi APK dari User-Agent (`... ZRoomsAndroid/1.0.11`). Sumber kedua yang
 *  bekerja bahkan di APK lama tanpa method versi() — asal agen memuat
 *  penanda versi. `ZRoomsAndroid/1.0` tanpa angka minor berarti APK lama
 *  yang menandai agennya secara tetap. */
function versiDariAgen(): string {
  if (typeof navigator === 'undefined') return '-'
  const c = navigator.userAgent.match(/ZRoomsAndroid\/(\S+)/)
  if (!c) return 'bukan APK (peramban biasa)'
  return c[1] === '1.0' ? '1.0 (tetap — APK lama, pra-versi-agen)' : c[1]
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
    // Versi APK dari User-Agent: satu-satunya sumber yang tersisa saat APK
    // terlalu lama untuk punya method versi(). Tanpa ini, log hanya bisa
    // bilang "APK lama (versi ?)" dan asal-usulnya tak pernah ketahuan.
    `apk-agen : ${versiDariAgen()}`,
    '',
    `--- ${baris.length} kejadian ---`,
  ]
  const isi = baris.map((b) =>
    `[${b.ts}] ${b.jenis}${b.tempat ? ` (${b.tempat})` : ''}: ${b.pesan}`)
  if (isi.length === 0) isi.push('(tak ada error tercatat)')
  return [...kepala, ...isi].join('\n')
}

/** Buang isi setelah terkirim — supaya kiriman kedua tidak mengulang yang lama
 *  (server juga dedup 30 menit, tapi ini menghemat kuota kasir). */
export function kosongkan() {
  baris.length = 0
  simpan()
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
