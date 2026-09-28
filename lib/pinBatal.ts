// lib/pinBatal.ts
//
// Pengecekan PIN & pencatatan log untuk PEMBATALAN (karaoke & booking).
//
// Kenapa PIN: tombol batal itu jalur uang keluar — stok dikembalikan, tagihan
// jadi BATAL, kamar dibebaskan. Tanpa pengesahan, siapa pun yang memegang
// tablet bisa menghapus transaksi.
//
// Kenapa ALASAN wajib: jejak audit. Log tanpa keterangan tak menjawab
// pertanyaan yang sebenarnya diajukan pemilik — "kenapa ini dibatalkan?".

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const MAKS_ALASAN = 200

export type HasilValidasi = { ok: true; alasan: string } | { ok: false; res: NextResponse }

/** Baca & wajibkan alasan dari body. */
export function bacaAlasan(body: unknown): string {
  const b = body as { alasan?: unknown; catatan?: unknown } | null
  const nilai = typeof b?.alasan === 'string' ? b.alasan : typeof b?.catatan === 'string' ? b.catatan : ''
  return nilai.trim().slice(0, MAKS_ALASAN)
}

/**
 * Validasi PIN terhadap properti. Dipanggil sebelum transaksi pembatalan.
 * `properti.pinBatal` NULL -> lolos tanpa PIN (fitur belum diaktifkan).
 */
export async function cekPinBatal(
  properti: { id: string; pinBatal: string | null },
  body: unknown,
): Promise<HasilValidasi> {
  const alasan = bacaAlasan(body)
  if (!alasan) {
    return {
      ok: false,
      res: NextResponse.json({ error: { message: 'Alasan pembatalan wajib diisi.' } }, { status: 400 }),
    }
  }
  if (!properti.pinBatal) return { ok: true, alasan }

  const pin = typeof (body as { pin?: unknown } | null)?.pin === 'string' ? (body as { pin: string }).pin.trim() : ''
  if (!pin) {
    return {
      ok: false,
      res: NextResponse.json({ error: { message: 'PIN pembatalan wajib diisi.' } }, { status: 403 }),
    }
  }
  const cocok = await bcrypt.compare(pin, properti.pinBatal)
  if (!cocok) {
    return {
      ok: false,
      res: NextResponse.json({ error: { message: 'PIN salah. Pembatalan ditolak.' } }, { status: 403 }),
    }
  }
  return { ok: true, alasan }
}

/** Catat ke LogAktivitas. Tak boleh membatalkan transaksi kalau gagal — log
 *  adalah pelengkap, bukan penentu berhasilnya aksi. */
export async function catatAktivitas(d: {
  propertiId: string
  userId?: string | null
  userEmail?: string | null
  aksi: 'BATAL_KARAOKE' | 'BATAL_BOOKING' | 'CHECKIN_BOOKING' | 'BOOKING_BARU'
  referensiId: string
  alasan: string
  detail?: string
}) {
  try {
    await prisma.logAktivitas.create({
      data: {
        propertiId: d.propertiId,
        userId: d.userId ?? null,
        userEmail: d.userEmail ?? null,
        aksi: d.aksi,
        referensiId: d.referensiId,
        alasan: d.alasan.slice(0, MAKS_ALASAN),
        detail: d.detail?.slice(0, 300) ?? null,
      },
    })
  } catch {
    // Log gagal jangan sampai membatalkan aksi utama.
  }
}
