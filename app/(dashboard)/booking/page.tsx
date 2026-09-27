// app/(dashboard)/booking/page.tsx
//
// Server wrapper — Next tak mengizinkan props custom di page, jadi panel klien
// dipindah ke BookingPanel.tsx dan `butuhPin` diteruskan dari DB.
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import BookingPanel from './BookingPanel'

export const dynamic = 'force-dynamic'

export default async function BookingPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  return <BookingPanel butuhPin={!!properti?.pinBatal} />
}
