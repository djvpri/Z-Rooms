// app/api/auth/face-login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signIn } from 'next-auth/react'

const ZFACE_API_URL = process.env.ZFACE_API_URL || 'https://zface.zomet.my.id'
const FACE_LOGIN_SECRET = process.env.FACE_LOGIN_SECRET || 'Fffhjjtxdddggh4457743$&$#$&+'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image, threshold = 0.40 } = body

    if (!image) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 })
    }

    // Call ZFace to identify face
    const zfaceRes = await fetch(`${ZFACE_API_URL}/api/auth/face-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image, threshold }),
    })

    if (!zfaceRes.ok) {
      const error = await zfaceRes.json()
      return NextResponse.json({ error: error.detail || 'Face recognition failed' }, { status: 400 })
    }

    const zfaceData = await zfaceRes.json()
    const { face_id } = zfaceData

    if (!face_id) {
      return NextResponse.json({ error: 'No face match found' }, { status: 404 })
    }

    // Find user by faceId
    const user = await prisma.user.findUnique({
      where: { faceId: face_id },
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 })
    }

    // Return user data for client-side signIn
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        faceId: user.faceId,
      },
    })
  } catch (error: any) {
    console.error('Face login error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
