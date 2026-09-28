'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { rentangCepat } from '@/lib/rentang'

const CEPAT = [
  { kode: 'hari', label: 'Hari ini' },
  { kode: '7', label: '7 hari' },
  { kode: '30', label: '30 hari' },
  { kode: 'bulan', label: 'Bulan ini' },
  { kode: 'lalu', label: 'Bulan lalu' },
] as const

export function FilterPeriode({ dari, sampai }: { dari: string; sampai: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [custom, setCustom] = useState(false)

  function terapkan(d: string, s: string) {
    const q = new URLSearchParams(params.toString())
    q.set('dari', d)
    q.set('sampai', s)
    router.push(`/keuangan?${q.toString()}`)
  }

  const aktif = (kode: string) => {
    const r = rentangCepat(kode)
    return !!r && r.dari === dari && r.sampai === sampai
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {CEPAT.map((c) => (
        <button
          key={c.kode}
          type="button"
          onClick={() => {
            const r = rentangCepat(c.kode)
            if (r) { terapkan(r.dari, r.sampai); setCustom(false) }
          }}
          className={`rounded-full px-3 py-1 text-xs whitespace-nowrap border transition-colors ${
            aktif(c.kode)
              ? 'bg-teal-600 text-white border-teal-600'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {c.label}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setCustom((v) => !v)}
        className={`rounded-full px-3 py-1 text-xs border transition-colors ${
          custom ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Rentang sendiri
      </button>

      {custom && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dari}
            onChange={(e) => e.target.value && terapkan(e.target.value, sampai)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
          <span className="text-xs text-gray-400">s/d</span>
          <input
            type="date"
            value={sampai}
            onChange={(e) => e.target.value && terapkan(dari, e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
        </div>
      )}

      <span className="ml-auto text-xs text-gray-400">
        {dari === sampai ? dari : `${dari} — ${sampai}`}
      </span>
    </div>
  )
}
