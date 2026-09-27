'use client'

import { useEffect, useRef } from 'react'

/** Buang panel "Segera berakhir" kalau semua kartunya sudah tak ada.
 *
 * Kasus nyata: WebView APK menyajikan dokumen basi — badge "2" masih tampil
 * padahal kartu-kartunya sudah dihapus TombolBookingLewat (sessionStorage +
 * node removal). Kepala panel datang dari server, jadi satu-satunya cara
 * membersihkannya dari client adalah membuang node panelnya sendiri.
 */
export function BersihkanPanel() {
  const tanda = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = tanda.current
    if (!node) return
    const daftar = node.parentElement
    const panel = node.closest('.card')
    if (!daftar || !panel) return

    const cek = () => {
      if (daftar.querySelectorAll('a').length === 0) panel.remove()
    }
    cek() // kartu bisa sudah raib sebelum observer terpasang

    const obs = new MutationObserver(cek)
    obs.observe(daftar, { childList: true })
    return () => obs.disconnect()
  }, [])

  return <div ref={tanda} className="hidden" aria-hidden="true" />
}
