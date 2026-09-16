// app/(dashboard)/lisensi/page.tsx
//
// Lisensi & langganan properti yang sedang dibuka.
//
// Server component: baca langsung dari DB, tanpa fetch ke API sendiri. Halaman
// ZGym sejenisnya client component karena datanya datang dari token next-auth;
// di sini datanya di DB dan halamannya tak perlu interaktif, jadi satu
// perjalanan ke DB lebih ringkas daripada render lalu fetch.
//
// Kuota sengaja TIDAK ditampilkan. ZGym menampilkan maxMembers/maxInstructors/
// maxClasses karena ketiganya ditegakkan; ZXRoom tak punya padanannya, dan
// menampilkan batas yang tak berlaku akan menyesatkan.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Calendar3, Clock, ExclamationTriangle, ArrowRepeat, Gear } from 'react-bootstrap-icons'
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import {
  labelPlan, statusLisensi, sisaHari, kalimatStatus, hargaPlan,
} from '@/lib/lisensi'
import { formatRupiah } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const WARNA_STATUS = {
  habis: 'text-red-600 font-medium',
  'segera-habis': 'text-amber-600 font-medium',
  aktif: 'text-green-600 font-medium',
  'belum-diatur': 'text-gray-500',
} as const

const WARNA_KARTU = {
  habis: 'bg-red-50 border-red-200',
  'segera-habis': 'bg-amber-50 border-amber-200',
  aktif: 'bg-white border-gray-100',
  'belum-diatur': 'bg-white border-gray-100',
} as const

export default async function LisensiPage() {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) redirect('/login')

  const properti = await propertiAktif(userId)
  if (!properti) redirect('/pengaturan/properti')

  const status = statusLisensi(properti.planExpires)
  const sisa = sisaHari(properti.planExpires)

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck className="h-5 w-5 text-teal-600" />
        <h1 className="text-xl font-bold text-gray-900">Lisensi &amp; Langganan</h1>
      </div>

      {/* Identitas properti yang lisensinya ditampilkan. Penting: pemilik bisa
          punya beberapa properti, dan lisensi melekat pada satu properti —
          tanpa baris ini user bisa salah kira ini lisensi seluruh akun. */}
      <p className="text-sm text-gray-500 mb-4">
        Untuk properti <span className="font-semibold text-gray-700">{properti.nama}</span>
      </p>

      <div className={`rounded-2xl border p-5 mb-5 ${WARNA_KARTU[status]}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            status === 'segera-habis' || status === 'habis' ? 'bg-amber-100 text-amber-600' : 'bg-teal-50 text-teal-600'
          }`}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              properti.plan === 'free' ? 'bg-gray-100 text-gray-700'
              : properti.plan === 'business' ? 'bg-amber-100 text-amber-700'
              : 'bg-teal-100 text-teal-700'
            }`}>
              {labelPlan(properti.plan)}
            </span>
            <div className="text-xs text-gray-400 mt-1">
              {hargaPlan(properti.plan) > 0
                ? `${formatRupiah(hargaPlan(properti.plan))}/bulan`
                : 'Tanpa biaya'}
            </div>
          </div>
        </div>

        {properti.planExpires ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar3 className="h-4 w-4 text-gray-400" />
              Berlaku hingga{' '}
              <span className="font-semibold">
                {properti.planExpires.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className={`flex items-center gap-2 text-sm ${WARNA_STATUS[status]}`}>
              <Clock className="h-4 w-4" />
              {kalimatStatus(status, sisa)}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ExclamationTriangle className="h-4 w-4 text-amber-500" />
            {kalimatStatus('belum-diatur', null)}
          </div>
        )}
      </div>

      {/* Pengelolaan lisensi ada di Pengaturan, bukan di halaman ini: halaman
          ini untuk MELIHAT status, dan menaruh form ubah di sini membuat
          pemilik bisa mengubah masa berlakunya sendiri tanpa sadar. */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Kelola lisensi</h2>
        <p className="text-sm text-gray-500 mb-4">
          Plan dan masa berlaku diatur dari halaman Pengaturan &rarr; Lisensi.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/pengaturan/lisensi" className="btn btn-primary inline-flex items-center gap-2">
            <ArrowRepeat className="h-4 w-4" />
            Perpanjang / ubah plan
          </Link>
          <Link href="/pengaturan/properti" className="btn btn-ghost inline-flex items-center gap-2">
            <Gear className="h-4 w-4" />
            Data properti
          </Link>
        </div>
      </div>
    </div>
  )
}
