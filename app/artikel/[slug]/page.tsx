import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const ZADV_API = process.env.ZADV_API_URL || 'https://zpromo.zomet.my.id'
const SITE_URL = 'https://www.zxroom.zomet.my.id'

type Artikel = {
  judul: string
  slug: string
  deskripsi: string | null
  tags: string[] | null
  konten: string
  publishedAt: string
  gambarPath: string | null
}

async function getArtikel(slug: string): Promise<Artikel | null> {
  try {
    const res = await fetch(`${ZADV_API}/api/artikel/publik/${slug}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.artikel ?? data.item ?? data) as Artikel | null
  } catch {
    return null
  }
}

type ArtikelMin = Pick<Artikel, 'judul' | 'slug' | 'deskripsi' | 'publishedAt'>

async function getTerkait(excludeSlug: string, limit = 3): Promise<ArtikelMin[]> {
  try {
    const res = await fetch(`${ZADV_API}/api/artikel/publik?appId=8`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const all = (data.items ?? data.artikel ?? []) as ArtikelMin[]
    return all.filter((x) => x.slug !== excludeSlug).slice(0, limit)
  } catch {
    return []
  }
}

function imgUrl(p: string | null | undefined): string | null {
  if (!p) return null
  if (/^https?:\/\//.test(p)) return p
  return `${ZADV_API}${p}`
}

// Renderer markdown — konten dari cron sendiri, dipercaya.
function renderMarkdown(md: string): string {
  md = md
    .replace(/<\s*\/?\s*b\s*>/gi, '**')
    .replace(/<\s*\/?\s*strong\s*>/gi, '**')
    .replace(/<\s*\/?\s*em\s*>/gi, '*')
    .replace(/<\s*\/?\s*i\s*>/gi, '*')

  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let listOpen = false

  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false } }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { closeList(); continue }

    const li = line.match(/^[-*]\s+(.*)/)
    if (li) {
      if (!listOpen) { out.push('<ul>'); listOpen = true }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }

    closeList()

    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) {
      const lvl = h[1].length + 1
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
      continue
    }
    if (line === '---' || /^\*{3,}\s*$/.test(line)) { out.push('<hr/>'); continue }

    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}

function inline(s: string): string {
  const esc = (t: string) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  let t = s
  t = t.replace(/`([^`]+)`/g, (_m: string, g: string) => `<code>${esc(g)}</code>`)
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m: string, g: string) => `<strong>${esc(g)}</strong>`)
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, (_m: string, pre: string, g: string) => `${pre}<em>${esc(g)}</em>`)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, txt: string, url: string) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>`)
  return t
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const a = await getArtikel(slug)
  const title = a?.judul ?? 'Artikel'
  const description = a?.deskripsi ?? 'Tips mengelola kos, kontrakan, hotel, dan properti sewa dari ZXRoom.'
  const img = a?.gambarPath ? imgUrl(a.gambarPath) : null
  const ogImages = img ? [{ url: img, width: 1200, height: 630, alt: title }] : undefined

  return {
    title,
    description,
    alternates: { canonical: `/artikel/${slug}` },
    openGraph: {
      type: 'article',
      locale: 'id_ID',
      url: `${SITE_URL}/artikel/${slug}`,
      siteName: 'ZXRoom',
      title,
      description,
      images: ogImages,
      ...(a?.publishedAt ? { publishedTime: a.publishedAt } : {}),
      ...(a?.tags?.length ? { tags: a.tags } : {}),
    },
    twitter: {
      card: img ? 'summary_large_image' : 'summary',
      title,
      description,
      images: img ? [img] : undefined,
    },
  }
}

export default async function ArtikelDetail({ params }: Props) {
  const { slug } = await params
  const a = await getArtikel(slug)
  if (!a) notFound()
  const terkait = await getTerkait(slug)

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">Z</span>
            </div>
            <span className="font-bold text-gray-900">ZXRoom</span>
          </Link>
          <Link href="/artikel" className="text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors">
            ← Artikel
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20">
        {a.gambarPath && imgUrl(a.gambarPath) && (
          <div className="mb-8 rounded-xl overflow-hidden border border-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl(a.gambarPath)!} alt={a.judul} className="w-full aspect-[16/9] object-cover" />
          </div>
        )}
        <div className="text-xs text-gray-400 mb-4">
          {a.publishedAt
            ? new Date(a.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : ''}
          {(a.tags && a.tags.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.tags.map((t: string) => (
                <span key={t} className="inline-block bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-6">{a.judul}</h1>
        <div
          className="artikel-body prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(a.konten) }}
        />
      </article>

      {terkait.length > 0 && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Artikel lainnya</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {terkait.map((t) => (
              <Link
                key={t.slug}
                href={`/artikel/${t.slug}`}
                className="group block bg-white rounded-xl border border-gray-100 hover:border-teal-200 hover:shadow-sm transition-all p-4"
              >
                <div className="text-xs text-gray-400 mb-2">
                  {t.publishedAt
                    ? new Date(t.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                    : ''}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-teal-600 transition-colors line-clamp-3">
                  {t.judul}
                </h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center text-xs text-gray-400">
          <Link href="/artikel" className="hover:text-teal-600 transition-colors">← Lihat artikel lainnya</Link>
        </div>
      </footer>
    </div>
  )
}
