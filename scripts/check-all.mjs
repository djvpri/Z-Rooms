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
import { readdirSync, existsSync } from 'node:fs'
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

const gagal = []

for (const f of berkas) {
  const r = spawnSync(process.execPath, [tsxCli, join(scriptsDir, f)], {
    stdio: 'inherit',
    cwd: akarRepo,
  })
  if (r.status !== 0) gagal.push(f)
}

if (gagal.length > 0) {
  console.error(`\nGAGAL: ${gagal.join(', ')}`)
  process.exit(1)
}
console.log(`\nOK — check: ${berkas.length} berkas lulus`)
