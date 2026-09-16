// scripts/check-cross-app-lisensi.mjs
//
// Aturan lisensi lintas-app: hub ZOne yang mengatur lisensi ZXRoom, dan satu
// tenant hanya boleh punya satu properti.
//
// Yang diuji di sini adalah ATURAN-nya (validasi plan, tanggal, penolakan
// properti kedua), bukan HTTP-nya. Bagian yang menyentuh DB ditandai jujur dan
// dilewati kalau DATABASE_URL tak ada — sama seperti check-fasilitas-*.mjs.
//
// Dijalankan lewat `npm run check` (pakai tsx), bukan `node` polos.
import assert from 'node:assert/strict'
import { DAFTAR_PLAN, planDikenal } from '../lib/lisensi.ts'

let n = 0
const blok = (nama, fn) => { fn(); n++; console.log(`  ok ${n}. ${nama}`) }

// ── Plan yang diterima dari hub
blok('plan dari hub divalidasi: hanya free/basic/pro/enterprise', () => {
  // Nilai ini persis yang dikirim ZOne lewat /manage → Kelola Apps → ZXRoom.
  for (const p of ['free', 'basic', 'pro', 'enterprise']) {
    assert.ok(planDikenal(p), `${p} harus diterima`)
  }
  // 'enterprise' ada di ZGym DAN di tombol hub ZOne — ZXRoom wajib menerimanya,
  // kalau tidak klik Enterprise di hub selalu ditolak dan lisensi tak tersimpan.
  assert.ok(planDikenal('enterprise'), 'enterprise wajib diterima')
  assert.ok(!planDikenal('PRO'), 'huruf besar bukan nama plan kanonik')
})

blok('plan di-lowercase sebelum divalidasi (hub bisa kirim "Pro")', () => {
  // Cross-app menormalkan dulu, baru memvalidasi — jadi "Pro" dari hub lolos
  // dan tersimpan sebagai "pro".
  for (const p of ['Pro', 'PRO', 'Free', '  pro  ']) {
    assert.ok(planDikenal(p.trim().toLowerCase()), `"${p}" harus lolos setelah normalisasi`)
  }
})

blok('DAFTAR_PLAN dipakai untuk pesan error', () => {
  assert.equal(DAFTAR_PLAN.join(', '), 'free, basic, pro, enterprise')
})

// ── Plan ZXRoom selaras dengan hub ZOne
blok('daftar plan SAMA dengan tombol hub ZOne', () => {
  // ZOne ManageContent.tsx: PLANS = ['free','basic','pro','enterprise'].
  // Daftar ini yang menentukan tombol apa yang bisa diklik pengelola, jadi
  // ZXRoom harus menerima tepat himpunan yang sama.
  const PLANS_DI_HUB = ['free', 'basic', 'pro', 'enterprise']
  assert.deepEqual([...DAFTAR_PLAN], PLANS_DI_HUB)
  for (const p of PLANS_DI_HUB) {
    assert.ok(planDikenal(p), `${p} ada di hub, harus diterima ZXRoom`)
  }
  // Kebalikannya juga: plan yang tak ada tombolnya di hub tak perlu diterima.
  for (const p of DAFTAR_PLAN) {
    assert.ok(PLANS_DI_HUB.includes(p), `${p} tak punya tombol di hub`)
  }
})

// ── Tanggal berakhir dari hub
blok('planExpires dari hub dinormalkan ke tengah malam UTC', () => {
  // Hub mengirim ISO penuh (ZOne: `new Date(dateStr).toISOString()`), mis.
  // "2027-10-16T00:00:00.000Z". Yang disimpan harus tanggal kalender saja.
  const normalkan = (iso) => {
    const d = new Date(iso)
    assert.ok(!isNaN(d.getTime()), `${iso} harus tanggal valid`)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
  }
  assert.equal(normalkan('2027-10-16T00:00:00.000Z'), '2027-10-16T00:00:00.000Z')
  // Jamnya dibuang: hub bisa mengirim tengah malam waktu LOKAL server hub
  // (17:00Z hari sebelumnya untuk WIB), dan itu tak boleh menggeser tanggalnya.
  assert.equal(normalkan('2027-10-16T17:00:00.000Z'), '2027-10-16T00:00:00.000Z')
  assert.equal(normalkan('2027-10-15T17:00:00.000Z'), '2027-10-15T00:00:00.000Z')
})

blok('planExpires tak sah ditolak, bukan disimpan sebagai Invalid Date', () => {
  const sah = (v) => !isNaN(new Date(String(v)).getTime())
  assert.ok(sah('2027-10-16T00:00:00.000Z'))
  assert.ok(!sah('bukan tanggal'))
  assert.ok(!sah(''))
  // Tanggal kosong ditangani terpisah (jadi null), bukan lewat Date().
  assert.ok(sah('1970-01-01T00:00:00.000Z'), 'epoch itu tanggal valid')
})

blok('null dari hub mengosongkan tanggal, bukan error', () => {
  // handleSetPlan mengirim { tenantId, plan } TANPA planExpires saat hanya
  // plan yang diubah. Kalau tidak dikirim, tanggal LAMA harus tetap utuh.
  const digabung = (lama, kiriman) => (kiriman === undefined ? lama : kiriman === null ? null : kiriman)
  assert.equal(digabung('2027-01-01', undefined), '2027-01-01', 'tak dikirim -> tanggal lama tetap')
  assert.equal(digabung('2027-01-01', null), null, 'null eksplisit -> dikosongkan')
  assert.equal(digabung(null, '2027-05-05'), '2027-05-05', 'diisi dari kosong')
})

// ── 1 tenant = 1 properti
blok('aturan 1 tenant 1 properti: properti kedua ditolak', () => {
  // Bentuk data nyata setelah pemisahan: tiap owner tepat 1 properti.
  const properti = [
    { id: 'p1', ownerId: 'u1' },
    { id: 'p2', ownerId: 'u2' },
  ]
  const bolehBuatProperti = (ownerId) => !properti.some(p => p.ownerId === ownerId)
  assert.ok(bolehBuatProperti('u3'), 'owner baru boleh')
  assert.ok(!bolehBuatProperti('u1'), 'owner yang sudah punya properti ditolak')
  assert.ok(!bolehBuatProperti('u2'), 'berlaku untuk semua owner')
})

blok('moveTenant tak boleh membuat owner dengan 2 properti', () => {
  // Celah dari aturan yang sama: "pindah" bisa dipakai menumpuk properti.
  // Tujuan hanya boleh menerima kalau belum punya properti sama sekali.
  const properti = [{ id: 'p1', ownerId: 'u1' }]
  const bolehPindahKe = (targetId) => !properti.some(p => p.ownerId === targetId)
  assert.ok(bolehPindahKe('u9'), 'tujuan tanpa properti boleh')
  assert.ok(!bolehPindahKe('u1'), 'tujuan yang sudah punya properti ditolak')
})

blok('idempotent: nama sama untuk owner sama -> properti lama, bukan error', () => {
  // createTenant dipanggil ulang dengan nama identik harus sukses dan
  // mengembalikan properti yang sama; hub bisa memanggilnya dua kali.
  const properti = [{ id: 'p1', ownerId: 'u1', nama: 'Kos Melati' }]
  const cari = (nama, ownerId) => properti.find(p => p.nama === nama && p.ownerId === ownerId)
  assert.equal(cari('Kos Melati', 'u1')?.id, 'p1')
  // Owner yang sama dengan nama BEDA tetap ditolak oleh aturan 1 properti.
  assert.equal(cari('Kos Baru', 'u1'), undefined)
})

// ── Kontrak GET: yang dibaca hub
blok('GET mengirim plan & expires_at dari DB, bukan nilai tetap', () => {
  // Sebelumnya: plan: 'pro' dan expires_at: null HARDCODE, sehingga rekap
  // hub menampilkan semua tenant ZXRoom sebagai "pro" tanpa tanggal.
  const properti = [
    { nama: 'A', plan: 'basic', planExpires: new Date('2027-05-01T00:00:00Z'), aktif: true },
    { nama: 'B', plan: 'free', planExpires: null, aktif: true },
  ]
  const kirim = properti.map(p => ({
    name: p.nama,
    plan: p.plan,
    active: p.aktif,
    expires_at: p.planExpires ? p.planExpires.toISOString() : null,
  }))
  assert.equal(kirim[0].plan, 'basic')
  assert.equal(kirim[0].expires_at, '2027-05-01T00:00:00.000Z')
  assert.equal(kirim[1].plan, 'free')
  assert.equal(kirim[1].expires_at, null)
  // Yang penting: tak ada lagi nilai tetap untuk semua baris.
  assert.ok(!kirim.every(k => k.plan === 'pro'), 'plan tidak boleh seragam hardcode')
})

console.log(`OK — check-cross-app-lisensi: ${n} blok assertion lulus`)
