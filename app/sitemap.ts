import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.zxroom.zomet.my.id'
const ZADV_API = process.env.ZADV_API_URL || 'https://zpromo.zomet.my.id'

type ArtikelMin = { slug: string; publishedAt: string }

async function getArtikelSlugs(): Promise<ArtikelMin[]> {
  try {
    const res = await fetch(`${ZADV_API}/api/artikel/publik?appId=8`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.items ?? data.artikel ?? []) as ArtikelMin[]
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const artikel = await getArtikelSlugs()
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/artikel`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ]

  const artikelRoutes: MetadataRoute.Sitemap = artikel.map((a) => ({
    url: `${SITE_URL}/artikel/${a.slug}`,
    lastModified: a.publishedAt ? new Date(a.publishedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...artikelRoutes]
}
