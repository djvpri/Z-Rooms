'use client'
// Pemilih waktu reservasi: chips hari (sampai akhir bulan) + grid jam 24 jam.
//
// Menggantikan `<input type="date">` + `<select>` jam. Alasan gantinya bukan
// estetika: dropdown jam cuma menampilkan pilihan, sedangkan di sini tiap jam
// bisa ditandai TERPAKAI dari data sewa yang sudah dimuat halaman. Kasir jadi
// tahu jam mana yang bakal ditolak server sebelum menekan simpan, bukan
// sesudahnya sebagai galat 400 di form yang sudah terisi penuh.
//
// Jam terpakai tetap DITAMPILKAN (abu-abu, tidak bisa diklik), bukan
// disembunyikan: kasir perlu bisa membedakan "kamar memang terisi" dari
// "aplikasi rusak". Menyembunyikan pilihan membuat lubang di grid yang tak
// bisa dijelaskan.

import { CheckCircleFill, Clock } from 'react-bootstrap-icons'
import { tglJamJadiDate } from '@/lib/utils'

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Jam masuk yang bisa dipilih: 00:00..23:00.
export const JAM_MASUK = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

// Rentang tanggal dari `awal` (inklusif) sampai `akhir` (inklusif), format
// "YYYY-MM-DD". Dipakai untuk chips hari. Aritmetika lewat tengah malam pakai
// jam 12:00 WIB sebagai titik tengah hari, bukan jam 00:00: penjumlahan 24 jam
// dari tengah malam bisa mendarat di hari yang sama atau lewat satu hari
// tergantung zona mesin kasir — jam 12:00 aman untuk semua offset ±12 jam.
export function daftarTanggal(awal: string, sampai: string): string[] {
  const hasil: string[] = []
  let t = tglJamJadiDate(awal, '12:00').getTime()
  const batas = tglJamJadiDate(sampai, '12:00').getTime()
  while (t <= batas) {
    // Ambil bagian tanggalnya di WIB. `+07:00` ditulis eksplisit: toISOString()
    // memakai UTC dan akan menggeser hari untuk jam 12:00 WIB (05:00 UTC).
    const d = new Date(t + 7 * 60 * 60 * 1000)
    hasil.push(d.toISOString().slice(0, 10))
    t += 24 * 60 * 60 * 1000
  }
  return hasil
}

// "Sen, 25 Okt" untuk label chip. Jam 12:00 WIB supaya nama harinya tak
// bergeser di mesin yang zonanya bukan WIB.
export function labelChip(tanggal: string) {
  const d = new Date(tglJamJadiDate(tanggal, '12:00').getTime() + 7 * 60 * 60 * 1000)
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`
}

type Props = {
  // Tanggal & jam yang sedang dipilih ('' = belum ada).
  tanggal: string
  jam: string
  // Tanggal-tanggal untuk chips. Halaman yang menyusun daftarnya karena ia
  // yang tahu batas "akhir bulan" dan apakah harinya masih boleh dipesan.
  tanggalPilihan: string[]
  // Jam (format "HH:00") yang TERPAKAI oleh sewa lain.
  jamTerpakai: Set<string>
  // Jam yang sengaja tidak ditawarkan meski tak terpakai sewa — mis. sudah
  // lewat untuk hari ini. Ditandai sama seperti jam terpakai.
  jamLewat?: Set<string>
  // Sewa bulanan/tahunan tak butuh jam: penyewa masuk tanggal berapa pun
  // dianggap mulai pukul 00:00. Grid jam disembunyikan supaya kasir tak
  // merasa ada yang harus dipilih. Nilainya tetap dikirim ('00:00') karena
  // `tanggalKeluar` dan nota menghitung dari jam, jadi data lama tetap utuh.
  tanpaJam?: boolean
  onPilih: (tanggal: string, jam: string) => void
}

export default function PilihWaktu({
  tanggal, jam, tanggalPilihan, jamTerpakai, jamLewat, tanpaJam, onPilih,
}: Props) {
  const terkunci = (j: string) => jamTerpakai.has(j) || !!jamLewat?.has(j)

  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">Tanggal masuk *</label>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {tanggalPilihan.map(t => {
            const aktif = t === tanggal
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPilih(t, jam)}
                aria-pressed={aktif}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs text-center transition-colors ${
                  aktif
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <span className="block whitespace-nowrap font-medium leading-tight">{labelChip(t)}</span>
                {/* Penanda "Dipilih" ditulis, bukan cuma diwarnai: warna saja
                    tidak terbaca kalau kasir buta warna atau layarnya redup.
                    `aria-hidden` untuk yang tidak aktif, bukan teks transparan —
                    teks transparan tetap diumumkan pembaca layar, jadi 14 chip
                    akan terbaca "Dipilih" semua. Tingginya dijaga `h-2` supaya
                    chip terpilih tidak lebih tinggi dari yang lain. */}
                {aktif
                  ? <span aria-hidden="true" className="block text-[10px] leading-none h-2 text-white/80">Dipilih</span>
                  : <span aria-hidden="true" className="block text-[10px] leading-none h-2" />}
              </button>
            )
          })}
        </div>
      </div>

      {!tanpaJam && (
        <div>
          <label className="form-label">Jam masuk *</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
          {JAM_MASUK.map(j => {
            const mati = terkunci(j)
            const aktif = j === jam && !mati
            return (
              <button
                key={j}
                type="button"
                disabled={mati}
                onClick={() => onPilih(tanggal, j)}
                aria-pressed={aktif}
                title={mati ? 'Sudah terpakai sewa lain' : undefined}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs leading-none transition-colors ${
                  aktif
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : mati
                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-400'
                }`}
              >
                <Clock className={`h-3 w-3 shrink-0 ${aktif ? 'text-white' : 'text-gray-400'}`} />
                <span className="truncate tabular-nums">{j}</span>
                {/* Centang hanya di jam terpilih. Radio di mockup tidak dipakai:
                    klik seluruh kotak sudah memilih, dan radio 24 buah bikin
                    tiap baris lebih sempit tanpa menambah informasi. */}
                {aktif && <CheckCircleFill className="h-3 w-3 ml-auto shrink-0 text-white" />}
              </button>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}
