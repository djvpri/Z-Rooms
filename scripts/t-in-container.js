const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const P = 'cmtv6f1f30003y5t5ngn0ubj0'
const hariIni = { gte: new Date('2026-10-02T17:00:00.000Z'), lte: new Date('2026-10-03T17:00:00.000Z') }
p.pembayaran.aggregate({
  where: { dibayarPada: hariIni, tagihan: { sewa: { kamar: { propertiId: P } } } },
  _sum: { nominal: true },
}).then(r => {
  console.log('HARI_INI_SUM', JSON.stringify(r._sum))
  return p.$disconnect()
}).catch(e => { console.log('ERR', String(e.message).slice(0, 150)); process.exit(1) })
