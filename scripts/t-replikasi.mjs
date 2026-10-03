// Replikasi pendapatanSewa lib/uang.ts dgn rentang PERSIS dari debug line.
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const P = 'cmtv6f1f30003y5t5ngn0ubj0' // Hotel Demo

async function sewa(rentang) {
  const r = await p.pembayaran.aggregate({
    where: { dibayarPada: rentang, tagihan: { sewa: { kamar: { propertiId: P } } } },
    _sum: { nominal: true },
  })
  return Number(r._sum.nominal ?? 0)
}

const hariIni = { gte: new Date('2026-10-02T17:00:00.000Z'), lte: new Date('2026-10-03T17:00:00.000Z') }
const rentang = { gte: new Date('2026-10-01T17:00:00.000Z'), lte: new Date('2026-11-02T17:00:00.000Z') }

console.log(JSON.stringify({
  hariIni: await sewa(hariIni),
  rentang: await sewa(rentang),
  // dan daftar pembayaran yg seharusnya masuk hari-ini:
  list: await p.pembayaran.findMany({
    where: { dibayarPada: hariIni, tagihan: { sewa: { kamar: { propertiId: P } } } },
    select: { dibayarPada: true, nominal: true },
  }),
}, null, 1))
await p.$disconnect()
