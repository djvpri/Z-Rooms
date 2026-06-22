// app/api/auth/qr/generate/route.ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// In-memory store (production: use Redis)
const sessions = new Map<string, { createdAt: number; token?: string }>()

// Cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, data] of sessions.entries()) {
    if (now - data.createdAt > 120000) { // 2 minutes TTL
      sessions.delete(sessionId)
    }
  }
}, 60000)

export async function POST() {
  const sessionId = randomBytes(16).toString('hex')
  
  sessions.set(sessionId, {
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

  if (!sessionId || !sessions.has(sessionId)) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }

  const session = sessions.get(sessionId)!
  
  if (session.token) {
    // Token found, return it and delete session
    const token = session.token
    sessions.delete(sessionId)
    return NextResponse.json({ success: true, token })
  }

  return NextResponse.json({ success: false, waiting: true })
}

// Export sessions for approve endpoint
export { sessions }
