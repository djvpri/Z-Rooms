// components/kamar/TombolJual.tsx
//
// Tombol "Jual" di kartu kamar terisi: lompat ke kasir Penjualan Barang
// dengan penyewa sudah terpilih. Tanpa ini kasir harus pilih ulang kamar
// secara manual — mudah salah, apalagi kalau nomor kamar mirip.
//
// Hanya navigasi, bukan jalur uang: keranjang & simpan tetap di KasirJual.
import Link from 'next/link'
import { CartPlus } from 'react-bootstrap-icons'

export default function TombolJual({ sewaId }: { sewaId: string }) {
  return (
    <Link
      href={`/penjualan-barang?sewa=${sewaId}`}
      className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-100 transition-colors"
    >
      <CartPlus size={12} aria-hidden="true" />
      Jual
    </Link>
  )
}
