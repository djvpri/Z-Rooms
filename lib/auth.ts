// lib/auth.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        
        // Token-based login (from QR approval)
        if ((credentials as any).token) {
          try {
            const { jwtVerify } = await import('jose')
            const JWT_SECRET = new TextEncoder().encode(
              process.env.NEXTAUTH_SECRET || 'fallback-secret'
            )
            const { payload } = await jwtVerify((credentials as any).token, JWT_SECRET)
            return { 
              id: payload.sub as string, 
              email: payload.email as string, 
              name: payload.name as string, 
              role: payload.role as string 
            }
          } catch {
            return null
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
