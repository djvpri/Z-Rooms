// middleware.ts
import { auth } from './lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  
  // Allow public routes
  if (
    pathname === '/' || 
    pathname.startsWith('/api/auth') || 
    pathname === '/api/health' ||
    pathname === '/api/admin/cross-app' ||
    pathname.startsWith('/api/demo') ||
    pathname === '/auth/qr-approve' ||
    pathname === '/sso'
  ) {
    return NextResponse.next()
  }
  
  const isLoggedIn = !!req.auth?.user
  const isAuthPage = pathname.startsWith('/login')
  
  // Redirect to login if not authenticated
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  
  // Redirect to dashboard if already logged in and trying to access login
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  
  const res = NextResponse.next()
  // Halaman di bawah /dashboard menampilkan data real-time (booking lewat
  // check-in, sesi karaoke). WebView APK kadang menyajikan dokumen basi
  // sehingga kartu selesai muncul lagi. Header eksplisit no-store.
  if (pathname.startsWith('/dashboard')) {
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  }
  return res
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
