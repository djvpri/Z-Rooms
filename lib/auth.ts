// lib/auth.ts
import NextAuth from 'next-auth'
import jwt from 'jsonwebtoken'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import { verifyToken, createToken } from './jwt'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        ssoToken: { label: 'SSO Token', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)

        // SSO login dari Z One
        if ((credentials as any).ssoToken) {
          try {
            // Migration 2026-07-02: try both secrets
            const NEW_SECRET = process.env.CROSS_APP_SECRET || 'uurclTHL375CiZeWi2g4T3GczU2YNY9I1wzjlsVTgSk'
            const OLD_SECRET = 'z-ecosystem-admin-2026'
            
            let payload: any = null
            for (const s of [NEW_SECRET, OLD_SECRET]) {
              try {
                payload = jwt.verify((credentials as any).ssoToken, s)
                break
              } catch {}
            }
            if (!payload) return null
            console.log('[SSO] payload.app:', payload.app, 'email:', payload.email)
            if (payload.app !== 'zrooms' && payload.app !== 'z-rooms') {
              console.log('[SSO] app mismatch, rejecting')
              return null
            }
            const email = String(payload.email || '').trim().toLowerCase()
            let user = await prisma.user.findUnique({ where: { email } })
            
            // Auto-create user jika belum ada (first-time SSO access)
            if (!user) {
              const name = String(payload.name || email.split('@')[0])
              user = await prisma.user.create({
                data: {
                  email,
                  name,
                  password: '', // SSO user, no password needed
                  role: 'USER',
                  isActive: true,
                },
              })
              console.log(`[SSO] Auto-created ZRooms user: ${email}`)
            }
            
            if (!user.isActive) return null
            return { id: user.id, name: user.name, email: user.email, role: user.role }
          } catch (e: any) {
            console.log('[SSO] verify error:', e.message)
            return null
          }
        }

        // Token-based login (from QR approval)
        if ((credentials as any).token) {
          const payload = await verifyToken((credentials as any).token)
          if (!payload) return null
          return { 
            id: payload.sub as string, 
            email: payload.email as string, 
            name: payload.name as string, 
            role: payload.role as string 
          }
        }

        // Face-based login
        if ((credentials as any).faceId) {
          const user = await prisma.user.findUnique({
            where: { faceId: (credentials as any).faceId },
          })
          if (!user || !user.isActive) return null
          return { id: user.id, name: user.name, email: user.email, role: user.role }
        }

        // Email/password login
        if (!parsed.success) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user || !user.password || !user.isActive) return null

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role
      }
      return session
    },
  },
})
