// app/(dashboard)/dashboard/loading.tsx
// Skeleton dashboard: tampil instan selama SSR 11-query berjalan (streaming).
// Bentuknya nurut dengan halaman aslinya — 4 kartu statistik, 3 kolom, tabel
// aktivitas — supaya pergantian ke konten asli tidak menggeser layout.
export default function Loading() {
  return (
    <div className="p-4 md:p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
            <div className="h-40 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded mb-2" />
        ))}
      </div>
    </div>
  )
}
