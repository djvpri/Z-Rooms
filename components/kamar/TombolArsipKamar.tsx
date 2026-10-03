'use client'
// components/kamar/TombolArsipKamar.tsx
// Arsipkan kamar (pensiunkan). Kamar terisi/dipesan ditolak server (409) —
// pesannya tampil apa adanya. Dipakai di kartu kamar & baris tabel.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'react-bootstrap-icons'

export default function TombolArsipKamar({ id, nomor }: { id: string; nomor: string }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)

  async function arsipkan() {
    setLoading(true); setPesan('')
    try {
      const res = await fetch(`/api/kamar/${id}/arsip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arsip: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPesan(data?.error?.message || 'Gagal mengarsipkan kamar.')
        return
      }
      setBuka(false)
      router.refresh()
    } catch (err: any) {
      setPesan('Terjadi kesalahan: ' + String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setPesan(''); setBuka(true) }} className="btn btn-ghost px-2 py-1 text-xs"
        aria-label={`Arsipkan kamar ${nomor}`} title="Arsipkan kamar">
        <Archive size={13} aria-hidden="true" />
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Arsipkan kamar {nomor}?</h2>
            {pesan ? (
              <>
                <p className="text-sm text-red-600">{pesan}</p>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-sm">Tutup</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">Kamar hilang dari daftar & tak bisa dibooking, tapi riwayat sewa dan laporan keuangannya tetap utuh. Kamar harus kosong dulu.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-sm" disabled={loading}>Batal</button>
                  <button type="button" onClick={arsipkan} className="btn btn-primary text-sm" disabled={loading}>
                    {loading ? 'Mengarsip…' : 'Arsipkan'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
