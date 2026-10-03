'use client'
// components/offline/PenyiapOffline.tsx
//
// Komponen tanpa tampilan, dipasang sekali di layout dashboard:
//   1. Daftarkan service worker (public/sw.js) — fallback navigasi ke /offline
//      saat jaringan mati.
//   2. Tiap halaman dashboard selesai dimuat & tiap kembali online → ambil
//      /api/snapshot dan simpan ke localStorage (lib/offline.ts). Itulah
//      bahan yang dipakai halaman /offline saat jaringan mati.
import { useEffect } from 'react'
import { simpanSnapshotHasil, kirimOutbox } from '@/lib/offline'

export default function PenyiapOffline() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Gagal daftar (mis. SW matis di WebView lama): mode offline nyala
        // lewat APK fallback onReceivedError — sisa fungsinya tetap jalan.
      })
    }

    async function simpan() {
      try {
        const res = await fetch('/api/snapshot')
        if (res.ok) simpanSnapshotHasil(await res.json())
      } catch {
        // Offline / sesi berakhir: diam — snapshot lama tetap dipakai.
      }
    }

    simpan()
    window.addEventListener('online', simpan)
    // Juga saat halaman dashboard terlihat lagi (APK kembali dari background).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        simpan()
        kirimOutbox().catch(() => {})
      }
    })
    return () => window.removeEventListener('online', simpan)
  }, [])

  return null
}
