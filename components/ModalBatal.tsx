'use client'

import { useState } from 'react'

/** Dialog pengesahan pembatalan: alasan (wajib) + PIN (kalau properti
 *  mengaktifkannya). Dipakai batal karaoke & batal booking kamar. */
export function ModalBatal({
  judul,
  butuhPin,
  tutup,
  batal,
}: {
  judul: string
  butuhPin: boolean
  tutup: () => void
  batal: (isi: { alasan: string; pin: string }) => Promise<void>
}) {
  const [alasan, setAlasan] = useState('')
  const [pin, setPin] = useState('')
  const [jalan, setJalan] = useState(false)
  const [err, setErr] = useState('')

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!alasan.trim()) {
      setErr('Alasan wajib diisi.')
      return
    }
    setJalan(true)
    try {
      await batal({ alasan: alasan.trim(), pin })
    } catch (e) {
      setErr((e as Error).message || 'Gagal membatalkan.')
    } finally {
      setJalan(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={kirim} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Batalkan {judul}?</h3>
        <p className="text-xs text-gray-400 mb-4">Tindakan ini dicatat di log aktivitas.</p>

        <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="alasan-batal">
          Alasan <span className="text-coral-600">*</span>
        </label>
        <textarea
          id="alasan-batal"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={2}
          maxLength={200}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Contoh: salah buat sesi, pelanggan berubah pikiran…"
          autoFocus
        />

        {butuhPin && (
          <>
            <label className="mt-3 block text-xs font-medium text-gray-600 mb-1" htmlFor="pin-batal">
              PIN pembatalan <span className="text-coral-600">*</span>
            </label>
            <input
              id="pin-batal"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
              placeholder="••••"
            />
          </>
        )}

        {err && <p className="mt-2 text-xs text-coral-600">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={tutup}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={jalan || !alasan.trim()}
            className="rounded-lg bg-coral-600 px-4 py-2 text-sm font-medium text-white hover:bg-coral-700 disabled:opacity-50"
          >
            {jalan ? 'Memproses…' : 'Ya, batalkan'}
          </button>
        </div>
      </form>
    </div>
  )
}
