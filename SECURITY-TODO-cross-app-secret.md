# Temuan: secret cross-app hardcoded (BELUM diperbaiki)

Status: **dilaporkan, sengaja tidak diubah** (2026-09-12, keputusan owner — mau cek
pemanggil lain dulu).

## Kerentanan

Secret `z-ecosystem-admin-2026` tertulis di source code dan **masih diterima**
sebagai kredensial sah. Terverifikasi di produksi:

    curl -X GET https://zxroom.zomet.my.id/api/admin/cross-app \
      -H 'Authorization: Bearer z-ecosystem-admin-2026'   -> HTTP 200

Siapa pun yang bisa membaca repo bisa **membuat, menonaktifkan, dan mengaktifkan
tenant** di semua instalasi ZXRoom (aksi `createTenant` / `deleteTenant` /
`reactivateTenant`).

## Lokasi (3 titik, 2 repo)

| File | Baris | Isi |
|---|---|---|
| `Z-Rooms/app/api/admin/cross-app/route.ts` | 10-11 | `NEW_SECRET` fallback hardcoded + `OLD_SECRET` |
| `Z-Rooms/lib/auth.ts` | 35-36 | sama, di jalur auth SSO |
| `ZOne/src/lib/secrets.ts` | 8 | `OLD_SECRET` hardcoded, ikut di `VALID_SECRETS` |

Catatan: `ZOne/src/lib/secrets.ts` komentarnya sudah berniat baik ("TIDAK ada
fallback hardcode di sini ... lebih baik gagal keras") tapi baris di bawahnya
tetap memuat secret hardcoded — niat dan kode tidak sinkron.

`CROSS_APP_SECRET` di produksi ZXRoom **sudah ter-set** (22 karakter), jadi
fallback hardcoded sebenarnya tidak diperlukan.

## Rencana perbaikan (kalau nanti disetujui)

1. Buang fallback `NEW_SECRET` hardcoded di kedua repo -> fail fast kalau env kosong
2. Buang `OLD_SECRET` dari `VALID_SECRETS` -> hanya secret env yang sah
3. Push + deploy **kedua repo** (ZOne & ZXRoom); secret lama harus berhenti berlaku bersamaan
4. Uji: secret lama -> 401, secret env -> 200

Risiko: pemanggil yang masih pakai secret lama (cron/script/instalasi lama) akan
putus sampai di-update. Belum ada jejak pemanggil di kedua repo — perlu dicek manual.

## Yang sudah diperbaiki (terpisah, sudah live)

- `booking`: kamarId diverifikasi kepemilikannya (commit e60790d)
- `properti aktif`: pemilih properti multi-tenant (commit a27dd8a)
- `demo`: seed ke owner yang benar, reset-daily tidak menumpuk (commit e53b317)
