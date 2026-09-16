// scripts/check-all.mjs
//
// Jalankan semua self-check di scripts/check-*.mjs. Dipanggil `npm run check`.
//
// Sebelumnya `check` di package.json berbunyi `for f in scripts/check-*.mjs; ...`
// — sintaks bash. npm menjalankan script lewat cmd.exe di Windows, jadi
// perintahnya mati dengan "f was unexpected at this time" dan `npm run verify`
// tak pernah benar-benar memeriksa apa pun di mesin Windows. Runner ini murni
// Node, jadi hasilnya sama di Windows maupun Linux.
//
// Tiap berkas dijalankan lewat tsx (bukan node polos): check-*.mjs mengimpor
// modul .ts langsung, dan Node tak paham sintaks TypeScript.
//
// Memanggil tsx/dist/cli.mjs dengan process.execPath, BUKAN `npx`:
// npx di Windows adalah shim .cmd, dan lewat spawnSync tanpa shell ia balik
// dengan status bukan-nol walau perintahnya sukses — tiap check dilaporkan
// GAGAL padahal lulus (dibuktikan: npx -> status 1, cli.mjs -> status 0).
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const akarRepo = join(scriptsDir, '..')
const tsxCli = join(akarRepo, 'node_modules', 'tsx', 'dist', 'cli.mjs')

if (!existsSync(tsxCli)) {
  console.error(`tsx tak ada di ${tsxCli} — jalankan npm install`)
  process.exit(1)
}

const DIRI_SENDIRI = 'check-all.mjs'
const berkas = readdirSync(scriptsDir)
  .filter((f) => f.startsWith('check-') && f.endsWith('.mjs') && f !== DIRI_SENDIRI)
  .sort()

if (berkas.length === 0) {
  console.error('Tidak ada scripts/check-*.mjs')
  process.exit(1)
}

// Sebagian check menyentuh Postgres sungguhan (menulis lalu membersihkan data
// uji) dan mengimpor PrismaClient — tanpa DATABASE_URL, Prisma melempar
// "Environment variable not found" dan seluruh `npm run check` jadi merah
// padahal kodenya benar. Bedakan lewat isi berkas, bukan daftar nama: daftar
// nama akan basi begitu ada check baru yang butuh DB.
const bacaBerkas = (f) => readFileSync(join(scriptsDir, f), 'utf8')
const butuhDb = (f) => /@prisma\/client|new PrismaClient/.test(bacaBerkas(f))

const punyaDb = Boolean(process.env.DATABASE_URL)
const gagal = []
const dilewati = []

for (const f of berkas) {
  if (butuhDb(f) && !punyaDb) {
    dilewati.push(f)
    continue
  }
  const r = spawnSync(process.execPath, [tsxCli, join(scriptsDir, f)], {
    stdio: 'inherit',
    cwd: akarRepo,
  })
  if (r.status !== 0) gagal.push(f)
}

// Dilewati BUKAN lulus. Dicetak besar supaya tak ada yang mengira seluruh
// pemeriksaan hijau padahal jalur DB belum diuji sama sekali.
if (dilewati.length > 0) {
  console.log(`\nDILEWATI (butuh DATABASE_URL): ${dilewati.join(', ')}`)
  console.log('Jalankan dengan DATABASE_URL terisi untuk memeriksa jalur ini.')
}

if (gagal.length > 0) {
  console.error(`\nGAGAL: ${gagal.join(', ')}`)
  process.exit(1)
}
const lulus = berkas.length - dilewati.length
console.log(`\nOK — check: ${lulus} berkas lulus${dilewati.length > 0 ? `, ${dilewati.length} dilewati` : ''}`)
