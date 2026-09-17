// app/api/log/route.ts
//
// Log error dari peramban kasir. Dipanggil tombol "Kirim Log Error" di tab
// Pengaturan, lalu dibaca agent untuk diagnosa tanpa harus ke lokasi kasir.
//
// Ditiru dari zpos (`/api/kasir/log`) supaya cara kerjanya sama di seluruh
// ekosistem: potong panjang, buang duplikat, retensi pendek.
//
// Sengaja BUKAN audit trail. Baris dihapus setelah 12 jam, sekali per panggilan
// supaya tak perlu cron sendiri — log masuk jarang (kasir menekan tombol), jadi
// pembersihan sesekali sudah cukup dan tak ada cron yang bisa lupa dipasang.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif, daftarProperti } from '@/lib/properti'

export const runtime = 'nodejs'

/** Batas per unggahan. Log error biasanya puluhan baris, bukan megabyte. */
const MAX_BARIS = 2_000
const MAX_PANJANG = 200_000
/** Dedup: konten sama dari perangkat sama dalam rentang ini dianggap kiriman
 *  ulang — kasir menekan tombol dua kali karena tak yakin, atau halaman di-reload. */
const DEDUP_MENIT = 30

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Bersihkan yang kedaluwarsa tiap panggilan. Dibungkus try: urusan diagnosa
  // tak boleh gagal hanya karena pembersihan tak jalan.
  try {
    await prisma.$executeRaw`DELETE FROM "LogKasir" WHERE "createdAt" < now() - interval '12 hours'`
  } catch { /* non-blokir */ }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>

  const perangkat = String(b.perangkat ?? '').trim().slice(0, 100)
  const nama = String(b.nama ?? '').trim().slice(0, 200)
  const konten = String(b.konten ?? '').trim()

  // Perangkat & isi wajib: log tanpa penanda perangkat tak bisa dipakai
  // menebak "rusak di mana", dan itu satu-satunya alasan fitur ini ada.
  if (!perangkat || !konten) {
    return NextResponse.json({ error: 'perangkat & konten wajib' }, { status: 400 })
  }

  // Potong dari BELAKANG: baris terakhir adalah yang terbaru, dan yang terbaru
  // yang paling menjelaskan kegagalan.
  let potong = konten
  const baris = konten.split('\n')
  if (baris.length > MAX_BARIS) potong = baris.slice(-MAX_BARIS).join('\n')
  if (potong.length > MAX_PANJANG) potong = potong.slice(-MAX_PANJANG)

  const properti = await propertiAktif(session.user.id as string)
  const propertiId = properti?.id ?? null

  const sejak = new Date(Date.now() - DEDUP_MENIT * 60_000)
  const kembar = await prisma.logKasir.findFirst({
    where: { propertiId, perangkat, konten: potong, createdAt: { gt: sejak } },
    select: { id: true },
  })
  if (kembar) return NextResponse.json({ ok: true, dedup: true })

  await prisma.logKasir.create({
    data: { propertiId, perangkat, nama: nama || null, konten: potong },
  })
  return NextResponse.json({ ok: true })
}

/** Baca log terbaru. Dipakai agent saat mendiagnosa, dan tab Pengaturan untuk
 *  menampilkan kiriman terakhir — supaya kasir tahu lognya benar-benar masuk. */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const properti = await propertiAktif(session.user.id as string)

  // ?semua=1 -> seluruh properti owner, bukan cuma yang sedang dibuka. Berguna
  // saat kasir melapor dari properti yang kebetulan tidak aktif di layarnya.
  const semua = req.nextUrl.searchParams.get('semua') === '1'
  const where = semua || !properti
    ? { propertiId: { in: (await daftarProperti(session.user.id as string)).map((p) => p.id) } }
    : { propertiId: properti.id }

  const rows = await prisma.logKasir.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, perangkat: true, nama: true, konten: true, createdAt: true },
  })
  return NextResponse.json({ rows })
}
