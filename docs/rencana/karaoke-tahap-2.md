# TAHAP 2 KARAOKE ZXRoom — Instruksi Kerja

> **Status Tahap 1: SELESAI, TERVERIFIKASI, LIVE.** Commit `9a7a4ed`, sudah
> di-push ke `origin/master`, sudah deploy di produksi.
> Rencana lengkap: `.hermes/plans/2026-09-18_221500-karaoke-hotel.md` (baca §4.5,
> §4.7, §12). **TAPI baca bagian "Kenyataan kode" di bawah dulu** — sebagian
> rencana sudah terlanjur dikerjakan saat Tahap 1, jadi jangan kerjakan ulang.

Repo: `C:\Users\KBK065\zrooms`, branch `master`. Shell: git-bash/MSYS.
Bahasa laporan ke user: **Indonesia**. Commit author: `Andi <sentarummedia@gmail.com>`.

---

## 0. BACA DULU — kenyataan kode (ini menghemat separuh pekerjaan)

Rencana menyebut Tahap 2 punya 4 tugas. **Kenyataannya 2 di antaranya sudah
setengah jalan** karena logikanya sudah ditulis di Tahap 1 "supaya tidak
menggantung". Jangan bangun ulang — pakai yang ada.

| Tugas rencana | Kenyataan di kode | Yang benar-benar kurang |
|---|---|---|
| 2.1 Booking + lepas 15 menit | `memegangRuang()` (`lib/karaoke.ts:221`), `bentrok()` (`:236`), `TOLERANSI_BOOKING_MENIT = 15` (`:52`), `mulaiSekarang` (`:327`) **SUDAH ADA** | API **belum bisa** membuat sesi `BOOKING` berjadwal — `app/api/karaoke/sesi/route.ts:113` selalu `mulaiPada: sekarang`. Tak ada cara memasukkan jam mulai masa depan. |
| 2.2 Jaminan | **SUDAH JALAN PENUH.** `jaminan` di schema, zod (`lib/karaoke.ts:319`), API (`sesi/route.ts:117`), potong dari total (`sesi/[id]/route.ts:151`), UI input + baris struk (`karaoke/page.tsx:306`, `:569`) | **Tidak ada.** Kecuali: saat ini jaminan cuma "disarankan" kalau ada minuman — peringatan UI itu belum ada. |
| 2.3 Minuman ditebus | Model `ItemMinumanKaraoke` **ADA** (`schema.prisma:572`), total sudah dihitung (`sesi/[id]/route.ts:108-109`), ikut di `include` (`:34`, `:82`) | **Endpoint tambah/hapus minuman belum ada** — tak ada rute untuk menulis `ItemMinumanKaraoke`. UI pun belum ada. Stok produk belum di-`decrement`, dan belum dikembalikan saat batal. |
| 2.4 Laporan pendapatan | Belum ada sama sekali | Semua. |

**Kesimpulan: yang benar-benar perlu dikerjakan adalah 2.1 (sisi API booking),
2.3 (tulis minuman + stok), 2.4 (laporan). 2.2 sudah selesai — jangan sentuh
kecuali menambah peringatan UI.**

---

## 1. Aturan main yang TIDAK boleh dilanggar

Ini semua hasil keputusan yang sudah dikunci bersama user. Melanggarnya =
pekerjaan ditolak.

1. **Uang TIDAK PERNAH dari klien.** Total, sewa, jaminan dihitung ulang server
   dari `mulaiPada`. Klien cuma kirim niat (durasi, minuman apa).
2. **Jangan pakai cron/scheduler.** Booking lepas 15 menit dihitung *lazy* saat
   data dibaca. Repo ini tak punya scheduler, dan menambah satu = infra baru.
3. **Minuman mengurangi stok saat ditambahkan; stok kembali saat sesi dibatalkan.**
   Pola persis: `app/api/penjualan/[id]/batal/route.ts` (lihat `:62` `increment`).
   Saat menambah: `decrement` atomik seperti `app/api/penjualan/route.ts:206`.
   Stok kurang → HTTP 409 kode `STOK_KURANG` (jangan diam-diam minus).
4. **Jaminan BUKAN diskon.** Ia mengurangi `dibayar`, BUKAN `total`.
   `total = sewa + minuman`, `dibayar = total − jaminan` (sudah benar di
   `sesi/[id]/route.ts:150-151`).
5. **Jangan sentuh `Sewa`, `Tagihan`, `Kamar`.** Karaoke jalur uang ketiga yang
   berdiri sendiri.
6. **`lib/karaoke.ts` WAJIB tetap murni** — tanpa impor Prisma. Query DB ke
   `lib/karaokeDb.ts` (lihat pola `lib/produk.ts` ↔ `lib/piutang.ts`).
   Kalau menambah fungsi hitung uang, taruh di `lib/karaoke.ts`, bukan di route.
7. **Blok tarif wajib menutup 24 jam** — sudah ditegakkan (`periksaBlok()`,
   `lib/karaoke.ts:132`). Jangan longgarkan.
8. **Pembulatan selalu ke ATAS ke jam penuh.** 90 menit = 2 jam. Minimum 1 jam.
9. **Batalkan sesi = status `BATAL`, baris TIDAK dihapus.** Riwayat harus tetap
   ada untuk laporan.
10. **Ruang dengan riwayat sesi tak boleh dihapus.** Kalau tombol hapus ruang
    dipakai pada ruang yang sudah punya sesi, tolak dengan pesan jelas.

---

## 2. Tugas 2.1 — Booking berjadwal + lepas otomatis

**Masalah:** logika lepas-15-menit sudah ada, tapi tak ada cara membuat booking.

**Yang dikerjakan:**

1. `lib/karaoke.ts` — tambah `pada` (opsional) ke `bukaSesiSchema`:
   ```
   pada: z.string().datetime().optional()   // jam mulai yang diinginkan
   ```
   Kalau `pada` kosong → sesi jalan sekarang (perilaku lama, `BERJALAN`).
   Kalau `pada` diisi → `mulaiPada = pada`, `status = 'BOOKING'`.
   Kalau `pada` di masa lalu → tolak dengan pesan "Waktu mulai sudah lewat."
   Kehadiran `pada` adalah satu-satunya penentu status. Jangan tambah field
   `status` yang bisa dikirim klien — klien tak boleh memilih status.

2. `app/api/karaoke/sesi/route.ts:113` — ganti `mulaiPada: sekarang` jadi
   `mulaiPada: waktuMulai`, dan `status: d.pada ? 'BOOKING' : 'BERJALAN'`.
   **Penjaga bentrok tetap di dalam transaksi** (`:91-99`) — jangan dipindah.
   Sesi `BOOKING` yang sudah lepas 15 menit sudah otomatis diabaikan
   `bentrok()` karena `memegangRuang()` mengembalikan `false`.

3. **Tandai `BATAL` saat disentuh.** Ini bagian yang belum ada. Kalau
   `bentrok()` mengembalikan `bentrok: false` karena booking lama sudah lepas,
   booking itu harus ditandai `BATAL` supaya tak menggantung sebagai `BOOKING`
   selamanya (dan tidak ikut terhitung di laporan). Lakukan di dalam transaksi
   yang sama, sebelum `create`:
   ```
   updateMany({ where: { ruangId, status: 'BOOKING', mulaiPada: { lt: batasLepas } },
                data: { status: 'BATAL' } })
   ```
   `batasLepas = new Date(Date.now() - TOLERANSI_BOOKING_MENIT * 60_000)`.
   Ini juga yang membuat laporan 2.4 bersih.

4. `app/(dashboard)/karaoke/page.tsx` — tombol **"Booking"** di sebelah
   "Mulai" pada kartu ruang yang kosong. Form: nama pelanggan, tanggal + jam
   mulai, durasi, jaminan. Pakai ulang form yang sudah ada (`formBuka`) —
   tambah field `pada` saja, jangan bikin form kedua.
   Kartu ruang berstatus `BOOKING` tampil beda (badge "Booking 19:00") dengan
   tombol **"Pelanggan datang"** (sudah ada jalurnya lewat `mulaiSekarang`) dan
   **"Batal"**.

**Uji yang harus lulus:** booking jam 19:00, buka halaman jam 19:20 → booking
harus sudah lepas, ruang bisa dipakai, booking lama jadi `BATAL` di DB.

---

## 3. Tugas 2.3 — Minuman ditebus ke sesi

**Model sudah ada**, yang kurang rute + stok + UI.

1. **Rute baru** `app/api/karaoke/sesi/[id]/minuman/route.ts`:
   - `POST` — body `{ produkId, jumlah }`. Validasi zod di `lib/karaoke.ts`
     (murni), query di route.
   - Tolak kalau sesi bukan `BERJALAN` (sesi `BOOKING` belum didatangi; sesi
     `SELESAI`/`BATAL` tak bisa ditambah).
   - Salin `namaProduk` + `hargaSatuan` dari `Produk` **saat ditambahkan**
     (harga berubah besok tak boleh mengubah struk kemarin).
   - `subtotal = hargaSatuan × jumlah`.
   - `decrement` stok di transaksi sama; stok kurang → 409 `STOK_KURANG`.
   - `DELETE` dengan `?itemId=` untuk hapus satu baris + `increment` stok balik.
   Keduanya dalam `prisma.$transaction`.

2. `app/api/karaoke/sesi/[id]/batal/route.ts` — **kembalikan stok minuman** saat
   batal. Baca semua `ItemMinumanKaraoke` sesi itu, `increment` stok masing-masing
   produk, di dalam transaksi yang sama dengan perubahan status. Ini yang belum
   ada dan berpotensi merugikan stok kalau dilewat.

3. **UI** di `app/(dashboard)/karaoke/page.tsx` — panel sesi yang berjalan:
   daftar minuman + tombol "Tambah minuman" (pilih produk dari daftar produk
   yang sudah ada — halaman Produk di Pengaturan). Tampilkan subtotal dan
   `total` yang diperbarui.

4. **Peringatan jaminan (bukan paksaan).** Kalau minuman ditambah tapi
   `jaminan === 0`, tampilkan peringatan: "Pelanggan umum tanpa jaminan bisa
   kabur setelah pesan. Isi jaminan?" Jangan blokir — user memilih peringatan,
   bukan larangan.

---

## 4. Tugas 2.4 — Laporan pendapatan karaoke

Ikut di menu **Karaoke** (jangan buat menu baru — sidebar sudah padat).

- Ringkasan: pendapatan per ruang, per hari, rentang tanggal bisa dipilih.
- Yang dihitung hanya sesi `SELESAI` (bukan `BERJALAN`, bukan `BATAL`).
- Pisahkan **sewa ruang** dan **minuman** — operator perlu tahu mana yang
  menguntungkan.
- Tampilkan juga: jam terpakai (okupansi) per ruang, jumlah sesi.
- Tak perlu grafik. Tabel + total. Simpel dulu.

---

## 5. Uji wajib

Repo pakai `npm run check` yang auto-menjalankan setiap `scripts/check-*.mjs`
(tak perlu daftar manual — `readdirSync`).

- **`scripts/check-karaoke.mjs`** (murni, tanpa DB) — sudah ada, 45 assertion
  lulus. **Tambah** assertion untuk: booking lepas 15 menit (batas tepat 15:00
  lepas, 14:59 masih memegang), `pada` di masa lalu ditolak, `bukaSesiSchema`
  menerima `pada` opsional.
- **`scripts/check-karaoke-sesi.mjs`** (butuh DB) — sudah ada, 9 lulus. **Tambah**:
  tambah minuman → stok turun + item tersimpan; batal → stok kembali; minuman
  di sesi `BOOKING` ditolak; booking lepas jadi `BATAL`.
  ⚠ Nama file uji jalur sesi di rencana (`check-sesi-karaoke.mjs`) **salah** —
  nama nyatanya `check-karaoke-sesi.mjs`. Jangan bikin file kedua.
- **Skrip uji sementara JANGAN di-commit.** Kalau butuh skrip sekali pakai untuk
  debug, taruh di luar `scripts/` (mis. `/tmp`) atau hapus sebelum commit.

**Aturan uji:** impor sumber ASLI (jangan salin logikanya), idempoten (jalankan
2× harus sama), dan jangan mengunci angka yang memang harus berubah (jangan
tulis "ada 5 model karaoke" — tulis hubungan antar-data).

---

## 6. Verifikasi sebelum commit (WAJIB, jalankan semua)

```bash
cd /c/Users/KBK065/zrooms
npx tsc --noEmit                      # harus exit 0. JANGAN ukur lewat grep.
npm run check                         # tanpa DB: harus lulus
npx prisma validate                   # harus exit 0
npx next build --webpack              # harus exit 0
```

Dengan DB staging (Postgres portabel, port **55432**):

```bash
export DATABASE_URL="postgresql://postgres:<PASSWORD_STAGING>@127.0.0.1:55432/zxroom_uji4?schema=public"
npm run check                         # harus lulus, termasuk uji DB
```

**Path Postgres di MSYS WAJIB lewat `cygpath -w`** — `/c/tmp/...` gagal,
`cygpath -w /tmp/pgstage/...` berhasil. Ini sudah pernah menjebak.

**Angka acuan Tahap 1** (jangan bingung kalau beda sedikit, tapi ketahui baseline):
- `npm run check` tanpa DB: **28 lulus, 3 dilewati**
- dengan DB: **30 lulus, 1 dilewati**
- `check-karaoke.mjs`: 45 assertion
- `check-karaoke-sesi.mjs`: 9 lulus, idempoten

Yang "dilewati" adalah uji yang butuh `DATABASE_URL` — sengaja, bukan gagal.

---

## 7. Verifikasi di produksi setelah deploy

Push ke `master` **otomatis memicu deploy Coolify** (webhook aktif, ~7-12 menit).
Jangan klaim "belum ter-deploy" sebelum cek halaman deployment.

- App Coolify: `s1wonif2ibsl2jse0zoyrnkw`, env `x22jg9drzphve1qox0mzlg0l`, project `tqzvtl1ppnpwrbf6pzces0s5`.
- Coolify: `http://103.93.129.94:8000` (login di catatan memori).
- URL app: `https://zxroom.zomet.my.id`.
- **Tabel baru otomatis dibuat** — `package.json` `start` menjalankan
  `prisma db push --accept-data-loss` sebelum `next start`. Tabel karaoke Tahap 1
  terkonfirmasi muncul di prod lewat jalur ini (23 tabel).
- Login uji: tombol **"Coba Langsung sebagai Demo"** di `https://zone.zomet.my.id/login`
  → pilih ZXRoom. Login biasa tak bisa menembus SSO antar-domain.

**Jebakan verifikasi produksi:** `middleware.ts` meredirect SEMUA rute tanpa
login (307 ke `/login`) — termasuk rute palsu. Jadi HTTP 307/404 **bukan bukti**
rute ada atau tidak. Satu-satunya cara: login dulu, baru buka halamannya.

---

## 8. Jebakan yang sudah pernah menggigit (hindari berulang)

1. **`window.confirm()` di UI memblokir SEMUA aksi browser tool, permanen** —
   reload tak menembusnya. Jangan pernah klik tombol hapus/batal lewat browser
   otomatis tanpa rencana. Uji jalur itu manual atau lewat DB/API langsung.
2. **Pipe `|` di terminal web Coolify bocor ke shell Windows host.** Hindari
   pipe di sana. Dan `psql` TIDAK ADA di container — pakai `node` + Prisma.
3. **Skrip `.mjs` yang menulis file ke `/tmp` lalu dijalankan `node` dari `/app`
   akan gagal `MODULE_NOT_FOUND`** — resolusi modul ikut lokasi file, bukan cwd.
   Tulis skrip di dalam `/app`.
4. **Linter xterm Coolify menelan `=>`** (dianggap escape). Hindari arrow function
   di perintah terminal web; pakai `function(){}` atau tulis skrip ke file dulu.
5. **Next 16: `searchParams` adalah Promise — WAJIB `await`.**
6. **`db push` di repo `zrooms` pernah menghapus tabel di luar schema** — di
   produksi jalur ini sudah terbukti aman, tapi jangan tambah `db push` manual di
   tempat lain.
7. **Uji `.tsx` wajib lewat `node node_modules/tsx/dist/cli.mjs`** + pola interop
   `Mod.default ?? Mod`.
8. **Fungsi `uji()` di skrip `.mjs` harus langsung menjalankan `await fn()`** saat
   dideklarasikan. Daftar `judul`/`jalankan` yang ditunda pernah menghasilkan
   laporan palsu "0 lulus, 0 gagal" padahal tak ada yang jalan.

---

## 9. Definisi selesai

- [ ] Booking berjadwal bisa dibuat, tampil di papan, bisa "Pelanggan datang", dan lepas otomatis 15 menit jadi `BATAL`
- [ ] Minuman bisa ditambah/dihapus di sesi berjalan; stok turun & kembali dengan benar
- [ ] Laporan pendapatan karaoke (per ruang, per hari, sewa vs minuman)
- [ ] `npx tsc --noEmit` = 0
- [ ] `npm run check` lulus tanpa DB **dan** dengan DB
- [ ] `npx prisma validate` = 0
- [ ] `npx next build --webpack` = 0
- [ ] Commit author `Andi <sentarummedia@gmail.com>`, pesan jelas, **push ke `master`**
- [ ] Deploy Coolify cek statusnya (webhook otomatis), lalu verifikasi live setelah login demo

**Laporan akhir ke user dalam bahasa Indonesia:** apa yang dikerjakan, angka
verifikasi nyata, hash commit, status deploy. Jangan mengklaim sesuatu yang tidak
dibuktikan output tool.
