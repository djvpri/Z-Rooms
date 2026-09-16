'use client'
// components/kamar/TabelKamar.tsx
//
// Tabel daftar kamar (desktop) dengan kolom yang bisa dipilih dan diurutkan.
//
// Dipisah jadi client component karena butuh state: kolom mana yang tampil dan
// urutannya. Halaman Kamar sendiri server component — pengurutan di server
// berarti tiap klik sort memuat ulang halaman.
//
// Semua nilai yang tampil SUDAH dihitung di server (harga, status bayar, batas
// check-out) dan dikirim sebagai teks siap-render + nilai mentah untuk sorting.
// Perhitungannya tak digandakan di sini: harga & status punya aturannya sendiri
// di lib/tipeKamar dan lib/bayar, dan menyalinnya ke client akan membuat dua
// sumber yang bisa berbeda.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, Sliders } from 'react-bootstrap-icons'

/** Satu kolom tabel: kunci, judul, nilai mentah untuk sorting, sel ReactNode. */
export type KolomKamar = {
  kunci: string
  judul: string
  /** Nilai untuk pengurutan. string -> localeCompare, number -> selisih. */
  nilai: string | number | null
  sel: ReactNode
  /** Kolom aksi (tombol Ubah/Check-out) tak punya header yang bisa diklik. */
  tetap?: boolean
}

export type BarisKamar = {
  id: string
  aksi: ReactNode
  kolom: KolomKamar[]
}

/** Kolom yang boleh disembunyikan. `nomor` sengaja selalu tampil — tanpa itu
 *  barisnya tak bisa dikenali. */
const WAJIB = new Set(['nomor'])

export default function TabelKamar({ baris, kunciAwal }: { baris: BarisKamar[]; kunciAwal: string[] }) {
  // Kolom yang tampil + urutannya mengikuti kunciAwal (dari server, jadi
  // urutan bawaan tetap satu tempat dengan definisinya).
  const [tampil, setTampil] = useState<string[]>(kunciAwal)
  const [urutKolom, setUrutKolom] = useState<string | null>(null)
  const [naik, setNaik] = useState(true)
  const [panelBuka, setPanelBuka] = useState(false)

  const semua = baris[0]?.kolom ?? []
  const aktif = semua.filter(k => tampil.includes(k.kunci))

  const toggleKolom = (kunci: string) =>
    setTampil(t => t.includes(kunci)
      ? t.filter(x => x !== kunci)
      : kunciAwal.filter(x => t.includes(x) || x === kunci))

  const klikHeader = (kunci: string) => {
    if (urutKolom === kunci) setNaik(n => !n)
    else { setUrutKolom(kunci); setNaik(true) }
  }

  // Urutkan. null/undefined selalu di bawah, apa pun arahnya — baris kosong
  // menumpuk di satu ujung, bukan menyelip di tengah.
  const terurut = urutKolom == null ? baris : [...baris].sort((a, b) => {
    const ka = a.kolom.find(k => k.kunci === urutKolom)?.nilai
    const kb = b.kolom.find(k => k.kunci === urutKolom)?.nilai
    const kosongA = ka == null || ka === ''
    const kosongB = kb == null || kb === ''
    if (kosongA || kosongB) return kosongA && kosongB ? 0 : kosongA ? 1 : -1
    const hasil = typeof ka === 'number' && typeof kb === 'number'
      ? ka - kb
      : String(ka).localeCompare(String(kb), 'id-ID')
    return naik ? hasil : -hasil
  })

  return (
    <div>
      {/* Pemilih kolom. Ditutup secara bawaan supaya tabelnya tak tertutup panel
          saat halaman dibuka. */}
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setPanelBuka(b => !b)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          <Sliders size={13} />
          Kolom ({aktif.length}/{semua.length})
          <ChevronDown size={11} className={panelBuka ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {panelBuka && (
        <div className="mb-2 p-3 bg-gray-50 rounded-xl flex flex-wrap gap-x-4 gap-y-2">
          {semua.filter(k => !k.tetap).map(k => (
            <label
              key={k.kunci}
              className={`text-xs flex items-center gap-1.5 ${WAJIB.has(k.kunci) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 cursor-pointer'}`}
            >
              <input
                type="checkbox"
                className="accent-teal-600"
                disabled={WAJIB.has(k.kunci)}
                checked={tampil.includes(k.kunci)}
                onChange={() => toggleKolom(k.kunci)}
              />
              {k.judul}
            </label>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {aktif.map(k => (
                <th key={k.kunci} className="text-left py-2 text-xs font-medium text-gray-400 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => klikHeader(k.kunci)}
                    className="flex items-center gap-1 hover:text-gray-600"
                  >
                    {k.judul}
                    {urutKolom === k.kunci
                      ? (naik ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                      : null}
                  </button>
                </th>
              ))}
              <th className="text-left py-2 w-px"></th>
            </tr>
          </thead>
          <tbody>
            {terurut.map(b => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                {aktif.map(k => {
                  const sel = b.kolom.find(x => x.kunci === k.kunci)?.sel
                  return <td key={k.kunci} className="py-2.5">{sel ?? '-'}</td>
                })}
                <td className="py-2.5 w-px">{b.aksi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {terurut.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">Tak ada kamar.</p>
      )}
    </div>
  )
}
