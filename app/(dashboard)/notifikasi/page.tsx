// app/(dashboard)/notifikasi/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatTanggal } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

const tipeConfig: Record<string, { emoji: string; color: string }> = {
  TAGIHAN_TERLAMBAT:   { emoji: '🔴', color: 'border-l-coral-400 bg-coral-50' },
  TAGIHAN_JATUH_TEMPO: { emoji: '🟡', color: 'border-l-amber-400 bg-amber-50' },
  PEMBAYARAN_DITERIMA: { emoji: '🟢', color: 'border-l-teal-400 bg-teal-50' },
  CHECKIN_BARU:        { emoji: '🏠', color: 'border-l-teal-400 bg-teal-50' },
  CHECKOUT_BESOK:      { emoji: '📦', color: 'border-l-purple-400 bg-purple-50' },
  BOOKING_BARU:        { emoji: '📋', color: 'border-l-purple-400 bg-purple-50' },
  PEMELIHARAAN:        { emoji: '🔧', color: 'border-l-amber-400 bg-amber-50' },
  INFO:                { emoji: 'ℹ️', color: 'border-l-gray-300 bg-gray-50' },
}

async function tandaiSemuaDibaca(propertiId: string) {
  'use server'
  await prisma.notifikasi.updateMany({
    where: { propertiId, dibaca: false },
    data: { dibaca: true },
  })
  revalidatePath('/notifikasi')
}

export default async function NotifikasiPage() {
  const session = await auth()
  const properti = await prisma.properti.findFirst({ where: { ownerId: session!.user!.id } })
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const notifikasi = await prisma.notifikasi.findMany({
    where: { propertiId: properti.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const belumDibaca = notifikasi.filter(n => !n.dibaca).length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Notifikasi</h1>
          <p className="text-sm text-gray-400">
            {belumDibaca > 0 ? `${belumDibaca} belum dibaca` : 'Semua sudah dibaca'}
          </p>
        </div>
        {belumDibaca > 0 && (
          <form action={tandaiSemuaDibaca.bind(null, properti.id)}>
            <button type="submit" className="btn btn-ghost text-xs">
              Tandai semua dibaca
            </button>
          </form>
        )}
      </div>

      <div className="space-y-2">
        {notifikasi.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">🔔</p>
            <p className="text-sm">Belum ada notifikasi.</p>
          </div>
        )}

        {notifikasi.map(n => {
          const cfg = tipeConfig[n.tipe] ?? tipeConfig.INFO
          return (
            <div
              key={n.id}
              className={`rounded-lg border-l-4 p-4 transition-opacity ${cfg.color} ${n.dibaca ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0">{cfg.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${n.dibaca ? 'text-gray-600' : 'text-gray-900'}`}>
                      {n.judul}
                      {!n.dibaca && (
                        <span className="ml-2 inline-block w-1.5 h-1.5 bg-teal-500 rounded-full align-middle" />
                      )}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatTanggal(n.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{n.pesan}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
