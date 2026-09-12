'use client'
// components/layout/PemilihProperti.tsx
//
// Pemilih properti aktif. Hanya tampil kalau owner punya >1 properti —
// akun dengan satu properti tidak perlu kontrol tambahan.
// Setelah memilih, halaman di-refresh supaya server component membaca
// properti baru dari cookie.
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Building, ChevronExpand } from 'react-bootstrap-icons'

type Properti = { id: string; nama: string }

export default function PemilihProperti({
  daftar, aktifId,
}: { daftar: Properti[]; aktifId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pilihan, setPilihan] = useState(aktifId)

  if (daftar.length <= 1) return null

  const aktif = daftar.find(p => p.id === pilihan)

  async function pilih(id: string) {
    setPilihan(id)
    const res = await fetch('/api/properti/aktif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertiId: id }),
    })
    if (!res.ok) return
    startTransition(() => router.refresh())
  }

  return (
    <div className="relative">
      <Building size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
      <select
        aria-label="Pilih properti"
        value={pilihan}
        disabled={pending}
        onChange={e => pilih(e.target.value)}
        className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-7 py-2 text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-60 cursor-pointer"
      >
        {daftar.map(p => (
          <option key={p.id} value={p.id}>{p.nama}</option>
        ))}
      </select>
      <ChevronExpand size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
      <span className="sr-only">Properti aktif: {aktif?.nama}</span>
    </div>
  )
}
