// app/(dashboard)/pengaturan/page.tsx
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import { jamKeMenit } from '@/lib/checkout'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import FormPengaturan from './FormPengaturan'
import KirimLogError from '@/components/pengaturan/KirimLogError'

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

      <TabPengaturan aktif="/pengaturan" />

      <FormPengaturan jam={`${jj}:${mm}`} toleransi={aturan.toleransiCheckout} />

      <div className="mt-4 space-y-4">
        {/* Versi = hash yang di-build, sama dengan yang dilaporkan /api/health.
            Tanpa itu, log dari kasir tak bisa dipastikan berasal dari build mana. */}
        <KirimLogError
          versi={process.env.ENV_COMMIT_SHA ?? process.env.SOURCE_COMMIT ?? undefined}
        />
      </div>
    </div>
  )
}
