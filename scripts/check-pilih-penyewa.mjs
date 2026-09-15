// scripts/check-pilih-penyewa.mjs
//
// Self-check logika "pilih penyewa lama vs buat baru" di app/api/booking/route.ts.
// Jalankan: node scripts/check-pilih-penyewa.mjs
//
// Menyalin cabang pemilihan penyewa. Kalau route diubah, ubah juga di sini —
// invarian yang dijaga tertulis di komentar tiap blok.

const assert = (ok, pesan) => { if (!ok) throw new Error(`GAGAL: ${pesan}`) }

// Cermin cabang penyewa di route. `db` = tabel Penyewa yang sudah ada.
// Route menormalisasi '' -> null DULU (kosongJadiNull) sebelum cabang, jadi
// cermin ini melakukan hal yang sama di depan.
function pilihPenyewa({ penyewaId, nik, nama }, db = []) {
  nik = nik && nik.trim() ? nik.trim() : null
  if (penyewaId) {
    const lama = db.find(p => p.id === penyewaId)
    if (!lama) return { aksi: 'TOLAK_404' }
    // Jalur id: NIK boleh berubah, tapi tidak boleh menabrak milik baris lain.
    if (nik && db.some(p => p.nik === nik && p.id !== penyewaId)) return { aksi: 'TOLAK_409' }
    return { aksi: 'UPDATE', id: penyewaId, nik: nik ?? null }
  }
  if (nik) {
    if (db.some(p => p.nik === nik)) return { aksi: 'TOLAK_409' }
    return { aksi: 'CREATE', nik }
  }
  return { aksi: 'CREATE', nik: null }
}

const DB = [
  { id: 'p1', nik: '111', nama: 'Budi' },
  { id: 'p2', nik: null, nama: 'Sari' },   // penyewa tanpa NIK
]

// 1. Pilih penyewa lama -> UPDATE baris itu, BUKAN bikin baru.
{
  const r = pilihPenyewa({ penyewaId: 'p1', nik: '111', nama: 'Budi' }, DB)
  assert(r.aksi === 'UPDATE', `pilih lama harus UPDATE, dapat ${r.aksi}`)
  assert(r.id === 'p1', 'harus memperbarui baris yang sama')
}

// 2. Inti perbaikan: penyewa TANPA NIK yang dipilih ulang tetap satu baris.
//    Dulu (upsert by nik) selalu bikin baris baru.
{
  const r = pilihPenyewa({ penyewaId: 'p2', nik: null, nama: 'Sari' }, DB)
  assert(r.aksi === 'UPDATE', 'penyewa tanpa NIK harus UPDATE, bukan CREATE')
  assert(r.id === 'p2', 'id penyewa tanpa NIK harus dipertahankan')
}

// 3. penyewaId tak dikenal -> 404, jangan diam-diam bikin baris baru.
{
  assert(pilihPenyewa({ penyewaId: 'hantu', nik: null }, DB).aksi === 'TOLAK_404',
    'penyewaId asing harus 404')
}

// 4. NIK milik penyewa LAIN -> 409. Jangan pindahkan identitas orang.
{
  const r = pilihPenyewa({ penyewaId: 'p2', nik: '111', nama: 'Sari' }, DB)
  assert(r.aksi === 'TOLAK_409', 'NIK milik baris lain harus ditolak')
}

// 5. Mengosongkan NIK pada penyewa lama DIIZINKAN (koreksi data), bukan ditolak.
{
  const r = pilihPenyewa({ penyewaId: 'p1', nik: '', nama: 'Budi' }, DB)
  assert(r.aksi === 'UPDATE' && r.nik === null, 'NIK dikosongkan harus jadi null, bukan ditolak')
}

// 6. NIK sama persis dengan baris yang sedang di-update -> diizinkan (bukan 409).
{
  const r = pilihPenyewa({ penyewaId: 'p1', nik: '111', nama: 'Budi' }, DB)
  assert(r.aksi === 'UPDATE', 'NIK sendiri tak boleh dianggap bentrok')
}

// 7. Booking baru dengan NIK yang sudah terpakai -> 409, bukan menimpa penyewa lain.
{
  const r = pilihPenyewa({ penyewaId: null, nik: '111', nama: 'Budi Lain' }, DB)
  assert(r.aksi === 'TOLAK_409', 'NIK duplikat pada booking baru harus 409')
}

// 8. Booking baru tanpa NIK -> CREATE dengan nik null (bukan string kosong,
//    yang akan bentrok di kolom unique).
{
  const r = pilihPenyewa({ penyewaId: null, nik: '', nama: 'Tamu' }, DB)
  assert(r.aksi === 'CREATE' && r.nik === null, 'NIK kosong harus jadi null')
}

// 9. Booking baru dengan NIK baru -> CREATE, tersimpan.
{
  const r = pilihPenyewa({ penyewaId: null, nik: '999', nama: 'Andi' }, DB)
  assert(r.aksi === 'CREATE' && r.nik === '999', 'NIK baru harus tersimpan')
}

// 10. Tak ada cabang yang menghapus baris penyewa.
{
  const hasil = [
    pilihPenyewa({ penyewaId: 'p1', nik: '111' }, DB),
    pilihPenyewa({ penyewaId: 'p2', nik: null }, DB),
    pilihPenyewa({ penyewaId: null, nik: '999' }, DB),
  ]
  assert(hasil.every(h => h.aksi !== 'DELETE'), 'tak boleh ada jalur menghapus penyewa')
}

console.log('OK — check-pilih-penyewa: 10 blok assertion lulus')
