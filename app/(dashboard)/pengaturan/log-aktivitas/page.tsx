// app/(dashboard)/pengaturan/log-aktivitas/page.tsx
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import { prisma } from '@/lib/prisma'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'

export const dynamic = 'force-dynamic'

const LABEL_AKSI: Record<string, string> = {
  BATAL_KARAOKE: 'Batalkan karaoke',
  BATAL_BOOKING: 'Batalkan booking',
}

export default async function LogAktivitasPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const log = await prisma.logAktivitas.findMany({
    where: { propertiId: properti.id },
    orderBy: { wktPada: 'desc' },
    take: 50,
  })

  const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Log Aktivitas</h1>
        <p className="text-sm text-gray-400">{properti.nama}</p>
      </div>

      <TabPengaturan aktif="/pengaturan/log-aktivitas" />

      {log.length === 0 ? (
        <div className="card p-6 text-sm text-gray-400 text-center">
          Belum ada aktivitas tercatat. Pembatalan karaoke & booking akan muncul di sini.
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {log.map((l) => (
            <div key={l.id} className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">
                  {LABEL_AKSI[l.aksi] ?? l.aksi}
                  {l.detail && <span className="ml-2 text-xs text-gray-400">{l.detail}</span>}
                </p>
                <p className="text-[10px] text-gray-400 shrink-0">{fmt.format(l.wktPada)} WIB</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="text-gray-400">Alasan:</span> {l.alasan}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {l.userEmail ? `oleh ${l.userEmail}` : 'oleh sistem'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
