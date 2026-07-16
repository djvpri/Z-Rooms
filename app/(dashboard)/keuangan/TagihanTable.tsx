'use client'

import { useState } from 'react'
import { Printer } from 'react-bootstrap-icons'
import { formatRupiah, formatTanggal, statusTagihanColor, statusTagihanLabel } from '@/lib/utils'

export type TagihanRow = {
  id: string
  nominal: number
  jatuhTempo: string
  status: string
  sewa: {
    kamar: { nomor: string }
    penyewa: { nama: string }
  }
  pembayaran: { metodeBayar: string | null }[]
}

export default function TagihanTable({ tagihan, bulanLabel }: { tagihan: TagihanRow[]; bulanLabel: string }) {
  const [printTagihan, setPrintTagihan] = useState<TagihanRow | null>(null)

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #nota-tagihan, #nota-tagihan * { visibility: visible !important; }
          #nota-tagihan {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: 100% !important; padding: 24px !important; background: white !important;
          }
        }
      `}</style>

      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Tagihan bulan {bulanLabel}</h2>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Kamar', 'Penyewa', 'Nominal', 'Jatuh Tempo', 'Status', 'Metode', ''].map(h => (
                  <th key={h} className="text-left py-2 text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tagihan.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{t.sewa.kamar.nomor}</td>
                  <td className="py-2.5 text-gray-600">{t.sewa.penyewa.nama}</td>
                  <td className="py-2.5 text-gray-700 font-medium">{formatRupiah(t.nominal)}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'short' })}</td>
                  <td className="py-2.5">
                    <span className={`badge ${statusTagihanColor(t.status)}`}>{statusTagihanLabel(t.status)}</span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">{t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</td>
                  <td className="py-2.5">
                    <button
                      onClick={() => setPrintTagihan(t)}
                      className="text-gray-400 hover:text-teal-600 transition-colors"
                      title="Cetak nota"
                    >
                      <Printer size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {tagihan.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400 text-xs">Tidak ada tagihan bulan ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {tagihan.map(t => (
            <div key={t.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="font-medium text-gray-800 text-sm">Kamar {t.sewa.kamar.nomor}</span>
                  <span className="text-gray-600 text-sm ml-2">{t.sewa.penyewa.nama}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPrintTagihan(t)} className="text-gray-400 hover:text-teal-600">
                    <Printer size={14} />
                  </button>
                  <span className={`badge text-[10px] shrink-0 ${statusTagihanColor(t.status)}`}>{statusTagihanLabel(t.status)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatRupiah(t.nominal)} · {formatTanggal(t.jatuhTempo, { day: 'numeric', month: 'short' })}</span>
                <span>{t.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</span>
              </div>
            </div>
          ))}
          {tagihan.length === 0 && (
            <p className="text-center text-gray-400 text-xs py-4">Tidak ada tagihan bulan ini.</p>
          )}
        </div>
      </div>

      {/* Modal Nota */}
      {printTagihan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div id="nota-tagihan" className="p-6 font-mono text-sm">
              <div className="text-center mb-4">
                <div className="text-lg font-bold flex items-center justify-center gap-2">
                  <i className="bi bi-house-door-fill text-teal-600" /> ZRooms
                </div>
                <div className="text-xs text-gray-500 mt-1">Sistem Manajemen Kos & Apartemen</div>
                <div className="border-t border-dashed border-gray-300 my-3" />
              </div>

              <div className="text-center text-xs font-medium text-gray-600 mb-3">NOTA TAGIHAN SEWA</div>

              <div className="space-y-1 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Kamar</span>
                  <span className="font-semibold">{printTagihan.sewa.kamar.nomor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Penyewa</span>
                  <span className="font-semibold">{printTagihan.sewa.penyewa.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jatuh Tempo</span>
                  <span>{formatTanggal(printTagihan.jatuhTempo, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Metode</span>
                  <span>{printTagihan.pembayaran[0]?.metodeBayar?.replace('_', ' ') ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={printTagihan.status === 'LUNAS' ? 'text-teal-600 font-semibold' : 'text-amber-500 font-semibold'}>
                    {statusTagihanLabel(printTagihan.status)}
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />

              <div className="flex justify-between font-bold text-sm mb-3">
                <span>TOTAL</span>
                <span>{formatRupiah(printTagihan.nominal)}</span>
              </div>

              {printTagihan.status === 'LUNAS' && (
                <div className="border border-teal-400 rounded text-center text-teal-600 font-bold text-xs py-1 mb-3 tracking-widest">
                  ✓ LUNAS
                </div>
              )}

              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="text-center text-xs text-gray-500">
                <p>Terima kasih atas kepercayaan Anda.</p>
                <p>Simpan nota ini sebagai bukti pembayaran.</p>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Printer size={14} /> Cetak
              </button>
              <button
                onClick={() => setPrintTagihan(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
