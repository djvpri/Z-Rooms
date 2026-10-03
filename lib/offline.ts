// lib/offline.ts
//
// Mesin mode offline (sisi klien): snapshot data + antrean transaksi.
// Semua simpan di localStorage — tak ada dependensi, tak ada IndexedDB,
// volume data kecil (puluhan kamar, ratusan tagihan tercukupi).
//
// Alur:
//   ONLINE : halaman normal memanggil simpanSnapshotHasil() (dari dashboard
//            layout) → snapshot segar di perangkat.
//   OFFLINE: APK memuat /offline → halaman merender dari ambilSnapshot().
//            Transaksi → antreOperasi() → outbox.
//   ONLINE : kirimOutbox() POST ke /api/sinkron (idempoten per idOperasi) —
//            dipanggil otomatis oleh halaman /offline saat event `online`.

export const KUNCI_SNAPSHOT = 'zxroom.snapshot'
export const KUNCI_OUTBOX = 'zxroom.outbox'
// Penanda bahwa /offline dibuka lewat jalur resmi (offline.ts memasangnya
// sebelum memuat URL) — dipakai halaman utk menampilkan banner mode.
export const BUKA_HALAMAN_OFFLINE = 'zxroom.offline'

// ── Snapshot ───────────────────────────────────

export type SnapshotSewa = {
  id: string
  statusSewa: 'AKTIF' | 'PENDING'
  tanggalMasuk: string
  hargaSewa: number
  deposit: number
  penyewa: { id: string; nama: string | null; noHp: string | null } | null
  tagihan: { id: string; nominal: number; jatuhTempo: string; status: string }[]
  sisaBarang: number
}
export type SnapshotKamar = {
  id: string; nomor: string; lantai: number; status: string; sewa: SnapshotSewa[]
}
export type Snapshot = {
  diambilPada: string
  properti: { id: string; nama: string; jamCheckout: string; toleransiCheckout: number }
  kamar: SnapshotKamar[]
  produk: { id: string; nama: string; hargaJual: number; stok: number; satuan: string }[]
  tagihan: {
    id: string; nominal: number; jatuhTempo: string; status: string
    statusSewa: string; kamarNomor: string; penyewaNama: string | null
  }[]
}

export function simpanSnapshot(data: Snapshot) {
  try {
    localStorage.setItem(KUNCI_SNAPSHOT, JSON.stringify(data))
  } catch {
    // Kuota penuh / mode privat: biarkan — mode offline memang tak tersedia.
  }
}

/** Dipanggil dari halaman normal (dashboard) tiap berhasil online. */
export function simpanSnapshotHasil(data: unknown) {
  if (data && typeof data === 'object' && 'kamar' in (data as object)) {
    simpanSnapshot(data as Snapshot)
  }
}

export function ambilSnapshot(): Snapshot | null {
  try {
    const mentah = localStorage.getItem(KUNCI_SNAPSHOT)
    return mentah ? (JSON.parse(mentah) as Snapshot) : null
  } catch {
    return null
  }
}

// ── Outbox ─────────────────────────────────────

export type Operasi = {
  jenis: 'BAYAR_TAGIHAN' | 'PENJUALAN' | 'CHECKIN'
  idOperasi: string
  tagihanId?: string
  sewaId?: string | null
  item?: { produkId: string; jumlah: number }[]
  metodeBayar?: string
  dibuatKlien?: string
}

export function muatOutbox(): Operasi[] {
  try {
    const mentah = localStorage.getItem(KUNCI_OUTBOX)
    return mentah ? (JSON.parse(mentah) as Operasi[]) : []
  } catch {
    return []
  }
}

function simpanOutbox(daftar: Operasi[]) {
  localStorage.setItem(KUNCI_OUTBOX, JSON.stringify(daftar))
}

export function antreOperasi(op: Operasi) {
  simpanOutbox([...muatOutbox(), op])
}

export function hapusDariOutbox(idOperasi: string) {
  simpanOutbox(muatOutbox().filter((o) => o.idOperasi !== idOperasi))
}

export type HasilKirim = {
  idOperasi: string
  jenis: string
  status: 'OK' | 'KIRIMAN_LAMA' | 'GAGAL'
  pesan: string
  nomor?: string
}

/**
 * Kirim seluruh outbox ke /api/sinkron.
 * - OK / KIRIMAN_LAMA  → keluar dari outbox (server sudah mencatat; duplikat
 *   pun tak mungkin karena idOperasi).
 * - GAGAL              → TETAP di outbox, bisa dikirim ulang (mis. stok sudah
 *   diisi). Hindari loop: GAGAL tak dihapus, tapi kirimOutbox hanya dipanggil
 *   saat event online / manual — bukan retry otomatis mengetuk server.
 * - Jaringan masih mati → keluar tanpa mengubah apa pun.
 */
export async function kirimOutbox(): Promise<HasilKirim[]> {
  const daftar = muatOutbox()
  if (daftar.length === 0) return []
  let hasil: HasilKirim[] = []
  try {
    const res = await fetch('/api/sinkron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daftar),
    })
    if (!res.ok) return []
    const data = await res.json()
    hasil = (data.hasil ?? []) as HasilKirim[]
  } catch {
    return [] // masih offline — outbox utuh, dicoba lagi nanti
  }
  const sukses = new Set(hasil.filter((h) => h.status !== 'GAGAL').map((h) => h.idOperasi))
  simpanOutbox(daftar.filter((o) => !sukses.has(o.idOperasi)))
  return hasil
}
