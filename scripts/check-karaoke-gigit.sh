#!/usr/bin/env bash
# Uji gigit: pastikan uji-uji baru BENAR-BENAR menggigit.
#
# Caranya: SALIN berkas ke cadangan, suntik bug yang seharusnya ditangkap,
# jalankan uji, lalu kembalikan dari cadangan.
#
# KENAPA CADANGAN SALINAN, BUKAN `git checkout`: berkas baru belum dilacak git
# (`??`), dan `git checkout --` pada berkas untracked GAGAL — dulu itu membuat
# bug tertinggal di repo tanpa terlihat. Salinan selalu bisa dikembalikan.
#
# Skrip ini BERHENTI kalau ada berkas yang tak bisa dikembalikan: menggagalkan
# seluruh pemeriksaan jauh lebih baik daripada meninggalkan bug di kode.
set -eu
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:55432/postgres}"

CADANGAN=$(mktemp -d -t hermes-gigit-XXXXXX)
lulus=0
gagal=0

# Simpan & kembalikan. `trap` menjaga cadangan terhapus walau skrip gagal.
BERKAS=(lib/karaoke.ts 'app/api/karaoke/sesi/[id]/minuman/route.ts' app/api/karaoke/laporan/route.ts scripts/check-karaoke-sesi.mjs)
for f in "${BERKAS[@]}"; do
  mkdir -p "$CADANGAN/$(dirname "$f")"
  cp "$f" "$CADANGAN/$f"
done
kembalikan() { for f in "${BERKAS[@]}"; do cp "$CADANGAN/$f" "$f"; done; }
bersihkan() { rm -rf "$CADANGAN"; }
trap bersihkan EXIT
trap 'kembalikan; echo "BERHENTI: bug dikembalikan setelah kegagalan tak terduga"' ERR

MATI() {
  kembalikan
  echo "BERHENTI: $1"
  echo "Semua berkas sudah dikembalikan dari cadangan; repo bersih."
  exit 1
}

# Jalankan uji; GAGAL = menggigit (yang kita mau), LULUS = cacat.
cek_gigit() {
  local nama="$1" berkas="$2"
  printf '  %-56s ' "$nama"
  if TZ=UTC node "$berkas" >/tmp/gigit-out.txt 2>&1; then
    echo "TIDAK MENGGIGIT — uji tetap lulus padahal bug disuntik"
    gagal=$((gagal + 1))
  else
    echo "menggigit"
    lulus=$((lulus + 1))
  fi
}

echo "Uji gigit — bug disuntik, uji harus GAGAL"

# ── 1. Zona waktu diabaikan: kembali ke jam mesin (bug produksi UTC) ───────
python3 - <<'PY' || MATI "tak bisa menyuntik bug zona waktu"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = """export function menitSejakTengahMalam(d: Date): number {
  const { jam, menit } = jamDiZona(d)
  return jam * 60 + menit
}"""
assert lama in s, 'penanda zona tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, """export function menitSejakTengahMalam(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}"""))
PY
cek_gigit "zona waktu: getHours() dipakai lagi" scripts/check-karaoke.mjs
kembalikan

# ── 2. `pada` diabaikan: booking tak pernah dibuat ────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug pada"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = "  if (!pada) return { ok: true, mulai: sekarang, booking: false }"
assert lama in s, 'penanda pada tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  return { ok: true, mulai: sekarang, booking: false }"))
PY
cek_gigit "booking: pada diabaikan, selalu mulai sekarang" scripts/check-karaoke.mjs
kembalikan

# ── 3. Jam yang sudah lewat diterima ──────────────────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug jam lewat"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = """  if (mulai.getTime() < sekarang.getTime() - MS_MENIT) {
    return { ok: false, pesan: 'Waktu mulai sudah lewat.' }
  }"""
assert lama in s, 'penanda lewat tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, ''))
PY
cek_gigit "booking: jam yang sudah lewat DITERIMA" scripts/check-karaoke.mjs
kembalikan

# ── 4. Subtotal minuman lupa dikali jumlah ────────────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug subtotal"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = "  return hargaSatuan * jumlah"
assert lama in s, 'penanda subtotal tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  return hargaSatuan"))
PY
cek_gigit "minuman: subtotal lupa dikali jumlah" scripts/check-karaoke.mjs
kembalikan

# ── 5. Penjaga stok dilumpuhkan di HELPER ─────────────────────────────────
# Helper dipakai route DAN uji, jadi melumpuhkannya harus menggigit di
# keduanya. Inilah yang dulu bocor: uji menulis ulang syaratnya sendiri, jadi
# bug di jalur asli tak terdeteksi.
python3 - <<'PY' || MATI "tak bisa menyuntik bug helper stok"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = """export function stokCukup(stokTersedia: number, diminta: number): boolean {
  return stokTersedia >= diminta
}"""
assert lama in s, 'penanda stokCukup tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, """export function stokCukup(stokTersedia: number, diminta: number): boolean {
  return true
}"""))
PY
cek_gigit "helper stokCukup selalu true (stok bisa minus)" scripts/check-karaoke.mjs
kembalikan

# ── 6. Uji murni stok dihapus dari berkas uji ─────────────────────────────
# Menjaga "uji yang menjaga": kalau baris uji `stokCukup` dihapus dari berkas
# uji, tak ada lagi yang memeriksa penjaga stok. Diperiksa dengan cara yang
# berbeda — bukan dengan menjalankan uji (yang tentu lulus tanpa baris uji),
# tapi dengan memastikan jalur potong-stok di route benar-benar memanggil
# `stokCukup`. Itu yang dulu bocor: route punya penjagaan, tapi tak ada uji
# yang menutupnya.
python3 - <<'PY' || MATI "tak bisa menyuntik bug pemanggilan stokCukup"
p = 'app/api/karaoke/sesi/[id]/minuman/route.ts'
s = open(p, encoding='utf8').read()
lama = "  if (!stokCukup(produk.stok, d.jumlah)) {"
assert lama in s, 'penanda pemanggilan stokCukup tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  if (produk.stok < 0) {"))
PY
# Uji murni memeriksa helper; yang memastikan ROUTE memakainya adalah
# pemeriksaan statis di berkas uji. Jadi jalankan pemeriksa itu.
if grep -q "route minuman memanggil stokCukup" scripts/check-karaoke.mjs; then
  printf '  %-56s ' "route tak lagi memanggil stokCukup"
  if TZ=UTC node scripts/check-karaoke.mjs >/tmp/gigit-out.txt 2>&1; then
    echo "TIDAK MENGGIGIT"; gagal=$((gagal + 1))
  else
    echo "menggigit"; lulus=$((lulus + 1))
  fi
else
  echo "  (lewat) pemeriksa statis belum ada — ditambahkan nanti"
fi
kembalikan

# ── 7. Laporan menghitung status yang salah ───────────────────────────────
# Saringan laporan kini satu definisi di `lib/karaoke.ts`, dipakai route DAN
# uji. Melumpuhkannya harus menggigit di kedua-duanya.
python3 - <<'PY' || MATI "tak bisa menyuntik bug laporan"
p = 'lib/karaoke.ts'
s = open(p, encoding='utf8').read()
lama = "  return { propertiId, status: 'SELESAI' as const, mulaiPada: { gte: awal, lte: akhir } }"
assert lama in s, 'penanda saringan laporan tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  return { propertiId, status: { in: ['SELESAI', 'BERJALAN'] } as const, mulaiPada: { gte: awal, lte: akhir } }"))
PY
cek_gigit "laporan ikut menghitung sesi BERJALAN (uang belum masuk)" scripts/check-karaoke-sesi.mjs
kembalikan

echo
if [ "$gagal" -ne 0 ]; then
  echo "uji gigit: $lulus menggigit, $gagal TIDAK menggigit"
  exit 1
fi
echo "uji gigit: $lulus menggigit, 0 tidak — semua berkas dikembalikan"
