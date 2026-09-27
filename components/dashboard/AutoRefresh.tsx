'use client'

import { useEffect } from 'react'

/**
 * Muat ulang dashboard secara penuh (window.location.reload) tiap N detik.
 *
 * Kenapa perlu: WebView APK di sebagian perangkat menyajikan dokumen basi —
 * `router.refresh()` dan `location.reload()` biasa masih menampilkan kartu
 * "perlu check-in" padahal server sudah tak mengirimnya (query 0 baris).
 * Navigasi penuh dengan query unik memaksa ambil dokumen baru.
 *
 * Aman untuk interaksi: kalau user sedang menekan tombol (check-in/batal),
 * reload ditunda ke siklus berikutnya — setidaknya tombolnya sempat selesai.
 * Kalau dokumen disembunyikan (APK di-background), reload dilewati.
 */
export function AutoRefresh({ detik }: { detik: number }) {
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return
      // Sedang ada request aksi berjalan? Tunda — lihat indikator tombol.
      if (document.querySelector('button[disabled]')) return
      const u = new URL(window.location.href)
      u.searchParams.set('_r', String(Date.now()))
      window.location.replace(u.toString())
    }, detik * 1000)
    return () => clearInterval(t)
  }, [detik])
  return null
}
