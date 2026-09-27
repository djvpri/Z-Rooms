'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Tombol check-in / batalkan booking yang LEWAT waktu. Dipakai di kartu
 * dasbor supaya kasir tak perlu pindah ke /booking dulu.
 *
 * DULU kartu ini cuma `<Link href="/booking">` — petunjuknya ada
 * ("perlu check-in / batal") tapi aksinya butuh 2 langkah, jadi booking
 * hantu tertahan berhari-hari.
 *
 * Setelah aksi sukses, tombol disembunyikan & kartu ditandai "selesai"
 * secara optimistik — kalau `router.refresh()` lambat/diam di WebView APK,
 * kasir tak sempat klik kedua kali (yang akan kena 409 karena sewa sudah
 * bukan PENDING lagi).
 */
export function TombolBookingLewat({ sewaId, nama }: { sewaId: string; nama: string }) {
  const [jalan, setJalan] = useState<'checkin' | 'batal' | null>(null)
  const [pesan, setPesan] = useState<string | null>(null)
  const [selesai, setSelesai] = useState(false)
  const router = useRouter()

  async function aksi(jenis: 'checkin' | 'batal', e: React.MouseEvent) {
    e.preventDefault() // kartunya <Link>; jangan ikut navigasi
    e.stopPropagation()
    setJalan(jenis)
    setPesan(null)
    try {
      const res = await fetch(`/api/booking/${sewaId}/${jenis}`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // 409 = sewa sudah bukan PENDING (sudah di-check-in/dibatalkan sebelumnya).
        // Bukan error — kartunya basi. Anggap selesai & refresh.
        if (res.status === 409) {
          setSelesai(true)
          router.refresh()
          return
        }
        throw new Error(data?.error ?? 'Gagal.')
      }
      // Sembunyikan tombol langsung — tak tunggu server refresh.
      setSelesai(true)
      // Refresh server component supaya kartu hilang dari daftar.
      // Fallback window.location.reload kalau router.refresh tak mengubah DOM
      // (terjadi di WebView APK yang kadang tak re-render).
      router.refresh()
      // WebView APK memegang cache dokumen: reload biasa bisa menyajikan HTML
      // basi (kartu "tak check-in" muncul lagi meski server sudah tak
      // mengirimnya). URL unik memaksa ambil dokumen baru dari server.
      setTimeout(() => {
        if (document.hidden) return
        const u = new URL(window.location.href)
        u.searchParams.set('_r', String(Date.now()))
        window.location.replace(u.toString())
      }, 1200)
    } catch (e) {
      setPesan((e as Error).message)
    } finally {
      setJalan(null)
    }
  }

  if (selesai) {
    return <p className="text-[10px] font-medium text-teal-600">Selesai ✓</p>
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
