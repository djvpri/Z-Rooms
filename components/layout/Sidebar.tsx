'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, inisial } from '@/lib/utils'
import {
  X, List as Menu, BoxArrowRight as LogOut,
  Speedometer2, DoorOpen, People, CalendarPlus, CashCoin, Bell,
} from 'react-bootstrap-icons'
import type { ComponentType } from 'react'

const navItems: { href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { href: '/dashboard',    label: 'Dashboard',   Icon: Speedometer2 },
  { href: '/kamar',        label: 'Kamar',       Icon: DoorOpen },
  { href: '/penyewa',      label: 'Penyewa',     Icon: People },
  { href: '/booking',      label: 'Booking Baru',Icon: CalendarPlus },
  { href: '/keuangan',     label: 'Keuangan',    Icon: CashCoin },
  { href: '/notifikasi',   label: 'Notifikasi',  Icon: Bell },
]

export default function Sidebar({ user }: { user?: { name?: string | null; email?: string | null } }) {
  const path = usePathname()
  const router = useRouter()

  const sidebar = (
    <aside className="flex flex-col bg-white h-full w-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-teal-600 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">Z-Rooms</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors',
              path.startsWith(item.href)
                ? 'bg-teal-50 text-teal-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <item.Icon className="text-base shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium">
            {inisial(user?.name ?? 'U')}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left text-xs text-gray-400 hover:text-coral-600 px-1 py-1 transition-colors"
        >
          Keluar →
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-52 shrink-0 border-r border-gray-100 h-full">
        {sidebar}
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 flex items-center justify-around px-1 pb-safe">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center py-1.5 px-2 rounded-lg transition-colors min-w-0',
              path.startsWith(item.href)
                ? 'text-teal-600'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            <item.Icon className="text-lg" />
            <span className="text-[10px] mt-0.5 truncate max-w-full">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Spacer for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </>
  )
}
