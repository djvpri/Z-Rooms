// scripts/check-lisensi.mjs
//
// Aturan lisensi properti: status dari tanggal berakhir, dan perpanjangan.
//
// Semuanya MURNI (lib/lisensi.ts tak menyentuh DB), jadi diuji langsung dengan
// waktu yang dipatok — hasilnya sama kapan pun dijalankan.
//
// Dijalankan lewat `npm run check` (pakai tsx). Jalankan dengan `node` polos
// akan gagal: Node tak paham sintaks TypeScript.
import assert from 'node:assert/strict'
import {
  PLANS, DAFTAR_PLAN, planDikenal, labelPlan, hargaPlan,
  sisaHari, statusLisensi, kalimatStatus, perpanjang, AMBANG_SEGERA_HABIS,
} from '../lib/lisensi.ts'

let n = 0
const blok = (nama, fn) => { fn(); n++; console.log(`  ok ${n}. ${nama}`) }

const SEKARANG = new Date('2026-09-16T05:00:00Z')  // 12:00 WIB

// ── Plan dikenal
blok('plan dikenal dikenali', () => {
  assert.ok(planDikenal('free'))
  assert.ok(planDikenal('enterprise'))
  assert.ok(!planDikenal('business'), 'business BUKAN plan — hub kirim enterprise')
  assert.ok(!planDikenal(''))
  assert.ok(!planDikenal(null))
  assert.ok(!planDikenal(undefined))
  // Bukan properti yang diwarisi dari Object.prototype.
  assert.ok(!planDikenal('toString'), 'toString tak boleh dianggap plan')
  assert.ok(!planDikenal('constructor'), 'constructor tak boleh dianggap plan')
})

blok('label plan: dikenal -> label, tak dikenal -> Free', () => {
  assert.equal(labelPlan('free'), 'Free')
  assert.equal(labelPlan('pro'), 'Pro')
  assert.equal(labelPlan('enterprise'), 'Enterprise')
  assert.equal(labelPlan(null), 'Free')
  assert.equal(labelPlan('sampah'), 'Free')
})

blok('harga plan: tak dikenal -> 0', () => {
  assert.equal(hargaPlan('free'), 0)
  assert.equal(hargaPlan('basic'), 100000)
  assert.equal(hargaPlan('enterprise'), 1000000)
  assert.equal(hargaPlan('sampah'), 0)
  assert.equal(hargaPlan(null), 0)
})

blok('DAFTAR_PLAN & PLANS sinkron', () => {
  assert.deepEqual(DAFTAR_PLAN, ['free', 'basic', 'pro', 'enterprise'])
  for (const p of DAFTAR_PLAN) assert.ok(PLANS[p], `${p} harus ada di PLANS`)
})

// ── sisaHari
blok('sisaHari: null/kosong -> null', () => {
  assert.equal(sisaHari(null), null)
  assert.equal(sisaHari(undefined), null)
  assert.equal(sisaHari(''), null)
  assert.equal(sisaHari('bukan tanggal'), null)
})

blok('sisaHari dibulatkan ke ATAS (sisa beberapa jam masih hari ini)', () => {
  // 3 jam lagi -> masih 1 hari, bukan 0. Kalau 0, UI bilang "sisa 0 hari"
  // padahal belum habis — membingungkan.
  assert.equal(sisaHari(new Date('2026-09-16T08:00:00Z'), SEKARANG), 1)
  // Tepat sekarang -> 0
  assert.equal(sisaHari(new Date('2026-09-16T05:00:00Z'), SEKARANG), 0)
  // Sudah lewat 1 jam -> -1
  assert.equal(sisaHari(new Date('2026-09-16T04:00:00Z'), SEKARANG), -1)
  // Penuh 10 hari
  assert.equal(sisaHari(new Date('2026-09-26T05:00:00Z'), SEKARANG), 10)
})

// ── statusLisensi
blok('statusLisensi: belum diatur', () => {
  assert.equal(statusLisensi(null, SEKARANG), 'belum-diatur')
  assert.equal(statusLisensi(undefined, SEKARANG), 'belum-diatur')
})

blok('statusLisensi: habis kalau sisa negatif', () => {
  assert.equal(statusLisensi(new Date('2026-09-15T05:00:00Z'), SEKARANG), 'habis')
  assert.equal(statusLisensi(new Date('2020-01-01T00:00:00Z'), SEKARANG), 'habis')
})

blok('statusLisensi: tepat hari terakhir BELUM habis', () => {
  // Sisa 0 = hari terakhir, masih berlaku. Penting: kalau 0 dianggap habis,
  // lisensi mati sehari lebih awal.
  assert.equal(statusLisensi(new Date('2026-09-16T05:00:00Z'), SEKARANG), 'segera-habis')
})

blok('statusLisensi: batas segera-habis', () => {
  const hari = (h) => new Date(SEKARANG.getTime() + h * 86400000)
  assert.equal(statusLisensi(hari(1), SEKARANG), 'segera-habis')
  assert.equal(statusLisensi(hari(AMBANG_SEGERA_HABIS), SEKARANG), 'segera-habis')
  // Lewat ambang satu hari -> aktif
  assert.equal(statusLisensi(hari(AMBANG_SEGERA_HABIS + 1), SEKARANG), 'aktif')
  assert.equal(statusLisensi(hari(60), SEKARANG), 'aktif')
  assert.equal(AMBANG_SEGERA_HABIS, 14, 'ambang harus 14 hari seperti ZGym')
})

blok('statusLisensi terima string ISO, bukan cuma Date', () => {
  // 16 Sep -> 16 Okt = 30 hari, di atas ambang 14.
  assert.equal(statusLisensi('2026-10-16T05:00:00.000Z', SEKARANG), 'aktif')
  assert.equal(statusLisensi('2026-09-26T05:00:00.000Z', SEKARANG), 'segera-habis')
  assert.equal(statusLisensi('2026-09-10T05:00:00.000Z', SEKARANG), 'habis')
})

// ── kalimatStatus
blok('kalimatStatus: tak ada teks kosong/undefined', () => {
  assert.equal(kalimatStatus('belum-diatur', null), 'Tanggal berakhir belum diatur.')
  assert.match(kalimatStatus('habis', -5), /berakhir 5 hari lalu/)
  assert.match(kalimatStatus('segera-habis', 3), /Sisa 3 hari/)
  assert.match(kalimatStatus('aktif', 40), /sisa 40 hari/)
  for (const s of ['belum-diatur', 'habis', 'segera-habis', 'aktif']) {
    const t = kalimatStatus(s, 3)
    assert.ok(typeof t === 'string' && t.length > 0, `${s} harus punya kalimat`)
    assert.ok(!/undefined|NaN|null/.test(t), `${s} tak boleh bocorkan undefined: "${t}"`)
  }
})

// ── perpanjang
blok('perpanjang dari lisensi yang masih aktif MENYAMBUNG, tak memotong sisa', () => {
  // Aktif sampai 1 Des 2026, perpanjang 1 bulan -> 1 Jan 2027, bukan 16 Okt.
  const dasar = new Date('2026-12-01T00:00:00Z')
  assert.equal(perpanjang(1, dasar, SEKARANG).toISOString(), '2027-01-01T00:00:00.000Z')
  assert.equal(perpanjang(12, dasar, SEKARANG).toISOString(), '2027-12-01T00:00:00.000Z')
})

blok('perpanjang dari lisensi yang sudah HABIS dihitung dari sekarang', () => {
  const lampau = new Date('2026-01-01T00:00:00Z')
  // Dasar = SEKARANG (16 Sep 2026) + 1 bulan -> 16 Okt 2026.
  // Hasilnya tengah malam UTC: planExpires adalah TANGGAL kalender, bukan
  // titik waktu, jadi jamnya sengaja dinormalkan.
  assert.equal(perpanjang(1, lampau, SEKARANG).toISOString(), '2026-10-16T00:00:00.000Z')
})

blok('perpanjang tanpa tanggal -> dari sekarang', () => {
  assert.equal(perpanjang(3, null, SEKARANG).toISOString(), '2026-12-16T00:00:00.000Z')
  assert.equal(perpanjang(1, undefined, SEKARANG).toISOString(), '2026-10-16T00:00:00.000Z')
})

blok('perpanjang menormalkan jam ke tengah malam UTC', () => {
  // Tanggal berakhir tersimpan sebagai tanggal kalender. Kalau jamnya ikut
  // terbawa, "berlaku hingga 16 Okt" bisa tampil 16 Okt 12:00 WIB — dan sisa
  // harinya berbeda satu hari tergantung jam berapa halaman dibuka.
  const siang = new Date('2026-10-16T13:45:12.345Z')
  assert.equal(perpanjang(1, siang, SEKARANG).toISOString(), '2026-11-16T00:00:00.000Z')
})

blok('perpanjang menjepit akhir bulan (31 Jan + 1 bulan = 28/29 Feb)', () => {
  // Semua tanggal di sini HARUS di masa depan relatif SEKARANG (16 Sep 2026):
  // kalau sudah lewat, perpanjang() memakai SEKARANG sebagai dasar dan
  // penjepitan akhir bulan tak ikut teruji.
  // Bug klasik setMonth: 31 Jan + 1 bulan meluber ke 3 Maret.
  assert.equal(perpanjang(1, new Date('2027-01-31T00:00:00Z'), SEKARANG).toISOString(), '2027-02-28T00:00:00.000Z')
  // 2028 kabisat -> 29 Feb
  assert.equal(perpanjang(1, new Date('2028-01-31T00:00:00Z'), SEKARANG).toISOString(), '2028-02-29T00:00:00.000Z')
  // 31 Mar + 1 bulan = 30 Apr
  assert.equal(perpanjang(1, new Date('2027-03-31T00:00:00Z'), SEKARANG).toISOString(), '2027-04-30T00:00:00.000Z')
  // 31 Des + 1 bulan -> 31 Jan tahun berikutnya (tak terjepit)
  assert.equal(perpanjang(1, new Date('2027-12-31T00:00:00Z'), SEKARANG).toISOString(), '2028-01-31T00:00:00.000Z')
  // 30 hari di bulan 31 hari: 30 Apr + 1 bulan = 30 Mei (hari terakhir lebih besar)
  assert.equal(perpanjang(1, new Date('2027-04-30T00:00:00Z'), SEKARANG).toISOString(), '2027-05-30T00:00:00.000Z')
})

blok('perpanjang: hasilnya selalu di masa depan', () => {
  for (const bulan of [1, 3, 6, 12]) {
    const h = perpanjang(bulan, new Date('2026-09-01T00:00:00Z'), SEKARANG)
    assert.ok(h.getTime() > SEKARANG.getTime(), `+${bulan} bulan harus di depan`)
  }
})

blok('perpanjang dua kali berturut-turut menambah 2x', () => {
  // Dasar 16 Sep 2026 05:00Z (masa depan relatif SEKARANG? tidak — sama).
  // Pakai tanggal yang jelas di depan supaya dasarnya dipakai apa adanya.
  const awal = new Date('2026-09-16T05:00:00Z')   // == SEKARANG
  const sekali = perpanjang(6, awal, SEKARANG)
  assert.equal(sekali.toISOString(), '2027-03-16T00:00:00.000Z')
  const dua = perpanjang(6, sekali, SEKARANG)
  assert.equal(dua.toISOString(), '2027-09-16T00:00:00.000Z')
  // Dua kali 6 bulan = 12 bulan dari awal, bukan 6 bulan dari sekarang.
  assert.equal(dua.getUTCFullYear(), 2027)
  assert.equal(dua.getUTCMonth(), 8)   // September (0-index)
  assert.equal(dua.getUTCDate(), 16)
})

console.log(`OK — check-lisensi: ${n} blok assertion lulus`)
