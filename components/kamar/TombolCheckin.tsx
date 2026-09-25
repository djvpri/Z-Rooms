'use client'
// Aksi untuk sewa PENDING yang tanggal masuknya sudah lewat (tamu tak
// kunjung datang). Dipasang di kartu kamar, di atas tombol check-out.
// Check-in: tamu datang — PENDING → AKTIF, tanggal masuk di-reset.
// Batalkan: tamu batal — kamar kembali TERSEDIA, tagihan ikut batal.
import { useState } from 'react'

export default function TombolCheckin({ sewaId, nama, kamar }: { sewaId: string; nama: string; kamar: string }) {
  const [loading, setLoading] = useState<'checkin' | 'batal' | null>(null)
  const [pesan, setPesan] = useState('')
  const [selesai, setSelesai] = useState(false)

  async function aksi(jenis: 'checkin' | 'batal') {
    // Batalkan butuh konfirmasi — aksinya membalikkan status kamar &
    // menandai tagihan batal; salah klik tak boleh langsung jalan.
    if (jenis === 'batal' && !confirm(`Batalkan booking ${nama} di ${kamar}? Kamar kembali tersedia.`)) return
    setLoading(jenis)
    setPesan('')
    try {
      const res = await fetch(`/api/booking/${sewaId}/${jenis}`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Gagal.')
      setSelesai(true)
      setPesan(data?.pesan ?? 'Selesai.')
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setPesan((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  if (selesai) {
    return <p className="text-[11px] text-green-600 mt-1">{pesan}</p>
  }

  return (
    <>
      <div className="flex gap-1">
        <button
          type="button"
          className="btn btn-primary flex-1 text-xs py-1.5"
          disabled={loading !== null}
          onClick={() => void aksi('checkin')}
        >
          {loading === 'checkin' ? 'Memproses…' : `Check-in ${nama}`}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-xs py-1.5 px-2"
          disabled={loading !== null}
          onClick={() => void aksi('batal')}
        >
          {loading === 'batal' ? '…' : 'Batalkan'}
        </button>
      </div>
      {pesan && <p className="text-[10px] text-coral-600 mt-1">{pesan}</p>}
    </>
  )
}