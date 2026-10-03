// app/(dashboard)/kamar/loading.tsx
// Skeleton halaman kamar: tampil instan selama SSR (daftar kamar + sewa +
// tagihan per kamar) berjalan. Kerangka kartu + tabel, tanpa angka.
export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-6 w-32 bg-gray-200 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-16 bg-gray-100 rounded mb-4" />
            <div className="h-8 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded mb-2" />
        ))}
      </div>
    </div>
  )
}
