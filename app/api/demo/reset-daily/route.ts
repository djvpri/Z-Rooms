import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetDemoData } from "@/app/lib/demo-seed";

const SECRET_PREFIX = "zrooms-demo-";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth" }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!token.startsWith(SECRET_PREFIX)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Find expired demo properties
    const expired = await prisma.properti.findMany({
      where: {
        isDemo: true,
        demoExpiresAt: { lt: new Date() },
      },
    });

    if (expired.length === 0) {
      return NextResponse.json({ message: "No expired demo properties" });
    }

    // Reset each expired demo property
    const results = [];
    for (const properti of expired) {
      try {
        await resetDemoData(properti.id);
        results.push({ id: properti.id, status: "reset" });
      } catch (err: any) {
        results.push({ id: properti.id, status: "error", detail: String(err?.message || err) });
      }
    }

    return NextResponse.json({ reset: results.length, details: results });
  } catch (error: any) {
    console.error("reset-daily error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo data", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
