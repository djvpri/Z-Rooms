'use client'
// app/login/page.tsx
import { useState, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Mail, Camera, QrCode as QrCodeIcon } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [method, setMethod] = useState<'email' | 'face' | 'qr'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  // QR state
  const [qrData, setQrData] = useState('')
  const [sessionId, setSessionId] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pollInterval = useRef<NodeJS.Timeout>()

  // Face state
  const [showCamera, setShowCamera] = useState(false)

  // Generate QR on mount if QR method selected
  useEffect(() => {
    if (method === 'qr' && !sessionId) {
      generateQR()
    }
    
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current)
      }
    }
  }, [method])

  // Poll for QR approval
  useEffect(() => {
    if (sessionId && method === 'qr') {
      pollInterval.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/auth/qr/generate?sid=${sessionId}`)
          const data = await res.json()
          
          if (data.success && data.token) {
            clearInterval(pollInterval.current)
            // Use token to sign in
            const result = await signIn('credentials', {
              token: data.token,
              redirect: false,
            })
            
            if (result?.ok) {
              router.push('/dashboard')
            }
          }
        } catch (err) {
          console.error('Poll error:', err)
        }
      }, 2000) // Poll every 2 seconds
      
      return () => {
        if (pollInterval.current) {
          clearInterval(pollInterval.current)
        }
      }
    }
  }, [sessionId, method, router])

  async function generateQR() {
    try {
      const res = await fetch('/api/auth/qr/generate', { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        setSessionId(data.sessionId)
        setQrData(data.qrData)
        
        // Render QR code
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, data.qrData, {
            width: 256,
            margin: 2,
          })
        }
      }
    } catch (err) {
      setError('Gagal generate QR code')
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    
    setLoading(false)
    
    if (res?.error) {
      setError('Email atau password salah.')
    } else {
      router.push('/dashboard')
    }
  }

  async function handleFaceLogin() {
    setShowCamera(true)
    // Camera will be implemented with react-webcam
  }

  async function onFaceCapture(imageData: string) {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Wajah tidak dikenali')
        setLoading(false)
        setShowCamera(false)
        return
      }

      // Sign in with face data
      const result = await signIn('credentials', {
        faceId: data.user.faceId,
        redirect: false,
      })

      if (result?.ok) {
        router.push('/dashboard')
      } else {
        setError('Login gagal')
        setLoading(false)
        setShowCamera(false)
      }
    } catch (err) {
      setError('Terjadi kesalahan')
      setLoading(false)
      setShowCamera(false)
    }
  }

  if (showCamera) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center px-4">
        <div className="card max-w-md w-full">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">Scan Wajah Anda</h2>
          <div className="bg-gray-900 rounded-lg aspect-[3/4] mb-4 flex items-center justify-center">
            <p className="text-white text-sm">Camera placeholder (implement with react-webcam)</p>
          </div>
          {error && (
            <div className="bg-coral-50 text-coral-600 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}
          <button
            onClick={() => setShowCamera(false)}
            className="btn bg-white border border-gray-200 text-gray-700 w-full justify-center"
          >
            Batal
          </button>
        </div>
      </div>
    )
  }

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
          <p className="text-sm text-gray-500">Masuk ke dashboard properti Anda</p>
        </div>

        <div className="card space-y-4 shadow-sm">
          {/* Method selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMethod('email')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                method === 'email'
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Mail className="w-5 h-5 mx-auto mb-1" />
              <span className="text-xs font-medium">Email</span>
            </button>
            <button
              onClick={() => setMethod('face')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                method === 'face'
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Camera className="w-5 h-5 mx-auto mb-1" />
              <span className="text-xs font-medium">Face</span>
            </button>
            <button
              onClick={() => setMethod('qr')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                method === 'qr'
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <QrCodeIcon className="w-5 h-5 mx-auto mb-1" />
              <span className="text-xs font-medium">QR</span>
            </button>
          </div>

          {error && (
            <div className="bg-coral-50 text-coral-600 text-sm px-3 py-2 rounded-lg border border-coral-100">
              {error}
            </div>
          )}

          {/* Email/Password Form */}
          {method === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="admin@nusasewa.id"
                  required
                />
              </div>
              <div>
                <label className="form-label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full justify-center"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
          )}

          {/* Face Recognition */}
          {method === 'face' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera className="w-10 h-10 text-teal-600" />
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Gunakan kamera untuk scan wajah Anda
              </p>
              <button
                onClick={handleFaceLogin}
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Memproses...' : 'Aktifkan Kamera'}
              </button>
            </div>
          )}

          {/* QR Code */}
          {method === 'qr' && (
            <div className="text-center py-6">
              <div className="bg-white border-4 border-teal-600 rounded-lg p-4 inline-block mb-4">
                <canvas ref={canvasRef} />
              </div>
              <p className="text-sm text-gray-600 mb-2">
                📱 Scan QR code dengan HP Anda
              </p>
              <p className="text-xs text-gray-500">
                Waiting for approval...
              </p>
              <button
                onClick={generateQR}
                className="btn bg-white border border-gray-200 text-gray-700 text-sm mt-4"
              >
                Refresh QR
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Demo: admin@nusasewa.id / admin123
        </p>
      </div>
    </div>
  )
}
