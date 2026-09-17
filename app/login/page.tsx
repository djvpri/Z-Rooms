'use client'
// app/login/page.tsx
//
// Halaman masuk ZXRoom = pintu ke Z One. Form email/password lokal sudah
// dihapus: satu-satunya cara masuk sekarang lewat SSO hub (/sso), yang
// memverifikasi akun di Z One lalu menukar token jadi sesi di sini.
//
// Middleware mengarahkan semua halaman terkunci ke sini saat belum login, jadi
// halaman ini harus tetap ada walau isinya cuma pengalih.
import { useEffect } from 'react'

// Hub SSO ekosistem Z. Bisa ditimpa lewat env kalau perlu diuji di tempat lain.
const ZONE = process.env.NEXT_PUBLIC_ZONE_URL || 'https://zone.zomet.my.id'

export default function LoginPage() {
  useEffect(() => {
    // callbackUrl = /sso: hub akan mengembalikan token SSO ke sana, dan /sso
    // yang menukarnya jadi sesi. origin dihitung dari browser supaya
    // localhost/nama domain lain tetap benar tanpa konfigurasi.
    const kembali = encodeURIComponent(`${window.location.origin}/sso`)
    window.location.replace(`${ZONE}/login?callbackUrl=${kembali}`)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Mengarahkan ke Z One...</p>
        <a
          href={ZONE}
          className="text-teal-600 text-xs underline mt-4 inline-block"
        >
          Tidak teralih otomatis? Buka Z One
        </a>
      </div>
    </div>
  )
}
