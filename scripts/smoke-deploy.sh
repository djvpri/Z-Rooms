#!/usr/bin/env bash
# scripts/smoke-deploy.sh
#
# Smoke pasca-deploy: pastikan tiap route menjawab status yang BENAR.
# Jalankan: npm run smoke  (atau: bash scripts/smoke-deploy.sh <base-url>)
#
# Sengaja tanpa DB dan tanpa login — ini cek "app hidup dan routing utuh",
# bukan cek fitur. Yang ditangkap: deploy gagal, container crash-loop, route
# hilang, middleware mati (halaman terproteksi jadi 200 buat publik = bahaya).
#
# Status yang diharapkan:
#   200      halaman publik (login)
#   307/302  halaman terproteksi -> redirect ke /login (middleware bekerja)
#   200/401/405  route API (401 = butuh sesi, benar; 405 = method salah)
#   404      route yang memang tak ada (negatif — memastikan bukan semua 200)
set -uo pipefail

BASE="${1:-https://zxroom.zomet.my.id}"
GAGAL=0
LEWAT=0

minta() {
  local jalur="$1" harap="$2" nama="$3"
  local kode bodi
  # -o ke berkas sementara RELATIF, bukan /dev/null dan bukan hasil mktemp:
  # curl bawaan MSYS (git-bash) menolak menulis ke jalur yang dikenali shell
  # tapi bukan jalur Windows yang sah — /dev/null dan /tmp/tmp.XXXX sama-sama
  # keluar dengan status 23 ("client returned ERROR on write"), sehingga tiap
  # route dilaporkan "000 tak terhubung" padahal produksi sehat: smoke selalu
  # 18/18 GAGAL di Windows. Nama relatif di direktori kerja bekerja di
  # Windows maupun Linux.
  bodi=".smoke-bodi.$$"
  kode=$(curl -sS -o "$bodi" -w '%{http_code}' --max-time 20 "$BASE$jalur" 2>/dev/null) || kode="000"
  rm -f "$bodi"
  if [[ ",$harap," == *",$kode,"* ]]; then
    printf 'OK    %-28s %s\n' "$jalur" "$kode"
  else
    printf 'GAGAL %-28s %s (harap: %s)  %s\n' "$jalur" "$kode" "$harap" "$nama"
    GAGAL=$((GAGAL + 1))
  fi
  LEWAT=$((LEWAT + 1))
}

echo "Smoke: $BASE"
echo

# Tunggu container benar-benar melayani sebelum menilai. Pasca-deploy ada jeda
# di mana /api/health sudah balas (proses hidup) tapi routing Next belum siap —
# smoke yang langsung jalan melaporkan GAGAL palsu untuk sebagian route, dan
# itu sudah kejadian. Tunggu sampai /login stabil 200 dua kali berturut-turut.
siap=0
for i in $(seq 1 30); do
  kode=$(curl -sS -o .smoke-siap.$$ -w '%{http_code}' --max-time 10 "$BASE/login" 2>/dev/null) || kode="000"
  if [ "$kode" = "200" ]; then
    kode2=$(curl -sS -o .smoke-siap.$$ -w '%{http_code}' --max-time 10 "$BASE/login" 2>/dev/null) || kode2="000"
    [ "$kode2" = "200" ] && { siap=1; break; }
  fi
  sleep 3
done
rm -f .smoke-siap.$$
if [ "$siap" -ne 1 ]; then
  echo "GAGAL — $BASE/login tidak siap setelah 90 detik (kode terakhir: $kode)"
  exit 1
fi

# ── Halaman publik ───────────────────────────────────────────────────────
minta /login               '200'      'halaman login harus render'

# ── Halaman terproteksi: WAJIB redirect, bukan 200 ───────────────────────
# Kalau ini balas 200 tanpa sesi, middleware/proxy bocor — kasir lain bisa
# lihat data properti tanpa masuk. Uji ini yang paling penting di sini.
minta /dashboard           '307,302'  'terproteksi -> redirect login'
minta /kamar               '307,302'  'terproteksi -> redirect login'
minta /penyewa             '307,302'  'terproteksi -> redirect login'
minta /booking             '307,302'  'terproteksi -> redirect login'
minta /keuangan            '307,302'  'terproteksi -> redirect login'
minta /notifikasi          '307,302'  'terproteksi -> redirect login'
minta /pengaturan          '307,302'  'terproteksi -> redirect login'
minta /pengaturan/properti '307,302'  'terproteksi -> redirect login'

# ── API: tanpa sesi SEMUA jalur dilindungi middleware dulu -> 307 ke /login.
#    Jadi 307 di sini memang benar. Route API membalas 401/404/405 hanya kalau
#    dipanggil DENGAN sesi — itu uji lapis integrasi, bukan smoke. ─────────
minta /api/properti        '307'      'middleware lindungi sebelum route'
minta /api/properti/aktif  '307'      'route identitas properti (dipakai nota)'
minta /api/kamar           '307'      'middleware lindungi sebelum route'
minta /api/booking         '307'      'middleware lindungi sebelum route'
minta /api/keuangan        '307'      'middleware lindungi sebelum route'
minta /api/dashboard       '307'      'middleware lindungi sebelum route'
minta /api/penyewa         '307'      'middleware lindungi sebelum route'

# ── Jalur yang SENGAJA publik di middleware harus benar-benar tembus, bukan
#    ikut ter-redirect. Kalau ini balas 307, demo/health/SSO mati diam-diam. ─
minta /api/health          '200,401,405'  'health publik, tak boleh redirect'

# ── Negatif: jalur asing pun ikut middleware (307), BUKAN 404. Diverifikasi di
#    produksi: matcher middleware menangkap semua. Uji ini mengunci perilaku
#    itu supaya perubahan matcher terlihat. ────────────────────────────────
minta /halaman-tidak-ada-ini '307'    'jalur asing ikut middleware (bukan 404)'

echo
if [ "$GAGAL" -eq 0 ]; then
  echo "OK — smoke: $LEWAT route lulus"
  exit 0
fi
echo "GAGAL — smoke: $GAGAL dari $LEWAT route tak sesuai"
exit 1
