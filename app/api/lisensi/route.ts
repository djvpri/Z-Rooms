// app/api/lisensi/route.ts
//
// Ubah plan dan masa berlaku lisensi properti.
//
// Hanya ADMIN. ZGym menaruh ini di /api/admin/tenants dengan role
// 'superadmin'; di sini perannya ADMIN karena itulah peran pengelola tertinggi
// yang ada di enum Role ZXRoom (USER/ADMIN/MANAGER).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { DAFTAR_PLAN } from '@/lib/lisensi'

// Tanggal datang sebagai "YYYY-MM-DD" dari <input type="date">, atau null untuk
// mengosongkan. Sengaja TIDAK pakai z.coerce.date(): "2026-09-16" akan dibaca
// sebagai tengah malam UTC, dan itu memang yang diinginkan di sini — tanggal
// berakhir adalah tanggal kalender, bukan titik waktu. Dikonversi manual di
// bawah supaya jelas.
const skema = z.object({
  plan: z.enum(DAFTAR_PLAN as [string, ...string[]]).optional(),
  // Boleh null (kosongkan) atau tanggal. String kosong dari form dianggap null.
  planExpires: z.union([z.string(), z.null()]).optional(),
})

/** "2026-09-16" -> Date tengah malam UTC. Kosong/null -> null. Tak sah -> undefined (ditolak). */
function keTanggal(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const t = v.trim()
  if (t === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return undefined
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // Tolak tanggal yang tak ada, mis. 2026-02-30 yang digeser JS ke 2 Maret.
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return undefined
  return d
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return NextResponse.json({ error: 'Belum masuk' }, { status: 401 })
  if ((session?.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Hanya admin yang bisa mengubah lisensi' }, { status: 403 })
  }

  const properti = await propertiAktif(userId)
  if (!properti) return NextResponse.json({ error: 'Properti belum ada' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON' }, { status: 400 })
  }

  const parsed = skema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Plan atau tanggal tidak valid' }, { status: 400 })
  }

  const tanggal = keTanggal(parsed.data.planExpires)
  if (parsed.data.planExpires !== undefined && tanggal === undefined) {
    return NextResponse.json({ error: 'Tanggal berakhir tidak valid' }, { status: 400 })
  }

  const data: { plan?: string; planExpires?: Date | null } = {}
  if (parsed.data.plan !== undefined) data.plan = parsed.data.plan
  if (tanggal !== undefined) data.planExpires = tanggal

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada yang diubah' }, { status: 400 })
  }

  const hasil = await prisma.properti.update({ where: { id: properti.id }, data })
  return NextResponse.json({
    ok: true,
    plan: hasil.plan,
    // null tetap null supaya klien tak mengira tanggalnya berubah.
    planExpires: hasil.planExpires ? hasil.planExpires.toISOString() : null,
  })
}
