// Self-check: node --experimental-strip-types scripts/check-demo-auth.mjs
// ponytail: assert-based, no test framework. Jalankan sebelum deploy.
import { cekDemoSecret } from "../app/lib/demo-auth.ts";

const mk = (auth) => new Request("http://x/api/demo/setup", auth ? { headers: { Authorization: auth } } : undefined);

const cases = [
  ["secret benar", "rahasia123", "Bearer rahasia123", true],
  ["prefix doang (eksploit lama)", "rahasia123", "Bearer zrooms-demo-x", false],
  ["secret salah", "rahasia123", "Bearer rahasia124", false],
  ["tanpa header", "rahasia123", null, false],
  ["header non-Bearer", "rahasia123", "Basic rahasia123", false],
  ["secret kosong di header", "rahasia123", "Bearer ", false],
  ["env tak diset", undefined, "Bearer rahasia123", false],
];

let gagal = 0;
for (const [nama, envSecret, auth, harap] of cases) {
  if (envSecret === undefined) delete process.env.DEMO_SECRET;
  else process.env.DEMO_SECRET = envSecret;
  const dapat = cekDemoSecret(mk(auth));
  if (dapat !== harap) {
    gagal++;
    console.error(`FAIL ${nama}: harap ${harap}, dapat ${dapat}`);
  }
}
if (gagal) process.exit(1);
console.log(`OK ${cases.length} kasus`);
