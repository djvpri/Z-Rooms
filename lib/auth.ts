// lib/auth.ts
import NextAuth from 'next-auth'
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
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const jwt = require('jsonwebtoken')
            const payload = jwt.verify((credentials as any).ssoToken, process.env.CROSS_APP_SECRET || 'z-ecosystem-admin-2026') as any
            if (payload.app !== 'zrooms' && payload.app !== 'z-rooms') return null
            const email = String(payload.email || '').trim().toLowerCase()
            const user = await prisma.user.findUnique({ where: { email } })
            if (!user || !user.isActive) return null
            return { id: user.id, name: user.name, email: user.email, role: user.role }
          } catch { return null }
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
