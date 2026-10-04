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
import { catat } from '@/lib/logError'

// Guard anti-spam: catat hanya saat KEADAAN berubah (per muatan dokumen),
// bukan tiap fetch — visibilitychange menyala tiap kali app kembali ke depan.
let terakhir = ''

export default function PenyiapOffline() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        catat('INFO', 'offline/sw: terdaftar')
      }).catch((e: unknown) => {
        // Gagal daftar (mis. SW mati di WebView lama): mode offline nyala
        // lewat APK fallback onReceivedError — sisa fungsinya tetap jalan.
        // Tapi JANGAN diam: kasus "ikon tofu + snapshot kosong" butuh tahu
        // apakah SW ini hidup atau tidak.
        catat('KESALAHAN', `offline/sw: gagal daftar: ${e instanceof Error ? e.message : e}`)
      })
    }

    async function simpan() {
      try {
        const res = await fetch('/api/snapshot')
        if (!res.ok) {
          if (terakhir !== `http${res.status}`) {
            terakhir = `http${res.status}`
            catat('KESALAHAN', `offline/simpan GAGAL: HTTP ${res.status}`)
          }
          return
        }
        let data: unknown
        try { data = JSON.parse(await res.text()) } catch {
          // res.ok tapi bukan JSON — biasanya redirect /login (HTML) karena
          // sesi berakhir: inilah jalur sunyi yang dulu bikin snapshot kosong.
          if (terakhir !== 'bukan-json') {
            terakhir = 'bukan-json'
            catat('KESALAHAN', 'offline/simpan: balasan bukan JSON (redirect sesi habis?)')
          }
          return
        }
        simpanSnapshotHasil(data)
        const nKamar = Array.isArray((data as { kamar?: unknown })?.kamar)
          ? (data as { kamar: unknown[] }).kamar.length : -1
        if (nKamar < 0) {
          if (terakhir !== 'bukan-snapshot') {
            terakhir = 'bukan-snapshot'
            catat('KESALAHAN', 'offline/simpan: balasan bukan snapshot')
          }
          return
        }
        const nTagihan = Array.isArray((data as { tagihan?: unknown[] })?.tagihan)
          ? (data as { tagihan: unknown[] }).tagihan.length : '?'
        const kunci = `${nKamar}:${nTagihan}`
        if (kunci !== terakhir) {
          terakhir = kunci
          catat('INFO', `offline/simpan: OK (kamar=${nKamar} tagihan=${nTagihan})`)
        }
      } catch {
        // Jaringan mati: normal (fetch snapshot gagal saat offline) — diam.
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
