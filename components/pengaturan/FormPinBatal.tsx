'use client'

import { useState } from 'react'

/** Atur PIN pembatalan (karaoke & booking). PIN tak pernah dibaca balik —
 *  server cuma melaporkan ADA/TIDAK. */
export function FormPinBatal({ adaPin }: { adaPin: boolean }) {
  const [pin, setPin] = useState('')
  const [ulangi, setUlangi] = useState('')
  const [pinLama, setPinLama] = useState('')
  const [jalan, setJalan] = useState(false)
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null)

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setPesan(null)

    if (pin !== ulangi) {
      setPesan({ ok: false, teks: 'PIN baru dan ulangi PIN tidak sama.' })
      return
    }
    if (adaPin && !pinLama) {
      setPesan({ ok: false, teks: 'PIN lama wajib diisi untuk mengganti PIN.' })
      return
    }

    setJalan(true)
    try {
      const res = await fetch('/api/properti/pin-batal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, pinLama: adaPin ? pinLama : undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPesan({ ok: false, teks: data?.error ?? 'Gagal menyimpan PIN.' })
        return
      }
      setPesan({ ok: true, teks: data.pesan ?? 'PIN disimpan.' })
      setPin('')
      setUlangi('')
      setPinLama('')
    } catch {
      setPesan({ ok: false, teks: 'Koneksi gagal. Coba lagi.' })
    } finally {
      setJalan(false)
    }
  }

  async function hapus() {
    if (!confirm('Hapus PIN pembatalan? Semua staf bisa membatalkan tanpa pengesahan.')) return
    setJalan(true)
    setPesan(null)
    try {
      const pinLamaInput = window.prompt('Masukkan PIN lama untuk konfirmasi:')
      if (pinLamaInput === null) { setJalan(false); return }
      const res = await fetch('/api/properti/pin-batal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: null, pinLama: pinLamaInput }),
      })
      const data = await res.json().catch(() => null)
      setPesan(res.ok
        ? { ok: true, teks: data?.pesan ?? 'PIN dihapus.' }
        : { ok: false, teks: data?.error ?? 'Gagal menghapus PIN.' })
    } catch {
      setPesan({ ok: false, teks: 'Koneksi gagal.' })
    } finally {
      setJalan(false)
    }
  }

  return (
    <form onSubmit={simpan} className="card mb-4">
      <h2 className="text-sm font-medium text-gray-700 mb-1">PIN Pembatalan</h2>
      <p className="text-xs text-gray-400 mb-4">
        {adaPin
          ? 'Aktif — batal karaoke & booking kamar wajib pakai PIN dan alasan.'
          : 'Belum aktif — siapa pun bisa membatalkan tanpa pengesahan. Atur PIN untuk mengamankan.'}
      </p>

      <div className="space-y-3">
        {adaPin && (
          <div>
            <label htmlFor="pin-lama" className="block text-xs font-medium text-gray-600 mb-1">PIN lama</label>
            <input
              id="pin-lama"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pinLama}
              onChange={(e) => setPinLama(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
              placeholder="••••"
            />
          </div>
        )}
        <div>
          <label htmlFor="pin-baru" className="block text-xs font-medium text-gray-600 mb-1">PIN baru (4-8 angka)</label>
          <input
            id="pin-baru"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
            placeholder="••••"
          />
        </div>
        <div>
          <label htmlFor="pin-ulangi" className="block text-xs font-medium text-gray-600 mb-1">Ulangi PIN baru</label>
          <input
            id="pin-ulangi"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            value={ulangi}
            onChange={(e) => setUlangi(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
            placeholder="••••"
          />
        </div>
      </div>

      {pesan && (
        <p className={`mt-3 text-xs ${pesan.ok ? 'text-teal-600' : 'text-coral-600'}`}>{pesan.teks}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={jalan || pin.length < 4}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {jalan ? 'Menyimpan…' : adaPin ? 'Ganti PIN' : 'Simpan PIN'}
        </button>
        {adaPin && (
          <button
            type="button"
            onClick={() => void hapus()}
            disabled={jalan}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-coral-600 hover:bg-coral-50 disabled:opacity-50"
          >
            Hapus PIN
          </button>
        )}
      </div>
    </form>
  )
}
