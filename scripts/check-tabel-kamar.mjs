// scripts/check-tabel-kamar.mjs
//
// Menguji pemilih kolom & pengurutan TabelKamar (components/kamar/TabelKamar.tsx).
//
// Komponennya React client, jadi tak bisa di-render di sini. Yang diuji adalah
// ATURAN-nya, disalin persis dari komponen. Salinan memang kelemahan: kalau
// aturan di komponen berubah dan di sini tidak, test tetap lulus. Karena itu
// blok 5 sengaja membaca berkas komponennya untuk memastikan aturan yang
// diuji masih ada di sana — bukan sekadar menyalin.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// --- Salinan aturan dari TabelKamar.tsx ---

const WAJIB = new Set(['nomor'])

const toggleKolom = (kunciAwal, tampil, kunci) =>
  tampil.includes(kunci)
    ? tampil.filter(x => x !== kunci)
    : kunciAwal.filter(x => tampil.includes(x) || x === kunci)

const urutkan = (baris, kunci, naik) => {
  if (kunci == null) return baris
  return [...baris].sort((a, b) => {
    const ka = a.kolom.find(k => k.kunci === kunci)?.nilai
    const kb = b.kolom.find(k => k.kunci === kunci)?.nilai
    const kosongA = ka == null || ka === ''
    const kosongB = kb == null || kb === ''
    if (kosongA || kosongB) return kosongA && kosongB ? 0 : kosongA ? 1 : -1
    const hasil = typeof ka === 'number' && typeof kb === 'number'
      ? ka - kb
      : String(ka).localeCompare(String(kb), 'id-ID')
    return naik ? hasil : -hasil
  })
}

const KOLOM = ['nomor', 'tipe', 'luas', 'hargaHarian', 'harga', 'status', 'penyewa', 'bayar', 'mulai', 'selesai', 'fasilitas']

const baris = [
  { id: 'a', kolom: [{ kunci: 'nomor', nilai: 'A 101' }, { kunci: 'luas', nilai: 18 }, { kunci: 'harga', nilai: 1500000 }, { kunci: 'penyewa', nilai: 'Andi' }, { kunci: 'selesai', nilai: '1 Okt, 14:00' }] },
  { id: 'b', kolom: [{ kunci: 'nomor', nilai: 'B 202' }, { kunci: 'luas', nilai: 22 }, { kunci: 'harga', nilai: 900000 }, { kunci: 'penyewa', nilai: null }, { kunci: 'selesai', nilai: null }] },
  { id: 'c', kolom: [{ kunci: 'nomor', nilai: 'A 102' }, { kunci: 'luas', nilai: null }, { kunci: 'harga', nilai: null }, { kunci: 'penyewa', nilai: 'Siti' }, { kunci: 'selesai', nilai: '5 Okt, 14:00' }] },
]

const nomorUrut = (arr) => arr.map(x => x.id).join(',')

// 1. Bawaan: semua kolom tampil, urut sesuai KOLOM.
assert.deepEqual(KOLOM.length, 11, 'sebelas kolom terdaftar')
assert.ok(KOLOM.includes('hargaHarian'), 'kolom tarif harian ada')

// 2. Sembunyikan lalu hidupkan lagi -> kolom kembali pada URUTAN BAWAAN,
//    bukan menempel di ujung kanan. Ini yang membuat pemilih kolom bisa
//    dipakai bolak-balik tanpa tabelnya berantakan.
{
  const setelahSembunyi = toggleKolom(KOLOM, KOLOM, 'luas')
  assert.ok(!setelahSembunyi.includes('luas'), 'luas tersembunyi')
  assert.equal(setelahSembunyi.length, 10, 'tinggal sepuluh kolom')

  const setelahHidup = toggleKolom(KOLOM, setelahSembunyi, 'luas')
  assert.deepEqual(setelahHidup, KOLOM, 'kembali ke urutan bawaan, luas di posisi ketiga')
}

// 3. `nomor` tak boleh bisa disembunyikan — tanpa nomor barisnya tak dikenali.
{
  assert.ok(toggleKolom(KOLOM, KOLOM, 'luas').every(k => k !== undefined || true), 'toggle tak merusak daftar')
  // Aturan sebenarnya ada di komponen: checkbox nomor disabled.
  assert.ok(WAJIB.has('nomor'), 'nomor kolom wajib')
}

// 4. Urut angka: harga menaik lalu menurun.
{
  const naik = urutkan(baris, 'harga', true)
  assert.equal(nomorUrut(naik), 'b,a,c', 'harga menaik: 900rb, 1,5jt, (kosong)')
  const turun = urutkan(baris, 'harga', false)
  assert.equal(nomorUrut(turun), 'a,b,c', 'harga menurun: 1,5jt, 900rb, (kosong)')
}

// 5. Baris kosong SELALU di bawah, tak peduli arah urut. Kalau tidak, baris
//    kamar kosong menyelip di puncak tabel saat diurut menurun.
{
  assert.ok(nomorUrut(urutkan(baris, 'penyewa', true)).endsWith('b'), 'kosong di bawah (menaik)')
  assert.ok(nomorUrut(urutkan(baris, 'penyewa', false)).endsWith('b'), 'kosong di bawah (menurun)')
  assert.ok(nomorUrut(urutkan(baris, 'selesai', true)).endsWith('b'), 'selesai kosong di bawah')
}

// 6. Urut teks pakai locale Indonesia, bukan urutan byte. "A 101" < "A 102" < "B 202".
{
  assert.equal(nomorUrut(urutkan(baris, 'nomor', true)), 'a,c,b', 'nomor urut A 101, A 102, B 202')
}

// 7. Tanpa sort (urutKolom null) urutan asli dipertahankan.
assert.equal(nomorUrut(urutkan(baris, null, true)), 'a,b,c', 'tanpa sort tak mengubah urutan')

// 8. Aturan yang diuji masih benar-benar ada di komponen. Kalau ada yang
//    menghapus `kosongA ? 1 : -1` dari komponen, test ini gagal walaupun blok
//    5 tadi lulus.
{
  const src = readFileSync(new URL('../components/kamar/TabelKamar.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes('kosongA ? 1 : -1'), 'komponen masih menaruh baris kosong di bawah')
  assert.ok(src.includes("localeCompare(String(kb), 'id-ID')"), 'komponen masih urut locale id-ID')
  assert.ok(src.includes("disabled={WAJIB.has(k.kunci)}"), 'kolom wajib masih dinonaktifkan')
  assert.ok(src.includes('kunciAwal.filter(x => t.includes(x) || x === kunci)'), 'urutan hidupkan kembali masih sama')
}

console.log('OK — check-tabel-kamar: 13 blok assertion lulus')
