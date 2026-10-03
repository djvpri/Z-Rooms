'use client'
// app/(dashboard)/shift/ShiftKlien.tsx
//
// Kartu shift aktif + form buka/tutup. Setelah aksi sukses: router.refresh()
// agar rekap server (sumber kebenaran) dimuat ulang — angka tidak dihitung
// ulang di klien.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupiah, formatTanggal } from '@/lib/utils'

type Rekap = {
  sewaTunai: number
  sewaLainnya: number
  barangTunai: number
  barangLainnya: number
  tunaiSistem: number
  totalMasuk: number
  jumlahTransaksi: number
}

type ShiftAktif = {
  id: string
  modalAwal: number
  mulaiPada: string | Date
}

export default function ShiftKlien({
  propertiNama,
  kasirNama,
  aktifAwal,
  rekapAwal,
}: {
  propertiNama: string
  kasirNama: string
  aktifAwal: ShiftAktif | null
  rekapAwal: Rekap | null
}) {
  const router = useRouter()
  const [aktif] = useState<ShiftAktif | null>(aktifAwal)
  const [rekap] = useState<Rekap | null>(rekapAwal)
  const [modal, setModal] = useState('0')
  const [fisik, setFisik] = useState('')
  const [catatan, setCatatan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [error, setError] = useState('')

  async function buka() {
    setSibuk(true); setError('')
    const res = await fetch('/api/shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modalAwal: Number(modal) || 0 }),
    })
    setSibuk(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Gagal buka shift'); return }
    router.refresh()
  }

  async function tutup() {
    setSibuk(true); setError('')
    const res = await fetch(`/api/shift/${aktif!.id}/tutup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uangFisik: Number(fisik) || 0, catatan }),
    })
    setSibuk(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Gagal tutup shift'); return }
    router.refresh()
  }

  if (!aktif) {
    return (
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Belum ada shift aktif — {kasirNama}</h2>
        <p className="text-sm text-gray-500">Buka shift dengan mencatat modal awal laci.</p>
        <label className="block text-xs font-medium text-gray-500 mb-1">Modal awal (Rp)</label>
        <input
          className="w-48 rounded-lg border border-gray-300 px-3 py-2"
          type="number" min={0} inputMode="numeric"
          value={modal} onChange={(e) => setModal(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-teal" disabled={sibuk} onClick={buka}>
          {sibuk ? 'Membuka…' : 'Buka shift'}
        </button>
      </section>
    )
  }

  const diperkirakan = Number(aktif.modalAwal) + (rekap?.tunaiSistem ?? 0)

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="badge badge-green">Shift aktif</span>
        <span className="text-sm text-gray-500">
          dibuka {formatTanggal(aktif.mulaiPada, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {rekap && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Tunai sewa" nilai={rekap.sewaTunai} />
          <Stat label="Tunai barang" nilai={rekap.barangTunai} />
          <Stat label="Non-tunai (QRIS/transfer/VA)" nilai={rekap.sewaLainnya + rekap.barangLainnya} />
          <Stat label="Total masuk" nilai={rekap.totalMasuk} tebal />
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm space-y-1">
        <div className="flex justify-between"><span>Modal awal</span><b className="tabular-nums">{formatRupiah(aktif.modalAwal)}</b></div>
        <div className="flex justify-between"><span>Tunai sistem (sewa + barang)</span><b className="tabular-nums">{formatRupiah(rekap?.tunaiSistem ?? 0)}</b></div>
        <div className="flex justify-between border-t pt-1"><span>Seharusnya di laci</span><b className="tabular-nums">{formatRupiah(diperkirakan)}</b></div>
        <p className="text-xs text-gray-400">{rekap?.jumlahTransaksi ?? 0} transaksi selama shift ini · {propertiNama}</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-500 mb-1">Hitung uang fisik di laci (Rp)</label>
        <input
          className="w-48 rounded-lg border border-gray-300 px-3 py-2"
          type="number" min={0} inputMode="numeric"
          value={fisik} onChange={(e) => setFisik(e.target.value)}
          placeholder={String(diperkirakan)}
        />
        <label className="block text-xs font-medium text-gray-500 mb-1">Catatan (opsional)</label>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          value={catatan} onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. serahkan ke pemilik, pegang untuk shift berikut…"
        />
        {fisik !== '' && (
          <p className="text-sm">
            Selisih:{' '}
            <b className={Number(fisik) === diperkirakan ? 'text-green-600' : 'text-amber-600'}>
              {formatRupiah(Number(fisik) - diperkirakan)}
            </b>
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-danger" disabled={sibuk || fisik === ''} onClick={tutup}>
          {sibuk ? 'Menutup…' : 'Tutup shift'}
        </button>
      </div>
    </section>
  )
}

function Stat({ label, nilai, tebal }: { label: string; nilai: number; tebal?: boolean }) {
  return (
    <div className="stat-card">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`tabular-nums ${tebal ? 'text-lg font-bold' : 'font-semibold'}`}>{formatRupiah(nilai)}</p>
    </div>
  )
}
