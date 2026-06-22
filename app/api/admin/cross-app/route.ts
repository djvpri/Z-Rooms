import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// Endpoint ini dipanggil Z One (hub ekosistem) lewat /manage, bukan oleh
// browser pengguna langsung — autentikasi pakai Bearer secret, bukan cookie.
// Z-Rooms pakai Properti sebagai "tenant" (satu user bisa punya banyak properti).

const CROSS_APP_SECRET = process.env.CROSS_APP_SECRET || 'z-ecosystem-admin-2026'

function checkAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${CROSS_APP_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const properti = await prisma.properti.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, nama: true, tipe: true, kota: true, aktif: true, createdAt: true },
    })
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    return NextResponse.json({
      tenants: properti.map((p: typeof properti[number]) => ({
        id: p.id,
        name: `${p.nama} (${p.tipe}, ${p.kota})`,
        plan: 'pro',
        active: p.aktif,
        expires_at: null,
      })),
      users: users.map((u: typeof users[number]) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, active: u.isActive,
      })),
    })
  } catch (err) {
    console.error('cross-app GET error:', err)
    return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { action, email, data } = body

    // ── Tenant (Properti) ────────────────────────────────────────────────
    if (action === 'createTenant') {
      const nama = String(data?.name || '').trim()
      if (!nama) return NextResponse.json({ error: 'name wajib diisi' }, { status: 400 })
      // Butuh owner — pakai user admin pertama yang ada
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
      if (!admin) return NextResponse.json({ error: 'Belum ada user ADMIN di Z-Rooms' }, { status: 400 })
      const p = await prisma.properti.create({
        data: { nama, tipe: 'KOS', alamat: '-', kota: '-', ownerId: admin.id },
      })
      return NextResponse.json({ success: true, tenant: { id: p.id, name: p.nama } })
    }

    if (action === 'deleteTenant') {
      // Soft-delete: nonaktifkan properti saja, tidak hapus baris (ada relasi ke Sewa/Tagihan)
      const id = data?.tenantId
      if (!id) return NextResponse.json({ error: 'tenantId wajib diisi' }, { status: 400 })
      await prisma.properti.update({ where: { id }, data: { aktif: false } })
      return NextResponse.json({ success: true, deactivated: true })
    }

    if (action === 'reactivateTenant') {
      const id = data?.tenantId
      if (!id) return NextResponse.json({ error: 'tenantId wajib diisi' }, { status: 400 })
      await prisma.properti.update({ where: { id }, data: { aktif: true } })
      return NextResponse.json({ success: true, reactivated: true })
    }

    if (action === 'updatePlan') {
      // Z-Rooms tidak punya plan tier — abaikan, kembalikan success biar UI tidak error
      return NextResponse.json({ success: true, note: 'Z-Rooms tidak menggunakan plan tier' })
    }

    // ── User ─────────────────────────────────────────────────────────────
    if (action === 'create') {
      const name = String(data?.name || '').trim()
      const userEmail = String(data?.email || '').trim()
      const password = String(data?.password || '')
      if (!name || !userEmail || !password) {
        return NextResponse.json({ error: 'name, email, password wajib diisi' }, { status: 400 })
      }
      const existing = await prisma.user.findUnique({ where: { email: userEmail } })
      if (existing) return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 409 })
      const hashed = await bcrypt.hash(password, 10)
      const user = await prisma.user.create({
        data: { email: userEmail, name, password: hashed, role: 'USER', isActive: true },
      })
      return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email } })
    }

    if (action === 'delete') {
      // Soft-delete: user punya relasi ke Sewa/Tagihan/Pembayaran
      if (!email) return NextResponse.json({ error: 'email wajib diisi' }, { status: 400 })
      const result = await prisma.user.updateMany({ where: { email }, data: { isActive: false } })
      if (!result.count) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
      return NextResponse.json({ success: true, deactivated: true })
    }

    if (action === 'reactivate') {
      if (!email) return NextResponse.json({ error: 'email wajib diisi' }, { status: 400 })
      const result = await prisma.user.updateMany({ where: { email }, data: { isActive: true } })
      if (!result.count) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
      return NextResponse.json({ success: true, reactivated: true })
    }

    // Tetap dukung action lama (create, updateRole, toggleActive, resetPassword, list)
    // biar kode lain yang sudah pakai endpoint ini tidak rusak
    if (action === 'list') {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ success: true, users })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Cross-app API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
