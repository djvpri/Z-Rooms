import { NextResponse } from "next/server"

export const GET = () => NextResponse.json({ 
  version: "v4", 
  commit: "7042092",
  deployedAt: new Date().toISOString()
})
