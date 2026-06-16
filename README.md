# 🏠 NusaSewa — Manajemen Properti Sewa

Aplikasi web manajemen properti sewa (kos, kontrakan, hotel) berbasis Next.js 14 + PostgreSQL, siap deploy ke Railway.

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API Routes + Server Actions |
| Database | PostgreSQL (Railway) |
| ORM | Prisma |
| Auth | NextAuth v5 (Credentials) |
| Deploy | Railway |

---

## 🚀 Deploy ke Railway (Step by Step)

### 1. Siapkan Repository

```bash
git init
git add .
git commit -m "initial commit: NusaSewa"
```

Buat repo baru di GitHub, lalu push:
```bash
git remote add origin https://github.com/USERNAME/nusasewa.git
git push -u origin main
```

---

### 2. Buat Project di Railway

1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repo `nusasewa`

---

### 3. Tambahkan PostgreSQL

Di Railway dashboard:
1. Klik **+ New** → **Database** → **Add PostgreSQL**
2. Setelah terbuat, klik database → tab **Variables**
3. Salin nilai `DATABASE_URL` (format: `postgresql://...`)

---

### 4. Set Environment Variables

Di Railway → service NusaSewa → tab **Variables**, tambahkan:

```
DATABASE_URL        = (paste dari PostgreSQL di atas)
NEXTAUTH_SECRET     = (generate: openssl rand -base64 32)
NEXTAUTH_URL        = https://NAMA-APP.up.railway.app
NEXT_PUBLIC_APP_URL = https://NAMA-APP.up.railway.app
```

> **Catatan:** `NEXTAUTH_URL` diisi setelah Railway memberi domain.
> Bisa sementara diisi `http://localhost:3000` dulu, lalu update setelah deploy pertama.

---

### 5. Jalankan Migrasi & Seed

Setelah deploy pertama berhasil, buka **Railway Shell** (tab Settings → Shell) atau gunakan Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway link

# Jalankan migrasi Prisma
railway run npx prisma migrate deploy

# Isi data contoh
railway run npm run prisma:seed
```

Atau bisa juga set `buildCommand` di `railway.toml` agar migrasi jalan otomatis saat build:
```
buildCommand = "npm install && npx prisma generate && npx prisma migrate deploy && npm run build"
```

---

### 6. Akses Aplikasi

Buka URL Railway yang diberikan. Login dengan:
- **Email:** `admin@nusasewa.id`
- **Password:** `admin123`

> ⚠️ Ganti password setelah login pertama!

---

## 💻 Development Lokal

```bash
# Clone & install
git clone https://github.com/USERNAME/nusasewa.git
cd nusasewa
npm install

# Setup environment
cp .env.example .env
# Edit .env → isi DATABASE_URL dengan PostgreSQL lokal atau Railway

# Migrasi database
npx prisma migrate dev --name init

# Seed data contoh
npm run prisma:seed

# Jalankan dev server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

---

## 📁 Struktur Project

```
nusasewa/
├── app/
│   ├── (dashboard)/          # Halaman utama (protected)
│   │   ├── dashboard/        # Ringkasan properti
│   │   ├── kamar/            # Grid & tabel kamar
│   │   ├── penyewa/          # Data penyewa aktif
│   │   ├── booking/          # Form booking baru
│   │   ├── keuangan/         # Pendapatan & tagihan
│   │   └── notifikasi/       # Alert & pengingat
│   ├── api/
│   │   ├── auth/             # NextAuth handler
│   │   ├── dashboard/        # GET statistik
│   │   ├── kamar/            # CRUD kamar
│   │   ├── booking/          # POST sewa baru
│   │   ├── keuangan/         # GET laporan keuangan
│   │   └── health/           # Health check Railway
│   ├── login/                # Halaman login
│   └── layout.tsx
├── components/
│   └── layout/Sidebar.tsx
├── lib/
│   ├── auth.ts               # NextAuth config
│   ├── prisma.ts             # Prisma client singleton
│   └── utils.ts              # Helper functions
├── prisma/
│   ├── schema.prisma         # 12 model database
│   └── seed.ts               # Data contoh (20 kamar, 14 penyewa)
├── middleware.ts             # Route protection
└── railway.toml              # Railway deployment config
```

---

## 🗄️ Model Database

| Model | Deskripsi |
|---|---|
| `User` | Pemilik / pengelola properti |
| `Properti` | Kos, kontrakan, hotel, apartemen |
| `Kamar` | Kamar dengan tipe & fasilitas |
| `HargaKamar` | Harga harian/bulanan/tahunan per kamar |
| `Penyewa` | Data penyewa (individu / perusahaan) |
| `Sewa` | Kontrak sewa (kamar + penyewa + periode) |
| `Tagihan` | Tagihan per periode sewa |
| `Pembayaran` | Record pembayaran per tagihan |
| `Pengeluaran` | Biaya operasional properti |
| `Notifikasi` | Alert otomatis sistem |

---

## 🗺️ Roadmap Fitur

- [ ] Upload foto KTP penyewa (Cloudinary/R2)
- [ ] Kirim tagihan via WhatsApp (Fonnte / WA Business API)
- [ ] Export laporan PDF / Excel
- [ ] Multi-properti per akun
- [ ] QRIS terintegrasi (Midtrans / Xendit)
- [ ] Portal penyewa (cek tagihan, lapor kerusakan)
- [ ] Pengingat otomatis H-7/H-3/H jatuh tempo
- [ ] Integrasi Mamikos / Traveloka (webhook)

---

## 📝 Lisensi

MIT — bebas digunakan dan dimodifikasi.
