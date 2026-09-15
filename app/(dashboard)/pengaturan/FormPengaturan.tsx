'use client'
// app/(dashboard)/pengaturan/FormPengaturan.tsx
//
// Form jam check-out. Dipisah jadi client component karena butuh
// `useActionState` untuk menampilkan konfirmasi/pesan error — server component
// tak bisa memegang state setelah action selesai.
import { useActionState } from 'react'
import { CheckCircleFill, ExclamationTriangleFill } from 'react-bootstrap-icons'
import { simpanPengaturan, type HasilSimpan } from './actions'

export default function FormPengaturan({
  jam, toleransi,
}: {
  jam: string
  toleransi: number
}) {
  const [hasil, aksi, sedang] = useActionState<HasilSimpan | null, FormData>(
    simpanPengaturan,
    null,
  )

  return (
    <form action={aksi} className="space-y-4">
      {hasil?.ok === true && (
        <div className="text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <CheckCircleFill size={14} aria-hidden="true" /> {hasil.pesan}
        </div>
      )}
      {hasil?.ok === false && (
        <div className="text-sm text-coral-600 bg-coral-50 border border-coral-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <ExclamationTriangleFill size={14} aria-hidden="true" /> {hasil.pesan}
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-1">Jam check-out</h2>
        <p className="text-xs text-gray-500 mb-3">
          Sewa harian habis pada jam ini di hari terakhir, bukan jam masuk + 24 jam.
          Jadi penyewa yang masuk jam 15:00 tetap harus check-out jam {jam} besoknya.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="jamCheckout" className="form-label">Jam acuan habis sewa</label>
            <input
              id="jamCheckout"
              name="jamCheckout"
              type="text"
              inputMode="numeric"
              pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
              maxLength={5}
              placeholder="HH:mm"
              defaultValue={jam}
              required
              className="form-input"
              title="Format 24 jam, contoh 14:30"
            />
          </div>
          <div>
            <label htmlFor="toleransiCheckout" className="form-label">
              Toleransi (menit)
            </label>
            <input
              id="toleransiCheckout"
              name="toleransiCheckout"
              type="number"
              min={0}
              max={720}
              step={15}
              defaultValue={toleransi}
              required
              className="form-input"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Setelah jam {jam} plus {toleransi} menit, kamar ditandai{' '}
          <span className="font-medium text-coral-600">lewat check-out</span>.
          Tanda ini hanya peringatan — kamar tidak otomatis dikosongkan, karena
          check-out mengembalikan deposit dan harus diperiksa orang.
        </p>
      </div>

      <button type="submit" disabled={sedang} className="btn btn-primary disabled:opacity-60">
        {sedang ? 'Menyimpan...' : 'Simpan'}
      </button>
    </form>
  )
}
