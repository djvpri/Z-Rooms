// Grep pola di chunk server dalam kontainer ZXRoom, tampil konteks pendek.
// Ganti pola via argumen (regex POSIX ERE, di-escape utk sh -c).
const { execSync } = require('child_process')
const pat = process.argv[2]
const cmd = `sudo -n docker exec $(sudo -n docker ps -q --filter name=s1wonif2ibsl2jse0zoyrnkw | head -1) sh -c "grep -oE '${pat}' /app/.next/server/app/\\(dashboard\\)/keuangan/page.js | head -3"`
console.log(execSync(cmd, { encoding: 'utf8', maxBuffer: 10e6 }))
