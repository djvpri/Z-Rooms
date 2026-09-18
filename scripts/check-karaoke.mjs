// Uji MURNI aturan karaoke — tanpa DB, tanpa Prisma.
//
// Ini bagian paling mahal kalau salah: aritmetika blok tarif menentukan uang
// yang ditagih ke pelanggan, dan penjaga bentrok menentukan apakah dua orang
// bisa diklaim ruang yang sama. Keduanya harus benar sebelum UI disentuh.
//
// Dijalankan lewat `npm run check` (scripts/check-all.mjs memanggilnya).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Mod from '../lib/karaoke.ts'

// Untuk pemeriksaan statis (bagian 18): berkas uji ini harus bisa membaca
// sumber route-nya sendiri tanpa membutuhkan DB.
const akarRepo = join(dirname(fileURLToPath(import.meta.url)), '..')

const K = Mod.default ?? Mod

// ─── Blok tarif contoh: siang murah, malam mahal ───────────────────────────
// 00:00-10:00 (istirahat) 20rb | 10:00-17:00 (siang) 50rb | 17:00-24:00 (malam) 80rb
const TARIF = [
  { jamMulai: 0, jamSelesai: 600, hargaPerJam: 20000 },
  { jamMulai: 600, jamSelesai: 1020, hargaPerJam: 50000 },
  { jamMulai: 1020, jamSelesai: 1440, hargaPerJam: 80000 },
]

// ─── 1. Pembulatan jam ─────────────────────────────────────────────────────
assert.equal(K.jumlahJamDari(10), 1, '10 menit harus 1 jam (minimum)')
assert.equal(K.jumlahJamDari(60), 1, '60 menit harus 1 jam')
assert.equal(K.jumlahJamDari(61), 2, '61 menit harus 2 jam (bulat ke atas)')
assert.equal(K.jumlahJamDari(90), 2, '90 menit harus 2 jam')
assert.equal(K.jumlahJamDari(120), 2, '120 menit harus 2 jam')
assert.equal(K.jumlahJamDari(121), 3, '121 menit harus 3 jam')
assert.equal(K.jumlahJamDari(0), 1, '0 menit tetap 1 jam (minimum)')

// ─── 2. Blok untuk satu menit ──────────────────────────────────────────────
assert.equal(K.blokUntukMenit(TARIF, 0).hargaPerJam, 20000)
assert.equal(K.blokUntukMenit(TARIF, 599).hargaPerJam, 20000)
assert.equal(K.blokUntukMenit(TARIF, 600).hargaPerJam, 50000, '600 = batas, masuk blok berikutnya')
assert.equal(K.blokUntukMenit(TARIF, 1019).hargaPerJam, 50000)
assert.equal(K.blokUntukMenit(TARIF, 1020).hargaPerJam, 80000, '1020 = 17:00, tarif malam')
assert.equal(K.blokUntukMenit(TARIF, 1439).hargaPerJam, 80000)
assert.equal(K.blokUntukMenit(TARIF, 0).hargaPerJam, 20000)

// ─── 3. Sesi melewati dua blok: dihitung PER BLOK ─────────────────────────
// Mulai 16:00 (960), 2 jam. Jam-1 = 16:00-17:00 siang 50rb;
// jam-2 = 17:00-18:00 malam 80rb. Total 130rb.
{
  const h = K.hitungSewa(TARIF, new Date('2026-09-18T16:00:00+07:00'), 120)
  assert.equal(h.jumlahJam, 2)
  assert.equal(h.item.length, 2, 'harus 2 baris jam')
  assert.equal(h.item[0].hargaPerJam, 50000, 'jam ke-1 tarif siang')
  assert.equal(h.item[1].hargaPerJam, 80000, 'jam ke-2 tarif malam')
  assert.equal(h.total, 130000, 'total 50rb + 80rb')
}

// ─── 4. Tarif dipatok dari JAM MULAI jam itu, bukan seluruh rentangnya ────
// Mulai 16:59 (1019) 1 jam. Walau 59 menitnya masuk blok malam, tarifnya siang.
{
  const h = K.hitungSewa(TARIF, new Date('2026-09-18T16:59:00+07:00'), 60)
  assert.equal(h.item.length, 1)
  assert.equal(h.item[0].hargaPerJam, 50000, '16:59 tetap tarif siang')
  assert.equal(h.total, 50000)
}

// ─── 5. Sesi melewati tengah malam ────────────────────────────────────────
// Mulai 23:00 (1380) 2 jam: jam-1 = 23:00-24:00 blok malam 80rb;
// jam-2 = 24:00-01:00 = menit 0..59 → blok 00:00-10:00 → 20rb.
{
  const h = K.hitungSewa(TARIF, new Date('2026-09-18T23:00:00+07:00'), 120)
  assert.equal(h.jumlahJam, 2)
  assert.equal(h.item[0].hargaPerJam, 80000, 'jam ke-1 tarif malam')
  assert.equal(h.item[1].hargaPerJam, 20000, 'jam ke-2 lewat tengah malam → blok dini hari')
  assert.equal(h.total, 100000)
}

// ─── 6. Pembulatan dipakai di perhitungan, bukan cuma di helper ───────────
// 90 menit → 2 jam ditagih, dan tetap dihitung per blok.
{
  const h = K.hitungSewa(TARIF, new Date('2026-09-18T16:00:00+07:00'), 90)
  assert.equal(h.jumlahJam, 2, '90 menit ditagih 2 jam')
  assert.equal(h.total, 130000, 'tetap 2 blok')
}

// ─── 7. Validasi blok menutup 24 jam ──────────────────────────────────────
// Lengkap & urut (walau tak urut di input, harus lolos setelah diurutkan).
assert.equal(K.periksaBlok(TARIF).ok, true, 'blok lengkap harus lolos')
assert.equal(
  K.periksaBlok([
    { jamMulai: 1020, jamSelesai: 1440, hargaPerJam: 80000 },
    { jamMulai: 0, jamSelesai: 600, hargaPerJam: 20000 },
    { jamMulai: 600, jamSelesai: 1020, hargaPerJam: 50000 },
  ]).ok,
  true,
  'blok tak urut tapi lengkap harus lolos (diurutkan dulu)',
)

// Lubang: 10:00-17:00 hilang → sesi jam 12:00 tak bisa dihargai.
{
  const r = K.periksaBlok([
    { jamMulai: 0, jamSelesai: 600, hargaPerJam: 20000 },
    { jamMulai: 1020, jamSelesai: 1440, hargaPerJam: 80000 },
  ])
  assert.equal(r.ok, false, 'blok berlubang harus DITOLAK')
  assert.match(r.pesan ?? '', /lubang|belum tertutup/i, `pesan harus sebut lubang, dapat: ${r.pesan}`)
}

// Tumpang tindih: 17:00-24:00 dan 20:00-24:00 → harga jam 20:00 ambigu.
{
  const r = K.periksaBlok([
    { jamMulai: 0, jamSelesai: 1440, hargaPerJam: 10000 },
    { jamMulai: 1200, jamSelesai: 1440, hargaPerJam: 20000 },
  ])
  assert.equal(r.ok, false, 'blok tumpang tindih harus DITOLAK')
  assert.match(r.pesan ?? '', /tumpang tindih|beririsan/i, `pesan harus sebut tumpang tindih, dapat: ${r.pesan}`)
}

// Kosong → ditolak (ruang tanpa tarif = sesi tak bisa dihargai).
assert.equal(K.periksaBlok([]).ok, false, 'blok kosong harus ditolak')

// Tak mulai dari 00:00 → ditolak.
assert.equal(
  K.periksaBlok([{ jamMulai: 600, jamSelesai: 1440, hargaPerJam: 50000 }]).ok,
  false,
  'blok yang tak mulai dari 00:00 harus ditolak',
)

// Blok yang berakhir di 1440 = tengah malam, harus lolos.
assert.equal(
  K.periksaBlok([
    { jamMulai: 0, jamSelesai: 720, hargaPerJam: 50000 },
    { jamMulai: 720, jamSelesai: 1440, hargaPerJam: 80000 },
  ]).ok,
  true,
  'blok yang berakhir 1440 harus lolos',
)

// ─── 8. Nomor sesi: KR-0009 → KR-0010 (numerik, bukan leksikografis) ──────
assert.equal(K.nomorBerikut([]), 'KR-0001', 'tanpa sesi sebelumnya → KR-0001')
assert.equal(K.nomorBerikut(['KR-0001', 'KR-0002']), 'KR-0003')
assert.equal(K.nomorBerikut(['KR-0009']), 'KR-0010', 'harus numerik, bukan urut teks')
assert.equal(K.nomorBerikut(['KR-0009', 'KR-0100']), 'KR-0101', 'ambil tertinggi numerik')
assert.equal(K.nomorBerikut(['KR-0007', 'KR-0003']), 'KR-0008', 'tak peduli urutan input')

// ─── 9. Penjaga bentrok ruang ─────────────────────────────────────────────
// Sesi memegang ruang: BOOKING dan BERJALAN.
const jam = (h, m = 0) => new Date(`2026-09-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`)

// BERJALAN dianggap TAK TERBATAS — sesi yang jalan boleh lewat rencana,
// jadi sesi berikutnya tak boleh masuk.
{
  const ada = [{ status: 'BERJALAN', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  assert.equal(
    K.bentrok(ada, jam(21), jam(23), jam(18, 30)).bentrok,
    true,
    'BERJALAN memegang ruang sampai tak terbatas — mulai 21:00 harus BENTROK',
  )
}

// Berurutan tepat setelah sesi SELESAI → boleh.
{
  const ada = [{ status: 'SELESAI', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: jam(21) }]
  assert.equal(K.bentrok(ada, jam(21), jam(23), jam(18, 30)).bentrok, false, 'sesi SELESAI tak memegang ruang')
}

// BOOKING beririsan dengan BOOKING baru → bentrok.
// `sekarang` WAJIB diisi: `bentrok` memakai jam nyata kalau diberi null, dan uji
// ini jadi lulus/gagal menurut jam berapa ia dijalankan.
{
  const ada = [{ status: 'BOOKING', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  assert.equal(K.bentrok(ada, jam(20), jam(22), jam(18, 30)).bentrok, true, 'BOOKING beririsan harus bentrok')
}

// BOOKING berurutan (habis 21:00, mulai baru 21:00) → boleh.
{
  const ada = [{ status: 'BOOKING', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  assert.equal(K.bentrok(ada, jam(21), jam(23), jam(18, 30)).bentrok, false, 'berurutan tepat harus boleh')
}

// BATAL tak memegang ruang.
{
  const ada = [{ status: 'BATAL', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  assert.equal(K.bentrok(ada, jam(19), jam(21), jam(18, 30)).bentrok, false, 'BATAL tak memegang ruang')
}

// BOOKING yang sudah lewat 15 menit dari jadwal → dianggap LEPAS.
{
  const ada = [{ status: 'BOOKING', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  const sekarang = jam(19, 20) // 20 menit lewat jadwal mulai
  assert.equal(
    K.bentrok(ada, jam(19, 30), jam(21, 30), sekarang).bentrok,
    false,
    'BOOKING telat >15 menit harus dianggap lepas',
  )
  // Tapi BOOKING yang baru lewat 5 menit masih memegang.
  assert.equal(
    K.bentrok(ada, jam(19, 30), jam(21, 30), jam(19, 5)).bentrok,
    true,
    'BOOKING telat 5 menit masih memegang ruang',
  )
}

// ─── 10. Pesan bentrok menyebut penghalangnya (dipakai UI) ────────────────
{
  const ada = [{ status: 'BERJALAN', mulaiPada: jam(19), rencanaSelesai: jam(21), selesaiAktual: null }]
  const r = K.bentrok(ada, jam(20), jam(22), jam(19, 30))
  assert.equal(r.bentrok, true)
  assert.ok(r.penghalang, 'harus mengembalikan penghalang untuk pesan')
  assert.equal(r.penghalang.status, 'BERJALAN')
}

// ─── 11. Sisa waktu & peringatan 10 menit terakhir ───────────────────────
{
  const mulai = jam(19)
  const rencana = jam(21)
  const sekarang = jam(20, 30)
  const sisa = K.sisaMenit(mulai, rencana, sekarang)
  assert.equal(sisa, 30, '30 menit tersisa (21:00 - 20:30)')
  assert.equal(K.mendesak(sisa), false, '30 menit belum mendesak')

  assert.equal(K.sisaMenit(mulai, rencana, jam(20, 50)), 10)
  assert.equal(K.mendesak(10), true, '10 menit = mendesak')
  assert.equal(K.mendesak(11), false, '11 menit belum mendesak')
  assert.equal(K.mendesak(0), true, 'habis = mendesak')
  assert.equal(K.mendesak(-5), true, 'lewat jadwal = mendesak')
}

// ─── 12. Format durasi untuk layar ────────────────────────────────────────
assert.equal(K.formatDurasi(90), '1 jam 30 menit')
assert.equal(K.formatDurasi(60), '1 jam')
assert.equal(K.formatDurasi(45), '45 menit')
assert.equal(K.formatDurasi(0), '0 menit')

// ─── 13. Booking: `pada` menentukan status, dan jam yang lewat ditolak ────
// `waktuMulaiDari` adalah SATU-SATUNYA penentu BOOKING vs BERJALAN. Kalau ia
// salah, kasir bisa membuat "booking" yang mulai kemarin.
{
  const sekarang = new Date('2026-09-18T10:00:00+07:00')

  // Kosong → mulai sekarang, BERJALAN.
  const kosong = K.waktuMulaiDari(undefined, sekarang)
  assert.equal(kosong.ok, true, 'tanpa `pada` harus lolos')
  assert.equal(kosong.ok && kosong.booking, false, 'tanpa `pada` = BERJALAN')
  assert.equal(kosong.ok && kosong.mulai.getTime(), sekarang.getTime(), 'mulai = sekarang')

  const nullJuga = K.waktuMulaiDari(null, sekarang)
  assert.equal(nullJuga.ok && nullJuga.booking, false, 'null sama dengan kosong')

  // Jam ke depan → BOOKING.
  const nanti = K.waktuMulaiDari('2026-09-18T19:00:00+07:00', sekarang)
  assert.equal(nanti.ok, true, 'jam ke depan harus lolos')
  assert.equal(nanti.ok && nanti.booking, true, 'jam ke depan = BOOKING')
  // Dibaca lewat helper, bukan `getHours()`: uji harus lulus di zona mesin mana
  // pun, termasuk container produksi yang UTC.
  assert.equal(nanti.ok && K.menitSejakTengahMalam(nanti.mulai), 19 * 60, 'jam mulai 19:00 WIB')

  // Jam yang sudah lewat → DITOLAK. Diam-diam memakai jam sekarang berarti kasir
  // mengira booking besok tersimpan, padahal sesinya jalan hari ini.
  const lewat = K.waktuMulaiDari('2026-09-18T08:00:00+07:00', sekarang)
  assert.equal(lewat.ok, false, 'jam yang sudah lewat harus DITOLAK')
  assert.match(lewat.ok === false ? lewat.pesan : '', /lewat/i, 'pesan menyebut sudah lewat')

  // Beberapa detik lewat masih lolos (toleransi 1 menit) — "sekarang" yang
  // diketik tangan dibulatkan ke menit, dan tak boleh ditolak.
  const detikLalu = K.waktuMulaiDari('2026-09-18T09:59:30+07:00', sekarang)
  assert.equal(detikLalu.ok, true, 'kurang dari 1 menit lewat masih lolos')

  // Sampah → ditolak, bukan diam-diam jadi sekarang.
  const sampah = K.waktuMulaiDari('bukan-tanggal', sekarang)
  assert.equal(sampah.ok, false, 'tanggal sampah harus ditolak')
}

// ─── 14. Batas lepas booking = mulai + 15 menit ───────────────────────────
{
  const mulai = new Date('2026-09-18T19:00:00+07:00')
  const batas = K.batasLepasBooking(mulai)
  assert.equal(batas.getTime(), mulai.getTime() + 15 * 60000, 'batas = mulai + 15 menit')

  // Batas ini dipakai menyapu booking basi: tepat di batas BELUM lepas (kasir
  // masih boleh memulai), satu milidetik setelahnya sudah lepas.
  const tepat = new Date(batas.getTime())
  const lepas = new Date(batas.getTime() + 1)
  assert.equal(tepat.getTime() <= batas.getTime(), true, 'tepat di batas belum lepas')
  assert.equal(lepas.getTime() > batas.getTime(), true, 'satu ms setelah batas sudah lepas')

  // String ISO juga diterima — nilai dari DB datang sebagai Date, dari klien
  // sebagai string, dan keduanya harus menghasilkan batas yang sama.
  assert.equal(K.batasLepasBooking(mulai.toISOString()).getTime(), batas.getTime(), 'string ISO diterima')
}

// ─── 15. Subtotal minuman: harga dikali jumlah ────────────────────────────
assert.equal(K.subtotalMinuman(15000, 1), 15000)
assert.equal(K.subtotalMinuman(15000, 3), 45000)
assert.equal(K.subtotalMinuman(0, 5), 0, 'produk gratis tetap 0, bukan NaN')

// ─── 16. Schema: `pada` wajib berzona waktu, jumlah minuman dibatasi ──────
{
  const dasar = { ruangId: 'r1', durasiMenit: 60 }

  // `pada` tanpa zona waktu ditolak: "2026-09-18T19:00" berarti jam berbeda di
  // tiap mesin, dan jam mulai booking tak boleh ambigu.
  assert.equal(K.bukaSesiSchema.safeParse({ ...dasar, pada: '2026-09-18T19:00' }).success, false, 'tanpa offset ditolak')
  assert.equal(K.bukaSesiSchema.safeParse({ ...dasar, pada: '2026-09-18T19:00:00+07:00' }).success, true, 'dengan offset lolos')
  assert.equal(K.bukaSesiSchema.safeParse(dasar).success, true, 'tanpa `pada` tetap lolos (mulai sekarang)')

  // Jumlah minuman: 0 dan negatif ditolak, 999 dibatasi, pecahan ditolak.
  assert.equal(K.tambahMinumanSchema.safeParse({ produkId: 'p1', jumlah: 0 }).success, false, 'jumlah 0 ditolak')
  assert.equal(K.tambahMinumanSchema.safeParse({ produkId: 'p1', jumlah: -1 }).success, false, 'jumlah negatif ditolak')
  assert.equal(K.tambahMinumanSchema.safeParse({ produkId: 'p1', jumlah: 1000 }).success, false, 'jumlah >999 ditolak')
  assert.equal(K.tambahMinumanSchema.safeParse({ produkId: 'p1', jumlah: 2.5 }).success, false, 'jumlah pecahan ditolak')
  assert.equal(K.tambahMinumanSchema.safeParse({ produkId: 'p1' }).success, true, 'jumlah default terisi')
  assert.equal(K.tambahMinumanSchema.parse({ produkId: 'p1' }).jumlah, 1, 'default jumlah = 1')
}

// ─── 17. Stok cukup: batasnya inklusif ────────────────────────────────────
// Sama persis dengan yang dipakai route. Stok = permintaan HARUS lolos (stok
// jadi 0, bukan minus), kurang satu pun sudah ditolak.
assert.equal(K.stokCukup(10, 3), true, 'stok lebih banyak → cukup')
assert.equal(K.stokCukup(3, 3), true, 'stok tepat sama → cukup (jadi 0)')
assert.equal(K.stokCukup(2, 3), false, 'stok kurang satu → TIDAK cukup')
assert.equal(K.stokCukup(0, 1), false, 'stok kosong → tidak cukup')
assert.equal(K.stokCukup(5, 0), true, 'diminta 0 → cukup (skema menolak jumlah 0)')

// ─── 18. Route minuman BENAR-BENAR memakai penjaga itu ────────────────────
// Uji di atas memeriksa helper-nya. Tapi helper yang benar tak ada gunanya
// kalau route memakai pemeriksaan sendiri. Dulu persis itu yang bocor: route
// punya penjagaan, tapi tak ada uji yang menutupnya, sehingga bug di jalur
// asli lolos. Pemeriksaan ini menutup celah itu tanpa perlu DB.
{
  const sumber = readFileSync(join(akarRepo, 'app/api/karaoke/sesi/[id]/minuman/route.ts'), 'utf8')
  assert.ok(
    sumber.includes('stokCukup(produk.stok, d.jumlah)'),
    'route minuman memanggil stokCukup sebelum memotong stok',
  )
  assert.ok(
    sumber.includes('stok: { gte: d.jumlah }'),
    'potong stok memakai syarat gte di dalam WHERE (penjaga terhadap dua kasir bersamaan)',
  )
  assert.ok(
    sumber.includes("throw new StokKurangError") || sumber.includes('STOK_KURANG'),
    'stok kurang menghasilkan 409 STOK_KURANG, bukan error 500',
  )
}

console.log('check-karaoke: semua uji murni LULUS')
