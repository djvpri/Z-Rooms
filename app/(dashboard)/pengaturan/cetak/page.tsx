'use client'
// app/(dashboard)/pengaturan/cetak/page.tsx
//
// Setelan cetak nota — ukuran kertas, koneksi, dan pratinjau.
//
// KENAPA ADA PRATINJAU DI SINI
// Salah pilih ukuran kertas tak terlihat sampai nota pertama tercetak, dan
// saat itu kasir sudah menyerahkan bon yang berlipat ke pelanggan. Pratinjau
// memakai fungsi yang SAMA dengan yang akan mencetak (`lib/cetak.ts`), jadi
// yang dilihat admin di layar persis bentuk yang keluar dari printer —
// termasuk jumlah kolomnya.
import { useEffect, useRef, useState } from 'react'
import { Printer, Check2, ArrowCounterclockwise, ExclamationTriangleFill, CupHot } from 'react-bootstrap-icons'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import {
  JENIS_KONEKSI,
  NAMA_PRINTER_MAKS,
  PREF_CETAK_BAWAAN,
  UKURAN_KERTAS,
  adaJembatanCetak,
  adaJembatanLama,
  ambilJembatan,
  barisDuaKolom,
  barisKiriKanan,
  barisTengah,
  garisKertas,
  kolomKertas,
  labelPrinter,
  naskahKeTeks,
  naskahNota,
  notaUji,
  type PrefCetak,
} from '@/lib/cetak'
// Alasan tombol mati dicatat sebagai kejadian: pesan di layar hilang begitu
// kasir pindah halaman, sedangkan laporan dikirim dari halaman Pengaturan —
// tanpa dicatat, laporan hanya bisa menebak kenapa tombolnya tak bisa diklik.
import { alasanTombolMati, catat } from '@/lib/logError'
import KirimLogError from '@/components/pengaturan/KirimLogError'

export default function PengaturanCetakPage() {
  const [pref, setPref] = useState<PrefCetak>(PREF_CETAK_BAWAAN)
  const [loading, setLoading] = useState(true)
  const [simpan, setSimpan] = useState(false)
  const [pesan, setPesan] = useState('')
  const [error, setError] = useState('')
  // Hasil tes cetak DIPISAH dari pesan simpan: tes cetak bicara soal printer,
  // bukan soal setelan yang tersimpan. Menggabungkannya membuat pesan
  // "tersimpan" hilang begitu kasir menekan Tes cetak.
  const [hasilTes, setHasilTes] = useState<{ ok: boolean; teks: string } | null>(null)
  // Diperiksa setelah halaman tampil: `window` belum ada saat render server,
  // dan membacanya di render pertama membuat HTML server berbeda dari klien.
  const [bisaCetak, setBisaCetak] = useState(false)
  // Menunggu jawaban APK. Menyambung printer bisa beberapa detik, dan tombol
  // yang tetap bisa ditekan akan mengirim nota berkali-kali.
  const [menunggu, setMenunggu] = useState(false)
  // Penjelasan kenapa tombol cetak mati. Dipisah jadi state karena sebabnya
  // dua (di peramban vs APK lama) dan harus diketahui SETELAH mount.
  const [pesanCetak, setPesanCetak] = useState('')
  // Nama printer tersimpan (dari APK, bukan dari form). Dipakai menampilkan
  // label yang dibaca kasir — alamat MAC tak memberi tahu apa pun.
  const [namaPrinterApk, setNamaPrinterApk] = useState('')
  // Apakah socket printer sedang hidup. Berubah otomatis dari APK lewat
  // `ZXR_PRINTER_STATUS` — bukan hanya saat tes cetak.
  const [printerTersambung, setPrinterTersambung] = useState(false)

  // Penanda "pengguna sudah menyentuh form". Dipakai sebagai ref, bukan state:
  // nilainya dibaca di dalam respons fetch yang sudah berjalan, dan state akan
  // tertangkap basi di closure itu.
  const sudahDisentuh = useRef(false)

  async function muat() {
    setLoading(true)
    try {
      const res = await fetch('/api/properti/pref-cetak', { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? d?.error ?? 'Gagal memuat setelan.')
      // DIKUNCI saat memuat: respons yang datang setelah pengguna mulai mengetik
      // akan menimpa ketikan itu, dan kolom kembali tampak kosong seperti
      // "pilihan saya tak tersimpan".
      if (sudahDisentuh.current) return
      setPref(d.pref)
      setError('')
    } catch (e) {
      if (sudahDisentuh.current) return
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void muat()
  }, [])

  // Jembatan cetak hanya ada di dalam aplikasi Android. Diperiksa sekali
  // setelah halaman tampil; `window` tak ada saat render server.
  useEffect(() => {
    const j = ambilJembatan(window)
    setBisaCetak(j !== null)
    // Pesan penjelas dipilih berdasarkan JENIS kegagalannya — "buka dari
    // aplikasi" tak menolong kalau pengguna memang SUDAH di aplikasi dan
    // yang bermasalah versinya: itu terjadi saat APK lama punya ZXR_APK
    // tanpa `cetak`, dan satu-satunya jalan keluarnya memperbarui APK.
    setPesanCetak(
      j
        ? ''
        : adaJembatanLama(window)
          ? 'Aplikasi Android ini terlalu lama — cetak butuh Z-Rooms 1.0.9 ke atas. Perbarui aplikasinya (cek notifikasi pembaruan, atau unduh dari github.com/djvpri/Z-Rooms-android/releases), lalu buka ulang halaman ini.'
          : 'Halaman ini sedang dibuka di peramban. Cetak langsung butuh aplikasi Z-Rooms versi Android — di peramban tak ada jalur ke printer Bluetooth.',
    )
    if (!j) {
      // Sebabnya dicatat persis: pesan layar tak ikut ke laporan, dan
      // "tombol mati" tanpa sebab hanya bisa ditebak dari versi APK saja.
      catat('cetak', `tombol cetak mati — ${alasanTombolMati() ?? 'sebab tak dikenal'}`)
      return
    }

    // Baca nama printer tersimpan + status awal.
    setNamaPrinterApk(j.namaPrinterTersimpan?.() ?? '')
    setPrinterTersambung(j.statusPrinter?.() ?? false)
    // Daftar printer terpasang diminta TANPA menunggu hasilnya dipakai:
    // APK mencatat status pairing saat ini dikerjakan, dan tanpa baris itu
    // laporan kasir hanya bilang "cetak gagal" tanpa sebab. Kalau nanti
    // daftarnya perlu ditampilkan, nilainya sudah ada di sini.
    try {
      const terpasang = j.daftarPrinter?.() ?? ''
      catat('cetak', `printer terpasang: ${terpasang ? terpasang.split('\n').join(', ') : 'TIDAK ADA'}`)
    } catch {
      catat('cetak', 'daftar printer tak bisa dibaca')
    }

    // Callback: APK memanggil balik saat kasir memilih printer di dialog native.
    ;(window as unknown as Record<string, unknown>).ZXR_PRINTER_DIPILIH = (nama: string | null, _alamat: string | null) => {
      setNamaPrinterApk(nama ?? '')
    }
    // Callback: APK memberi tahu saat sambungan hidup/putus (auto-connect).
    ;(window as unknown as Record<string, unknown>).ZXR_PRINTER_STATUS = (ok: boolean) => {
      setPrinterTersambung(ok)
    }
  }, [])

  /**
   * Kirim satu naskah ke printer lewat aplikasi Android.
   *
   * Tak ada nilai balik yang bisa dipercaya dari jembatan: APK menerima
   * naskah lalu mengembalikan segera, sementara printer masih bekerja di
   * latar. Jadi hasil di sini berarti "sudah DIKIRIM ke aplikasi", bukan
   * "sudah tercetak" — dan pesannya harus berbunyi begitu, supaya kasir tak
   * menyimpulkan printer rusak hanya karena kertas belum keluar.
   */
  function kirimKePrinter(baris: string[], label: string) {
    const j = ambilJembatan(window)
    if (!j) {
      const alasan = alasanTombolMati() ?? 'sebab tak dikenal'
      catat('cetak', `tes cetak gagal — ${alasan}`)
      setHasilTes({
        ok: false,
        teks: 'Cetak langsung butuh aplikasi Z-Rooms versi Android. Buka halaman ini dari aplikasi, bukan dari peramban.',
      })
      return
    }
    // APK menjawab BELAKANGAN lewat `ZXR_CETAK_HASIL` karena menyambung printer
    // makan waktu. Kalau callback ini belum dipasang, kegagalan cetak tak akan
    // pernah terlihat — kasir menekan tombol, dan halaman diam saja.
    setMenunggu(true)
    ;(window as unknown as Record<string, unknown>).ZXR_CETAK_HASIL = (ok: boolean, pesan: string) => {
      setMenunggu(false)
      setHasilTes({ ok, teks: pesan })
      // Hasil dari APK dicatat: kalau cetak gagal karena printer mati/kertas
      // habis, pesannya ada di sini dan laporan kasir memuatnya — kalau tidak,
      // laporan hanya bilang "tombol hidup" padahal cetaknya tak pernah keluar.
      if (!ok) catat('cetak', `hasil cetak GAGAL — ${pesan}`)
    }
    try {
      j.cetak!(naskahKeTeks(naskahNota(baris)))
    } catch (e) {
      // Jembatan bisa melempar kalau APK-nya sudah lama/tak cocok.
      const teks = (e as Error).message
      catat('cetak', `kirim ke printer melempar — ${teks}`)
      setMenunggu(false)
      setHasilTes({ ok: false, teks: `Gagal mengirim ke printer: ${teks}` })
      return
    }
    setHasilTes({ ok: true, teks: `${label} sedang dicetak…` })
  }

  function tesCetak() {
    setError('')
    setPesan('')
    kirimKePrinter(notaUji(pref.kertas), 'Nota uji')
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPesan('')
    setSimpan(true)
    try {
      const res = await fetch('/api/properti/pref-cetak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pref }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? d?.error ?? 'Gagal menyimpan.')
      // Pakai nilai yang DIKEMBALIKAN server, bukan yang kita kirim: server
      // membuang field tak dikenal, dan menampilkan kiriman mentah akan
      // membuat form tampak berbeda dari yang benar-benar tersimpan.
      setPref(d.pref)
      setPesan('Setelan cetak tersimpan.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSimpan(false)
    }
  }

  async function kembaliBawaan() {
    if (!window.confirm('Kembalikan setelan cetak ke bawaan?')) return
    setError('')
    setPesan('')
    try {
      const res = await fetch('/api/properti/pref-cetak', { method: 'DELETE' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error?.message ?? 'Gagal mengembalikan.')
      setPref(d.pref)
      setPesan('Setelan cetak kembali ke bawaan.')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const kolom = kolomKertas(pref.kertas)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Pengaturan</h1>
      <p className="text-sm text-gray-400 mb-4">Setelan cetak nota untuk properti ini.</p>

      <TabPengaturan aktif="/pengaturan/cetak" />

      {error && (
        <div className="mb-4 rounded-lg border-l-4 border-l-coral-400 bg-coral-50 p-3 text-sm text-coral-600">{error}</div>
      )}
      {pesan && (
        <div className="mb-4 rounded-lg border-l-4 border-l-teal-400 bg-teal-50 p-3 text-sm text-teal-700 flex items-center gap-2">
          <Check2 aria-hidden="true" /> {pesan}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Memuat…</p>
      ) : (
        <form onSubmit={kirim} className="grid gap-6 md:grid-cols-2">
          {/* ── Kolom kiri: form ── */}
          <div className="space-y-5">
            <div>
              <span className="block text-xs text-gray-500 mb-2">Ukuran kertas</span>
              <div className="space-y-2">
                {(Object.keys(UKURAN_KERTAS) as (keyof typeof UKURAN_KERTAS)[]).map((k) => (
                  <label
                    key={k}
                    className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${
                      pref.kertas === k ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="kertas"
                      className="mt-0.5"
                      checked={pref.kertas === k}
                      onChange={() => setPref({ ...pref, kertas: k })}
                    />
                    <span>
                      <span className="block text-sm text-gray-900">{UKURAN_KERTAS[k].label}</span>
                      <span className="block text-[11px] text-gray-400">
                        {UKURAN_KERTAS[k].kolom} kolom karakter per baris
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">Jenis koneksi</span>
              <select
                className="input w-full"
                value={pref.koneksi}
                onChange={(e) => setPref({ ...pref, koneksi: e.target.value as PrefCetak['koneksi'] })}
              >
                {(Object.keys(JENIS_KONEKSI) as (keyof typeof JENIS_KONEKSI)[]).map((k) => (
                  <option key={k} value={k}>
                    {JENIS_KONEKSI[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">Printer terakhir</span>
              <input
                className="input w-full"
                value={pref.printer}
                maxLength={NAMA_PRINTER_MAKS}
                placeholder={pref.koneksi === 'bluetooth' ? 'Alamat MAC, mis. 66:1E:0C:2A:9F:31' : 'Alamat / IP printer'}
                onChange={(e) => { sudahDisentuh.current = true; setPref({ ...pref, printer: e.target.value }) }}
              />
              <span className="block text-[11px] text-gray-400 mt-1">
                Diisi otomatis saat kasir pertama kali mencetak. Boleh dikosongkan.
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={pref.salinan}
                onChange={(e) => setPref({ ...pref, salinan: e.target.checked })}
              />
              <span>
                <span className="block text-sm text-gray-900">Cetak salinan untuk pelanggan</span>
                <span className="block text-[11px] text-gray-400">Menghasilkan dua lembar bon per transaksi.</span>
              </span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={pref.kakiNota}
                onChange={(e) => setPref({ ...pref, kakiNota: e.target.checked })}
              />
              <span>
                <span className="block text-sm text-gray-900">Cetak kalimat penutup & kontak</span>
                <span className="block text-[11px] text-gray-400">
                  Memakai nomor HP dan catatan dari tab Properti.
                </span>
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn btn-primary" disabled={simpan}>
                <Check2 aria-hidden="true" /> {simpan ? 'Menyimpan…' : 'Simpan'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={kembaliBawaan}>
                <ArrowCounterclockwise aria-hidden="true" /> Bawaan
              </button>
            </div>

            {/* ── Tes cetak ── */}
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="block text-xs text-gray-500">Tes cetak</span>
                {bisaCetak && (
                  <span className={`text-[11px] flex items-center gap-1 ${printerTersambung ? 'text-teal-700' : 'text-gray-400'}`}>
                    {printerTersambung ? '● Printer tersambung' : '○ Belum tersambung'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mb-2">
                Mengirim nota contoh ke printer, supaya ketahuan tersambung atau tidak.
                Pakai ukuran kertas di atas — jadi sekaligus terlihat apakah barisnya berlipat.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={tesCetak}
                  disabled={!bisaCetak || menunggu}
                  title={bisaCetak ? undefined : 'Buka halaman ini dari aplikasi Z-Rooms di Android'}
                >
                  <Printer aria-hidden="true" /> {menunggu ? 'Mencetak…' : 'Tes cetak'}
                </button>
                {bisaCetak && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => ambilJembatan(window)?.pilihPrinter?.()}
                    title="Pilih atau pindai printer Bluetooth"
                  >
                    {namaPrinterApk ? `Ganti (${namaPrinterApk})` : 'Pilih printer'}
                  </button>
                )}
              </div>

              {!bisaCetak && pesanCetak && (
                <p className="text-[11px] text-amber-600 mt-2 flex items-start gap-1">
                  <ExclamationTriangleFill aria-hidden="true" className="mt-0.5 shrink-0" />
                  {pesanCetak}
                </p>
              )}

              {hasilTes && (
                <p
                  className={`text-[11px] mt-2 flex items-start gap-1 ${
                    hasilTes.ok ? 'text-teal-700' : 'text-coral-600'
                  }`}
                >
                  {hasilTes.ok ? (
                    <Check2 aria-hidden="true" className="mt-0.5 shrink-0" />
                  ) : (
                    <ExclamationTriangleFill aria-hidden="true" className="mt-0.5 shrink-0" />
                  )}
                  {hasilTes.teks}
                </p>
              )}
            </div>
          </div>

          {/* ── Kolom kanan: pratinjau ── */}
          <div>
            <span className="block text-xs text-gray-500 mb-2">
              Pratinjau · {kolom} kolom
            </span>
            <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
              <pre className="text-[11px] leading-tight text-teal-300 font-mono whitespace-pre">
                {pratinjau(pref)}
              </pre>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1">
              <CupHot aria-hidden="true" className="mt-0.5 shrink-0" />
              Panjang garis di bawah mengikuti lebar kertas yang dipilih. Kalau di printer asli
              hasilnya berlipat, ganti ke kertas yang lebih lebar.
            </p>

            {pref.printer === '' && (
              <p className="text-[11px] text-amber-600 mt-2 flex items-start gap-1">
                <ExclamationTriangleFill aria-hidden="true" className="mt-0.5 shrink-0" />
                Printer belum dipilih — kasir akan diminta memilih saat mencetak pertama kali.
              </p>
            )}

            <p className="text-[11px] text-gray-400 mt-2">
              Printer terakhir:{' '}
              {pref.printer ? (
                <span className="text-gray-600 inline-flex items-center gap-1">
                  {labelPrinter(pref.printer)}
                  {/* Bisa dihapus dari sini: kalau printer diganti, alamat lama
                      yang tertinggal membuat cetakan berikutnya menuju alat
                      yang sudah tak ada. */}
                  <button
                    type="button"
                    className="text-coral-600 hover:underline"
                    onClick={() => { sudahDisentuh.current = true; setPref({ ...pref, printer: '' }) }}
                  >
                    kosongkan
                  </button>
                </span>
              ) : (
                <span className="text-gray-600">{labelPrinter(pref.printer)}</span>
              )}
            </p>
          </div>
        </form>
      )}

      {/* Tombol kirim log di halaman cetak sendiri: diagnosa tombol cetak
          mati tercatat di halaman INI — kalau kasir harus pindah ke tab
          Pengaturan dulu, peristiwa "tombol mati" sudah lewat dan laporan
          kehilangan konteksnya. */}
      <div className="mt-4">
        <KirimLogError />
      </div>
    </div>
  )
}

/**
 * Contoh nota memakai fungsi cetak yang sebenarnya — bukan contoh yang ditulis
 * ulang. Kalau `lib/cetak.ts` berubah, pratinjau ikut berubah; kalau contohnya
 * ditulis sendiri di sini, ia bisa menampilkan tata letak yang tak akan pernah
 * keluar dari printer.
 */
function pratinjau(p: PrefCetak): string {
  const k = p.kertas
  const baris = [
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
  ]
  if (p.kakiNota) {
    baris.push(barisTengah('Terima kasih', k), barisTengah('0812-3456-7890', k))
  }
  if (p.salinan) {
    baris.push('', barisTengah('--- SALINAN ---', k))
  }
  return baris.join('\n')
}
