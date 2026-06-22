const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function check() {
  try {
    const users = await prisma.user.count()
    const rooms = await prisma.room.count()
    const tenants = await prisma.tenant.count()
    console.log(`✅ DB Connected`)
    console.log(`Users: ${users}, Rooms: ${rooms}, Tenants: ${tenants}`)
    
    if (users === 0) {
      console.log('⚠️  No users found - seed needed')
    } else {
      const admin = await prisma.user.findFirst({ where: { email: 'admin@nusasewa.id' }})
      console.log(`Admin exists: ${!!admin}`)
    }
  } catch (e) {
    console.error('❌ Error:', e.message)
  } finally {
    await prisma.$disconnect()
  }
}

check()
