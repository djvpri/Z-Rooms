'use client'
// app/(dashboard)/pengaturan/properti/page.tsx
//
// Kelola properti: tambah, edit, nonaktifkan/aktifkan.
// Tidak ada hapus permanen — properti menampung kamar, sewa, tagihan, dan
// pengeluaran; menghapusnya berarti kehilangan riwayat keuangan. Nonaktifkan
// menyembunyikannya dari pemilih properti tanpa membuang data.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TabPengaturan from '@/components/pengaturan/TabPengaturan'
import {
  Building, PlusLg, PencilSquare, EyeSlash, Eye, GeoAlt, DoorClosed,
  CheckCircleFill, SlashCircle,
} from 'react-bootstrap-icons'
import PropertiModal, { type PropertiData } from '@/components/properti/PropertiModal'

type Properti = PropertiData & {
  aktif: boolean
  isDemo: boolean
  _count: { kamar: number }
}

const TIPE_LABEL: Record<string, string> = {
  KOS: 'Kos', KONTRAKAN: 'Kontrakan', HOTEL: 'Hotel', APARTEMEN: 'Apartemen',
}

export default function PengaturanPropertiPage() {
  const router = useRouter()
  const [daftar, setDaftar] = useState<Properti[]>([])
  const [loading, setLoading] = useState(true)
  const [modalBuka, setModalBuka] = useState(false)
  const [editData, setEditData] = useState<PropertiData | null>(null)
  const [pesan, setPesan] = useState('')
  const [error, setError] = useState('')
  const [prosesId, setProsesId] = useState('')

  async function muat() {
    try {
      const res = await fetch('/api/properti')
      const json = await res.json()
      setDaftar(json.properti ?? [])
    } catch {
      setError('Gagal memuat daftar properti.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { muat() }, [])

  function bukaTambah() {
    setEditData(null); setModalBuka(true); setError(''); setPesan('')
  }

  function bukaEdit(p: Properti) {
    setEditData(p); setModalBuka(true); setError(''); setPesan('')
  }

  function tutupModal() {
    setModalBuka(false); setEditData(null)
    muat(); router.refresh()
  }

  async function toggleAktif(p: Properti) {
    setProsesId(p.id); setError(''); setPesan('')
    try {
      const res = await fetch('/api/properti', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, aktif: !p.aktif }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error?.message ?? 'Gagal mengubah status properti.')
        return
      }
      setPesan(p.aktif ? `"${p.nama}" dinonaktifkan.` : `"${p.nama}" diaktifkan kembali.`)
      muat(); router.refresh()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setProsesId('')
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Memuat properti...</div>
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Pengaturan</h1>
        <p className="text-sm text-gray-400">Properti</p>
      </div>

      <TabPengaturan aktif="/pengaturan/properti" />

      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="text-sm font-medium text-gray-900">Kelola properti</h2>
          <p className="text-sm text-gray-400">
            {daftar.length} properti terdaftar · {daftar.filter(p => p.aktif).length} aktif
          </p>
        </div>
        <button onClick={bukaTambah} className="btn btn-primary inline-flex items-center gap-1.5">
          <PlusLg size={14} /> Tambah properti
        </button>
      </div>

      {pesan && (
        <div className="mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
          <CheckCircleFill size={14} /> {pesan}
        </div>
      )}
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {daftar.length === 0 ? (
        <div className="card text-center py-14">
          <Building className="text-4xl text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Belum ada properti</h2>
          <p className="text-sm text-gray-500 mt-1">Tambahkan properti pertama untuk mulai mencatat kamar dan penyewa.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {daftar.map(p => (
            <div key={p.id} className={`card ${p.aktif ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-gray-900 truncate">{p.nama}</h2>
                    <span className="badge bg-gray-100 text-gray-600 text-[10px]">{TIPE_LABEL[p.tipe] ?? p.tipe}</span>
                    {p.aktif ? (
                      <span className="badge bg-teal-50 text-teal-700 text-[10px] inline-flex items-center gap-1">
                        <CheckCircleFill size={9} /> Aktif
                      </span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500 text-[10px] inline-flex items-center gap-1">
                        <SlashCircle size={9} /> Nonaktif
                      </span>
                    )}
                    {p.isDemo && (
                      <span className="badge bg-amber-50 text-amber-600 text-[10px]">Demo</span>
                    )}
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-sm text-gray-500">
                    <p className="inline-flex items-center gap-1.5">
                      <GeoAlt size={12} className="text-gray-400" />
                      {p.alamat} · {p.kota}, {p.provinsi}
                    </p>
                    <p className="inline-flex items-center gap-1.5">
                      <DoorClosed size={12} className="text-gray-400" />
                      {p._count.kamar} kamar
                    </p>
                  </div>

                  {p.deskripsi && (
                    <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{p.deskripsi}</p>
                  )}

                  {p.fasilitas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.fasilitas.map(f => (
                        <span key={f} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{f}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => bukaEdit(p)}
                    className="btn btn-ghost text-xs inline-flex items-center gap-1.5"
                  >
                    <PencilSquare size={13} /> Edit
                  </button>
                  <button
                    onClick={() => toggleAktif(p)}
                    disabled={prosesId === p.id}
                    title={p.aktif ? 'Nonaktifkan (data tetap tersimpan)' : 'Aktifkan kembali'}
                    className={`btn text-xs inline-flex items-center gap-1.5 disabled:opacity-50 ${
                      p.aktif ? 'btn-ghost text-amber-600' : 'btn-ghost text-teal-600'
                    }`}
                  >
                    {p.aktif ? <><EyeSlash size={13} /> Nonaktifkan</> : <><Eye size={13} /> Aktifkan</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Properti tidak bisa dihapus permanen — nonaktifkan saja. Data kamar, sewa, dan tagihan tetap tersimpan,
        dan properti nonaktif tidak muncul di pemilih properti.
      </p>

      {modalBuka && <PropertiModal data={editData} onTutup={tutupModal} />}
    </div>
  )
}
