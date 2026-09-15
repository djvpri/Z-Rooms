// app/(dashboard)/pengaturan/page.tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import { jamKeMenit } from '@/lib/checkout'
import FormPengaturan from './FormPengaturan'

export const dynamic = 'force-dynamic'

export default async function PengaturanPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const aturan = { jamCheckout: properti.jamCheckout, toleransiCheckout: properti.toleransiCheckout }
  const menit = jamKeMenit(aturan.jamCheckout)
  const jj = String(Math.floor(menit / 60)).padStart(2, '0')
  const mm = String(menit % 60).padStart(2, '0')

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
        <p className="text-sm text-gray-400">{properti.nama}</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100">
        <Link
          href="/pengaturan"
          className="px-3 py-2 text-sm font-medium text-teal-700 border-b-2 border-teal-600 -mb-px"
        >
          Umum
        </Link>
        <Link
          href="/pengaturan/properti"
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 border-b-2 border-transparent -mb-px"
        >
          Properti
        </Link>
      </div>

      <FormPengaturan jam={`${jj}:${mm}`} toleransi={aturan.toleransiCheckout} />
    </div>
  )
}
