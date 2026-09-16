// scripts/check-status-bayar.mjs
//
// MENGIMPOR lib/bayar.ts langsung (bukan menyalin) — salinan pernah terbukti
// tak menjaga apa pun (lihat skill zxroom: fallback jam diubah, test tetap hijau).
//
// Waktu ditulis UTC eksplisit, TIDAK pakai `new Date(y, m, d, ...)` (zona mesin),
// supaya lulus baik di dev ber-WIB maupun di runner TZ=UTC.

import assert from 'node:assert/strict'
import { ringkasBayar } from '../lib/bayar.ts'

let n = 0
const blok = (nama, fn) => { fn(); n++; console.log(`  ok ${n} — ${nama}`) }

// Jatuh tempo disimpan 00:00 UTC (pola repo ini).
const jt = (tgl) => new Date(`${tgl}T00:00:00.000Z`)
// Titik waktu ber-WIB: '2026-09-16T10:00+07:00'.
const saat = (iso) => new Date(iso)
const t = (nominal, status, jatuhTempo = jt('2026-09-20')) => ({ nominal, status, jatuhTempo })

blok('tanpa tagihan → LUNAS (sewa gratis, bukan tunggakan)', () => {
  const r = ringkasBayar([], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'LUNAS')
  assert.equal(r.sisa, 0)
  assert.equal(r.jumlahTagihan, 0)
})

blok('tagihan LUNAS → LUNAS, sisa 0', () => {
  const r = ringkasBayar([t(500000, 'LUNAS')], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'LUNAS')
  assert.equal(r.total, 500000)
  assert.equal(r.sisa, 0)
})

blok('BELUM_BAYAR, belum jatuh tempo → BELUM_BAYAR, sisa penuh', () => {
  const r = ringkasBayar([t(500000, 'BELUM_BAYAR')], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'BELUM_BAYAR')
  assert.equal(r.sisa, 500000)
})

blok('BELUM_BAYAR, sudah lewat jatuh tempo → TERLAMBAT', () => {
  const r = ringkasBayar([t(500000, 'BELUM_BAYAR')], saat('2026-09-21T09:00+07:00'))
  assert.equal(r.status, 'TERLAMBAT')
  assert.equal(r.sisa, 500000)
})

blok('satu lunas, satu belum → SEBAGIAN, sisa hanya yang belum', () => {
  const r = ringkasBayar(
    [t(300000, 'LUNAS'), t(200000, 'BELUM_BAYAR')],
    saat('2026-09-16T10:00+07:00'),
  )
  assert.equal(r.status, 'SEBAGIAN')
  assert.equal(r.total, 500000)
  assert.equal(r.lunas, 300000)
  assert.equal(r.sisa, 200000)
  assert.equal(r.jumlahTagihan, 2)
})

blok('SEBAGIAN menang atas TERLAMBAT (tak ada dua status sekaligus)', () => {
  const r = ringkasBayar(
    [t(300000, 'LUNAS'), t(200000, 'BELUM_BAYAR', jt('2026-01-01'))],
    saat('2026-09-16T10:00+07:00'),
  )
  assert.equal(r.status, 'SEBAGIAN')
})

blok('DIBATALKAN diabaikan: tak memaksa SEBAGIAN, tak masuk sisa', () => {
  const r = ringkasBayar(
    [t(300000, 'LUNAS'), t(999000, 'DIBATALKAN')],
    saat('2026-09-16T10:00+07:00'),
  )
  assert.equal(r.status, 'LUNAS')
  assert.equal(r.total, 300000)
  assert.equal(r.sisa, 0)
  assert.equal(r.jumlahTagihan, 1)
})

blok('hanya DIBATALKAN → LUNAS, sisa 0 (tak ada kewajiban)', () => {
  const r = ringkasBayar([t(400000, 'DIBATALKAN')], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'LUNAS')
  assert.equal(r.sisa, 0)
})

blok('batas TERLAMBAT = akhir hari WIB, bukan 07:00 WIB', () => {
  const jt21 = t(1, 'BELUM_BAYAR', jt('2026-09-21'))
  // jatuhTempo 21 Sep 00:00 UTC = 21 Sep 07:00 WIB. Lewat berarti setelah
  // 21 Sep 23:59:59 WIB — jadi 21 Sep 23:00 WIB masih BELUM_BAYAR…
  const s21 = ringkasBayar([jt21], saat('2026-09-21T23:00+07:00'))
  assert.equal(s21.status, 'BELUM_BAYAR')
  // …dan 22 Sep 00:30 WIB sudah TERLAMBAT.
  const s22 = ringkasBayar([jt21], saat('2026-09-22T00:30+07:00'))
  assert.equal(s22.status, 'TERLAMBAT')
  // Kalau batasnya salah pakai 07:00 WIB (bukan akhir hari), 21 Sep 23:00 WIB
  // sudah dicap TERLAMBAT — assertion di atas akan gagal.
})

blok('tagihan ber-status SEBAGIAN sendiri → SEBAGIAN, bukan BELUM_BAYAR', () => {
  // Ditemukan dari data prod (kamar B 201): satu tagihan ber-status SEBAGIAN
  // (dibayar sebagian), bukan "sebagian tagihan lunas". Status baris dihormati.
  const r = ringkasBayar([t(2200000, 'SEBAGIAN')], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'SEBAGIAN')
  assert.equal(r.sisa, 2200000)
})

blok('SEBAGIAN yang lewat jatuh tempo tetap SEBAGIAN (bukan TERLAMBAT)', () => {
  // Juga dari prod: jatuh tempo 9 Sep, sekarang 16 Sep, status tagihan SEBAGIAN.
  const r = ringkasBayar([t(2200000, 'SEBAGIAN', jt('2026-09-09'))], saat('2026-09-16T10:00+07:00'))
  assert.equal(r.status, 'SEBAGIAN')
})

blok('SEBAGIAN dan TERLAMBAT tak pernah muncul bersamaan', () => {
  const kombinasi = [
    [t(1, 'LUNAS'), t(2, 'BELUM_BAYAR', jt('2000-01-01'))],
    [t(1, 'SEBAGIAN')],
    [t(1, 'BELUM_BAYAR', jt('2000-01-01'))],
  ]
  for (const k of kombinasi) {
    const r = ringkasBayar(k, saat('2026-09-16T10:00+07:00'))
    assert.ok(['LUNAS', 'SEBAGIAN', 'BELUM_BAYAR', 'TERLAMBAT'].includes(r.status))
    assert.ok(r.sisa >= 0 && r.sisa <= r.total)
  }
})

blok('nominal Decimal (string) dijumlahkan sebagai angka', () => {
  const r = ringkasBayar(
    [{ nominal: '150000', status: 'LUNAS', jatuhTempo: jt('2026-09-20') },
     { nominal: '50000', status: 'LUNAS', jatuhTempo: jt('2026-09-20') }],
    saat('2026-09-16T10:00+07:00'),
  )
  assert.equal(r.total, 200000)
})

console.log(`\nOK — check-status-bayar: ${n} blok assertion lulus`)
