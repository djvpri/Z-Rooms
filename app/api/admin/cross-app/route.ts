// app/api/admin/cross-app/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const CROSS_APP_SECRET = process.env.CROSS_APP_SECRET || 'z-ecosystem-admin-2026'

export async function POST(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (token !== CROSS_APP_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, email, name, role, password } = body

    switch (action) {
      case 'create': {
        if (!email || !name) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        
        const hashedPassword = password 
          ? await bcrypt.hash(password, 10)
          : await bcrypt.hash(`face:${name}`, 10)
        
        const user = await prisma.user.create({
          data: {
            email,
            name,
            password: hashedPassword,
            role: role || 'USER',
            isActive: true,
          },
        })
        
        return NextResponse.json({ 
          success: true, 
          user: { id: user.id, email: user.email, name: user.name, role: user.role } 
        })
      }

      case 'updateRole': {
        if (!email || !role) {
          return NextResponse.json({ error: 'Missing email or role' }, { status: 400 })
        }
        
        const user = await prisma.user.update({
          where: { email },
          data: { role },
        })
        
        return NextResponse.json({ success: true, user })
      }

      case 'toggleActive': {
        if (!email) {
          return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        }
        
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        
        const updated = await prisma.user.update({
          where: { email },
          data: { isActive: !user.isActive },
        })
        
        return NextResponse.json({ success: true, user: updated })
      }

      case 'resetPassword': {
        if (!email || !password) {
          return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
        }
        
        const hashedPassword = await bcrypt.hash(password, 10)
        const user = await prisma.user.update({
          where: { email },
          data: { password: hashedPassword },
        })
        
        return NextResponse.json({ success: true })
      }

      case 'delete': {
        if (!email) {
          return NextResponse.json({ error: 'Missing email' }, { status: 400 })
        }
        
        await prisma.user.delete({ where: { email } })
        return NextResponse.json({ success: true })
      }

      case 'list': {
        const users = await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            faceId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
        
        return NextResponse.json({ success: true, users })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Cross-app API error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
