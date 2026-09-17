// app/(dashboard)/kamar/page.tsx
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { propertiAktif } from '@/lib/properti'
import { formatRupiah, statusKamarColor, statusKamarLabel, namaPenyewa, tglJamSingkat, statusTagihanColor, statusTagihanLabel } from '@/lib/utils'
import { cekLewat, labelLewat, batasCheckout } from '@/lib/checkout'
import { ringkasBayar } from '@/lib/bayar'
import { namaTipe, fasilitasEfektif, hargaEfektif, depositEfektif } from '@/lib/tipeKamar'
import Link from 'next/link'
import KamarTambahModal from '@/components/kamar/KamarTambahModal'
import CheckoutModal from '@/components/kamar/CheckoutModal'
import TabelKamar from '@/components/kamar/TabelKamar'
import { PemicuJadwal } from '@/components/kamar/JadwalKamar'
import { DoorClosedFill } from 'react-bootstrap-icons'

export const dynamic = 'force-dynamic'

// Urutan kolom bawaan tabel kamar (desktop). Dipakai sebagai urutan awal dan
// urutan saat kolom dihidupkan lagi lewat panel pemilih kolom.
const KOLOM_BAWAAN = [
  'nomor', 'tipe', 'luas', 'harga', 'status',
  'penyewa', 'bayar', 'mulai', 'selesai', 'fasilitas',
]

export default async function KamarPage() {
  const session = await auth()
  const properti = await propertiAktif(session!.user!.id as string)
  if (!properti) return <div className="p-8 text-gray-500">Belum ada properti.</div>

  const kamar = await prisma.kamar.findMany({
    where: { propertiId: properti.id },
    include: {
      // Tipe master data: kamar menunjuk ke sini. Dua hal diwarisi dari tipe —
      // fasilitas (untuk kamar yang belum diisi sendiri) dan harga sewa.
      tipe: { select: { id: true, nama: true, fasilitas: true, harga: { where: { aktif: true } } } },
      sewa: {
        // Penghuni sekarang (AKTIF) DAN penyewa berikutnya yang sudah memesan
        // (PENDING) — supaya kamar yang sudah ada antrean terlihat, bukan
        // tampak kosong begitu di-booking. Diurut AKTIF dulu, lalu PENDING
        // menurut tanggal masuk; pemakai memisahkannya sendiri.
        where: { statusSewa: { in: ['AKTIF', 'PENDING'] } },
        include: {
          penyewa: { select: { nama: true, noHp: true } },
          // SEMUA tagihan sewa ini, bukan cuma yang belum bayar: badge "sudah
          // bayar atau belum" di halaman ini perlu tagihan LUNAS untuk bisa
          // mengenali kamar yang sudah lunas. `ringkasBayar` (lib/bayar.ts) yang
          // memisahkan mana yang masih jadi kewajiban.
          tagihan: {
            select: { nominal: true, status: true, jatuhTempo: true },
          },
        },
        orderBy: [{ statusSewa: 'asc' }, { tanggalMasuk: 'asc' }],
      },
    },
    orderBy: { nomor: 'asc' },
  })

  const daftarTipe = await prisma.tipeKamar.findMany({
    where: { propertiId: properti.id },
    select: { id: true, nama: true, fasilitas: true },
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
  })

  const statusGroups = {
    TERSEDIA: kamar.filter(k => k.status === 'TERSEDIA'),
    TERISI: kamar.filter(k => k.status === 'TERISI'),
    DIPESAN: kamar.filter(k => k.status === 'DIPESAN'),
    PEMELIHARAAN: kamar.filter(k => k.status === 'PEMELIHARAAN'),
  }

  // Bentuk data untuk CheckoutModal. Diekstrak karena dipakai di tiga tempat
  // (grid, tabel desktop, kartu mobile) — sebelumnya disalin-tempel.
  type KamarBaris = (typeof kamar)[number]
  type SewaBaris = NonNullable<KamarBaris['sewa'][number]>
  // Opsi A: dihitung saat halaman dibuka, tanpa cron. `sekarang` diambil sekali
  // supaya semua kamar dinilai pada titik waktu yang sama.
  const sekarang = new Date()
  const aturan = { jamCheckout: properti.jamCheckout, toleransiCheckout: properti.toleransiCheckout }
  const jumlahLewat = kamar.filter(k => {
    const s = k.sewa.find(x => x.statusSewa === 'AKTIF')
    return s ? cekLewat(s.tanggalKeluar, aturan, sekarang).lewat : false
  }).length

  const ringkasSewa = (k: KamarBaris, s: SewaBaris) => {
    const bayar = ringkasBayar(s.tagihan, sekarang)
    return {
      id: s.id,
      kamarNomor: k.nomor,
      penyewaNama: s.penyewa?.nama ?? null,
      tanggalKeluar: s.tanggalKeluar.toISOString(),
      deposit: Number(s.deposit),
      sisaTagihan: bayar.sisa,
      jumlahTagihan: s.tagihan.filter(t => t.status !== 'DIBATALKAN').length,
      periodeSewa: s.periodeSewa as string,
      menitLebih: cekLewat(s.tanggalKeluar, aturan, sekarang).menitLebih,
    }
  }
  // Kandidat kamar tujuan pindah: kamar TERSEDIA selain kamar asal.
  const kamarTersediaUntuk = (asalId: string) =>
    kamar
      .filter(x => x.status === 'TERSEDIA' && x.id !== asalId)
      .map(x => {
        // Tarif HARIAN untuk kamar tujuan pindah — diwarisi dari tipenya.
        // (Dulu BULANAN, sisa dari masa sebelum Z-Rooms fokus sewa harian.)
        const hb = hargaEfektif(x, 'HARIAN')
        return {
          id: x.id,
          nomor: x.nomor,
          tipe: namaTipe(x.tipe),
          hargaHarian: hb > 0 ? hb : null,
          deposit: hb > 0 ? depositEfektif(x, 'HARIAN') : null,
        }
      })

  // Bentuk data untuk KamarTambahModal mode ubah. Fasilitas TIDAK ikut: fasilitas
  // kamar selalu mengikuti tipe kamarnya, jadi mengirim daftar di sini hanya akan
  // menampilkan centangan yang berbeda dari yang dilihat di tabel.
  // `status` juga tidak — diatur alur sewa, bukan form ini.
  const ringkasEdit = (k: KamarBaris) => ({
    id: k.id,
    nomor: k.nomor,
    lantai: k.lantai,
    luas: k.luas,
    tipeId: k.tipeId,
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Kamar</h1>
          <p className="text-sm text-gray-400">{kamar.length} kamar terdaftar</p>
        </div>
        <div className="flex items-center gap-2">
          <KamarTambahModal daftarTipe={daftarTipe} />
          <Link href="/booking" className="btn btn-ghost">Booking baru</Link>
        </div>
      </div>

      {/* Peringatan lewat check-out. Dihitung saat halaman dibuka (tanpa cron),
          jadi angkanya sebanding dengan keadaan saat ini — bukan sisa kemarin. */}
      {jumlahLewat > 0 && (
        <div className="rounded-lg border-l-4 border-l-coral-400 bg-coral-50 text-coral-600 p-4 mb-5">
          <p className="text-sm font-medium">
            {jumlahLewat} kamar lewat jam check-out
          </p>
          <p className="text-xs mt-0.5">
            Sewa sudah melewati jam {properti.jamCheckout} + toleransi {properti.toleransiCheckout} menit.
            Kamar tidak dikosongkan otomatis — periksa lalu check-out seperti biasa.
          </p>
        </div>
      )}

      {/* Legenda */}
      <div className="flex gap-4 mb-5 flex-wrap">
        {[
          { s: 'TERSEDIA', label: 'Tersedia', c: 'bg-teal-50 text-teal-700' },
          { s: 'TERISI', label: 'Terisi', c: 'bg-coral-50 text-coral-600' },
          { s: 'DIPESAN', label: 'Dipesan', c: 'bg-purple-50 text-purple-600' },
          { s: 'PEMELIHARAAN', label: 'Pemeliharaan', c: 'bg-amber-50 text-amber-400' },
        ].map(({ s, label, c }) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${c.split(' ')[0]}`} />
            {label} ({statusGroups[s as keyof typeof statusGroups]?.length ?? 0})
          </div>
        ))}
      </div>

      {/* Grid kamar */}
      {kamar.length === 0 ? (
        <div className="card text-center py-14 mb-8">
          <DoorClosedFill className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada kamar</h2>
          <p className="text-sm text-gray-500 mt-1">Tambahkan kamar pertama untuk mulai mencatat penyewa dan tagihan.</p>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 mb-8">
        {kamar.map(k => {
          const hargaHarian = hargaEfektif(k, 'HARIAN')
          const sewaAktif = k.sewa.find(x => x.statusSewa === 'AKTIF')
          const penyewa = sewaAktif?.penyewa
          return (
            <div
              key={k.id}
              className={`rounded-xl border p-3 text-center h-full ${statusKamarColor(k.status)}`}
            >
              <PemicuJadwal
                nomor={k.nomor}
                sewa={k.sewa}
                aturan={aturan}
                sekarang={sekarang}
                className="font-semibold text-sm underline decoration-dotted decoration-gray-400/60 underline-offset-2 hover:decoration-gray-700"
              >
                {k.nomor}
              </PemicuJadwal>
              <p className="text-xs mt-0.5 opacity-75">{namaTipe(k.tipe)}</p>
              {hargaHarian > 0 && (
                <p className="text-xs mt-1 font-medium">
                  {formatRupiah(hargaHarian)}<span className="opacity-60">/hari</span>
                </p>
              )}
              <p className="text-xs mt-1 opacity-60 truncate">
                {penyewa ? namaPenyewa(penyewa.nama) : 'Kosong'}
              </p>
              {/* Sudah bayar atau belum. Aturan di lib/bayar.ts, bukan di sini. */}
              {sewaAktif && (() => {
                const bayar = ringkasBayar(sewaAktif.tagihan, sekarang)
                return (
                  <p className={`text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded inline-block ${statusTagihanColor(bayar.status)}`}>
                    {statusTagihanLabel(bayar.status)}
                  </p>
                )
              })()}
              {/* Mulai & selesai sewa. Selesai = batas check-out (tanggal
                  keluar + jam check-out properti + toleransi), bukan jam
                  masuk + 24 jam. Dulu hanya sisi selesai yang tampil. */}
              {sewaAktif && (
                <p className="text-[10px] mt-0.5 opacity-75">
                  Mulai {tglJamSingkat(sewaAktif.tanggalMasuk)}
                  <span className="mx-1 opacity-60">·</span>
                  Selesai {tglJamSingkat(batasCheckout(sewaAktif.tanggalKeluar, aturan))}
                </p>
              )}
              {(() => {
                const lebih = sewaAktif ? cekLewat(sewaAktif.tanggalKeluar, aturan, sekarang).menitLebih : 0
                return lebih > 0 ? (
                  <p className="text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-coral-100 text-coral-700 inline-block">
                    Lewat {labelLewat(lebih)}
                  </p>
                ) : null
              })()}
              {/* Penyewa berikutnya yang sudah memesan. Kamar bisa dibooking
                  sebelum penghuni sekarang keluar, jadi tanpa baris ini kamar
                  tampak kosong padahal sudah ada yang menunggu. */}
              {(() => {
                const akan = k.sewa.filter(x => x.statusSewa === 'PENDING')
                return akan.length > 0 ? (
                  <p className="text-[10px] mt-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 inline-block">
                    Dipesan {tglJamSingkat(akan[0].tanggalMasuk)}
                    {akan.length > 1 ? ` +${akan.length - 1}` : ''}
                  </p>
                ) : null
              })()}
              {/* Ubah data kamar. Selalu tersedia — nomor, tipe, luas, fasilitas
                  boleh dikoreksi kapan saja; yang tak boleh cuma `status`. */}
              <div className="mt-2">
                <KamarTambahModal daftarTipe={daftarTipe} kamar={ringkasEdit(k)} />
              </div>
              {sewaAktif && (
                <CheckoutModal
                  sewa={ringkasSewa(k, sewaAktif)}
                  kamarTersedia={kamarTersediaUntuk(k.id)}
                />
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* Tabel detail */}
      <div className="card">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Detail kamar</h2>

        {/* Desktop table. Kolom bisa dipilih & diurutkan — lihat TabelKamar.
            Nilai tiap sel dihitung di sini (server) karena aturan harga, status
            bayar, dan batas check-out tinggal di lib, bukan di komponen. */}
        <div className="hidden md:block">
          <TabelKamar
            kunciAwal={KOLOM_BAWAAN}
            prefAwal={properti.prefTabelKamar ?? null}
            baris={kamar.map(k => {
              const hargaHarian = hargaEfektif(k, 'HARIAN')
              const sewaAktif = k.sewa.find(x => x.statusSewa === 'AKTIF')
              const penyewa = sewaAktif?.penyewa
              const fasilitas = fasilitasEfektif(k)
              const namaPenyewaAktif = penyewa ? namaPenyewa(penyewa.nama) : null
              // Penyewa berikutnya yang sudah memesan (sewa PENDING). Kamar
              // kosong tapi sudah ada antrean harus terlihat — kalau tidak,
              // kamar tampak siap dihuni padahal sudah dijanjikan.
              const akan = k.sewa.filter(x => x.statusSewa === 'PENDING')
              const statusBayar = sewaAktif ? ringkasBayar(sewaAktif.tagihan, sekarang) : null
              const masuk = sewaAktif ? tglJamSingkat(sewaAktif.tanggalMasuk) : null
              const selesai = sewaAktif ? tglJamSingkat(batasCheckout(sewaAktif.tanggalKeluar, aturan)) : null
              return {
                id: k.id,
                aksi: (
                  <div className="flex items-center gap-1">
                    <KamarTambahModal daftarTipe={daftarTipe} kamar={ringkasEdit(k)} />
                    {sewaAktif && (
                      <div className="w-28">
                        <CheckoutModal
                          sewa={ringkasSewa(k, sewaAktif)}
                          kamarTersedia={kamarTersediaUntuk(k.id)}
                        />
                      </div>
                    )}
                  </div>
                ),
                kolom: [
                  { kunci: 'nomor', judul: 'Nomor', nilai: k.nomor,
                    sel: <PemicuJadwal
                      nomor={k.nomor}
                      sewa={k.sewa}
                      aturan={aturan}
                      sekarang={sekarang}
                      className="font-medium text-gray-800 underline decoration-dotted decoration-gray-400/60 underline-offset-2"
                    >{k.nomor}</PemicuJadwal> },
                  { kunci: 'tipe', judul: 'Tipe', nilai: namaTipe(k.tipe),
                    sel: <span className="text-gray-600">{namaTipe(k.tipe)}</span> },
                  { kunci: 'luas', judul: 'Luas', nilai: k.luas ?? null,
                    sel: <span className="text-gray-500">{k.luas ? `${k.luas} m²` : '-'}</span> },
                  { kunci: 'harga', judul: 'Harga/hari', nilai: hargaHarian || null,
                    sel: <span className="text-gray-700">{hargaHarian > 0 ? formatRupiah(hargaHarian) : '-'}</span> },
                  { kunci: 'status', judul: 'Status', nilai: statusKamarLabel(k.status),
                    sel: <span className={`badge ${statusKamarColor(k.status)}`}>{statusKamarLabel(k.status)}</span> },
                  { kunci: 'penyewa', judul: 'Penyewa', nilai: namaPenyewaAktif,
                    sel: <span className="text-gray-600">
                      {namaPenyewaAktif ?? '-'}
                      {akan.length > 0 && (
                        <span className="ml-1 badge bg-sky-100 text-sky-800 whitespace-nowrap"
                          title={`Dipesan ${tglJamSingkat(akan[0].tanggalMasuk)}`}>
                          +{akan.length} pesanan
                        </span>
                      )}
                    </span> },
                  { kunci: 'bayar', judul: 'Bayar', nilai: statusBayar ? statusTagihanLabel(statusBayar.status) : null,
                    sel: statusBayar
                      ? <span className={`badge ${statusTagihanColor(statusBayar.status)}`}>{statusTagihanLabel(statusBayar.status)}</span>
                      : '-' },
                  // Mulai = tanggal & jam masuk yang dicatat kasir; Selesai =
                  // batas check-out (tanggal keluar + jam check-out properti +
                  // toleransi). Keduanya teks WIB 24 jam.
                  { kunci: 'mulai', judul: 'Mulai', nilai: masuk,
                    sel: <span className="text-gray-500 text-xs whitespace-nowrap">{masuk ?? '-'}</span> },
                  { kunci: 'selesai', judul: 'Selesai', nilai: selesai,
                    sel: <span className="text-gray-500 text-xs whitespace-nowrap">{selesai ?? '-'}</span> },
                  { kunci: 'fasilitas', judul: 'Fasilitas', nilai: fasilitas.join(', ') || null,
                    sel: <span className="text-gray-400 text-xs">
                      {fasilitas.slice(0, 3).join(', ') + (fasilitas.length > 3 ? '…' : '')}
                    </span> },
                ],
              }
            })}
          />
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {kamar.map(k => {
            const hargaHarian = hargaEfektif(k, 'HARIAN')
            const sewaAktif = k.sewa.find(x => x.statusSewa === 'AKTIF')
            const penyewa = sewaAktif?.penyewa
            return (
              <div key={k.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PemicuJadwal
                      nomor={k.nomor}
                      sewa={k.sewa}
                      aturan={aturan}
                      sekarang={sekarang}
                      className="font-medium text-gray-800 text-sm underline decoration-dotted decoration-gray-400/60 underline-offset-2"
                    >
                      {k.nomor}
                    </PemicuJadwal>
                    <span className={`badge text-[10px] ${statusKamarColor(k.status)}`}>{statusKamarLabel(k.status)}</span>
                    {sewaAktif && (() => {
                      const bayar = ringkasBayar(sewaAktif.tagihan, sekarang)
                      return (
                        <span className={`badge text-[10px] ${statusTagihanColor(bayar.status)}`}>
                          {statusTagihanLabel(bayar.status)}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {namaTipe(k.tipe)}{k.luas ? ` · ${k.luas}m²` : ''}
                    {hargaHarian > 0 ? ` · ${formatRupiah(hargaHarian)}/hari` : ''}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {penyewa ? namaPenyewa(penyewa.nama) : '-'} · {(() => { const f = fasilitasEfektif(k); return f.slice(0, 2).join(', ') + (f.length > 2 ? '…' : '') })()}
                  </div>
                  {sewaAktif && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Mulai {tglJamSingkat(sewaAktif.tanggalMasuk)}
                      <span className="mx-1 opacity-60">·</span>
                      Selesai {tglJamSingkat(batasCheckout(sewaAktif.tanggalKeluar, aturan))}
                    </div>
                  )}
                  {/* Pesanan menunggu: kamar bisa dibooking sebelum penghuni
                      sekarang keluar, jadi antreannya perlu terlihat. */}
                  {(() => {
                    const akan = k.sewa.filter(x => x.statusSewa === 'PENDING')
                    return akan.length > 0 ? (
                      <div className="text-xs text-sky-700 mt-0.5">
                        Dipesan {tglJamSingkat(akan[0].tanggalMasuk)}
                        {akan.length > 1 ? ` +${akan.length - 1}` : ''}
                      </div>
                    ) : null
                  })()}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <KamarTambahModal daftarTipe={daftarTipe} kamar={ringkasEdit(k)} />
                  {sewaAktif && (
                    <div className="w-24">
                      <CheckoutModal
                        sewa={ringkasSewa(k, sewaAktif)}
                        kamarTersedia={kamarTersediaUntuk(k.id)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
