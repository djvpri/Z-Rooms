// app/(dashboard)/pengaturan/page.tsx
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { revalidatePath } from 'next/cache'
import { jamKeMenit } from '@/lib/checkout'

export const dynamic = 'force-dynamic'

async function simpanPengaturan(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user) return
  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return

  const jam = String(formData.get('jamCheckout') ?? '').trim()
  const toleransi = Number(formData.get('toleransiCheckout') ?? 0)
  // Format 24 jam "HH:mm". Rentang dijaga di sini juga (bukan cuma di pattern
  // HTML) supaya nilai di luar 00:00-23:59 tak pernah masuk DB — jamKeMenit
  // diam-diam fallback ke 12:00 dan kasir tak akan sadar salah ketik.
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(jam)) return
  if (!Number.isFinite(toleransi) || toleransi < 0 || toleransi > 720) return
  const [hj, mj] = jam.split(':')
  const jam24 = `${hj.padStart(2, '0')}:${mj}`

  await prisma.properti.update({
    where: { id: properti.id },
    data: { jamCheckout: jam24, toleransiCheckout: Math.floor(toleransi) },
  })
  revalidatePath('/pengaturan')
}

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

      <form action={simpanPengaturan} className="space-y-4">
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-1">Jam check-out</h2>
          <p className="text-xs text-gray-500 mb-3">
            Sewa harian habis pada jam ini di hari terakhir, bukan jam masuk + 24 jam.
            Jadi penyewa yang masuk jam 15:00 tetap harus check-out jam {jj}:{mm} besoknya.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="jamCheckout" className="form-label">Jam acuan habis sewa</label>
              <input
                id="jamCheckout"
                name="jamCheckout"
                type="text"
                inputMode="numeric"
                pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                maxLength={5}
                placeholder="HH:mm"
                defaultValue={`${jj}:${mm}`}
                required
                className="form-input"
                title="Format 24 jam, contoh 14:30"
              />
            </div>
            <div>
              <label htmlFor="toleransiCheckout" className="form-label">
                Toleransi (menit)
              </label>
              <input
                id="toleransiCheckout"
                name="toleransiCheckout"
                type="number"
                min={0}
                max={720}
                step={15}
                defaultValue={aturan.toleransiCheckout}
                required
                className="form-input"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Setelah jam {jj}:{mm} plus {aturan.toleransiCheckout} menit, kamar ditandai{' '}
            <span className="font-medium text-coral-600">lewat check-out</span>.
            Tanda ini hanya peringatan — kamar tidak otomatis dikosongkan, karena
            check-out mengembalikan deposit dan harus diperiksa orang.
          </p>
        </div>

        <button type="submit" className="btn btn-primary">Simpan</button>
      </form>
    </div>
  )
}
