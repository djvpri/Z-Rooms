// app/api/penyewa/[id]/route.ts
//
// Ubah data penyewa yang sudah ada: nama, NIK, kontak, pekerjaan, alamat,
// bentuk entitas. Identitas penyewa dipakai bersama oleh semua sewa &
// tagihannya, jadi satu perbaikan di sini langsung berlaku untuk semuanya.
//
// Nama lama dicatat di `riwayatNama`. Sewa & Tagihan hanya menyimpan penyewaId
// — tak ada salinan nama di sana — sehingga tanpa catatan ini nama pada
// dokumen lama hilang begitu penyewa mengganti namanya.
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { updatePenyewaSchema, riwayatNamaSchema } from '@/lib/penyewa'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }

  const properti = await propertiAktif(session.user.id as string)
  if (!properti) return NextResponse.json({ error: 'Belum ada properti.' }, { status: 400 })

  const { id } = await params

  const badan = await req.json().catch(() => null)
  const hasil = updatePenyewaSchema.safeParse(badan)
  if (!hasil.success) {
    return NextResponse.json({ error: hasil.error.flatten() }, { status: 400 })
  }
  const d = hasil.data

  // Penyewa hanya boleh diubah kalau pernah menyewa di properti aktif. Tanpa
  // saringan ini, id penyewa properti lain bisa diubah dari sini.
  const lama = await prisma.penyewa.findFirst({
    where: { id, sewa: { some: { kamar: { propertiId: properti.id } } } },
  })
  if (!lama) return NextResponse.json({ error: 'Penyewa tidak ditemukan' }, { status: 404 })

  // NIK milik penyewa LAIN -> tolak. Tanpa ini, simpan gagal dengan error unik
  // Prisma yang tak terbaca pengguna, atau identitas orang lain tertimpa.
  if (d.nik) {
    const pemilikNik = await prisma.penyewa.findUnique({ where: { nik: d.nik } })
    if (pemilikNik && pemilikNik.id !== id) {
      return NextResponse.json(
        { error: `NIK ${d.nik} sudah terdaftar atas nama ${pemilikNik.nama ?? 'penyewa lain'}.` },
        { status: 409 },
      )
    }
  }

  // Catat nama lama HANYA kalau namanya benar-benar berubah. Menyimpan tanpa
  // mengubah nama tak boleh menumpuk riwayat palsu.
  const riwayatLama = riwayatNamaSchema.safeParse(lama.riwayatNama).data ?? []
  const namaBaru = d.nama ?? lama.nama
  const gantiNama = d.nama !== undefined && d.nama !== lama.nama
  const riwayat = gantiNama && lama.nama
    ? [...riwayatLama, { nama: lama.nama, digantiPada: new Date().toISOString() }]
    : riwayatLama

  const penyewa = await prisma.penyewa.update({
    where: { id },
    data: {
      ...(d.nama !== undefined ? { nama: d.nama } : {}),
      // `undefined` = jangan diubah; `null` = kosongkan. Keduanya harus
      // dibedakan, karena form boleh mengosongkan NIK/alamat dengan sengaja.
      ...(d.nik !== undefined ? { nik: d.nik } : {}),
      ...(d.noHp !== undefined ? { noHp: d.noHp } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.pekerjaan !== undefined ? { pekerjaan: d.pekerjaan } : {}),
      ...(d.alamatAsal !== undefined ? { alamatAsal: d.alamatAsal } : {}),
      ...(d.tipeEntitas !== undefined ? { tipeEntitas: d.tipeEntitas } : {}),
      ...(d.namaPerusahaan !== undefined ? { namaPerusahaan: d.namaPerusahaan } : {}),
      ...(d.npwp !== undefined ? { npwp: d.npwp } : {}),
      ...(gantiNama ? { riwayatNama: riwayat } : {}),
    },
  })

  return NextResponse.json({
    id: penyewa.id,
    nama: namaBaru,
    nik: penyewa.nik,
    noHp: penyewa.noHp,
    riwayatNama: riwayat,
  })
}
