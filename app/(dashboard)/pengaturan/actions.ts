'use server'
// app/(dashboard)/pengaturan/actions.ts
//
// Server action untuk jam check-out. Dipisah dari page.tsx supaya bisa
// di-import client component (`useActionState`) tanpa menyeret seluruh
// halaman server ke bundle client.
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { revalidatePath } from 'next/cache'

export type HasilSimpan = { ok: true; pesan: string } | { ok: false; pesan: string }

export async function simpanPengaturan(
  _sebelumnya: HasilSimpan | null,
  formData: FormData,
): Promise<HasilSimpan> {
  const session = await auth()
  if (!session?.user) return { ok: false, pesan: 'Sesi habis. Masuk ulang lalu simpan lagi.' }

  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return { ok: false, pesan: 'Properti tidak ditemukan.' }

  const jam = String(formData.get('jamCheckout') ?? '').trim()
  const toleransi = Number(formData.get('toleransiCheckout') ?? 0)
  // Format 24 jam "HH:mm". Rentang dijaga di sini juga (bukan cuma di pattern
  // HTML) supaya nilai di luar 00:00-23:59 tak pernah masuk DB — jamKeMenit
  // diam-diam fallback ke 12:00 dan kasir tak akan sadar salah ketik.
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(jam)) {
    return { ok: false, pesan: 'Jam check-out harus format 24 jam, contoh 14:30.' }
  }
  if (!Number.isFinite(toleransi) || toleransi < 0 || toleransi > 720) {
    return { ok: false, pesan: 'Toleransi harus antara 0 dan 720 menit.' }
  }
  const [hj, mj] = jam.split(':')
  const jam24 = `${hj.padStart(2, '0')}:${mj}`

  await prisma.properti.update({
    where: { id: properti.id },
    data: { jamCheckout: jam24, toleransiCheckout: Math.floor(toleransi) },
  })
  revalidatePath('/pengaturan')

  return { ok: true, pesan: `Pengaturan disimpan. Check-out jam ${jam24}, toleransi ${Math.floor(toleransi)} menit.` }
}
