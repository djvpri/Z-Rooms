// scripts/rapikan-tipe-kamar.mjs
//
// Dijalankan di start container SEBELUM `prisma db push`, lalu sekali lagi
// SESUDAHNYA. Schema baru membuat `Kamar.tipeId` NOT NULL dan mengganti tabel
// `HargaKamar` dengan `HargaTipe` — dua hal itu menabrak data lama:
//
//   1. `tipeId` NULL (semua kamar, pasca enum dibongkar) → db push gagal.
//   2. `HargaKamar` per kamar → `db push --accept-data-loss` MENGHAPUS tabelnya,
//      jadi tarif wajib diselamatkan SEBELUM push, bukan sesudah.
//
// Dan db push menghapus SEMUA tabel yang tak ada di schema Prisma — tabel
// perantara di DB yang sama ikut lenyap. Karena itu tarif diselamatkan ke
// BERKAS (`_harga-lama.json`), bukan ke tabel. Berkas ini hanya perlu hidup
// selama satu rantai `start`, dan berada di luar schema Prisma.
//
// Skrip idempoten: aman dijalankan berkali-kali, tiap bagian melewati dirinya
// sendiri kalau tabel/kolomnya tak ada. Fase "sebelum" pakai SQL mentah saja
// (Prisma Client masih schema lama, model `hargaTipe` belum ada).

import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

const p = new PrismaClient()
const q = String.fromCharCode(39)
const TIPE_DEFAULT = 'Standar'
const TIPE_DEFAULT_FASILITAS = ['AC', 'Kamar Mandi Dalam']
const BERKAS_TARIF = '_harga-lama.json'
// Saran bawaan untuk properti lama — kembar dengan SARAN_FASILITAS di
// lib/tipeKamar.ts, disalin karena skrip ini .mjs (tak bisa impor TS).
const SARAN_BAWAAN = [
  'AC', 'Kipas Angin', 'Kamar Mandi Dalam', 'Kamar Mandi Luar',
  'Kasur Queen', 'Kasur King', 'Kasur Single', 'Lemari', 'Meja',
  'WiFi', 'TV', 'Kulkas', 'Dapur', 'Balkon', 'Air Panas', 'Sofa',
]

async function tabelAda(nama) {
  const b = await p.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name=' + q + nama + q
  )
  return b[0].n > 0
}

async function kolomAda(tabel, kolom) {
  const b = await p.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name=' +
      q + tabel + q + ' AND column_name=' + q + kolom + q
  )
  return b[0].n > 0
}

/**
 * Fase sebelum push. Dua tugas, keduanya wajib selesai sebelum `db push`:
 *
 *   1. Tautkan kamar `tipeId IS NULL` ke tipe default propertinya (kalau
 *      properti belum punya tipe sama sekali, buatkan "Standar"). Tanpa ini
 *      `db push` gagal karena kolomnya jadi NOT NULL.
 *   2. Selamatkan tarif per kamar ke berkas, karena `db push
 *      --accept-data-loss` akan MENGHAPUS `HargaKamar`.
 */
async function faseSebelum() {
  if (!(await kolomAda('Kamar', 'tipeId'))) return
  const properti = await p.$queryRawUnsafe('SELECT id, nama FROM "Properti"')
  const fasArr = '{' + TIPE_DEFAULT_FASILITAS.map(f => '"' + f + '"').join(',') + '}'
  let dibuat = 0

  for (const prop of properti) {
    // Tipe default "Standar" — dipakai kalau properti ini belum punya.
    let cek = await p.$queryRawUnsafe(
      'SELECT id FROM "TipeKamar" WHERE "propertiId"=' + q + prop.id + q +
        ' AND lower(nama)=' + q + TIPE_DEFAULT.toLowerCase() + q
    )
    let tipeId = cek.length > 0 ? cek[0].id : null
    if (!tipeId) {
      // `gen_random_uuid` menghindari tabrakan id antar properti, dan
      // `ON CONFLICT (propertiId, nama)` menutup balapan dua container
      // start bersamaan. Prisma cuid() bukan default DB, jadi id diisi manual.
      await p.$executeRawUnsafe(
        'INSERT INTO "TipeKamar" (id, nama, fasilitas, urutan, "createdAt", "updatedAt", "propertiId") VALUES (' +
          q + 'tk' + q + ' || replace(gen_random_uuid()::text, ' + q + '-' + q + ', ' + q + q + '), ' +
          q + TIPE_DEFAULT + q + ', ' +
          q + fasArr + q + '::text[], 0, now(), now(), ' + q + prop.id + q +
          ') ON CONFLICT ("propertiId", nama) DO NOTHING'
      )
      cek = await p.$queryRawUnsafe(
        'SELECT id FROM "TipeKamar" WHERE "propertiId"=' + q + prop.id + q +
          ' AND nama=' + q + TIPE_DEFAULT + q
      )
      tipeId = cek.length > 0 ? cek[0].id : null
      if (!tipeId) continue
      dibuat++
    }
    await p.$queryRawUnsafe(
      'UPDATE "Kamar" SET "tipeId"=' + q + tipeId + q +
        ' WHERE "propertiId"=' + q + prop.id + q + ' AND "tipeId" IS NULL'
    )
  }

  // Tarif lama → berkas. Harga TERKECIL per (tipe, periode): menaikkan tarif
  // diam-diam lebih berbahaya daripada menurunkannya.
  let disimpan = 0
  if (await tabelAda('HargaKamar')) {
    const harga = await p.$queryRawUnsafe(
      'SELECT k."tipeId" AS "tipeKamarId", h."periodeSewa"::text AS "periodeSewa", ' +
        'MIN(h.harga)::text AS harga, MIN(h.deposit)::text AS deposit, bool_or(h.aktif) AS aktif ' +
        'FROM "HargaKamar" h JOIN "Kamar" k ON k.id = h."kamarId" ' +
        'WHERE k."tipeId" IS NOT NULL ' +
        'GROUP BY k."tipeId", h."periodeSewa"'
    )
    writeFileSync(BERKAS_TARIF, JSON.stringify(harga))
    disimpan = harga.length
  }

  const sisa = await p.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "Kamar" WHERE "tipeId" IS NULL')
  console.log('FASE_SEBELUM_OK tipe_dibuat=' + dibuat + ' tarif_disimpan=' + disimpan + ' sisa_null=' + sisa[0].n)
}

/**
 * Fase sesudah push: salin tarif dari berkas ke `HargaTipe`, lalu buang
 * berkasnya. Kalau (tipe, periode) sudah ada di HargaTipe — mis. pemilik sempat
 * mengisi sebelum deploy — yang sudah ada menang.
 */
async function faseSesudah() {
  if (!existsSync(BERKAS_TARIF)) {
    console.log('FASE_SESUDAH_OK dipindah=0 (tak ada tarif lama)')
    return
  }
  if (!(await tabelAda('HargaTipe'))) {
    console.log('FASE_SESUDAH_SKIP tabel HargaTipe belum ada')
    return
  }
  const tarif = JSON.parse(readFileSync(BERKAS_TARIF, 'utf8'))
  let dipindah = 0
  for (const t of tarif) {
    if (!t.tipeKamarId || !t.periodeSewa) continue
    const n = await p.$executeRawUnsafe(
      'INSERT INTO "HargaTipe" (id, "tipeKamarId", "periodeSewa", harga, deposit, aktif) VALUES (' +
        q + 'ht' + q + ' || replace(gen_random_uuid()::text, ' + q + '-' + q + ', ' + q + q + '), ' +
        q + t.tipeKamarId + q + ', ' + q + t.periodeSewa + q + '::"PeriodeSewa", ' +
        t.harga + ', ' + (t.deposit === null || t.deposit === undefined ? 'NULL' : t.deposit) +
        ', ' + (t.aktif ? 'true' : 'false') + ') ' +
        'ON CONFLICT ("tipeKamarId", "periodeSewa") DO NOTHING'
    )
    dipindah += n
  }
  const total = await p.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "HargaTipe"')
  unlinkSync(BERKAS_TARIF)
  console.log('FASE_SESUDAH_OK dipindah=' + dipindah + ' total_harga_tipe=' + total[0].n)
}

/**
 * Fase fasilitas: isi master `Fasilitas` per properti dari fasilitas yang
 * SUDAH dipakai tipe/kamar, lalu lengkapi dengan saran bawaan yang belum ada.
 * Tanpa ini tab Fasilitas kosong di properti lama, padahal fasilitasnya sudah
 * dipakai di mana-mana.
 *
 * Dipanggil SESUDAH db push (tabel Fasilitas baru ada saat itu). Nama yang
 * sudah dipakai menang atas saran bawaan supaya ejaan asli data tetap utuh.
 */
async function faseFasilitas() {
  if (!(await tabelAda('Fasilitas'))) {
    console.log('FASE_FASILITAS_SKIP tabel Fasilitas belum ada')
    return
  }
  const properti = await p.$queryRawUnsafe('SELECT id FROM "Properti"')
  let dibuat = 0
  for (const prop of properti) {
    const pakai = await p.$queryRawUnsafe(
      'SELECT DISTINCT f AS nama FROM (' +
        'SELECT unnest(fasilitas) AS f FROM "TipeKamar" WHERE "propertiId"=' + q + prop.id + q +
        ' UNION ALL SELECT unnest(fasilitas) AS f FROM "Kamar" WHERE "propertiId"=' + q + prop.id + q +
        ') x WHERE f IS NOT NULL AND f <> ' + q + q
    )
    const nama = pakai.map(r => r.nama).filter(n => typeof n === 'string' && n.trim())
    for (const s of SARAN_BAWAAN) {
      if (!nama.some(n => n.toLowerCase() === s.toLowerCase())) nama.push(s)
    }
    if (nama.length === 0) continue
    const nilai = nama.map((n, i) =>
      '(' + q + 'fs' + q + ' || replace(gen_random_uuid()::text, ' + q + '-' + q + ', ' + q + q + '), ' +
        q + n.replaceAll(q, q + q) + q + ', ' + i + ', true, now(), now(), ' + q + prop.id + q + ')'
    ).join(',')
    dibuat += await p.$executeRawUnsafe(
      'INSERT INTO "Fasilitas" (id, nama, urutan, aktif, "createdAt", "updatedAt", "propertiId") ' +
        'VALUES ' + nilai + ' ON CONFLICT ("propertiId", nama) DO NOTHING'
    )
  }
  console.log('FASE_FASILITAS_OK dibuat=' + dibuat)
}

async function main() {
  const fase = process.argv[2] ?? 'sebelum'
  if (fase === 'sebelum') await faseSebelum()
  else if (fase === 'fasilitas') await faseFasilitas()
  else await faseSesudah()
}

main()
  .then(() => p.$disconnect())
  .catch(async e => {
    console.error('RAPIKAN_GAGAL fase=' + (process.argv[2] ?? 'sebelum') + ' pesan=' + e.message)
    await p.$disconnect()
    process.exit(1)
  })
