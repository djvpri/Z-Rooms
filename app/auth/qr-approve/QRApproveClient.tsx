'use client'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Camera, Mail, CheckCircle2 } from 'lucide-react'

export default function QRApproveClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('sid')
  
  const [method, setMethod] = useState<'email' | 'face'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  useEffect(() => {
    if (!sessionId) setError('Invalid QR code. Please scan again.')
  }, [sessionId])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/qr/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login gagal'); setLoading(false); return }
      setSuccess(true)
      setTimeout(() => router.push('/'), 2000)
    } catch { setError('Terjadi kesalahan. Coba lagi.'); setLoading(false) }
  }

  async function onFaceCapture(imageData: string) {
    setLoading(true); setError('')
    try {
      const faceRes = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      })
      const faceData = await faceRes.json()
      if (!faceRes.ok) { setError(faceData.error || 'Wajah tidak dikenali'); setLoading(false); setShowCamera(false); return }
      const approveRes = await fetch('/api/auth/qr/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, faceId: faceData.user.faceId }),
      })
      const approveData = await approveRes.json()
      if (!approveRes.ok) { setError(approveData.error || 'Approval gagal'); setLoading(false); setShowCamera(false); return }
      setSuccess(true)
      setTimeout(() => router.push('/'), 2000)
    } catch { setError('Terjadi kesalahan. Coba lagi.'); setLoading(false); setShowCamera(false) }
  }

  if (!sessionId) return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="card text-center max-w-sm"><p className="text-red-600">❌ QR code tidak valid. Silakan scan ulang.</p></div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="card text-center max-w-sm">
        <CheckCircle2 className="w-16 h-16 text-teal-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Login Berhasil!</h2>
        <p className="text-gray-600">Kembali ke komputer Anda untuk melanjutkan.</p>
      </div>
    </div>
  )

  if (showCamera) return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="card max-w-md w-full">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">Scan Wajah Anda</h2>
        <div className="bg-gray-900 rounded-lg aspect-[3/4] mb-4 flex items-center justify-center">
          <p className="text-white text-sm">Camera placeholder</p>
        </div>
        {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}
        <button onClick={() => setShowCamera(false)} className="btn bg-white border border-gray-200 text-gray-700 w-full justify-center">Batal</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <span className="text-xl font-semibold text-gray-900">Z-Rooms</span>
          </div>
          <p className="text-sm text-gray-600">Approve login dari komputer Anda</p>
        </div>
        <div className="card space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMethod('email')} className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${method === 'email' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600'}`}>
              <Mail className="w-5 h-5 mx-auto mb-1" /><span className="text-xs font-medium">Email</span>
            </button>
            <button onClick={() => setMethod('face')} className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${method === 'face' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600'}`}>
              <Camera className="w-5 h-5 mx-auto mb-1" /><span className="text-xs font-medium">Face</span>
            </button>
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}
          {method === 'email' ? (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="form-label">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="admin@nusasewa.id" required />
              </div>
              <div>
                <label className="form-label">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="form-input" placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
                {loading ? 'Memproses...' : 'Approve Login'}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <Camera className="w-16 h-16 text-teal-600 mx-auto mb-4" />
              <button onClick={() => setShowCamera(true)} disabled={loading} className="btn btn-primary">
                {loading ? 'Memproses...' : 'Scan Wajah Saya'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
