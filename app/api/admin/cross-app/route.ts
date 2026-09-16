import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DAFTAR_PLAN, planDikenal } from '@/lib/lisensi'
import bcrypt from 'bcryptjs'

// Endpoint ini dipanggil Z One (hub ekosistem) lewat /manage, bukan oleh
// browser pengguna langsung — autentikasi pakai Bearer secret, bukan cookie.
// Z-Rooms pakai Properti sebagai "tenant" (satu user bisa punya banyak properti).

// Migration 2026-07-02: dual secret support
const NEW_SECRET = process.env.CROSS_APP_SECRET || 'uurclTHL375CiZeWi2g4T3GczU2YNY9I1wzjlsVTgSk'
const OLD_SECRET = 'z-ecosystem-admin-2026'
const VALID_SECRETS = [NEW_SECRET, OLD_SECRET]

function checkAuth(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const token = header.replace('Bearer ', '')
  return VALID_SECRETS.includes(token)
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const properti = await prisma.properti.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, nama: true, tipe: true, kota: true, aktif: true, createdAt: true,
        plan: true, planExpires: true,
      },
    })
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        properti: { select: { id: true }, where: { aktif: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    })
    return NextResponse.json({
      tenants: properti.map((p: typeof properti[number]) => ({
        id: p.id,
        name: p.nama,
        plan: p.plan,
        active: p.aktif,
        // Hub ZOne membaca expires_at / expiresAt / langganan_sampai.
        // Dikirim dua bentuk supaya tak bergantung pada mana yang dibaca.
        expires_at: p.planExpires ? p.planExpires.toISOString() : null,
        expiresAt: p.planExpires ? p.planExpires.toISOString() : null,
      })),
      users: users.map((u: typeof users[number]) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, active: u.isActive,
        tenantId: u.properti[0]?.id ?? null,
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
      // Owner properti: pakai ownerEmail kalau dikirim (mis. provisioning demo —
      // demo jadi PEMILIK propertinya sendiri, terisolasi), selain itu ADMIN pertama.
      // Hub ZOne mengirim email admin hanya di field top-level `email` (bukan
      // data.ownerEmail), jadi pakai itu sebagai fallback.
      const ownerEmail = String(data?.ownerEmail || email || '').trim()
      let owner = ownerEmail
        ? await prisma.user.findUnique({ where: { email: ownerEmail } })
        : null
      if (!owner) owner = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
      if (!owner) {
        const total = await prisma.user.count()
        return NextResponse.json({
          error: ownerEmail
            ? `Email owner "${ownerEmail}" tidak terdaftar di ZXRoom dan tidak ada user ADMIN. Tambahkan user tersebut dulu, atau jadikan salah satu user ZXRoom sebagai ADMIN.`
            : `Tidak ada owner: permintaan tidak menyertakan email owner dan ZXRoom belum punya user ADMIN (total user: ${total}). Set user pertama jadi ADMIN, atau kirim ownerEmail yang terdaftar.`,
        }, { status: 400 })
      }
      // Idempotent: jangan bikin properti ganda dgn nama sama untuk owner yang sama
      const existing = await prisma.properti.findFirst({ where: { nama, ownerId: owner.id } })
      if (existing) return NextResponse.json({ success: true, tenant: { id: existing.id, name: existing.nama } })
      // Satu tenant = satu properti. Owner yang sudah punya properti ditolak —
      // dulu boleh banyak, dan itu membuat lisensi (yang melekat pada properti)
      // jadi ambigu: properti mana yang tanggal berakhirnya berlaku?
      const sudahPunya = await prisma.properti.findFirst({
        where: { ownerId: owner.id },
        select: { id: true, nama: true },
      })
      if (sudahPunya) {
        return NextResponse.json({
          error: `Owner "${owner.email}" sudah memiliki properti "${sudahPunya.nama}". Satu tenant hanya boleh punya satu properti.`
            + ` Gunakan properti itu, atau pindahkan kepemilikannya dulu (moveTenant).`,
        }, { status: 409 })
      }
      const p = await prisma.properti.create({
        data: { nama, tipe: 'KOS', alamat: '-', kota: '-', ownerId: owner.id },
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

    // Pindah user ke properti (tenant) lain. Di Z-Rooms relasinya lewat
    // Properti.ownerId (satu properti satu owner), bukan kolom tenantId di User —
    // jadi "pindah" = ganti owner properti tujuan.
    if (action === 'moveTenant') {
      const userId = data?.userId
      const id = data?.tenantId
      if (!id) return NextResponse.json({ error: 'tenantId wajib diisi' }, { status: 400 })
      const properti = await prisma.properti.findUnique({ where: { id }, select: { nama: true } })
      if (!properti) return NextResponse.json({ error: `Properti dengan id "${id}" tidak ditemukan` }, { status: 404 })
      const target = userId
        ? await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, name: true, email: true } })
        : email
          ? await prisma.user.findUnique({ where: { email: String(email).trim() }, select: { id: true, name: true, email: true } })
          : null
      if (!target) {
        return NextResponse.json({ error: `User "${userId || email}" tidak terdaftar di ZXRoom` }, { status: 404 })
      }
      // Satu tenant = satu properti, jadi pindah hanya boleh kalau tujuan belum
      // punya properti sama sekali. Tanpa cek ini, "pindah" jadi cara membuat
      // owner dengan 2 properti — celah dari aturan yang sama.
      const targetSudahPunya = await prisma.properti.findFirst({
        where: { ownerId: target.id },
        select: { nama: true },
      })
      if (targetSudahPunya) {
        return NextResponse.json({
          error: `User "${target.email}" sudah memiliki properti "${targetSudahPunya.nama}". Satu tenant hanya boleh punya satu properti.`,
        }, { status: 409 })
      }
      await prisma.properti.update({ where: { id }, data: { ownerId: target.id } })
      return NextResponse.json({ success: true, moved: true, tenant: { id, name: properti.nama }, owner: target.email })
    }

    if (action === 'updatePlan') {
      // Lisensi diatur dari hub ZOne (/manage), bukan dari dalam ZXRoom.
      // ZOne mengirim { tenantId, plan, planExpires } — planExpires sebagai
      // ISO. Hanya field yang DIKIRIM yang diubah, supaya mengubah plan saja
      // tak menghapus tanggal berakhirnya.
      const id = String(data?.tenantId || data?.id || '').trim()
      if (!id) return NextResponse.json({ error: 'tenantId wajib diisi' }, { status: 400 })

      const ada = await prisma.properti.findUnique({ where: { id }, select: { id: true, nama: true } })
      if (!ada) return NextResponse.json({ error: `Properti dengan id "${id}" tidak ditemukan` }, { status: 404 })

      const ubah: { plan?: string; planExpires?: Date | null } = {}

      if (data?.plan !== undefined) {
        const plan = String(data.plan).trim().toLowerCase()
        if (!planDikenal(plan)) {
          return NextResponse.json(
            { error: `plan "${data.plan}" tidak dikenal. Pilihan: ${DAFTAR_PLAN.join(', ')}` },
            { status: 400 },
          )
        }
        ubah.plan = plan
      }

      if (data?.planExpires !== undefined) {
        if (data.planExpires === null || data.planExpires === '') {
          ubah.planExpires = null
        } else {
          const d = new Date(String(data.planExpires))
          if (isNaN(d.getTime())) {
            return NextResponse.json({ error: `planExpires "${data.planExpires}" bukan tanggal valid` }, { status: 400 })
          }
          // Disimpan sebagai tengah malam UTC: planExpires adalah TANGGAL
          // kalender. Kalau jamnya ikut, "berlaku hingga 16 Okt" bisa tampil
          // 16 Okt 12:00 WIB dan sisa harinya bergeser tergantung jam dibuka.
          ubah.planExpires = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        }
      }

      if (Object.keys(ubah).length === 0) {
        return NextResponse.json({ error: 'Tidak ada yang diubah (plan atau planExpires)' }, { status: 400 })
      }

      const hasil = await prisma.properti.update({ where: { id }, data: ubah })
      return NextResponse.json({
        success: true,
        tenant: {
          id: hasil.id,
          name: hasil.nama,
          plan: hasil.plan,
          expires_at: hasil.planExpires ? hasil.planExpires.toISOString() : null,
          expiresAt: hasil.planExpires ? hasil.planExpires.toISOString() : null,
        },
      })
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

    if (action === 'updateRole') {
      const role = String(data?.role || '').trim().toUpperCase()
      const valid = ['USER', 'ADMIN', 'MANAGER']
      if (!valid.includes(role)) {
        return NextResponse.json(
          { error: `role "${data?.role}" tidak dikenal. Pilihan: ${valid.join(', ')}` },
          { status: 400 },
        )
      }
      const targetEmail = String(data?.email || email || '').trim()
      if (!targetEmail) return NextResponse.json({ error: 'email wajib diisi' }, { status: 400 })
      const result = await prisma.user.updateMany({ where: { email: targetEmail }, data: { role: role as any } })
      if (!result.count) return NextResponse.json({ error: `User "${targetEmail}" tidak terdaftar di ZXRoom` }, { status: 404 })
      return NextResponse.json({ success: true, role })
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
