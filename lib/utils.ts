// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(nominal: number | bigint | { toNumber(): number }) {
  const num = typeof nominal === 'object' && 'toNumber' in nominal
    ? nominal.toNumber()
    : Number(nominal)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(num)
}

export function formatTanggal(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...opts,
  }).format(new Date(date))
}

export function inisial(nama: string) {
  return nama.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function statusKamarLabel(status: string) {
  const map: Record<string, string> = {
    TERSEDIA: 'Tersedia', TERISI: 'Terisi',
    PEMELIHARAAN: 'Pemeliharaan', DIPESAN: 'Dipesan',
  }
  return map[status] ?? status
}

export function statusKamarColor(status: string) {
  const map: Record<string, string> = {
    TERSEDIA: 'bg-teal-50 text-teal-800 border-teal-100',
    TERISI: 'bg-coral-50 text-coral-600 border-coral-100',
    PEMELIHARAAN: 'bg-amber-50 text-amber-400 border-amber-100',
    DIPESAN: 'bg-purple-50 text-purple-600 border-purple-100',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function statusTagihanColor(status: string) {
  const map: Record<string, string> = {
    LUNAS: 'bg-teal-50 text-teal-800',
    BELUM_BAYAR: 'bg-gray-100 text-gray-600',
    TERLAMBAT: 'bg-coral-50 text-coral-600',
    SEBAGIAN: 'bg-amber-50 text-amber-400',
    DIBATALKAN: 'bg-gray-100 text-gray-400',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function statusTagihanLabel(status: string) {
  const map: Record<string, string> = {
    LUNAS: 'Lunas', BELUM_BAYAR: 'Belum Bayar',
    TERLAMBAT: 'Terlambat', SEBAGIAN: 'Sebagian', DIBATALKAN: 'Dibatalkan',
  }
  return map[status] ?? status
}

export function periodeSewaSingkat(p: string) {
  const map: Record<string, string> = {
    HARIAN: '/hari', MINGGUAN: '/minggu', BULANAN: '/bulan', TAHUNAN: '/tahun',
  }
  return map[p] ?? p
}
