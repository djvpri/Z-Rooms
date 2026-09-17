// Tombol "Lihat jadwal 14 hari" di Detail sewa (tab Booking baru) hanya muncul
// kalau kamar terpilih sudah terisi/terpesan. Modal yang dibukanya adalah
// JadwalKamar yang sama dengan tab Kamar.
//
// Diuji di sini: komponen JadwalKamar ter-render dengan data sewa kamar
// terpilih dan menandai jam terpakai — jadi jalur yang dipakai halaman booking
// memang menghasilkan grid, bukan cuma tombol yang tak berujung.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JadwalKamar from '../components/kamar/JadwalKamar.tsx'
import { bolehDipesan } from '../lib/jadwalKamar.ts'

const Mod = JadwalKamar
const Komp = Mod.default ?? Mod

const aturan = { jamCheckout: '12:00', toleransiCheckout: 0 }
const sekarang = new Date('2026-09-17T10:00:00+07:00')

// Dua sewa berurutan: yang pertama sedang dihuni, yang kedua memesan setelahnya.
const sewa = [
  { statusSewa: 'AKTIF', tanggalMasuk: '2026-09-15T14:00:00+07:00', tanggalKeluar: '2026-09-19T12:00:00+07:00' },
  { statusSewa: 'PENDING', tanggalMasuk: '2026-09-20T14:00:00+07:00', tanggalKeluar: '2026-09-22T12:00:00+07:00' },
]

const html = renderToStaticMarkup(
  React.createElement(Komp, { nomor: '101', sewa, aturan, sekarang, onTutup: () => {} }),
)

// Modal memang grid 14 hari: judul kamar + 14 kolom tanggal + 24 baris jam.
assert(html.includes('Kamar 101'), 'judul kamar tak ter-render')
assert(html.includes('Jadwal 14 hari'), 'subjudul rentang jadwal hilang')
assert(html.includes('00:00'), 'label jam 00:00 hilang')
assert(html.includes('23:00'), 'label jam 23:00 hilang')
const jumlahSel = (html.match(/<td/g) ?? []).length
assert.equal(jumlahSel, 14 * 24, `sel grid harus 14×24=336, dapat ${jumlahSel}`)

// Sel kuning = jam yang akan ditolak server. Ada, dan jumlahnya masuk akal
// (bukan 0 karena semua dianggap kosong, bukan 336 karena semua dianggap penuh).
const selKuning = (html.match(/bg-amber-300/g) ?? []).length
assert(selKuning > 0, 'tak ada sel kuning — sewa yang sudah ada tak terbaca')
assert(selKuning < 336, 'semua sel kuning — aturan bentrok terlalu longgar')

// Silang-periksa dengan aturan server: tanggal yang ditandai kuning memang
// ditolak `bolehDipesan`, dan tanggal yang tak ditandai memang boleh.
const dihuni = { mulai: new Date('2026-09-20T14:00:00+07:00'), selesai: new Date('2026-09-22T12:00:00+07:00') }
assert.equal(
  bolehDipesan(dihuni, sewa, aturan).boleh,
  false,
  'jam yang ditandai kuning oleh grid justru dinyatakan boleh — grid & server tak sepakat',
)
const bebas = { mulai: new Date('2026-09-24T14:00:00+07:00'), selesai: new Date('2026-09-26T12:00:00+07:00') }
assert.equal(bolehDipesan(bebas, sewa, aturan).boleh, true, 'tanggal bebas justru dinyatakan bentrok')

// Tombol di halaman booking memakai komponen ini, bukan salinannya.
const halaman = fs.readFileSync('app/(dashboard)/booking/page.tsx', 'utf8')
assert(halaman.includes("from '@/components/kamar/JadwalKamar'"), 'halaman booking tak memakai JadwalKamar bersama')
assert(halaman.includes('Lihat jadwal 14 hari'), 'label tombol tak ada di halaman booking')

console.log(`OK — check-jadwal-booking: grid ${jumlahSel} sel, ${selKuning} sel kuning, aturan server sepakat`)
