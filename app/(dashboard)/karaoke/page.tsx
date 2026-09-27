// app/(dashboard)/karaoke/page.tsx
//
// Server wrapper —/tak bisa menerima props custom, jadi halaman klien
// dipindah ke KaraokePanel.tsx dan `butuhPin` diteruskan dari DB.
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import KaraokePanel from './KaraokePanel'

export const dynamic = 'force-dynamic'

export default async function KaraokePage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  return <KaraokePanel butuhPin={!!properti?.pinBatal} />
}
