// scripts/check-pindah-deposit.mjs
//
// Self-check logika perpindahan deposit saat pindah kamar. Jalankan:
//   node scripts/check-pindah-deposit.mjs
//
// Salinan logika dari app/api/sewa/[id]/pindah-kamar/route.ts. Kalau salah satu
// diubah, ubah keduanya — self-check ini mengunci invariannya, bukan angkanya.
import assert from 'node:assert/strict'

// Deposit yang ikut pindah selalu deposit titipan sewa lama; kekurangan ditagih.
function hitungDeposit(depositLama, depositDiminta) {
  const pindah = depositLama
  const kurang = Math.max((depositDiminta ?? depositLama) - depositLama, 0)
  return { pindah, kurang }
}

// Invarian inti: uang titipan tidak berubah jumlah hanya karena kamarnya pindah.
{
  const { pindah, kurang } = hitungDeposit(1_000_000, 1_000_000)
  assert.equal(pindah, 1_000_000, 'deposit sama -> pindah utuh')
  assert.equal(kurang, 0, 'deposit sama -> tidak ada tagihan tambahan')
}

// Kamar tujuan lebih mahal: selisih jadi tagihan, deposit tetap pindah utuh.
{
  const { pindah, kurang } = hitungDeposit(1_000_000, 1_500_000)
  assert.equal(pindah, 1_000_000)
  assert.equal(kurang, 500_000, 'selisih deposit ditagih, bukan dipotong dari titipan')
}

// Kamar tujuan lebih murah: TIDAK mengembalikan uang saat pindah. Kelebihan
// diselesaikan saat check-out final, supaya tidak ada uang keluar di tengah sewa.
{
  const { pindah, kurang } = hitungDeposit(2_000_000, 800_000)
  assert.equal(pindah, 2_000_000, 'kelebihan tetap ditahan, bukan dikembalikan')
  assert.equal(kurang, 0, 'tidak pernah negatif')
}

// Kamar tujuan tanpa harga/deposit terdaftar -> pakai deposit lama apa adanya.
{
  const { pindah, kurang } = hitungDeposit(750_000, null)
  assert.equal(pindah, 750_000)
  assert.equal(kurang, 0)
}

// Deposit nol (mis. sewa harian) tetap nol di kedua sisi, tanpa tagihan hantu.
{
  const { pindah, kurang } = hitungDeposit(0, 0)
  assert.equal(pindah, 0)
  assert.equal(kurang, 0)
}

// Invarian: total uang titipan yang dipegang properti sebelum dan sesudah
// pindah harus identik. Inilah alasan pindah tidak menulis Pengeluaran/Pembayaran.
for (const [lama, diminta] of [[1_000_000, 1_500_000], [2_000_000, 800_000], [0, 300_000], [500_000, 500_000]]) {
  const { pindah, kurang } = hitungDeposit(lama, diminta)
  assert.equal(pindah + kurang, Math.max(lama, diminta ?? lama),
    `titipan awal ${lama} + tagihan ${kurang} harus setara titipan target`)
}

console.log('OK — 6 blok assertion lulus')
