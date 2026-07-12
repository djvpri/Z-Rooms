import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedDemoData } from "@/app/lib/demo-seed";

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

    // Ensure demo columns exist
    await prisma.$executeRawUnsafe(`ALTER TABLE "Properti" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Properti" ADD COLUMN IF NOT EXISTS "demoExpiresAt" TIMESTAMP(3)`);

    // Clean existing demo properti first
    const existingDemo = await prisma.properti.findFirst({
      where: { isDemo: true },
      orderBy: { createdAt: "desc" },
    });
    if (existingDemo) {
      const { resetDemoData } = await import("@/app/lib/demo-seed");
      await resetDemoData(existingDemo.id);
    }

    // Seed fresh demo data
    const result = await seedDemoData();

    return NextResponse.json({
      success: true,
      properti: { id: result.propertiId },
      data: result,
    });
  } catch (error: any) {
    console.error("Demo setup error:", error);
    return NextResponse.json(
      { error: "Setup failed", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
