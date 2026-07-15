import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetDemoData, seedDemoData } from "@/app/lib/demo-seed";

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

    const demos = await prisma.properti.findMany({
      where: { isDemo: true },
      select: { id: true, nama: true },
    });

    const direset: string[] = [];
    for (const properti of demos) {
      try {
        await resetDemoData(properti.id);
        await seedDemoData();
        direset.push(properti.nama);
      } catch (err: any) {
        console.error(`reset-daily error for ${properti.nama}:`, err);
      }
    }

    return NextResponse.json({ ok: true, direset, total: demos.length });
  } catch (error: any) {
    console.error("reset-daily error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo data", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}
