// scripts/check-jadwal-kamar.mjs
//
// Menguji aturan penjadwalan kamar (lib/jadwalKamar.ts): sewa boleh berurutan,
// tapi rentang waktunya tidak boleh beririsan.
//
// Aturan ini yang paling mahal kalau salah: dua penyewa bisa diklaim kamar yang
// sama. Karena itu diimpornya dari lib aslinya, BUKAN disalin.
//
// Aturan owner (verbatim): "sebuah kamar itu kan ada jam masuk dan jam keluarnya,
// jadi jika di boking sebelum jam masuk harusnya bisa, dan jika di boking setelah
// jam keluar, harusnya bisa juga."
import assert from 'node:assert/strict'
import {
  bolehDipesan, statusUntuk, lepasPada, celahKosong, penghalangUntuk,
} from '../lib/jadwalKamar.ts'
import { tglJamSingkat } from '../lib/utils.ts'

const aturan = { jamCheckout: '12:00', toleransiCheckout: 0 }
const aturanTol = { jamCheckout: '12:00', toleransiCheckout: 120 }   // +2 jam

/** Rentang sewa baru: masuk jam 14:00, tinggal `hari` hari. */
const baru = (masukIso, keluarIso) => ({
  mulai: new Date(masukIso),
  selesai: new Date(keluarIso),
})

// Penghuni sekarang: masuk 1 Sep, keluar 1 Okt. Kamar dilepas 1 Okt 12:00 WIB.
const sewaAktif = {
  statusSewa: 'AKTIF',
  tanggalMasuk: new Date('2026-09-01T00:00:00+07:00'),
  tanggalKeluar: new Date('2026-10-01T00:00:00+07:00'),
}
const BEBAS = new Date('2026-10-01T12:00:00+07:00')

// 1. Kapan kamar benar-benar dilepas: jam check-out, bukan jam masuk.
{
  const lepas = lepasPada(sewaAktif, aturan)
  assert.equal(lepas.toISOString(), BEBAS.toISOString(),
    'kamar dilepas jam check-out properti, bukan jam masuk')
}

// 2. Toleransi menggeser waktu lepas — nota & layar kamar memakai angka yang
//    sama, jadi booking pun harus ikut angka itu.
{
  const lepas = lepasPada(sewaAktif, aturanTol)
  assert.equal(lepas.toISOString(), new Date('2026-10-01T14:00:00+07:00').toISOString(),
    'toleransi 120 menit -> lepas 14:00')
}

// 3. Kamar kosong selalu boleh.
{
  const r = bolehDipesan(baru('2026-09-05T10:00:00+07:00', '2026-09-06T10:00:00+07:00'), null, aturan)
  assert.equal(r.boleh, true, 'kamar kosong boleh dibooking')
  assert.equal(lepasPada(null, aturan), null, 'tak ada penghuni -> tak ada waktu lepas')
}

// 4. Rentang yang beririsan dengan penghuni sekarang -> tolak, dengan pesan yang
//    menyebut KAPAN kamar terpakai. Kasir butuh rentangnya, bukan "tidak tersedia".
{
  const r = bolehDipesan(baru('2026-09-20T10:00:00+07:00', '2026-09-21T10:00:00+07:00'), sewaAktif, aturan)
  assert.equal(r.boleh, false, 'masuk saat masih dihuni -> tolak')
  assert.match(r.pesan, /1 Sep/, 'pesan menyebut kapan kamar mulai terpakai')
  assert.match(r.pesan, /1 Okt/, 'pesan menyebut kapan kamar lepas')
  assert.equal(r.halangan.length, 1, 'satu sewa menghalangi')
}

// 5. TEPAT saat penghuni sebelumnya lepas -> boleh. Batasnya inklusif: pada jam
//    check-out kamar sudah kosong.
{
  assert.equal(bolehDipesan(baru('2026-10-01T12:00:00+07:00', '2026-10-02T12:00:00+07:00'), sewaAktif, aturan).boleh,
    true, 'masuk tepat pada jam check-out boleh')
}

// 6. Sehari sebelum -> tolak; sehari sesudah -> boleh. Batasnya tajam.
{
  assert.equal(bolehDipesan(baru('2026-09-30T14:00:00+07:00', '2026-10-01T14:00:00+07:00'), sewaAktif, aturan).boleh,
    false, '30 Sep 14:00 masih dihuni')
  assert.equal(bolehDipesan(baru('2026-10-02T08:00:00+07:00', '2026-10-03T08:00:00+07:00'), sewaAktif, aturan).boleh,
    true, '2 Okt 08:00 sudah bebas')
}

// 7. Status catatan baru: yang mulai LEBIH DULU menempati (AKTIF), yang
//    didahului jadi PENDING. Kalau ini salah, kamar berpenghuni tampak kosong.
{
  assert.equal(statusUntuk(BEBAS, sewaAktif, aturan), 'PENDING',
    'booking saat masih dihuni -> PENDING (menunggu, bukan menempati)')
  assert.equal(statusUntuk(new Date('2026-09-20T10:00:00+07:00'), null, aturan), 'AKTIF',
    'kamar kosong -> AKTIF')
  // Kasus yang bikin beda dari aturan lama: kamar KOSONG (tak ada penghuni)
  // tapi sudah ada pesanan 1 Okt, lalu kasir booking 20 Sep. Yang 20 Sep
  // menempati lebih dulu -> AKTIF, pesanan 1 Okt tetap PENDING.
  const pesananSaja = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-10-01T00:00:00+07:00'),
    tanggalKeluar: new Date('2026-10-02T00:00:00+07:00'),
  }
  assert.equal(statusUntuk(new Date('2026-09-20T10:00:00+07:00'), [pesananSaja], aturan), 'AKTIF',
    'masuk lebih awal dari pesanan yang ada -> AKTIF, bukan PENDING')
  assert.equal(statusUntuk(new Date('2026-10-05T10:00:00+07:00'), [pesananSaja], aturan), 'PENDING',
    'masuk setelah pesanan yang ada -> PENDING')
}

// 8. Jam masuk dini hari (00:00 WIB) tak menggeser tanggal. Ini bug yang pernah
//    terjadi di batasCheckout: tanggal dibaca UTC -> sehari terlalu cepat.
{
  assert.equal(bolehDipesan(baru('2026-10-01T00:00:00+07:00', '2026-10-02T00:00:00+07:00'), sewaAktif, aturan).boleh,
    false, 'masuk 1 Okt 00:00 masih dihuni (bebas 12:00)')
  assert.equal(bolehDipesan(baru('2026-10-01T12:00:00+07:00', '2026-10-02T12:00:00+07:00'), sewaAktif, aturan).boleh,
    true, 'masuk 1 Okt 12:00 sudah bebas')
}

// 9. INTI ATURAN OWNER. Sewa lama masuk 20 Sep 14:00 keluar 21 Sep 14:00 (kamar
//    terpakai 20 Sep 14:00 -> 21 Sep 12:00 check-out).
//    (a) Booking SEBELUM jam masuk  -> BOLEH (dulu ditolak oleh model satu-batas)
//    (b) Booking SETELAH jam keluar -> BOLEH
//    (c) Booking di antaranya       -> TOLAK
{
  const lama = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-09-20T14:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-21T14:00:00+07:00'),
  }
  const daftar = [lama]

  // (a) 17 Sep 14:00 -> 18 Sep 14:00. Selesai 18 Sep <= mulai lama 20 Sep.
  assert.equal(bolehDipesan(baru('2026-09-17T14:00:00+07:00', '2026-09-18T14:00:00+07:00'), daftar, aturan).boleh,
    true, 'booking SEBELUM jam masuk penghuni berikutnya -> boleh')

  // (b) 21 Sep 12:00 (tepat check-out lama) -> boleh.
  assert.equal(bolehDipesan(baru('2026-09-21T12:00:00+07:00', '2026-09-22T12:00:00+07:00'), daftar, aturan).boleh,
    true, 'booking SETELAH jam keluar -> boleh')

  // (c) 20 Sep 16:00 -> 21 Sep 16:00. Mulai di tengah masa sewa lama.
  assert.equal(bolehDipesan(baru('2026-09-20T16:00:00+07:00', '2026-09-21T16:00:00+07:00'), daftar, aturan).boleh,
    false, 'booking di tengah masa sewa lama -> tolak')

  // (d) Yang baru KELUAR setelah lama mulai tapi masuk sebelum lama mulai:
  //     19 Sep 20:00 -> 20 Sep 20:00. Lewat tengah malam, tetap beririsan.
  assert.equal(bolehDipesan(baru('2026-09-19T20:00:00+07:00', '2026-09-20T20:00:00+07:00'), daftar, aturan).boleh,
    false, 'keluar melewati jam masuk lama -> tolak')
}

// 10. CELAH YANG PERNAH TERBUKTI: satu kamar punya AKTIF + DUA PENDING tumpang
//     tindih. Dulu validasi hanya melihat penghuni pertama, jadi booking di sela
//     lolos padahal PENDING berikutnya masih memegang kamar.
{
  const aktif = {
    statusSewa: 'AKTIF',
    tanggalMasuk: new Date('2026-09-18T00:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-20T00:00:00+07:00'),
  }
  const pending22 = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-09-22T00:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-23T00:00:00+07:00'),
  }
  const pending25 = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-09-25T00:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-26T00:00:00+07:00'),
  }
  const daftar = [aktif, pending22, pending25]

  // 23 Sep 10:00 -> jatuh persis di sela 20..22 dan 23..25? 23 Sep 10:00 masih
  // di dalam masa pending22 (keluar 23 Sep 12:00) -> tolak.
  assert.equal(bolehDipesan(baru('2026-09-23T10:00:00+07:00', '2026-09-24T10:00:00+07:00'), daftar, aturan).boleh,
    false, 'booking di sela antrean -> tolak (dulu lolos)')
  assert.equal(bolehDipesan(baru('2026-09-25T10:00:00+07:00', '2026-09-26T10:00:00+07:00'), daftar, aturan).boleh,
    false, 'masuk saat PENDING 25 Sep masih memegang -> tolak')
  assert.equal(bolehDipesan(baru('2026-09-26T12:00:00+07:00', '2026-09-27T12:00:00+07:00'), daftar, aturan).boleh,
    true, 'tepat setelah sewa terakhir lepas -> boleh')

  // Celah sah yang harus tetap terbuka: 21 Sep 12:00 (setelah aktif lepas
  // 20 Sep 12:00, sebelum pending22 masuk 22 Sep 00:00).
  assert.equal(bolehDipesan(baru('2026-09-20T12:00:00+07:00', '2026-09-21T12:00:00+07:00'), daftar, aturan).boleh,
    true, 'celah kosong di antara dua sewa tetap boleh dipesan')

  // Beberapa penghalang sekaligus -> semuanya dilaporkan.
  const r = bolehDipesan(baru('2026-09-19T00:00:00+07:00', '2026-09-27T00:00:00+07:00'), daftar, aturan)
  assert.equal(r.boleh, false, 'rentang panjang menabrak semua sewa -> tolak')
  assert.equal(r.halangan.length, 3, 'ketiga sewa dilaporkan sebagai penghalang')
}

// 11. Jam masuk identik pun bentrok (keputusan owner: 1 kamar = 1 orang).
{
  const s = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-09-22T14:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-23T14:00:00+07:00'),
  }
  const r = bolehDipesan(baru('2026-09-22T14:00:00+07:00', '2026-09-23T14:00:00+07:00'), s, aturan)
  assert.equal(r.boleh, false, 'tanggal & jam identik -> bentrok')
  assert.match(r.pesan, /22 Sep/, 'pesan menyebut tanggal bentroknya')
}

// 12. Kompatibilitas pemanggil lama: satu sewa (atau null) tetap diterima, dan
//     daftar kosong berarti kamar bebas.
{
  assert.equal(bolehDipesan(baru('2026-09-20T10:00:00+07:00', '2026-09-21T10:00:00+07:00'), sewaAktif, aturan).boleh,
    false, 'satu sewa saja masih dinormalkan ke daftar')
  assert.equal(bolehDipesan(baru('2026-10-02T08:00:00+07:00', '2026-10-03T08:00:00+07:00'), sewaAktif, aturan).boleh,
    true, 'setelah lepas -> boleh')
  assert.equal(bolehDipesan(baru('2026-10-02T08:00:00+07:00', '2026-10-03T08:00:00+07:00'), [], aturan).boleh,
    true, 'daftar kosong -> boleh')
}

// 13. celahKosong(): rentang menganggur yang ditampilkan ke kasir. Kalau ini
//     salah, layar booking menyembunyikan tanggal yang sebenarnya bisa dijual.
{
  const daftar = [
    { statusSewa: 'AKTIF', tanggalMasuk: new Date('2026-09-18T00:00:00+07:00'), tanggalKeluar: new Date('2026-09-20T00:00:00+07:00') },
    { statusSewa: 'PENDING', tanggalMasuk: new Date('2026-09-25T00:00:00+07:00'), tanggalKeluar: new Date('2026-09-26T00:00:00+07:00') },
  ]
  const celah = celahKosong(daftar, aturan,
    new Date('2026-09-17T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'))

  assert.equal(celah.length, 3, 'tiga celah: sebelum, di sela, sesudah')
  assert.equal(celah[0].selesai.toISOString(), new Date('2026-09-18T00:00:00+07:00').toISOString(),
    'celah pertama berakhir saat sewa pertama masuk')
  assert.equal(celah[1].mulai.toISOString(), new Date('2026-09-20T12:00:00+07:00').toISOString(),
    'celah tengah mulai saat kamar dilepas (check-out), bukan tanggalKeluar mentah')
  assert.equal(celah[1].selesai.toISOString(), new Date('2026-09-25T00:00:00+07:00').toISOString(),
    'celah tengah berakhir saat pesanan berikutnya masuk')
  assert.equal(celah[2].selesai.toISOString(), new Date('2026-09-30T00:00:00+07:00').toISOString(),
    'celah terakhir dipotong batas jendela')

  // Tiap celah harus LULUS validasi — kalau tidak, layar menyarankan tanggal
  // yang justru ditolak server.
  for (const c of celah) {
    assert.equal(bolehDipesan(c, daftar, aturan).boleh, true,
      `celah ${c.mulai.toISOString()} seharusnya boleh dipesan`)
  }

  // Toleransi check-out ikut menggeser celah.
  const celahTol = celahKosong(daftar, aturanTol,
    new Date('2026-09-17T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'))
  assert.equal(celahTol[1].mulai.toISOString(), new Date('2026-09-20T14:00:00+07:00').toISOString(),
    'celah tengah ikut toleransi -> mulai 14:00')

  // Kamar tanpa sewa: seluruh jendela kosong.
  const celahPenuh = celahKosong([], aturan,
    new Date('2026-09-17T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'))
  assert.equal(celahPenuh.length, 1, 'tanpa sewa -> satu celah sepanjang jendela')

  // Sewa yang menutupi seluruh jendela: tak ada celah.
  const celahNol = celahKosong(
    [{ statusSewa: 'AKTIF', tanggalMasuk: new Date('2026-09-01T00:00:00+07:00'), tanggalKeluar: new Date('2026-12-01T00:00:00+07:00') }],
    aturan, new Date('2026-09-17T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'))
  assert.equal(celahNol.length, 0, 'sewa menutupi jendela -> tak ada celah')
}

// 13b. REGRESI: celah ekor pernah tampil terbalik ("21 Sep -> 17 Sep") karena
//      `sampai` dihitung dari `Date.now()` sementara `dari` dari waktu WIB —
//      begitu `sampai` jatuh sebelum `dari`, celah penutupnya terbalik.
//      Tiap celah yang keluar dari fungsi ini WAJIB punya selesai > mulai,
//      apa pun bentuk jendelanya.
{
  const daftar = [
    { statusSewa: 'PENDING', tanggalMasuk: new Date('2026-09-20T14:00:00+07:00'), tanggalKeluar: new Date('2026-09-21T14:00:00+07:00') },
    { statusSewa: 'PENDING', tanggalMasuk: new Date('2026-09-19T08:00:00+07:00'), tanggalKeluar: new Date('2026-09-20T08:00:00+07:00') },
  ]
  const dari = new Date('2026-09-17T09:00:00+07:00')
  const sampai = new Date('2027-09-17T09:00:00+07:00')

  for (const c of celahKosong(daftar, aturan, dari, sampai)) {
    assert.ok(c.selesai.getTime() > c.mulai.getTime(),
      `celah ${c.mulai.toISOString()} -> ${c.selesai.toISOString()} terbalik`)
    assert.ok(c.mulai.getTime() >= dari.getTime(), 'celah tidak boleh mulai sebelum jendela')
    assert.ok(c.selesai.getTime() <= sampai.getTime(), 'celah tidak boleh lewat jendela')
  }

  // Jendela terbalik -> tak ada celah sama sekali (bukan satu celah terbalik).
  assert.deepEqual(celahKosong(daftar, aturan, sampai, dari), [],
    'jendela terbalik -> daftar kosong')

  // Jendela berdurasi nol -> tak ada celah.
  assert.deepEqual(celahKosong(daftar, aturan, dari, dari), [],
    'jendela nol -> daftar kosong')

  // Sewa yang sudah lewat seluruhnya tidak menyisakan celah palsu di depan.
  const sudahLewat = celahKosong(
    [{ statusSewa: 'PENDING', tanggalMasuk: new Date('2026-08-01T08:00:00+07:00'), tanggalKeluar: new Date('2026-08-02T08:00:00+07:00') }],
    aturan, dari, new Date('2026-09-25T00:00:00+07:00'))
  assert.equal(sudahLewat.length, 1, 'sewa yang sudah lewat -> satu celah, bukan dua')
  assert.equal(sudahLewat[0].mulai.toISOString(), dari.toISOString(),
    'celah mulai dari jendela, bukan dari sewa lama')

  // Sewa mulai TEPAT di awal jendela: tak ada celah di depannya.
  const singgung = celahKosong(
    [{ statusSewa: 'PENDING', tanggalMasuk: new Date('2026-09-18T00:00:00+07:00'), tanggalKeluar: new Date('2026-09-19T00:00:00+07:00') }],
    aturan, new Date('2026-09-18T00:00:00+07:00'), new Date('2026-09-18T00:00:00+07:00'))
  assert.deepEqual(singgung, [], 'sewa mulai tepat di ujung jendela -> tak ada celah')
}

// 14. penghalangUntuk(): urut, dan sewa yang tak beririsan tidak ikut.
{
  const daftar = [
    { statusSewa: 'PENDING', tanggalMasuk: new Date('2026-09-25T00:00:00+07:00'), tanggalKeluar: new Date('2026-09-26T00:00:00+07:00') },
    { statusSewa: 'AKTIF', tanggalMasuk: new Date('2026-09-18T00:00:00+07:00'), tanggalKeluar: new Date('2026-09-20T00:00:00+07:00') },
  ]
  const h = penghalangUntuk(baru('2026-09-19T00:00:00+07:00', '2026-09-25T12:00:00+07:00'), daftar, aturan)
  assert.equal(h.length, 2, 'dua sewa beririsan')
  assert.equal(h[0].mulai.getTime() < h[1].mulai.getTime(), true, 'urut dari yang paling awal mulai')

  const takAda = penghalangUntuk(baru('2026-09-21T00:00:00+07:00', '2026-09-22T00:00:00+07:00'), daftar, aturan)
  assert.equal(takAda.length, 0, 'rentang di celah kosong -> tak ada penghalang')
}

// 15. tglJamSingkat(): celah yang menyeberang tahun pernah terbaca terbalik
//     ("21 Sep -> 17 Sep") karena tahun tidak dicetak. Sekarang tahun ikut
//     HANYA kalau beda dari acuan — label panjang di kasus umum itu mahal.
{
  const acuan = new Date('2026-09-17T09:00:00+07:00')
  const samaTahun = tglJamSingkat(new Date('2026-09-20T14:00:00+07:00'), acuan)
  assert.doesNotMatch(samaTahun, /202\d/, 'tahun sama -> tak dicetak')

  const bedaTahun = tglJamSingkat(new Date('2027-09-17T09:00:00+07:00'), acuan)
  assert.match(bedaTahun, /2027/, 'tahun beda -> dicetak, celah tak tampak terbalik')

  // Tanpa acuan tetap jalan (memakai tahun berjalan).
  assert.equal(typeof tglJamSingkat(new Date('2026-09-20T14:00:00+07:00')), 'string',
    'pemanggil lama tetap jalan')
}

console.log('OK — check-jadwal-kamar: 16 blok assertion lulus')
