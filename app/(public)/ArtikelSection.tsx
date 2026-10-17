import Link from 'next/link'

const ZADV_API = process.env.ZADV_API_URL || 'http://af7witcncxxt5fvjn0yg2bdz.103.93.129.94.sslip.io'

type ArtikelCard = {
  judul: string
  slug: string
  deskripsi: string | null
  publishedAt: string
  gambarPath: string | null
}

async function getArtikel(): Promise<ArtikelCard[]> {
  try {
    const res = await fetch(`${ZADV_API}/api/artikel/publik?appId=8`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? data.artikel ?? []).slice(0, 4) as ArtikelCard[]
  } catch {
    return []
  }
}

function imgUrl(p: string | null | undefined): string | null {
  if (!p) return null
  if (/^https?:\/\//.test(p)) return p
  return `${ZADV_API}${p}`
}

export default async function ArtikelSection() {
  const artikel = await getArtikel()
  if (artikel.length === 0) return null

  return (
    <section className="bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Tips Bisnis Terbaru</h2>
            <p className="text-sm sm:text-base text-gray-500">Artikel baru tiap hari — bantu kelola properti Anda lebih baik</p>
          </div>
          <Link href="/artikel" className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors whitespace-nowrap">
            Semua artikel →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {artikel.map((a) => {
            const img = imgUrl(a.gambarPath)
            return (
            <Link
              key={a.slug}
              href={`/artikel/${a.slug}`}
              className="group bg-white rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all flex flex-col overflow-hidden"
            >
              {img && (
                <div className="aspect-[16/9] bg-gray-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={a.judul} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-2.5 text-xs text-gray-400">
                {a.publishedAt
                  ? new Date(a.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''}
              </div>
              <h3 className="font-bold text-gray-900 leading-snug mb-2 group-hover:text-teal-600 transition-colors line-clamp-2">{a.judul}</h3>
              {a.deskripsi && (
                <p className="text-sm text-gray-500 line-clamp-2">{a.deskripsi}</p>
              )}
              </div>
            </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
