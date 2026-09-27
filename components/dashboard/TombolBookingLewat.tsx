'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { catat } from '@/lib/logError'

/** Tombol check-in / batalkan booking yang LEWAT waktu.
 *
 * Kenapa pakai sessionStorage: WebView APK menyajikan ulang kartu "tak
 * check-in" walau query server mengembalikan 0 PENDING, dan storage ini
 * bertahan walau dokumennya basi. Sewa yang sudah ditangani tak perlu
 * ditawari tombol lagi — klik kedua selalu berujung 409.
 */

const KUNCI = 'zxroom.booking-selesai'

function sudahDitangani(sewaId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try { return (sessionStorage.getItem(KUNCI) ?? '').split(',').includes(sewaId) } catch { return false }
}

function tandaiSelesai(sewaId: string) {
  try {
    const lama = (sessionStorage.getItem(KUNCI) ?? '').split(',').filter(Boolean)
    if (!lama.includes(sewaId)) lama.push(sewaId)
    sessionStorage.setItem(KUNCI, lama.slice(-100).join(','))
  } catch { /* abaikan */ }
}

export function TombolBookingLewat({ sewaId, nama }: { sewaId: string; nama: string }) {
  const [jalan, setJalan] = useState<'checkin' | 'batal' | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [selesai, setSelesai] = useState(() => sudahDitangani(sewaId))
  const router = useRouter()

  async function aksi(jenis: 'checkin' | 'batal', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setJalan(jenis)
    setPesan(null)
    const url = `/api/booking/${sewaId}/${jenis}`
    const mulai = Date.now()
    catat('INFO', `tombol booking: ${jenis} diklik`, `sewaId=${sewaId} url=${url}`)
    try {
      const res = await fetch(url, { method: 'POST' })
      const teksMentah = await res.text().catch(() => '')
      let data: unknown = null
      try { data = JSON.parse(teksMentah) } catch { data = null }
      catat(
        res.ok ? 'INFO' : 'ERROR',
        `${jenis} -> HTTP ${res.status} (${Date.now() - mulai} ms)`,
        `body=${teksMentah.slice(0, 300)}`,
      )
      if (!res.ok) {
        // 409: sewa pernah di-check-in — kartunya basi.
        // 404: kartu benar-benar usang.
        if (res.status === 409 || res.status === 404) {
          catat('WARN', `${jenis} ${res.status} — kartu basi`, `sewaId=${sewaId}`)
          setSelesai(true)
          tandaiSelesai(sewaId)
          return
        }
        throw new Error((data as { error?: string } | null)?.error ?? 'Gagal.')
      }
      setSelesai(true)
      tandaiSelesai(sewaId)
      router.refresh()
    } catch (e) {
      catat('ERROR', `${jenis} GAGAL: ${(e as Error).message}`,
        `sewaId=${sewaId} url=${url} durasi=${Date.now() - mulai}ms online=${navigator.onLine}`)
      setPesan((e as Error).message)
    } finally {
      setJalan(null)
    }
  }

  if (selesai) {
    return (
      <span className="text-[10px] font-medium text-teal-600" ref={(el) => {
        if (!el) return
        // Kartunya basi di layar; buang node-nya.
        const kartu = el.closest('a')
        if (kartu && kartu.parentElement) kartu.remove()
      }}>
        Selesai ✓
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => void aksi('checkin', e)}
          disabled={jalan !== null}
          className="rounded border border-teal-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          {jalan === 'checkin' ? 'Memproses…' : 'Check-in'}
        </button>
        <button
          onClick={(e) => void aksi('batal', e)}
          disabled={jalan !== null}
          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-coral-600 hover:bg-coral-50 disabled:opacity-50"
        >
          {jalan === 'batal' ? 'Memproses…' : 'Batal'}
        </button>
      </div>
      {pesan ? <p className="text-[10px] text-coral-600">{pesan}</p> : null}
    </div>
  )
}
