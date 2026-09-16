// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    // `commit` = hash yang di-build Next (diisi build arg/ENV_COMMIT saat deploy).
    // Dipakai memastikan versi yang hidup benar-benar versi yang baru di-push,
    // tanpa perlu masuk dashboard Coolify.
    const commit = process.env.ENV_COMMIT_SHA ?? process.env.SOURCE_COMMIT ?? null
    // `skema` = penanda migrasi harga-kamar→harga-tipe sudah jalan. Hilang
    // otomatis kalau HargaTipe belum ada, jadi bisa dibaca dari luar.
    const skema = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'HargaTipe'
    `.then(r => (r[0]?.n ? 'harga-tipe' : 'lama'))
    return NextResponse.json({ status: 'ok', db: 'connected', commit, skema, ts: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'disconnected' }, { status: 503 })
  }
}
