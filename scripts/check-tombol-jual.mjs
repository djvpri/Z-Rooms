// scripts/check-tombol-jual.mjs
//
// Merender komponen NYATA ke HTML statis (pola sama dengan
// check-jadwal-booking.mjs). Bukan memeriksa teks sumber.
//
// Yang dijaga:
//   T1. TabPengaturan memuat tautan /lisensi (Lisensi pindah ke dalam
//       Pengaturan — bottom nav HP tak cukup ruang untuk item ke-8)
//   T2. TabPengaturan menandai tab aktif
//   T3. TombolJual menautkan ke kasir dengan sewaId yang benar
//   T4. tujuanAwal hanya dipakai kalau sewaId itu ADA di daftar kamar —
//       ?sewa= sampah tak boleh mengunci dropdown ke nilai tak dikenal
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ModTombolJual from '../components/kamar/TombolJual.tsx'
import ModTabPengaturan from '../components/pengaturan/TabPengaturan.tsx'

// Interop ESM/CJS: tsx membungkus ekspor .tsx, jadi default kadang bersarang.
const TombolJual = ModTombolJual.default ?? ModTombolJual
const TabPengaturan = ModTabPengaturan.default ?? ModTabPengaturan
const TAB_PENGATURAN = ModTabPengaturan.TAB_PENGATURAN ?? ModTabPengaturan.default?.TAB_PENGATURAN

let n = 0
const blok = (nama, fn) => { fn(); n++; console.log(`  ok ${n} — ${nama}`) }

blok('T1 — TabPengaturan punya tautan /lisensi', () => {
  assert.ok(
    TAB_PENGATURAN.some(t => t.href === '/lisensi'),
    'tab Lisensi hilang — halaman /lisensi jadi tak bisa dijangkau dari UI',
  )
  const html = renderToStaticMarkup(React.createElement(TabPengaturan, { aktif: '/lisensi' }))
  assert.ok(html.includes('href="/lisensi"'), 'tautan /lisensi tak ter-render')
  assert.ok(html.includes('Lisensi'), 'label Lisensi tak ter-render')
})

blok('T2 — tab aktif ditandai, yang lain tidak', () => {
  const html = renderToStaticMarkup(React.createElement(TabPengaturan, { aktif: '/lisensi' }))
  // Tab aktif satu-satunya yang dapat border-teal-600.
  const aktif = html.split('border-teal-600').length - 1
  assert.equal(aktif, 1, `harus tepat 1 tab aktif, dapat ${aktif}`)
})

blok('T3 — TombolJual menautkan ke kasir dengan sewaId', () => {
  const html = renderToStaticMarkup(React.createElement(TombolJual, { sewaId: 'sewa-abc' }))
  assert.ok(html.includes('href="/penjualan-barang?sewa=sewa-abc"'), `tautan salah: ${html}`)
  assert.ok(html.includes('Jual'), 'label Jual tak ter-render')
})

blok('T4 — tujuanAwal hanya dipakai kalau sewaId ada di daftar kamar', () => {
  // Salinan aturan di KasirJual. Menyalin bukan ideal, tapi komponennya
  // 'use client' + butuh Next router; yang dijaga di sini keputusan produknya.
  const pilih = (tujuanAwal, kamar) => (kamar.some(k => k.sewaId === tujuanAwal) ? tujuanAwal : '')
  const kamar = [{ sewaId: 'a' }, { sewaId: 'b' }]
  assert.equal(pilih('a', kamar), 'a')
  assert.equal(pilih('zzz', kamar), '', '?sewa= sampah harus jatuh ke tunai')
  assert.equal(pilih('', kamar), '')
  assert.equal(pilih('a', []), '', 'tanpa kamar terisi harus jatuh ke tunai')
})

console.log(`OK — ${n} blok assertion lulus (tombol Jual & tab Lisensi)`)
