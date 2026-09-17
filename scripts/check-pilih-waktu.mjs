// Mode harian: grid jam tampil. Mode bulanan/tahunan (`tanpaJam`): grid jam
// disembunyikan, chips tanggal tetap ada. Regression: dulu grid jam selalu
// tampil walau periodenya bulanan, padahal jamnya tak dipakai.
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PilihWaktu from '../app/(dashboard)/booking/PilihWaktu.tsx'

const Mod = PilihWaktu
const Komp = Mod.default ?? Mod

const dasar = {
  tanggal: '2026-09-17',
  jam: '00:00',
  tanggalPilihan: ['2026-09-17', '2026-09-18', '2026-09-19'],
  jamTerpakai: new Set(),
  onPilih: () => {},
}

const harian = renderToStaticMarkup(React.createElement(Komp, { ...dasar, tanpaJam: false }))
const bulanan = renderToStaticMarkup(React.createElement(Komp, { ...dasar, tanpaJam: true }))

// Harian: label jam + grid 24 jam ada.
assert(harian.includes('Jam masuk'), 'harian: label "Jam masuk" hilang')
assert(harian.includes('23:00'), 'harian: jam 23:00 hilang — grid tak lengkap')
assert(harian.includes('Tanggal masuk'), 'harian: label tanggal hilang')

// Bulanan: label jam & grid hilang, chips tanggal TETAP ada.
assert(!bulanan.includes('Jam masuk'), 'bulanan: label "Jam masuk" masih tampil')
assert(!bulanan.includes('23:00'), 'bulanan: grid jam masih ter-render')
assert(bulanan.includes('Tanggal masuk'), 'bulanan: chips tanggal ikut hilang — harusnya tetap ada')
assert(bulanan.includes('Kam, 17 Sep'), 'bulanan: chip tanggal tak ter-render')

// Chip terpilih tetap ditandai di kedua mode.
for (const [nama, html] of [['harian', harian], ['bulanan', bulanan]]) {
  assert(html.includes('Dipilih'), `${nama}: penanda "Dipilih" hilang`)
}

console.log('OK — check-pilih-waktu: harian punya jam, bulanan tidak, chips tetap ada di keduanya')
