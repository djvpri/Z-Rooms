// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import 'bootstrap-icons/font/bootstrap-icons.css'

export const metadata: Metadata = {
  title: 'Z-Rooms — Manajemen Properti Sewa',
  description: 'Kelola kos, kontrakan, dan hotel Anda dengan mudah',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
