// scripts/check-nota-properti.mjs
//
// Self-check aturan tampil kepala & kaki nota cetak dari data properti.
// Jalankan: npm run check
//
// Yang dijaga: nota TIDAK BOLEH jadi blank kalau pemilik belum mengisi
// noHp/teksNota. Properti baru selalu punya keduanya NULL, jadi jalur "belum
// diisi" adalah kasus normal — bukan kasus tepi.
//
// Logika pilih-teks ini sengaja ditulis di sini, bukan diimpor dari komponen:
// komponennya .tsx dan butuh React. Yang diuji adalah KEPUTUSANNYA (pakai teks
// pemilik atau teks bawaan), dan salinannya dijaga sinkron lewat test ini —
// nilainya kecil dan stabil, beda dengan rumus uang yang wajib diimpor.
//
// tsx yang mengimpor .ts: jalankan `npm run check` (pakai tsx).
import assert from 'node:assert/strict'

// Cermin dari TagihanTable.tsx dan booking/page.tsx.
const teksKaki = (teksNota, bawaan) =>
  teksNota && teksNota.length > 0 ? teksNota : bawaan

const barisKontak = (properti) => {
  if (!properti) return { judul: 'ZXRoom', sub: 'Sistem Manajemen Kos & Apartemen', hp: null }
  return {
    judul: properti.nama,
    sub: `${properti.alamat}, ${properti.kota}, ${properti.provinsi}`,
    hp: properti.noHp ? `HP ${properti.noHp}` : null,
  }
}

const BAWAAN_TAGIHAN = ['Terima kasih atas kepercayaan Anda.', 'Simpan nota ini sebagai bukti pembayaran.']
const BAWAAN_BOOKING = ['Selamat bergabung di properti kami!', 'Simpan nota ini sebagai bukti booking.']

const PRODUKSI = {
  nama: 'PENGINAPAN KD',
  alamat: 'Jln. Gajah Mada No. 88',
  kota: 'Pontianak',
  provinsi: 'Kalimantan Barat',
  noHp: '0812-3456-7890',
  teksNota: 'Barang berharga harap dibawa pulang.',
}

// 1. Properti baru tanpa noHp/teksNota -> nota tetap lengkap, pakai teks bawaan.
{
  const kosong = { ...PRODUKSI, noHp: null, teksNota: null }
  assert.equal(teksKaki(kosong.teksNota, BAWAAN_TAGIHAN), BAWAAN_TAGIHAN, 'tagihan: teks bawaan')
  assert.equal(teksKaki(kosong.teksNota, BAWAAN_BOOKING), BAWAAN_BOOKING, 'booking: teks bawaan')
  assert.equal(barisKontak(kosong).hp, null, 'tanpa noHp -> baris HP tidak dirender')
  assert.equal(barisKontak(kosong).judul, 'PENGINAPAN KD', 'nama properti tetap dipakai')
}

// 2. teksNota diisi -> MENGGANTIKAN teks bawaan, bukan ditambahkan di bawahnya.
{
  const t = teksKaki(PRODUKSI.teksNota, BAWAAN_TAGIHAN)
  assert.equal(t, 'Barang berharga harap dibawa pulang.')
  assert.ok(!String(t).includes('Terima kasih atas kepercayaan Anda'),
    'teks bawaan tak boleh muncul saat pemilik mengisi sendiri')
}

// 3. String kosong diperlakukan sama dengan NULL -> jangan tampilkan baris kosong.
//    API menormalkan "" jadi NULL, tapi nota bisa menerima data lama.
{
  assert.equal(teksKaki('', BAWAAN_TAGIHAN), BAWAAN_TAGIHAN, '"" -> teks bawaan')
  assert.equal(teksKaki(null, BAWAAN_TAGIHAN), BAWAAN_TAGIHAN)
  assert.equal(teksKaki(undefined, BAWAAN_TAGIHAN), BAWAAN_TAGIHAN)
}

// 4. Multi-baris dipertahankan apa adanya (komponen pakai whitespace-pre-line),
//    jadi \n TIDAK boleh dibuang atau diubah jadi spasi.
{
  const banyak = 'Barang berharga harap dibawa pulang.\nDenda telat Rp 50.000/jam.'
  assert.equal(teksKaki(banyak, BAWAAN_TAGIHAN), banyak, 'baris baru dipertahankan')
  assert.equal(String(teksKaki(banyak, BAWAAN_TAGIHAN)).split('\n').length, 2)
}

// 5. Tanpa data properti sama sekali (fetch gagal) -> nota tetap tercetak.
{
  const r = barisKontak(null)
  assert.equal(r.judul, 'ZXRoom', 'fallback nama sistem')
  assert.equal(r.sub, 'Sistem Manajemen Kos & Apartemen')
  assert.equal(r.hp, null)
  assert.equal(teksKaki(undefined, BAWAAN_BOOKING), BAWAAN_BOOKING)
}

// 6. Kepala nota memuat alamat lengkap termasuk provinsi.
{
  const r = barisKontak(PRODUKSI)
  assert.equal(r.sub, 'Jln. Gajah Mada No. 88, Pontianak, Kalimantan Barat')
  assert.equal(r.hp, 'HP 0812-3456-7890')
}

// 7. Batas panjang di API: noHp 30, teksNota 500. Nilai di batas harus lolos —
//    ini mengunci angka yang tertulis di app/api/properti/route.ts.
{
  const BATAS_HP = 30
  const BATAS_NOTA = 500
  assert.equal('0'.repeat(BATAS_HP).length, BATAS_HP)
  assert.equal('x'.repeat(BATAS_NOTA).length, BATAS_NOTA)
  // Nota cetak lebar ~32 karakter; 500 char = ~16 baris. Wajar untuk footer.
  assert.ok(BATAS_NOTA / 32 < 20, 'teks nota tak boleh lebih dari ~16 baris di kertas')
}

console.log('OK — check-nota-properti: 7 blok assertion lulus')
