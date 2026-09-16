// app/api/ktp/baca/route.ts
//
// Baca data KTP dari foto, lalu periksa apakah NIK-nya sudah terdaftar.
//
// Dua hal sekaligus:
//   1. OCR — mengisi form penyewa baru otomatis.
//   2. Cek duplikat — sebelum kasir menyimpan, NIK hasil bacaan dicocokkan ke
//      tabel Penyewa. Kalau sudah ada, kasir ditawari memakai data lama.
//
// Cek duplikat ada di sini, bukan di /api/booking, karena di sinilah NIK
// pertama kali terbaca akurat. Tanpa ini, OCR yang bagus justru sering memicu
// galat 409 "NIK sudah terdaftar" dari /api/booking — kasir jadi buntu, padahal
// orangnya memang sudah tercatat.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bacaKtp, MIME_DIIZINKAN, MAKS_UKURAN } from '@/lib/ktp'

export async function POST(req: NextRequest) {
  const sesi = await auth()
  if (!sesi?.user) return NextResponse.json({ error: 'Belum masuk' }, { status: 401 })

  try {
    const form = await req.formData()
    const berkas = form.get('foto')

    if (!(berkas instanceof File)) {
      return NextResponse.json({ error: 'Foto belum dipilih.' }, { status: 400 })
    }
    if (!MIME_DIIZINKAN.includes(berkas.type)) {
      return NextResponse.json(
        { error: 'Format foto harus JPG, PNG, atau WEBP.' },
        { status: 400 },
      )
    }
    if (berkas.size > MAKS_UKURAN) {
      return NextResponse.json(
        { error: 'Foto terlalu besar. Maksimal 6 MB — kecilkan dulu.' },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await berkas.arrayBuffer())
    const hasil = await bacaKtp(buffer.toString('base64'), berkas.type, process.env.GEMINI_API_KEY)

    // Cek duplikat HANYA kalau NIK terbaca utuh 16 digit. NIK kosong bukan
    // dasar yang aman untuk menyimpulkan apa pun.
    const terdaftar = hasil.nik
      ? await prisma.penyewa.findUnique({
          where: { nik: hasil.nik },
          select: { id: true, nama: true, noHp: true, alamatAsal: true, pekerjaan: true, riwayatNama: true },
        })
      : null

    return NextResponse.json({ hasil, terdaftar })
  } catch (e) {
    // Pesan dari lib/ktp.ts sudah siap dibaca kasir; sisanya jadi pesan umum.
    const pesan = e instanceof Error ? e.message : 'Gagal membaca KTP.'
    return NextResponse.json({ error: pesan }, { status: 502 })
  }
}
