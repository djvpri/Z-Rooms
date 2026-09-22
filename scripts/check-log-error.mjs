// scripts/check-log-error.mjs
//
// Menguji penangkap log error sisi peramban (lib/logError.ts).
//
// Yang diuji: isi log yang DIKIRIM, bukan tampilannya. Kalau isinya salah,
// fiturnya justru menyesatkan — pengembang membaca log dan menyimpulkan
// penyebab yang tak ada, sementara masalah sebenarnya tak terekam.
//
// Diimpor dari lib aslinya, BUKAN disalin.
import assert from 'node:assert/strict'
import { catat, isiLog, kosongkan, jumlahBaris } from '../lib/logError.ts'

// Lingkungan peramban minimal. Node tak punya window/localStorage/location,
// dan lib ini memang menyentuhnya.
//
// `navigator` di Node 22 hanya punya getter — penugasan biasa melempar
// "Cannot set property navigator", jadi dipasang lewat defineProperty.
const simpan = new Map()
globalThis.localStorage = {
  getItem: (k) => (simpan.has(k) ? simpan.get(k) : null),
  setItem: (k, v) => simpan.set(k, String(v)),
  removeItem: (k) => simpan.delete(k),
}
globalThis.location = { pathname: '/kamar' }
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'uji' }, configurable: true, writable: true,
})

console.log('check-log-error: penangkap log kasir\n')

// ── Isi log: bagian kepala wajib ada ────────────────────────────────────────
kosongkan()
catat('console', new Error('gagal simpan'))
const isi = isiLog({ versi: 'abc123' })

for (const label of ['perangkat', 'versi', 'halaman', 'layar', 'zona']) {
  assert.ok(isi.includes(label), `kepala log wajib memuat "${label}"`)
}
assert.ok(isi.includes('abc123'), 'versi build ikut terkirim')
assert.ok(isi.includes('/kamar'), 'halaman yang dibuka ikut terkirim')

// ── Error dirapikan: nama + pesan + stack, bukan "[object Object]" ──────────
assert.ok(isi.includes('Error: gagal simpan'), 'pesan error harus terbaca')
assert.ok(!isi.includes('[object Object]'), 'error tak boleh jadi [object Object]')

// ── Jenis kejadian dibedakan: tanpa ini, error gambar dan crash kode
//    tercampur dan pembaca log menyalahkan kode yang sebenarnya sehat. ──────
kosongkan()
catat('promise', 'fetch gagal')
catat('resource', 'gagal memuat sumber daya', 'https://x/a.png:0')
const beda = isiLog()
assert.ok(beda.includes('promise'), 'kejadian promise ditandai')
assert.ok(beda.includes('resource'), 'kejadian resource ditandai')
assert.ok(beda.includes('https://x/a.png:0'), 'lokasi sumber daya ikut dicatat')

// ── Nilai aneh tak boleh melempar: penangkap error yang melempar membuat
//    aplikasi kasir mati tepat saat sedang bermasalah. ──────────────────────
kosongkan()
const bulat = { a: 1 }
bulat.diri = bulat // JSON.stringify melempar pada siklus
assert.doesNotThrow(() => catat('console', bulat), 'nilai bersiklus tak boleh melempar')
assert.doesNotThrow(() => catat('console', Symbol('x')), 'Symbol tak boleh melempar')
assert.doesNotThrow(() => catat('console', undefined), 'undefined tak boleh melempar')
assert.ok(isiLog().length > 0, 'walau nilai aneh, barisnya tetap tercatat')

// ── Pesan raksasa dipotong: error DOM memuat seluruh HTML halaman, dan satu
//    baris seperti itu mendorong error lain keluar dari batas server. ───────
kosongkan()
catat('console', 'x'.repeat(50_000))
const panjang = isiLog()
assert.ok(panjang.includes('[dipotong]'), 'pesan raksasa harus dipotong')
assert.ok(panjang.length < 10_000, `log harus tetap ringkas, dapat ${panjang.length}`)

// ── Batas jumlah baris: halaman kasir dibiarkan terbuka berhari-hari. ───────
kosongkan()
for (let i = 0; i < 500; i++) catat('console', `error ke-${i}`)
assert.equal(jumlahBaris(), 200, 'batas 200 baris berlaku')
const penuh = isiLog()
assert.ok(!penuh.includes('error ke-0'), 'yang lama dibuang, bukan yang baru')
assert.ok(penuh.includes('error ke-499'), 'yang terbaru dipertahankan — itu yang paling menjelaskan')

// ── Tanpa error pun log tetap bisa dikirim, dengan keterangan jelas. ────────
kosongkan()
const bersih = isiLog()
assert.ok(bersih.includes('0 kejadian'), 'jumlah kejadian dilaporkan')
assert.ok(bersih.includes('tak ada error tercatat'),
  'log kosong harus menyatakan dirinya kosong, bukan tampak rusak')

// ── Komponen benar-benar mengirim ke endpoint yang ada. ────────────────────
const { readFileSync } = await import('node:fs')
const komponen = readFileSync(
  new URL('../components/pengaturan/KirimLogError.tsx', import.meta.url), 'utf8')
assert.ok(komponen.includes("fetch('/api/log'"), 'komponen harus POST ke /api/log')
assert.ok(komponen.includes("pasangPenangkap()"), 'komponen harus memasang penangkap')
assert.ok(komponen.includes('perangkatId()'), 'kiriman harus membawa penanda perangkat')
assert.ok(komponen.includes('kosongkan()'), 'log dibuang setelah terkirim sukses')
// Gagal jaringan TIDAK boleh mengosongkan — kalau tidak, error yang tertangkap
// hilang sebelum sempat terkirim. Yang diperiksa adalah blok `catch` milik
// fungsi `kirim`, bukan catch localStorage di useEffect — karena itu diambil
// blok terakhir yang memuat komentar penandanya.
const blokGagal = komponen.slice(komponen.lastIndexOf('// Gagal jaringan'))
assert.ok(blokGagal.length > 0, 'komentar penanda blok gagal jaringan tak ketemu')
const badanCatch = blokGagal.slice(0, blokGagal.indexOf('} finally'))
assert.ok(!badanCatch.includes('kosongkan()'), 'gagal jaringan tak boleh membuang log')
assert.ok(!badanCatch.includes('setN(0)'), 'gagal jaringan tak boleh mengosongkan hitungan')

// ── Endpoint: potong, dedup, retensi. Dibaca dari berkas rutenya. ───────────
const rute = readFileSync(new URL('../app/api/log/route.ts', import.meta.url), 'utf8')
assert.ok(rute.includes('MAX_BARIS'), 'endpoint memotong jumlah baris')
assert.ok(rute.includes('MAX_PANJANG'), 'endpoint memotong panjang isi')
assert.ok(rute.includes('DEDUP_MENIT'), 'endpoint membuang kiriman kembar')
assert.ok(rute.includes("interval '12 hours'"), 'retensi 12 jam seperti zpos')
assert.ok(/slice\(-MAX_BARIS\)/.test(rute), 'potong dari BELAKANG (baris terbaru yang penting)')
assert.ok(rute.includes('if (!perangkat || !konten)'), 'perangkat & isi wajib diisi')

// ── Gema [APK] tak boleh jadi error: LogWeb.sambungkan menerjemahkan tiap
//    pesan APK jadi console.error('[APK] …'), dan interceptor mencatatnya
//    sebagai "console". Tanpa penjaga, info startup APK ("versi 1.0.13",
//    "pembaruan: sudah terbaru") membanjiri laporan — lihat LogKasir 2026-09-22.
//    Dilewat sebelum `catat`, tapi console asli TETAP dipanggil agar tak ada
//    yang hilang dari DevTools kasir. ─────────────────────────────────────────
const sumberLog = readFileSync(new URL('../lib/logError.ts', import.meta.url), 'utf8')
assert.ok(sumberLog.includes("teks.startsWith('[APK] ')"),
  'interceptor harus melewat gema [APK]')
assert.ok(/if \(teks\.startsWith\('\[APK\] '\)\) return/.test(sumberLog),
  'gema [APK] dilewat SEBELUM catat, bukan sesudahnya')
assert.ok(sumberLog.includes('asli.apply(console, a)'),
  'console asli tetap dipanggil walau gema dilewat')

// ── Jembatan WebView: typeof bisa 'function', bukan 'object'. ───────────────
// Objek hasil addJavascriptInterface punya typeof 'function' di WebView Android.
// Cek yang hanya menerima 'object' melaporkan "peramban (tak ada jembatan APK)"
// padahal APK berjalan — terbukti LogKasir 2026-09-22: apk-agen 1.0.13, tapi
// diagnosa "tak ada jembatan", dan tombol cetak ikut mati. ──────────────────
const sumberCetak = readFileSync(new URL('../lib/cetak.ts', import.meta.url), 'utf8')
assert.ok(sumberCetak.includes("typeof j !== 'object' && typeof j !== 'function'"),
  "ambilJembatan menerima typeof 'function' (bukan cuma 'object')")
assert.ok(sumberCetak.includes("typeof j === 'object' || typeof j === 'function'"),
  "adaJembatanLama menerima typeof 'function' (bukan cuma 'object')")
assert.ok(sumberLog.includes("typeof j !== 'object' && typeof j !== 'function'"),
  "diagnosaCetak menerima typeof 'function' (bukan cuma 'object')")

console.log('\nOK — check-log-error: 12 blok lulus')
