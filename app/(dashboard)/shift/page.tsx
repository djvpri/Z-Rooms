// app/(dashboard)/shift/page.tsx
//
// Shift kasir: buka (modal awal) → rekap berjalan → tutup (hitung fisik).
// Server component memuat state awal, interaksi via client ShiftKlien.
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { rekapShift } from '@/lib/shift'
import ShiftKlien from './ShiftKlien'

export const dynamic = 'force-dynamic'

export default async function ShiftPage() {
  const session = await auth()
  const userId = session!.user!.id as string
  const properti = await propertiAktif(userId)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const aktif = await prisma.shift.findFirst({
    where: { propertiId: properti.id, userId, status: 'AKTIF' },
    orderBy: { mulaiPada: 'desc' },
  })
  const rekap = aktif
    ? await rekapShift(properti.id, { gte: aktif.mulaiPada, lte: new Date() })
    : null

  const riwayat = await prisma.shift.findMany({
    where: { propertiId: properti.id, status: 'TUTUP' },
    orderBy: { mulaiPada: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  })

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shift Kasir</h1>
        <p className="text-sm text-gray-500">
          Batasnya orang &amp; uang di laci, bukan tanggal. Uang tunai sistem dihitung
          otomatis dari waktu shift berjalan.
        </p>
      </div>

      <ShiftKlien
        propertiNama={properti.nama}
        kasirNama={session!.user!.name ?? 'Kasir'}
        aktifAwal={aktif ? { ...aktif, modalAwal: Number(aktif.modalAwal) } : null}
        rekapAwal={rekap}
      />

      <RiwayatShift data={riwayat} />
    </div>
  )
}

type Riwayat = Awaited<ReturnType<typeof muatRiwayat>>

function muatRiwayat(propertiId: string) {
  return prisma.shift.findMany({
    where: { propertiId, status: 'TUTUP' },
    orderBy: { mulaiPada: 'desc' },
    take: 10,
    include: { user: { select: { name: true } } },
  })
}

function RiwayatShift({ data }: { data: Riwayat }) {
  if (data.length === 0) return null
  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-3">Riwayat shift terakhir</h2>
      <div className="divide-y">
        {data.map((s) => {
          const selisih = Number(s.selisih ?? 0)
          const fmt = (d: Date) =>
            new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
          const rp = (n: number) =>
            new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
          return (
            <div key={s.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{s.user.name ?? 'Kasir'}</span>
              <span className="text-gray-400 text-xs">
                {fmt(s.mulaiPada)} → {s.selesaiPada ? fmt(s.selesaiPada) : '…'}
              </span>
              <span className="ml-auto tabular-nums">fisik {rp(Number(s.uangFisik))}</span>
              <span className={`badge ${selisih === 0 ? 'bg-green-100 text-green-700' : selisih > 0 ? 'bg-amber-100 text-amber-700' : 'bg-coral-50 text-coral-600'}`}>
                {selisih === 0 ? 'pas' : selisih > 0 ? `+${selisih.toLocaleString('id-ID')}` : selisih.toLocaleString('id-ID')}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
