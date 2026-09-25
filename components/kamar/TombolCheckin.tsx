'use client'
// Tombol check-in untuk sewa PENDING yang tanggal masuknya sudah lewat.
// Dipasang di kartu kamar, di atas tombol check-out.
import { useState } from 'react'

export default function TombolCheckin({ sewaId, nama, kamar }: { sewaId: string; nama: string; kamar: string }) {
  const [loading, setLoading] = useState(false)
  const [pesan, setPesan] = useState('')
  const [selesai, setSelesai] = useState(false)

  async function checkin() {
    setLoading(true)
    setPesan('')
    try {
      const res = await fetch(`/api/booking/${sewaId}/checkin`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Gagal.')
      setSelesai(true)
      setPesan(data?.pesan ?? 'Check-in berhasil.')
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setPesan((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (selesai) {
    return <p className="text-[11px] text-green-600 mt-1">{pesan}</p>
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary w-full text-xs py-1.5"
        disabled={loading}
        onClick={() => void checkin()}
      >
        {loading ? 'Memproses…' : `Check-in ${nama}`}
      </button>
      {pesan && <p className="text-[10px] text-coral-600 mt-1">{pesan}</p>}
    </>
  )
}