// app/api/auth/qr/approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { getQRSession, setQRSession } from '@/lib/qr-sessions'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret'
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, email, password, faceId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 })
    }

    const session = getQRSession(sessionId)
    if (!session) {
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
    setQRSession(sessionId, {
      createdAt: session.createdAt,
      token,
    })

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
