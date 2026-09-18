#!/usr/bin/env bash
# Uji gigit untuk setelan cetak: pastikan check-cetak.mjs BENAR-BENAR menggigit.
#
# Menyuntik bug yang seharusnya ditangkap, lalu memastikan uji GAGAL. Uji yang
# tetap LULUS saat bug disuntik tak menjaga apa pun.
#
# Memakai cadangan SALINAN, bukan `git checkout`: berkas baru belum dilacak git
# dan `git checkout` pada berkas untracked gagal diam-diam (pelajaran dari
# check-karaoke-gigit.sh, yang sempat meninggalkan bug di repo).
set -eu
cd "$(dirname "$0")/.."

CADANGAN=$(mktemp -d -t hermes-cetak-XXXXXX)
lulus=0
gagal=0

BERKAS=(lib/cetak.ts app/api/properti/pref-cetak/route.ts 'app/(dashboard)/pengaturan/cetak/page.tsx')
for f in "${BERKAS[@]}"; do
  mkdir -p "$CADANGAN/$(dirname "$f")"
  cp "$f" "$CADANGAN/$f"
done
kembalikan() { for f in "${BERKAS[@]}"; do cp "$CADANGAN/$f" "$f"; done; }
trap 'rm -rf "$CADANGAN"' EXIT
trap 'kembalikan; echo "BERHENTI: bug dikembalikan setelah kegagalan tak terduga"' ERR

MATI() { kembalikan; echo "BERHENTI: $1"; echo "Berkas sudah dikembalikan dari cadangan."; exit 1; }

cek_gigit() {
  local nama="$1"
  printf '  %-56s ' "$nama"
  if TZ=UTC node scripts/check-cetak.mjs >/tmp/cetak-gigit.txt 2>&1; then
    echo "TIDAK MENGGIGIT — uji tetap lulus padahal bug disuntik"
    gagal=$((gagal + 1))
  else
    echo "menggigit"
    lulus=$((lulus + 1))
  fi
}

echo "Uji gigit setelan cetak"

# ── 1. Kolom 80mm salah (dibuat sama dengan 58mm) ─────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug kolom"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = "  '80': { label: '80 mm (struk lebar)', kolom: 48 },"
assert lama in s, 'penanda kolom 80 tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  '80': { label: '80 mm (struk lebar)', kolom: 32 },"))
PY
cek_gigit "kolom 80mm salah (32, bukan 48)"
kembalikan

# ── 2. Garis pemisah lebih panjang dari kertas ────────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug garis"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = "  return karakter.repeat(kolomKertas(kertas))"
assert lama in s, 'penanda garis tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  return karakter.repeat(kolomKertas(kertas) + 8)"))
PY
cek_gigit "garis pemisah kelebihan 8 karakter (akan berlipat)"
kembalikan

# ── 3. Pengisi dipaksa minimal 1 walau ruang habis ────────────────────────
# Ini bug ASLI yang ditemukan uji ini saat pertama ditulis: baris jadi 33
# karakter di kertas 32 kolom.
python3 - <<'PY' || MATI "tak bisa menyuntik bug pengisi"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = """  const pengisi = lebar - kiri.length - kanan.length
  if (pengisi <= 0) return kiri + kanan
  return kiri + '.'.repeat(pengisi) + kanan"""
assert lama in s, 'penanda pengisi tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  return kiri + '.'.repeat(Math.max(1, lebar - kiri.length - kanan.length)) + kanan"))
PY
cek_gigit "pengisi minimal 1 (baris melebihi lebar kertas)"
kembalikan

# ── 4. Ukuran kertas tak dikenal diteruskan apa adanya ────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug kertas tak dikenal"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = "  if (typeof s.kertas === 'string' && s.kertas in UKURAN_KERTAS) p.kertas = s.kertas as KunciKertas"
assert lama in s, 'penanda validasi kertas tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  if (typeof s.kertas === 'string') p.kertas = s.kertas as KunciKertas"))
PY
cek_gigit "kertas tak dikenal diteruskan (bisa 0 kolom di printer)"
kembalikan

# ── 5. JSON rusak membuat halaman mati ────────────────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug JSON rusak"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = """  } catch {
    // JSON rusak (pernah tersimpan separuh / diketik tangan) diperlakukan sama
    // dengan belum diatur. Menolak render hanya karena setelan cetak akan
    // mematikan halaman yang tak ada hubungannya dengan cetak.
    return { ...PREF_CETAK_BAWAAN }
  }"""
assert lama in s, 'penanda catch tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  } catch { throw new Error('JSON rusak') }"))
PY
cek_gigit "JSON rusak dilempar (halaman pengaturan mati)"
kembalikan

# ── 6. Field tak dikenal ikut tersimpan ───────────────────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug field asing"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = "  const p: PrefCetak = { ...PREF_CETAK_BAWAAN }\n  if (!simpan || typeof simpan !== 'object') return p\n  const s = simpan as Record<string, unknown>"
assert lama in s, 'penanda bacaPrefCetak tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  if (!simpan || typeof simpan !== 'object') return { ...PREF_CETAK_BAWAAN }\n  const p = { ...PREF_CETAK_BAWAAN, ...(simpan as Record<string, unknown>) } as PrefCetak\n  const s = simpan as Record<string, unknown>"))
PY
cek_gigit "field tak dikenal ikut tersimpan ke DB"
kembalikan

# ── 7. Route tak lagi memvalidasi lewat bacaPrefCetak ────────────────────
python3 - <<'PY' || MATI "tak bisa menyuntik bug route"
p = 'app/api/properti/pref-cetak/route.ts'
s = open(p, encoding='utf8').read()
lama = "  const pref = bacaPrefCetak(body.pref)"
assert lama in s, 'penanda validasi route tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  const pref = (body.pref ?? PREF_CETAK_BAWAAN) as PrefCetak"))
PY
cek_gigit "route menyimpan kiriman mentah tanpa validasi"
kembalikan

# ── 8. Pratinjau halaman menulis ulang tata letak sendiri ────────────────
# Harus melumpuhkan SEMUA panggilan, bukan satu: mengganti satu baris saja
# masih meninggalkan panggilan lain, sehingga pemeriksa tetap lulus dan bug
# tampak "tak menggigit" padahal cacatnya ada di gigit itu sendiri.
python3 - <<'PY' || MATI "tak bisa menyuntik bug pratinjau"
import re
p = 'app/(dashboard)/pengaturan/cetak/page.tsx'
s = open(p, encoding='utf8').read()
lama = """  const baris = [
    barisTengah('ZXRoom', k),
    barisTengah('Contoh Penginapan', k),
    garisKertas(k, '='),
    barisKiriKanan('No: KR-0042', '18/09 19:30', k),
    barisKiriKanan('Ruang: Melati', 'Kasir: Ani', k),
    garisKertas(k),
    barisDuaKolom('Sewa 2 jam', '130.000', k),
    barisDuaKolom('Air mineral 2x', '10.000', k),
    garisKertas(k),
    barisDuaKolom('TOTAL', '140.000', k),
    barisDuaKolom('Jaminan', '50.000', k),
    garisKertas(k, '='),
  ]"""
assert lama in s, 'penanda pratinjau tidak ketemu'
baru = """  const baris = [
    'ZXRoom',
    'Contoh Penginapan',
    '='.repeat(kolomKertas(k)),
    'No: KR-0042 18/09 19:30',
    'Ruang: Melati Kasir: Ani',
    '-'.repeat(kolomKertas(k)),
    'Sewa 2 jam ......... 130.000',
    'Air mineral 2x ...... 10.000',
    '-'.repeat(kolomKertas(k)),
    'TOTAL .............. 140.000',
    'Jaminan ............. 50.000',
    '='.repeat(kolomKertas(k)),
  ]"""
open(p, 'w', encoding='utf8').write(s.replace(lama, baru))
PY
cek_gigit "pratinjau menulis ulang tata letak (tak memakai lib/cetak)"
kembalikan

# ── 9. Tombol tes cetak hilang dari halaman ──────────────────────────────
python3 - <<'PY2' || MATI "tak bisa menyuntik bug tombol"
p = 'app/(dashboard)/pengaturan/cetak/page.tsx'
s = open(p, encoding='utf8').read()
lama = "                onClick={tesCetak}"
assert lama in s, 'penanda tombol tes tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "                onClick={() => {}}"))
PY2
cek_gigit "tombol Tes cetak tak lagi memanggil apa pun"
kembalikan

# ── 10. Jembatan dicek tanpa memastikan kemampuan cetak ───────────────────
# APK lama punya ZXR_APK tanpa `cetak`. Menganggapnya "ada" membuat tombol
# menyala lalu diam — terbaca kasir sebagai kerusakan.
python3 - <<'PY2' || MATI "tak bisa menyuntik bug jembatan"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = "  if (typeof kandidat.cetak !== 'function') return null"
assert lama in s, 'penanda jembatan tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  // kemampuan cetak tak diperiksa"))
PY2
cek_gigit "jembatan dianggap ada tanpa memeriksa kemampuan cetak"
kembalikan

# ── 11. Naskah dikirim tanpa perintah ESC/POS ─────────────────────────────
python3 - <<'PY2' || MATI "tak bisa menyuntik bug naskah"
p = 'lib/cetak.ts'
s = open(p, encoding='utf8').read()
lama = """  const naskah: PerintahEscPos[] = [
    { jenis: 'mentah', byte: [...ESC.INISIALISASI] },
    { jenis: 'mentah', byte: [...ESC.RATA_KIRI] },
  ]"""
assert lama in s, 'penanda naskah tidak ketemu'
open(p, 'w', encoding='utf8').write(s.replace(lama, "  const naskah: PerintahEscPos[] = []"))
PY2
cek_gigit "naskah tanpa inisialisasi printer"
kembalikan

echo
if [ "$gagal" -ne 0 ]; then
  echo "uji gigit cetak: $lulus menggigit, $gagal TIDAK menggigit"
  exit 1
fi
echo "uji gigit cetak: $lulus menggigit, 0 tidak — semua berkas dikembalikan"
