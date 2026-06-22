'use server'

import { jwtVerify, SignJWT } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret'
)

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload
  } catch {
    return null
  }
}

export async function createToken(data: {
  sub: string
  email: string
  name: string
  role: string
}) {
  return new SignJWT(data)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET)
}
