// components/pengaturan/TabPengaturan.tsx
// Nav sub-tab halaman Pengaturan. Kembar di tiap halaman sebelumnya — kalau
// ditambah tab baru, tiga tempat harus diubah dan satu pasti terlupa.
import Link from 'next/link'

const TAB = [
  { href: '/pengaturan', label: 'Umum' },
  { href: '/pengaturan/properti', label: 'Properti' },
  { href: '/pengaturan/tipe-kamar', label: 'Tipe kamar' },
  { href: '/pengaturan/fasilitas', label: 'Fasilitas' },
  { href: '/pengaturan/produk', label: 'Produk' },
  { href: '/pengaturan/karaoke', label: 'Karaoke' },
  { href: '/lisensi', label: 'Lisensi' },
] as const

/** Dipakai halaman yang bukan di bawah /pengaturan tapi punya tab yang sama. */
export const TAB_PENGATURAN = TAB

export default function TabPengaturan({ aktif }: { aktif: (typeof TAB)[number]['href'] }) {
  return (
    <div className="flex gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
      {TAB.map((t) => {
        const ini = t.href === aktif
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${
              ini
                ? 'font-medium text-teal-700 border-teal-600'
                : 'text-gray-500 hover:text-gray-900 border-transparent'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
