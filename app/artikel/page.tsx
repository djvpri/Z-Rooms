import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Artikel & Tips Properti | ZXRoom',
  description: 'Tips mengelola kos, kontrakan, hotel, dan properti sewa dari ZXRoom.',
}

export const dynamic = 'force-dynamic'

const ZADV_API = process.env.ZADV_API_URL || 'http://af7witcncxxt5fvjn0yg2bdz.103.93.129.94.sslip.io'

type ArtikelCard = {
  judul: string
  slug: string
  deskripsi: string | null
  tags: string[] | null
  publishedAt: string
}

async function getArtikel(): Promise<ArtikelCard[]> {
  try {
    const res = await fetch(`${ZADV_API}/api/artikel/publik?appId=8`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? data.artikel ?? []) as ArtikelCard[]
  } catch {
    return []
  }
}

export default async function ArtikelPage() {
  const artikel = await getArtikel()

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">Z</span>
            </div>
            <span className="font-bold text-gray-900">ZXRoom</span>
          </Link>
          <Link href="/" className="text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors">
            ← Kembali
          </Link>
        </div>
      </nav>

      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">Artikel &amp; Tips Properti</h1>
        <p className="text-gray-500 text-base sm:text-lg">
          Tips praktis mengelola kos, kontrakan, hotel, dan properti sewa.
        </p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        {artikel.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Belum ada artikel.</p>
            <p className="text-sm mt-1">Artikel baru terbit otomatis setiap hari.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {artikel.map((a) => (
              <Link
                key={a.slug}
                href={`/artikel/${a.slug}`}
                className="group bg-white rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all p-5 sm:p-6 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                  {a.publishedAt
                    ? new Date(a.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                    : ''}
                  {(a.tags && a.tags.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.tags.slice(0, 3).map((t: string) => (
                        <span key={t} className="bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <h2 className="font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors">{a.judul}</h2>
                {a.deskripsi && (
                  <p className="text-sm text-gray-500 line-clamp-3">{a.deskripsi}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center text-xs text-gray-400">
          © 2026 ZXRoom. Sistem Manajemen Properti Sewa Modern.
        </div>
      </footer>
    </div>
  )
}
