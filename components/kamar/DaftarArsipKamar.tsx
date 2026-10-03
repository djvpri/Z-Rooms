'use client'
// components/kamar/DaftarArsipKamar.tsx
// Daftar kamar terarsip + tombol kembalikan. Collapsed default — jarang dibuka.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArrowCounterclockwise, CaretDownFill, CaretRightFill } from 'react-bootstrap-icons'

export type KamarArsip = { id: string; nomor: string; lantai: number }

export default function DaftarArsipKamar({ daftar }: { daftar: KamarArsip[] }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function kembalikan(id: string, nomor: string) {
    setLoadingId(id)
    try {
      await fetch(`/api/kamar/${id}/arsip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arsip: false }),
      })
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  if (daftar.length === 0) return null

  return (
    <div className="card">
      <button type="button" onClick={() => setBuka(!buka)} className="flex items-center gap-2 text-sm font-medium text-gray-700 w-full">
        {buka ? <CaretDownFill size={11} aria-hidden="true" /> : <CaretRightFill size={11} aria-hidden="true" />}
        <Archive size={13} aria-hidden="true" /> Kamar arsip ({daftar.length})
      </button>
      {buka && (
        <ul className="mt-3 space-y-1.5">
          {daftar.map(k => (
            <li key={k.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Kamar {k.nomor} · lantai {k.lantai}</span>
              <button type="button" onClick={() => kembalikan(k.id, k.nomor)} disabled={loadingId === k.id}
                className="btn btn-ghost px-2 py-1 text-xs" title="Kembalikan ke daftar kamar">
                <ArrowCounterclockwise size={12} aria-hidden="true" /> Kembalikan
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
