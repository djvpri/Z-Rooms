// app/(dashboard)/layout.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { daftarProperti, propertiAktif } from '@/lib/properti'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = session.user.id as string
  const [properti, aktif] = await Promise.all([
    daftarProperti(userId),
    propertiAktif(userId),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        user={session.user}
        properti={properti.map(p => ({ id: p.id, nama: p.nama }))}
        propertiAktifId={aktif?.id}
      />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
