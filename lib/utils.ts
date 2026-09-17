// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(nominal: number | bigint | { toNumber(): number }) {
  const num = typeof nominal === 'object' && 'toNumber' in nominal
    ? nominal.toNumber()
    : Number(nominal)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(num)
}

export function formatTanggal(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...opts,
  }).format(new Date(date))
}

// Tanggal + jam (WIB) untuk struk/nota. Zona ditulis eksplisit: server bisa
// Tanggal + jam (WIB) untuk struk/nota. Zona ditulis eksplisit: server bisa
// jalan di UTC, dan tanpa ini jam yang diketik kasir bergeser 7 jam di struk.
// Dipakai lewat impor (bukan disalin) supaya skrip check-struk-jam.mjs
// benar-benar menguji format yang tampil, bukan salinannya.
export function tglJam(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

// Gabung tanggal "YYYY-MM-DD" + jam "HH:mm" jadi Date pada jam WIB.
//
// Kenapa perlu: `<input type="date">` mengirim "2026-09-16" tanpa zona, dan
// `new Date("2026-09-16")` menafsirkannya sebagai tengah malam UTC = 07:00 WIB.
// Kasir memilih 16 September lalu tersimpan jam 7 pagi hari itu — dan tanggal
// cetaknya masih benar, jadi salahnya tak kelihatan sampai jamnya diperiksa.
// Zona ditulis eksplisit seperti tglJam: server jalan di UTC.
//
// `jam` kosong atau tak sah -> 00:00 WIB. Penggabungan sengaja TIDAK pernah
// mengembalikan Invalid Date selama tanggalnya sah, supaya satu jam yang salah
// ketik tak menggagalkan seluruh booking; jamnya diambil dari dropdown, jadi
// kasus itu hanya mungkin dari kiriman luar.
export function tglJamJadiDate(tanggal: string, jam?: string | null): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((tanggal ?? '').trim())
  if (!m) return new Date(NaN)
  const j = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((jam ?? '').trim())
  const hh = j ? Number(j[1]) : 0
  const mm = j ? Number(j[2]) : 0
  // WIB = UTC+7 tanpa DST, jadi offset-nya konstan.
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh - 7, mm))
}

// Bagian tanggal & jam sebuah waktu, menurut zona WIB. hourCycle 'h23' dipakai
// supaya tengah malam jadi "00", bukan "24" yang keluar dari hour12:false di
// sebagian mesin.
function bagianWib(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return {
    tanggal: `${g('year')}-${g('month')}-${g('day')}`,
    jam: `${g('hour')}:00`,
    menitTotal: Number(g('hour')) * 60 + Number(g('minute')),
  }
}

// "Sekarang" untuk isian cepat tanggal + jam masuk: dibulatkan ke jam TERDEKAT
// menurut WIB, karena dropdown jam hanya menyediakan kelipatan jam. 14:37 ->
// 15:00, dan 14:29 -> 14:00.
//
// Perlu dibulatkan, bukan dipotong: 14:37 yang jadi 14:00 mencatat sewa mulai
// 37 menit sebelum kasir menekan tombol. Ke atas paling banyak 29 menit, dan
// tanggalnya ikut maju sendiri kalau 23:40 -> 00:00 besok.
//
// Dihitung dari `now` lewat formatToParts, BUKAN dari getHours(): jam dinding
// mesin kasir bisa beda zona, dan angka yang dihasilkan harus tetap WIB.
//
// `menitTotal` sengaja TIDAK ikut dikembalikan — itu urusan dalam fungsi, dan
// pemanggil hanya perlu dua nilai yang langsung dipasang ke form.
export function sekarangWib(now: Date = new Date()): { tanggal: string; jam: string } {
  const { tanggal, menitTotal } = bagianWib(now)
  const jamTerdekat = Math.round(menitTotal / 60) * 60
  // Lewat tengah malam: dasar jam 00:00 WIB + menit, lalu diformat ulang WIB
  // supaya tanggalnya ikut berpindah. new Date(…, hh + 24) akan menggeser hari
  // di zona mesin, bukan di WIB.
  const hasil = new Date(tglJamJadiDate(tanggal, '00:00').getTime() + jamTerdekat * 60000)
  const akhir = bagianWib(hasil)
  return { tanggal: akhir.tanggal, jam: akhir.jam }
}

// "16 Sep 12:00" — kapan sebuah kamar akan tersedia lagi. Dipakai tab Kamar
// supaya kasir tahu kapan bisa menerima penyewa berikutnya. Zona eksplisit
// seperti tglJam: server jalan di UTC, tanpa ini jamnya bergeser 7 jam.
//
// Tahun cuma ikut kalau beda dari tahun `acuan`. Tanpa ini, celah yang
// menyeberang tahun terbaca terbalik: "21 Sep → 17 Sep" (padahal 17 Sep tahun
// berikutnya). Menampilkan tahun selalu membuat label panjang di kasus umum
// yang justru paling sering dilihat, jadi hanya disertakan saat perlu.
export function tglJamSingkat(date: Date | string, acuan: Date | string = new Date()) {
  const d = new Date(date)
  const opsi: Intl.DateTimeFormatOptions = {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }
  if (d.getFullYear() !== new Date(acuan).getFullYear()) opsi.year = 'numeric'
  return d.toLocaleString('id-ID', opsi).replace(/\./g, ':')
}

export function namaPenyewa(nama?: string | null) {
  return nama?.trim() || 'Tanpa nama'
}

export function inisial(nama?: string | null) {
  const n = nama?.trim()
  if (!n) return '?'
  return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function statusKamarLabel(status: string) {
  const map: Record<string, string> = {
    TERSEDIA: 'Tersedia', TERISI: 'Terisi',
    PEMELIHARAAN: 'Pemeliharaan', DIPESAN: 'Dipesan',
  }
  return map[status] ?? status
}

export function statusKamarColor(status: string) {
  const map: Record<string, string> = {
    TERSEDIA: 'bg-teal-50 text-teal-800 border-teal-100',
    TERISI: 'bg-coral-50 text-coral-600 border-coral-100',
    PEMELIHARAAN: 'bg-amber-50 text-amber-400 border-amber-100',
    DIPESAN: 'bg-purple-50 text-purple-600 border-purple-100',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function statusTagihanColor(status: string) {
  const map: Record<string, string> = {
    LUNAS: 'bg-teal-50 text-teal-800',
    BELUM_BAYAR: 'bg-gray-100 text-gray-600',
    TERLAMBAT: 'bg-coral-50 text-coral-600',
    SEBAGIAN: 'bg-amber-50 text-amber-400',
    DIBATALKAN: 'bg-gray-100 text-gray-400',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function statusTagihanLabel(status: string) {
  const map: Record<string, string> = {
    LUNAS: 'Lunas', BELUM_BAYAR: 'Belum Bayar',
    TERLAMBAT: 'Terlambat', SEBAGIAN: 'Sebagian', DIBATALKAN: 'Dibatalkan',
  }
  return map[status] ?? status
}

export function metodeBayarLabel(m: string) {
  const map: Record<string, string> = {
    TUNAI: 'Tunai', TRANSFER: 'Transfer', QRIS: 'QRIS',
    VA_BCA: 'VA BCA', VA_BRI: 'VA BRI', VA_MANDIRI: 'VA Mandiri', LAINNYA: 'Lainnya',
  }
  return map[m] ?? m
}

export function periodeSewaSingkat(p: string) {
  const map: Record<string, string> = {
    HARIAN: '/hari', MINGGUAN: '/minggu', BULANAN: '/bulan', TAHUNAN: '/tahun',
  }
  return map[p] ?? p
}

// Warna tingkat hunian: hijau hanya bila benar-benar terisi. Hunian rendah =
// kondisi perlu perhatian, jadi jangan diberi warna "sukses" (menyesatkan).
export function hunianWarna(pct: number) {
  if (pct >= 70) return 'text-teal-600'
  if (pct >= 40) return 'text-amber-400'
  return 'text-coral-600'
}

export function hunianBarWarna(pct: number) {
  if (pct >= 70) return 'bg-teal-500'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-coral-400'
}

// "2 jam lalu" ala beranda — lebih cepat dibaca dari tanggal penuh.
export function waktuRelatif(date: Date | string) {
  const detik = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (detik < 60) return 'baru saja'
  const menit = Math.floor(detik / 60)
  if (menit < 60) return `${menit} menit lalu`
  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam lalu`
  const hari = Math.floor(jam / 24)
  if (hari < 30) return `${hari} hari lalu`
  return formatTanggal(date, { day: 'numeric', month: 'short' })
}
