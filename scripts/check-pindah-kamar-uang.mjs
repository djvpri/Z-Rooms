// Self-check logika uang pindah kamar: lebih mahal = kurang bayar, lebih
// murah = kembalian. Nilai dipilih agar hasil manual mudah dicek.
// Jalankan: node scripts/check-pindah-kamar-uang.mjs  (rc=0 = lulus)
function kreditPindahKamar({ tanggalMasuk, tanggalPindah, tanggalKeluar, hargaSewa, totalDibayar }) {
  const MS_HARI = 86_400_000
  const hariAntara = (a, b) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_HARI))
  const hariPeriode = Math.max(1, hariAntara(tanggalMasuk, tanggalKeluar))
  const hariDipakai = tanggalPindah.getTime() < tanggalMasuk.getTime()
    ? 0
    : Math.min(hariPeriode, hariAntara(tanggalMasuk, tanggalPindah) + 1)
  const nilaiPakai = Math.floor((hargaSewa / hariPeriode) * hariDipakai)
  return { hariPeriode, hariDipakai, nilaiPakai, kredit: Math.max(0, totalDibayar - nilaiPakai) }
}

const d = (s) => new Date(s)
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } }

// Kasus 1: harian 3 hari, hargaSewa periode 300rb (100rb/hari), bayar 300rb,
// pindah hari ke-2 ke kamar 150rb. Pakai 2 hari = 200rb → kredit 100rb
// → kamar baru 150rb → KURANG BAYAR 50rb, kembalian 0.
{
  const r = kreditPindahKamar({
    tanggalMasuk: d('2026-10-01T00:00:00Z'), tanggalPindah: d('2026-10-02T00:00:00Z'),
    tanggalKeluar: d('2026-10-04T00:00:00Z'), hargaSewa: 300_000, totalDibayar: 300_000,
  })
  assert(r.hariDipakai === 2 && r.kredit === 100_000, JSON.stringify(r))
  const kreditEfektif = Math.min(r.kredit, 150_000)
  const kembalian = r.kredit - kreditEfektif
  const kurangBayar = 150_000 - kreditEfektif
  assert(kurangBayar === 50_000 && kembalian === 0, 'kasus 1')
}

// Kasus 2: sama, pindah ke kamar 50rb. Pakai 2 hari = 200rb → kredit 100rb
// → tagihan baru 50rb → KEMBALIAN 50rb, kurang bayar 0.
{
  const r = kreditPindahKamar({
    tanggalMasuk: d('2026-10-01T00:00:00Z'), tanggalPindah: d('2026-10-02T00:00:00Z'),
    tanggalKeluar: d('2026-10-04T00:00:00Z'), hargaSewa: 300_000, totalDibayar: 300_000,
  })
  const hargaBaru = 50_000
  const kreditEfektif = Math.min(r.kredit, hargaBaru)
  const kembalian = r.kredit - kreditEfektif
  const kurangBayar = hargaBaru - kreditEfektif
  assert(kembalian === 50_000 && kurangBayar === 0, 'kasus 2')
}

// Kasus 3: pindah di hari yang sama dengan masuk → tetap 1 hari dipakai.
{
  const r = kreditPindahKamar({
    tanggalMasuk: d('2026-10-01T00:00:00Z'), tanggalPindah: d('2026-10-01T00:00:00Z'),
    tanggalKeluar: d('2026-10-04T00:00:00Z'), hargaSewa: 100_000, totalDibayar: 300_000,
  })
  assert(r.hariDipakai === 1, `hari sama = 1 dipakai, dapat ${r.hariDipakai}`)
}

// Kasus 4: bulanan 1jt periode 30 hari (1–31 Okt), pindah 11 Okt = hari ke-11
// inklusif. Nilai pakai = floor(1jt/30 × 11) = 366.666 → kredit 633.334.
{
  const r = kreditPindahKamar({
    tanggalMasuk: d('2026-10-01T00:00:00Z'), tanggalPindah: d('2026-10-11T00:00:00Z'),
    tanggalKeluar: d('2026-10-31T00:00:00Z'), hargaSewa: 1_000_000, totalDibayar: 1_000_000,
  })
  assert(r.nilaiPakai === 366_666 && r.kredit === 633_334, JSON.stringify(r))
}

console.log('check-pindah-kamar-uang: 4/4 lulus')
