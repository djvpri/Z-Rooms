// lib/qr-sessions.ts
// In-memory QR session store (production: use Redis)
const sessions = new Map<string, { createdAt: number; token?: string }>()

// Cleanup expired sessions every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    Array.from(sessions.entries()).forEach(([sessionId, data]) => {
      if (now - data.createdAt > 120000) { // 2 minutes TTL
        sessions.delete(sessionId)
      }
    })
  }, 60000)
}

export function getQRSession(sessionId: string) {
  return sessions.get(sessionId)
}

export function setQRSession(sessionId: string, data: { createdAt: number; token?: string }) {
  sessions.set(sessionId, data)
}

export function deleteQRSession(sessionId: string) {
  sessions.delete(sessionId)
}
