// scripts/check-jadwal-kamar.mjs
//
// Menguji aturan "kamar terisi tetap bisa dibooking setelah penghuninya keluar"
// (lib/jadwalKamar.ts).
//
// Aturan ini yang paling mahal kalau salah: dua penyewa bisa diklaim kamar yang
// sama. Karena itu diimpornya dari lib aslinya, BUKAN disalin.
import assert from 'node:assert/strict'
import { bolehDipesan, statusUntuk, lepasPada, lepasTerakhir } from '../lib/jadwalKamar.ts'

const aturan = { jamCheckout: '12:00', toleransiCheckout: 0 }
const aturanTol = { jamCheckout: '12:00', toleransiCheckout: 120 }   // +2 jam

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
  const r = bolehDipesan(new Date('2026-09-05T10:00:00+07:00'), null, aturan)
  assert.equal(r.boleh, true, 'kamar kosong boleh dibooking')
  assert.equal(lepasPada(null, aturan), null, 'tak ada penghuni -> tak ada waktu lepas')
}

// 4. Tanggal masuk SEBELUM kamar dilepas -> tolak, dengan pesan yang menyebut
//    kapan kamarnya bebas. Kasir butuh tanggalnya, bukan "tidak tersedia".
{
  const r = bolehDipesan(new Date('2026-09-20T10:00:00+07:00'), sewaAktif, aturan)
  assert.equal(r.boleh, false, 'masuk saat masih dihuni -> tolak')
  assert.match(r.pesan, /masih terpakai sampai/, 'pesan menyebut kamar masih terpakai')
  assert.match(r.pesan, /1 Okt/, 'pesan menyebut tanggal bebasnya')
}

// 5. TEPAT pada saat lepas -> boleh. Batas "mulai jam ini" inklusif: jam
//    check-out berarti kamar sudah kosong pada jam itu.
{
  const r = bolehDipesan(BEBAS, sewaAktif, aturan)
  assert.equal(r.boleh, true, 'tepat pada jam check-out boleh')
}

// 6. Sehari sebelum -> tolak; sehari sesudah -> boleh. Batasnya tajam.
{
  assert.equal(bolehDipesan(new Date('2026-09-30T14:00:00+07:00'), sewaAktif, aturan).boleh, false,
    '30 Sep 14:00 masih dihuni')
  assert.equal(bolehDipesan(new Date('2026-10-02T08:00:00+07:00'), sewaAktif, aturan).boleh, true,
    '2 Okt 08:00 sudah bebas')
}

// 7. Status catatan baru: PENDING kalau kamar masih dihuni, AKTIF kalau kosong.
//    Kalau ini salah, kamar berpenghuni akan tampak kosong.
{
  assert.equal(statusUntuk(BEBAS, sewaAktif, aturan), 'PENDING',
    'booking saat masih dihuni -> PENDING (menunggu, bukan menempati)')
  assert.equal(statusUntuk(new Date('2026-09-20T10:00:00+07:00'), null, aturan), 'AKTIF',
    'kamar kosong -> AKTIF')
  assert.equal(statusUntuk(new Date('2026-12-01T10:00:00+07:00'), sewaAktif, aturan), 'PENDING',
    'tanggal jauh di depan -> tetap PENDING sampai penghuni sekarang checkout')
}

// 8. Jam masuk dini hari (00:00 WIB) tak menggeser tanggal. Ini bug yang pernah
//    terjadi di batasCheckout: tanggal dibaca UTC -> sehari terlalu cepat.
{
  const masukDini = new Date('2026-10-01T00:00:00+07:00')
  const r = bolehDipesan(masukDini, sewaAktif, aturan)
  assert.equal(r.boleh, false, 'masuk 1 Okt 00:00 masih dihuni (bebas 12:00)')
  assert.equal(bolehDipesan(new Date('2026-10-01T12:00:00+07:00'), sewaAktif, aturan).boleh, true,
    'masuk 1 Okt 12:00 sudah bebas')
}

// 9. CELAH YANG PERNAH TERBUKTI: satu kamar punya AKTIF (keluar 20 Sep) plus
//    DUA PENDING (22 Sep dan 25 Sep) yang tumpang tindih. Dulu validasi hanya
//    melihat penghuni pertama, jadi booking 23 Sep lolos padahal PENDING 25 Sep
//    masih memegang kamar. Sekarang seluruh sewa non-selesai dihitung.
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

  // Batas terakhir = keluar PENDING 25 Sep 12:00, bukan 20 Sep.
  assert.equal(
    lepasTerakhir(daftar, aturan).toISOString(),
    new Date('2026-09-26T12:00:00+07:00').toISOString(),
    'batas = akhir sewa terakhir, bukan akhir penghuni pertama',
  )
  assert.equal(bolehDipesan(new Date('2026-09-23T10:00:00+07:00'), daftar, aturan).boleh, false,
    'booking di sela antrean -> tolak (dulu lolos)')
  assert.equal(bolehDipesan(new Date('2026-09-25T10:00:00+07:00'), daftar, aturan).boleh, false,
    'masuk saat PENDING 25 Sep masih memegang -> tolak')
  assert.equal(bolehDipesan(new Date('2026-09-26T12:00:00+07:00'), daftar, aturan).boleh, true,
    'tepat setelah sewa terakhir lepas -> boleh')
}

// 10. Jam masuk identik pun bentrok (keputusan owner: 1 kamar = 1 orang).
//     Tanggal sama, jam sama -> tidak boleh.
{
  const s = {
    statusSewa: 'PENDING',
    tanggalMasuk: new Date('2026-09-22T14:00:00+07:00'),
    tanggalKeluar: new Date('2026-09-23T14:00:00+07:00'),
  }
  const r = bolehDipesan(new Date('2026-09-22T14:00:00+07:00'), s, aturan)
  assert.equal(r.boleh, false, 'tanggal & jam identik -> bentrok')
  assert.match(r.pesan, /masih terpakai sampai/, 'pesan menyebut kapan kamar terpakai sampai')
}

// 11. Daftar kosong (kamar tanpa sewa non-selesai) -> bebas.
{
  assert.equal(lepasTerakhir([], aturan), null, 'tak ada sewa -> tak ada batas')
  assert.equal(bolehDipesan(new Date('2026-09-05T10:00:00+07:00'), [], aturan).boleh, true,
    'daftar kosong -> boleh')
}

// 12. Kompatibilitas pemanggil lama: satu sewa (atau null) tetap diterima.
{
  assert.equal(bolehDipesan(new Date('2026-09-20T10:00:00+07:00'), sewaAktif, aturan).boleh, false,
    'satu sewa saja masih dinormalkan ke daftar')
  assert.equal(bolehDipesan(new Date('2026-10-02T08:00:00+07:00'), sewaAktif, aturan).boleh, true,
    'setelah lepas -> boleh')
}

console.log('OK — check-jadwal-kamar: 18 blok assertion lulus')
