'use client'
// components/lisensi/FormLisensi.tsx
//
// Form ubah plan + tanggal berakhir. Dipisah dari halamannya karena halaman
// Lisensi adalah server component (baca DB langsung) sedangkan form ini perlu
// state. Server component tak bisa menaruh useState.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleFill, ExclamationTriangle, ArrowRepeat, ShieldCheck } from 'react-bootstrap-icons'
import { DAFTAR_PLAN, PLANS, labelPlan, perpanjang } from '@/lib/lisensi'
import { formatRupiah } from '@/lib/utils'

/** Date -> "YYYY-MM-DD" untuk <input type="date">, pakai komponen UTC. */
function keInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function FormLisensi({
  planAwal, expiresAwal, bolehUbah,
}: {
  planAwal: string
  expiresAwal: string | null   // ISO, atau null
  bolehUbah: boolean
}) {
  const router = useRouter()
  const [plan, setPlan] = useState(planAwal)
  const [tanggal, setTanggal] = useState(expiresAwal ? keInput(new Date(expiresAwal)) : '')
  const [pesan, setPesan] = useState('')
  const [error, setError] = useState('')
  const [simpan, setSimpan] = useState(false)

  // Pratinjau perpanjangan: isi kolom tanggal saja, BELUM menyimpan. Sengaja
  // tak langsung menyimpan — pemilik harus melihat tanggalnya dulu, karena
  // perpanjangan dihitung dari tanggal yang sedang berlaku, bukan dari hari ini.
  function pratinjau(bulan: number) {
    const dasar = expiresAwal ? new Date(expiresAwal) : null
    const hasil = perpanjang(bulan, dasar)
    setTanggal(keInput(hasil))
    setPesan(`Tanggal diisi ${hasil.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}. Periksa dulu, lalu Simpan.`)
    setError('')
  }

  async function simpanPerubahan() {
    setSimpan(true); setPesan(''); setError('')
    try {
      const res = await fetch('/api/lisensi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, planExpires: tanggal || null }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Gagal menyimpan'); return }
      setPesan('Lisensi tersimpan.')
      router.refresh()
    } catch {
      setError('Gagal menyimpan — periksa koneksi.')
    } finally {
      setSimpan(false)
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-5">
      <div>
        <label className="form-label">Plan</label>
        <select
          className="form-input"
          value={plan}
          onChange={e => { setPlan(e.target.value); setPesan(''); setError('') }}
          disabled={!bolehUbah}
        >
          {DAFTAR_PLAN.map(p => (
            <option key={p} value={p}>
              {PLANS[p].label}{PLANS[p].harga > 0 ? ` — ${formatRupiah(PLANS[p].harga)}/bulan` : ' — tanpa biaya'}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Plan saat ini: <span className="font-medium text-gray-600">{labelPlan(planAwal)}</span>
        </p>
      </div>

      <div>
        <label className="form-label">Berlaku hingga</label>
        <input
          type="date"
          className="form-input"
          value={tanggal}
          onChange={e => { setTanggal(e.target.value); setPesan(''); setError('') }}
          disabled={!bolehUbah}
        />
        <p className="text-xs text-gray-400 mt-1">
          Kosongkan kalau masa berlaku belum ditentukan.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {[1, 3, 6, 12].map(b => (
            <button
              key={b}
              type="button"
              onClick={() => pratinjau(b)}
              disabled={!bolehUbah}
              className="btn-ghost text-xs inline-flex items-center gap-1 disabled:opacity-40"
            >
              <ArrowRepeat className="h-3 w-3" />
              +{b} bulan
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Perpanjangan dihitung dari tanggal yang sedang berlaku, jadi sisa masa aktif tidak terpotong.
        </p>
      </div>

      {pesan && (
        <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircleFill className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{pesan}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <ExclamationTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!bolehUbah ? (
        <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Hanya admin yang bisa mengubah lisensi. Hubungi admin kalau perlu diperpanjang.</span>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={simpanPerubahan}
            disabled={simpan}
            className="btn btn-primary disabled:opacity-50"
          >
            {simpan ? 'Menyimpan...' : 'Simpan lisensi'}
          </button>
        </div>
      )}
    </div>
  )
}
