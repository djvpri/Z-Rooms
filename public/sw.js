// public/sw.js — Service worker Z-Rooms (vanilla, tanpa build step).
//
// TUGAS TUNGGAL: kalau navigasi (buka halaman) gagal karena jaringan mati,
// tampilkan halaman /offline dari cache — bukan layar error putih WebView.
//
// Kenapa TIDAK meng-cache halaman lain: semua halaman dinamis + no-store,
// dan menyajikan HTML basi untuk navigasi = dashboard bohong (uang, status
// kamar). Snapshot data ditangani lib/offline.ts via localStorage, bukan di
// sini. Halaman /offline sendiri adalah aset statis (client-only) → aman
// di-cache satu kali.
const CACHE = 'zxroom-offline-v3'
const URL_OFFLINE = '/offline'
// Font ikon: CSS halaman /offline memuat bootstrap-icons.woff2. Tanpa
// pra-cache, ikon jadi kotak kosong (tofu) saat offline — font dimuat
// SETELAH SW jalan, jadi fetch handler navigasi tak menolongnya. Hash nama
// berubah tiap build font berubah; kalau pra-cache gagal (404), install
// tetap lanjut — ikon rusak lebih baik daripada halaman offline mati.
const URL_FONT = '/_next/static/media/bootstrap-icons.bfa90bda.woff2'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled([c.add(URL_OFFLINE), c.add(URL_FONT)]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Aset statis ber-hash (JS chunk, CSS, font): cache-first + simpan balasan
  // pertama ke cache. Ini yang membuat halaman /offline hidup utuh — HTML
  // /offline sendirian tak berguna kalau chunk JS-nya gagal dimuat offline
  // (halaman kosong, ikan tofu). Aset ber-hash tak pernah berubah isinya,
  // jadi cache-first aman. Kalau belum ada di cache & jaringan mati → biarkan
  // gagal (halaman offline tetap menampilkan pesannya).
  const url = new URL(req.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((ada) => ada || fetch(req).then((res) => {
        // Simpan salinan HANYA bila sukses (jangan cache 404/500).
        if (res.ok) {
          const salin = res.clone()
          caches.open(CACHE).then((c) => c.put(req, salin))
        }
        return res
      })),
    )
    return
  }
  // Hanya navigasi dokumen. API/fetch lain: biarkan (gagal = UI halaman
  // offline menampilkan pesannya sendiri).
  if (req.mode !== 'navigate') return
  // Sudah di /offline: biarkan dari cache (offline page boleh dibuka offline).
  if (url.pathname === URL_OFFLINE) {
    event.respondWith(caches.match(URL_OFFLINE))
    return
  }
  event.respondWith(
    fetch(req).catch(() =>
      // Jaringan mati → /offline dari cache.
      caches.match(URL_OFFLINE).then((r) => r || Response.error()),
    ),
  )
})
