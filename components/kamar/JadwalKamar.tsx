'use client'
// components/kamar/JadwalKamar.tsx
//
// Jadwal 14 hari satu kamar: kolom = tanggal (hari ini sampai H+13), baris =
// 24 jam. Sel kuning = kamar terpakai pada jam itu.
//
// Kenapa grid jam, bukan daftar periode: owner memintanya (Picture3), dan
// untuk sewa harian bentuk ini menjawab pertanyaan yang sebenarnya ditanyakan
// kasir di depan penyewa — "tanggal 20 jam 8 pagi sudah bisa masuk belum?".
// Daftar periode menyembunyikan jawaban itu di balik aritmetika.
//
// Warnanya dihitung dari rentangSewa() yang sama dengan server, jadi sel yang
// kuning memang jam yang akan ditolak server. Menyalin aturan bentrok ke sini
// akan membuat dua sumber yang bisa berbeda.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'react-bootstrap-icons'
import { daftarHari, petaTerpakai, labelJam } from '@/lib/jadwalGrid'
import type { SewaNonSelesai } from '@/lib/jadwalKamar'
import type { AturanCheckout } from '@/lib/checkout'

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function JadwalKamar({
  nomor,
  sewa,
  aturan,
  sekarang,
  onTutup,
}: {
  nomor: string
  sewa: SewaNonSelesai[]
  aturan: AturanCheckout
  /** Diambil sekali di server supaya semua sel dinilai pada titik waktu sama. */
  sekarang: Date
  onTutup: () => void
}) {
  const hari = daftarHari(sekarang)
  const peta = petaTerpakai(sewa, aturan, hari)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onTutup}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-full max-h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="font-medium text-gray-800">Kamar {nomor}</div>
            <div className="text-xs text-gray-500">Jadwal 14 hari ke depan · kuning = terpakai</div>
          </div>
          <button type="button" onClick={onTutup} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto p-4">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 w-12" />
                {hari.map(t => {
                  const [y, m, d] = t.split('-').map(Number)
                  const dt = new Date(y, m - 1, d)
                  return (
                    <th key={t} className="font-normal px-1 pb-1 text-center text-gray-500 whitespace-nowrap">
                      <span className="block text-gray-400">{HARI_SINGKAT[dt.getDay()]}</span>
                      <span className="block">{d}/{m}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, j) => (
                <tr key={j}>
                  {/* Label jam menempel di kiri saat tabel di-scroll: tanpa itu
                      kolom tanggal yang jauh dari label jadi tak terbaca. */}
                  <th className="sticky left-0 bg-white z-10 font-normal pr-2 text-right text-gray-400 whitespace-nowrap">
                    {labelJam(j)}
                  </th>
                  {hari.map(t => {
                    const terpakai = peta.get(t)?.has(j) ?? false
                    return (
                      <td
                        key={t}
                        className={`border border-gray-100 text-center px-1 py-[3px] ${
                          terpakai ? 'bg-amber-300 text-amber-900' : 'bg-white text-gray-300'
                        }`}
                      >
                        {labelJam(j)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Pembungkus: apa pun isinya jadi tombol yang membuka jadwal.
 *
 *  Sengaja BUKAN pembungkus kartu utuh: kartu kamar berisi tombol Ubah dan
 *  Check-out, dan tombol di dalam tombol tak bisa diklik. Pemicunya dipasang
 *  di elemen kecil (nomor kamar) supaya klik tombol lain tetap bekerja. */
export function PemicuJadwal({
  nomor,
  sewa,
  aturan,
  sekarang,
  className = '',
  children,
}: {
  nomor: string
  sewa: SewaNonSelesai[]
  aturan: AturanCheckout
  sekarang: Date
  className?: string
  children: ReactNode
}) {
  const [buka, setBuka] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className={className} title="Lihat jadwal 14 hari">
        {children}
      </button>
      {buka && (
        <JadwalKamar nomor={nomor} sewa={sewa} aturan={aturan} sekarang={sekarang} onTutup={() => setBuka(false)} />
      )}
    </>
  )
}
