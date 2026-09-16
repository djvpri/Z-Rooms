// app/(dashboard)/pengaturan/lisensi/page.tsx
//
// Kelola lisensi properti: ubah plan dan tanggal berakhir. Server component —
// baca DB langsung lewat propertiAktif(), jadi tak ada API khusus untuk
// membaca. Hanya bagian form yang client component (perlu state).
import { redirect } from 'next/navigation'
import { ShieldCheck, Calendar3, Clock, ExclamationTriangle } from 'react-bootstrap-icons'
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import FormLisensi from '@/components/lisensi/FormLisensi'
import { labelPlan, statusLisensi, sisaHari, kalimatStatus } from '@/lib/lisensi'

export const dynamic = 'force-dynamic'

export default async function PengaturanLisensiPage() {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) redirect('/login')

  const properti = await propertiAktif(userId)
  if (!properti) redirect('/pengaturan/properti')

  const bolehUbah = (session?.user as { role?: string })?.role === 'ADMIN'
  const status = statusLisensi(properti.planExpires)
  const sisa = sisaHari(properti.planExpires)

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <TabPengaturan aktif="/pengaturan/lisensi" />

      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck className="h-5 w-5 text-teal-600" />
        <h1 className="text-xl font-bold text-gray-900">Lisensi &amp; Langganan</h1>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Properti <span className="font-semibold text-gray-700">{properti.nama}</span>
        {' — '}lisensi melekat pada properti ini, bukan pada akun.
      </p>

      {/* Ringkasan status di atas form: yang mengubah langsung melihat
          akibatnya, tanpa harus pindah ke halaman /lisensi. */}
      <div className={`rounded-2xl border p-5 mb-5 ${
        status === 'habis' ? 'bg-red-50 border-red-200'
        : status === 'segera-habis' ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-gray-100'
      }`}>
        <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
          <ShieldCheck className="h-4 w-4 text-teal-600" />
          Plan <span className="font-semibold">{labelPlan(properti.plan)}</span>
        </div>
        {properti.planExpires ? (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar3 className="h-4 w-4 text-gray-400" />
              Berlaku hingga{' '}
              <span className="font-semibold">
                {properti.planExpires.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className={`flex items-center gap-2 text-sm mt-1 ${
              status === 'habis' ? 'text-red-600 font-medium'
              : status === 'segera-habis' ? 'text-amber-600 font-medium'
              : 'text-green-600 font-medium'
            }`}>
              <Clock className="h-4 w-4" />
              {kalimatStatus(status, sisa)}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ExclamationTriangle className="h-4 w-4 text-amber-500" />
            {kalimatStatus('belum-diatur', null)}
          </div>
        )}
      </div>

      <FormLisensi
        planAwal={properti.plan}
        expiresAwal={properti.planExpires ? properti.planExpires.toISOString() : null}
        bolehUbah={bolehUbah}
      />
    </div>
  )
}
