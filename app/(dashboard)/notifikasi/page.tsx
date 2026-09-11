// app/(dashboard)/notifikasi/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatTanggal } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import {
  ExclamationOctagon, ClockHistory, CashCoin, BoxArrowInRight,
  BoxArrowRight, JournalText, WrenchAdjustable, InfoCircle, Bell,
  type Icon as BiIcon,
} from 'react-bootstrap-icons'

export const dynamic = 'force-dynamic'

// Ikon per tipe (bukan emoji): warna saja tak cukup — ikon + label teks tetap
// terbaca tanpa warna (ux: "Color Only" severity High).
const tipeConfig: Record<string, { Icon: BiIcon; color: string; teks: string }> = {
  TAGIHAN_TERLAMBAT:   { Icon: ExclamationOctagon, color: 'border-l-coral-400 bg-coral-50 text-coral-600',   teks: 'Terlambat' },
  TAGIHAN_JATUH_TEMPO: { Icon: ClockHistory,       color: 'border-l-amber-400 bg-amber-50 text-amber-400',   teks: 'Jatuh tempo' },
  PEMBAYARAN_DITERIMA: { Icon: CashCoin,           color: 'border-l-teal-400 bg-teal-50 text-teal-600',      teks: 'Pembayaran' },
  CHECKIN_BARU:        { Icon: BoxArrowInRight,    color: 'border-l-teal-400 bg-teal-50 text-teal-600',      teks: 'Check-in' },
  CHECKOUT_BESOK:      { Icon: BoxArrowRight,      color: 'border-l-purple-400 bg-purple-50 text-purple-600',teks: 'Check-out' },
  BOOKING_BARU:        { Icon: JournalText,        color: 'border-l-purple-400 bg-purple-50 text-purple-600',teks: 'Booking' },
  PEMELIHARAAN:        { Icon: WrenchAdjustable,   color: 'border-l-amber-400 bg-amber-50 text-amber-400',   teks: 'Pemeliharaan' },
  INFO:                { Icon: InfoCircle,         color: 'border-l-gray-300 bg-gray-50 text-gray-500',      teks: 'Info' },
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
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
            <Bell className="text-3xl mx-auto mb-2 opacity-40" />
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
                <cfg.Icon className="text-lg shrink-0 mt-0.5" aria-hidden="true" />
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
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium mt-1 text-gray-500">
                    <cfg.Icon size={11} aria-hidden="true" /> {cfg.teks}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
