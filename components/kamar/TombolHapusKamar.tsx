'use client'
// components/kamar/TombolHapusKamar.tsx
// Hapus kamar tanpa riwayat sewa. Server menolak kamar berriwayat (409) —
// pesannya ditampilkan apa adanya di sini. Konfirmasi sebelum kirim.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash } from 'react-bootstrap-icons'

export default function TombolHapusKamar({ id, nomor }: { id: string; nomor: string }) {
  const router = useRouter()
  const [buka, setBuka] = useState(false)
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)

  async function hapus() {
    setLoading(true); setPesan('')
    try {
      const res = await fetch(`/api/kamar/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPesan(data?.error?.message || 'Gagal menghapus kamar.')
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
      <button type="button" onClick={() => { setPesan(''); setBuka(true) }} className="btn btn-ghost px-2 py-1 text-xs text-red-600 hover:text-red-700"
        aria-label={`Hapus kamar ${nomor}`} title="Hapus kamar">
        <Trash size={13} aria-hidden="true" />
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Hapus kamar {nomor}?</h2>
            {pesan ? (
              <>
                <p className="text-sm text-red-600">{pesan}</p>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-sm">Tutup</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">Kamar kosong tanpa riwayat sewa akan dihapus permanen. Kamar yang pernah dihuni tidak bisa dihapus.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-sm" disabled={loading}>Batal</button>
                  <button type="button" onClick={hapus} className="btn bg-red-600 text-white hover:bg-red-700 text-sm" disabled={loading}>
                    {loading ? 'Menghapus…' : 'Hapus'}
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
