// app/api/auth/qr/generate/route.ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { setQRSession, getQRSession, deleteQRSession } from '@/lib/qr-sessions'

export async function POST() {
  const sessionId = randomBytes(16).toString('hex')
  
  setQRSession(sessionId, {
    createdAt: Date.now(),
  })

  const qrData = `${process.env.NEXTAUTH_URL}/auth/qr-approve?sid=${sessionId}`

  return NextResponse.json({
    success: true,
    sessionId,
    qrData,
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sid')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session' }, { status: 400 })
  }

  const session = getQRSession(sessionId)
  
  if (!session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }
  
  if (session.token) {
    const token = session.token
    deleteQRSession(sessionId)
    return NextResponse.json({ success: true, token })
  }

  return NextResponse.json({ success: false, waiting: true })
}
