// lib/ktp.ts
//
// Baca data KTP dari foto memakai Gemini.
//
// Dipakai PATCH/POST lewat /api/ktp/baca. Dipisah dari route supaya bisa diuji
// tanpa memuat auth() — polanya sama dengan lib/penyewa.ts dan lib/kamar.ts.
//
// Catatan penting soal bentuk permintaan ke Gemini (semuanya pernah gagal):
//
// 1. `required` pada field yang boleh kosong membuat Gemini balas 500
//    INTERNAL. Field yang wajib ada tapi nilainya boleh kosong tampaknya
//    membingungkan model. Tanpa `required` semuanya stabil.
// 2. `enum` tidak boleh memuat string kosong (400 INVALID_ARGUMENT). Dan kalau
//    `enum` dipakai, model TERPAKSA memilih salah satu, sehingga gambar bukan
//    KTP pun mengisi "LAKI-LAKI" — data palsu yang lolos tanpa disadari.
//    Jenis kelamin karena itu dibiarkan bebas dan disaring di sini.
// 3. Menghapus `required` membuat gambar tanpa KTP menghasilkan SEMUA field
//    kosong, yang memang perilaku yang diinginkan.
const MODEL = 'gemini-2.5-flash'
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export interface HasilKtp {
  nama: string
  nik: string
  alamat: string
  jenisKelamin: string
}

const PERINTAH = [
  'Baca KTP (Kartu Tanda Penduduk Indonesia) pada gambar ini.',
  'Isi hanya field yang benar-benar terlihat pada gambar.',
  'Kalau sebuah field tidak terlihat atau tidak terbaca, tulis string kosong.',
  'Jangan mengarang. Jangan menyimpulkan dari potongan yang tidak jelas.',
  'NIK harus 16 digit angka persis seperti tercetak.',
].join(' ')

const SKEMA = {
  type: 'OBJECT',
  properties: {
    nama: { type: 'STRING' },
    nik: { type: 'STRING' },
    alamat: { type: 'STRING' },
    jenisKelamin: { type: 'STRING' },
  },
}

// Jenis kelamin hanya diterima kalau persis salah satu dari dua nilai ini.
// Gemini bebas menjawab apa saja (lihat catatan 2 di atas), jadi nilai aneh
// dibuang alih-alih disimpan.
export function rapikanJenisKelamin(nilai: unknown): string {
  const t = String(nilai ?? '').trim().toUpperCase()
  if (t === 'LAKI-LAKI' || t === 'LAKI LAKI') return 'LAKI-LAKI'
  if (t === 'PEREMPUAN') return 'PEREMPUAN'
  return ''
}

// NIK: ambil 16 digit pertama. Foto KTP sering membuat model menyelipkan
// spasi/titik; kalau setelah dibersihkan bukan 16 digit, dianggap gagal baca.
export function rapikanNik(nilai: unknown): string {
  const digit = String(nilai ?? '').replace(/[^0-9]/g, '')
  return digit.length === 16 ? digit : ''
}

export const MIME_DIIZINKAN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
export const MAKS_UKURAN = 6 * 1024 * 1024

export function rapikanHasil(data: any): HasilKtp {
  return {
    nama: String(data?.nama ?? '').trim(),
    nik: rapikanNik(data?.nik),
    alamat: String(data?.alamat ?? '').trim(),
    jenisKelamin: rapikanJenisKelamin(data?.jenisKelamin),
  }
}

// Panggil Gemini dan balikan field yang sudah dirapikan.
// Melempar Error dengan pesan siap-tampil kalau gagal.
export async function bacaKtp(base64: string, mimeType: string, apiKey: string | undefined): Promise<HasilKtp> {
  if (!apiKey) throw new Error('Kunci Gemini belum dipasang di server.')

  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PERINTAH },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SKEMA },
    }),
  })

  if (!res.ok) {
    // Pesan asli Gemini disembunyikan dari pengguna; hanya dicatat di log
    // server agar kunci/kuota tidak bocor ke layar kasir.
    const detail = await res.text().catch(() => '')
    console.error('Gemini menolak:', res.status, detail.slice(0, 300))
    if (res.status === 429) throw new Error('Kuota pembacaan KTP sedang penuh. Coba lagi sebentar.')
    throw new Error('Gagal menghubungi layanan pembaca KTP.')
  }

  const json = await res.json()
  const teks = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!teks) throw new Error('Layanan pembaca KTP tidak memberi hasil. Coba foto ulang.')

  let data
  try {
    data = JSON.parse(teks)
  } catch {
    throw new Error('Hasil pembacaan tidak terbaca. Coba foto ulang.')
  }

  const hasil = rapikanHasil(data)
  if (!hasil.nama && !hasil.nik) {
    throw new Error('Data KTP tidak terbaca. Pastikan foto jelas dan tidak silau.')
  }
  return hasil
}
