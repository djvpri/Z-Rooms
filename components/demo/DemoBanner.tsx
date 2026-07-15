'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InfoCircle, ArrowCounterclockwise } from 'react-bootstrap-icons'

export default function DemoBanner() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleReset() {
    setLoading(true)
    try {
      await fetch('/api/demo/reset', { method: 'POST' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4">
      <span className="text-sm text-teal-700 flex items-center gap-2">
        <InfoCircle className="shrink-0" />
        Ini adalah akun demo. Data direset otomatis setiap hari.
      </span>
      <button
        onClick={handleReset}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium text-teal-700 bg-white border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50 disabled:opacity-50 transition-colors shrink-0 ml-3"
      >
        <ArrowCounterclockwise />
        {loading ? 'Mereset...' : 'Reset Demo'}
      </button>
    </div>
  )
}
