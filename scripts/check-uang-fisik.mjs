// Self-check lib/uang.ts vs SQL langsung di DB live. Jalankan:
//   DATABASE_URL=<url> node scripts/check-uang-fisik.mjs
// rc=0 = pendapatan helper = SQL, piutang = SQL.
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const PROP = process.argv[2] ?? 'cmtvas58c0001tr2vygektrli'
const RENTANG = {
  gte: new Date('2026-09-30T17:00:00Z'), // 1 Okt WIB
  lte: new Date('2026-10-31T17:00:00Z'),
}

const [sewaHelper, barangHelper, piutangHelper] = await Promise.all([
  p.pembayaran.aggregate({
    where: { dibayarPada: RENTANG, tagihan: { sewa: { kamar: { propertiId: PROP } } } },
    _sum: { nominal: true },
  }).then(r => Number(r._sum.nominal ?? 0)),
  p.penjualan.aggregate({
    where: {
      propertiId: PROP, status: 'LUNAS',
      OR: [{ dibayarPada: RENTANG }, { dibayarPada: null, createdAt: RENTANG }],
    },
    _sum: { total: true },
  }).then(r => Number(r._sum.total ?? 0)),
  (async () => {
    const t = await p.tagihan.findMany({
      where: { status: { in: ['BELUM_BAYAR', 'TERLAMBAT', 'SEBAGIAN'] }, sewa: { kamar: { propertiId: PROP } } },
      select: { nominal: true, pembayaran: { select: { nominal: true } } },
    })
    return t.reduce((s, x) => s + Math.max(Number(x.nominal) - x.pembayaran.reduce((a, b) => a + Number(b.nominal), 0), 0), 0)
  })(),
])

// Ekspektasi dari SQL manual (2026-10-02, tenant KD, rentang WIB 1–31 Okt):
//   sewa fisik = 2.950.000 (15 Pembayaran dlm rentang WIB; SQL dgn rentang UTC
//   polos 2.650.000 itu SALAH — 1 pembayaran 150rb terjadi 30 Sep 22:30 UTC =
//   1 Okt 05:30 WIB). Barang = 6.395.000 ; piutang = 800.000
const eks = { sewa: 2950000, barang: 6395000, piutang: 800000 }
console.log(JSON.stringify({ sewaHelper, barangHelper, piutangHelper }))
let gagal = 0
for (const [k, v] of Object.entries({ sewa: sewaHelper, barang: barangHelper, piutang: piutangHelper })) {
  if (v !== eks[k]) { console.error(`GAGAL: ${k}=${v}, ekspektasi ${eks[k]}`); gagal = 1 }
}
await p.$disconnect()
process.exit(gagal)
