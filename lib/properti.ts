// lib/properti.ts
//
// Satu-satunya sumber kebenaran untuk "properti mana yang sedang dibuka".
//
// Sebelum ini setiap halaman memanggil `prisma.properti.findFirst({ ownerId })`
// tanpa orderBy, sehingga urutan baris dari DB menentukan properti yang tampil —
// pemilik dengan 2 properti bisa melihat properti berbeda di tiap halaman.
//
// Properti terpilih disimpan di cookie `zx_properti`. Kalau cookie kosong/tidak
// valid (properti dihapus, atau milik owner lain), jatuh ke properti pertama
// dengan orderBy deterministik.
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export const COOKIE_PROPERTI = 'zx_properti'

/** Semua properti milik owner, urut konsisten (terlama dulu). Termasuk yang nonaktif. */
export async function daftarProperti(ownerId: string) {
  return prisma.properti.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

/** Hanya properti aktif milik owner — ini yang boleh muncul di pemilih properti. */
export async function daftarPropertiAktif(ownerId: string) {
  return prisma.properti.findMany({
    where: { ownerId, aktif: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

/**
 * Properti yang sedang aktif untuk owner ini.
 * Cookie dipakai kalau propertinya memang milik owner — kalau tidak, fallback.
 *
 * Properti nonaktif tidak dipilih lewat cookie maupun fallback — kecuali
 * SEMUA properti owner nonaktif. Dalam kasus itu properti pertama tetap
 * dikembalikan supaya halaman tidak blank; data tetap bisa dilihat, dan user
 * bisa mengaktifkannya lagi dari halaman Properti.
 */
export async function propertiAktif(ownerId: string) {
  const semua = await daftarProperti(ownerId)
  if (semua.length === 0) return null

  const boleh = semua.filter((p) => p.aktif)
  const kandidat = boleh.length > 0 ? boleh : semua

  const dipilih = (await cookies()).get(COOKIE_PROPERTI)?.value
  if (dipilih) {
    const cocok = kandidat.find((p) => p.id === dipilih)
    // Milik owner ini DAN aktif? kalau ya pakai. Kalau bukan (cookie basi/spoof,
    // atau properti barusan dinonaktifkan) abaikan.
    if (cocok) return cocok
  }
  return kandidat[0]
}

/** Properti aktif, atau lempar — untuk route API yang tidak boleh jalan tanpa properti. */
export async function propertiAktifWajib(ownerId: string) {
  const p = await propertiAktif(ownerId)
  if (!p) throw new Error('PROPERTI_TIDAK_ADA')
  return p
}
