// app/api/auth/qr/approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'

// Import sessions from generate route
const sessions = new Map<string, { createdAt: number; token?: string }>()

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret'
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, email, password, faceId } = body

    if (!sessionId || !sessions.has(sessionId)) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
    }

    let user

    // Auth via face or email/password
    if (faceId) {
      user = await prisma.user.findUnique({
        where: { faceId },
      })
    } else if (email && password) {
      const foundUser = await prisma.user.findUnique({
        where: { email },
      })
      
      if (foundUser && foundUser.password) {
        const valid = await bcrypt.compare(password, foundUser.password)
        if (valid) {
          user = foundUser
        }
      }
    }

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    // Generate JWT token
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(JWT_SECRET)

    // Store token in session
    const session = sessions.get(sessionId)
    if (session) {
      session.token = token
      sessions.set(sessionId, session)
    }

    return NextResponse.json({
      success: true,
      message: 'Login approved. Return to your computer.',
    })
  } catch (error: any) {
    console.error('QR approve error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
