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
const CACHE = 'zxroom-offline-v1'
const URL_OFFLINE = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([URL_OFFLINE]))
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
  // Hanya navigasi dokumen. API/fetch/aset statis: biarkan (gagal = UI
  // halaman offline menampilkan pesannya sendiri).
  if (req.mode !== 'navigate') return
  // Sudah di /offline: biarkan dari cache (offline page boleh dibuka offline).
  if (new URL(req.url).pathname === URL_OFFLINE) {
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
