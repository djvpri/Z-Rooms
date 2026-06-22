import { Suspense } from 'react'
import QRApproveClient from './QRApproveClient'

export default function QRApprovePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <QRApproveClient />
    </Suspense>
  )
}
