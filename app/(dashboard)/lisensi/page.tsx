// app/(dashboard)/lisensi/page.tsx
//
// Lisensi properti — BACA SAJA.
//
// Sumber kebenarannya hub ZOne (/manage → Kelola Apps → ZXRoom). Pemilik
// properti tidak mengubah lisensinya sendiri dari sini; kalau boleh, tanggal
// berakhir bisa diperpanjang sendiri tanpa sepengetahuan pengelola ekosistem.
//
// Karena itu halaman ini sengaja tidak punya form. Yang ditampilkan: plan,
// masa berlaku, sisa hari, dan ke mana harus menghubungi untuk memperpanjang.
//
// Server component: baca DB langsung lewat propertiAktif(), jadi tak ada
// fetch ke API sendiri.
import { redirect } from 'next/navigation'
import { ShieldCheck, Calendar3, Clock, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons'
import { auth } from '@/lib/auth'
import { propertiAktif } from '@/lib/properti'
import { labelPlan, statusLisensi, sisaHari, kalimatStatus, hargaPlan } from '@/lib/lisensi'
import { formatRupiah } from '@/lib/utils'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'

export const dynamic = 'force-dynamic'

const WARNA_TEKS = {
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
  const harga = hargaPlan(properti.plan)

  return (
    <div className="p-5 max-w-3xl mx-auto">
      {/* Tab disamakan dengan halaman Pengaturan: Lisensi memang bagian dari
          Pengaturan (nav HP tak cukup ruang untuk item ke-8). */}
      <TabPengaturan aktif="/lisensi" />

      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck className="h-5 w-5 text-teal-600" />
        <h1 className="text-xl font-bold text-gray-900">Lisensi &amp; Langganan</h1>
      </div>

      {/* Pemilik bisa punya lebih dari satu properti secara historis, dan
          lisensi melekat pada satu properti — tanpa baris ini user bisa salah
          kira ini lisensi seluruh akun. */}
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
              : properti.plan === 'enterprise' ? 'bg-amber-100 text-amber-700'
              : 'bg-teal-100 text-teal-700'
            }`}>
              {labelPlan(properti.plan)}
            </span>
            <div className="text-xs text-gray-400 mt-1">
              {harga > 0 ? `${formatRupiah(harga)}/bulan` : 'Tanpa biaya'}
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
            <div className={`flex items-center gap-2 text-sm ${WARNA_TEKS[status]}`}>
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

      {/* Asal lisensi dinyatakan terus terang. Tanpa ini, pemilik yang butuh
          perpanjangan akan mencari tombol ubah di halaman ini dan tak menemukan. */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <InfoCircle className="h-4 w-4 text-teal-600" />
          Cara memperpanjang
        </h2>
        <p className="text-sm text-gray-500">
          Hubungi pengelola untuk memperpanjang atau mengubah plan.
        </p>
      </div>
    </div>
  )
}
