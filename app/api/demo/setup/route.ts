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

    // Owner bisa ditentukan lewat body ({ ownerEmail } / { ownerId }).
    // Tanpa itu, pakai user pertama — endpoint ini dipanggil server-to-server
    // (bukan dari session), jadi tidak ada user login untuk dijadikan acuan.
    const body = await request.json().catch(() => ({} as any));
    const owner = body?.ownerId
      ? await prisma.user.findUnique({ where: { id: String(body.ownerId) } })
      : body?.ownerEmail
        ? await prisma.user.findUnique({ where: { email: String(body.ownerEmail) } })
        : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

    if (!owner) {
      return NextResponse.json(
        { error: "Tidak ada user untuk dijadikan owner properti demo." },
        { status: 400 }
      );
    }

    // Bersihkan SEMUA properti demo yang sudah ada (bukan cuma yang terbaru —
    // sisa seed sebelumnya bisa menumpuk dan ikut dihitung).
    const demoLama = await prisma.properti.findMany({
      where: { isDemo: true },
      select: { id: true, nama: true },
    });
    const { resetDemoData } = await import("@/app/lib/demo-seed");
    for (const p of demoLama) {
      await resetDemoData(p.id);
    }

    // Seed fresh demo data untuk owner tersebut
    const result = await seedDemoData(owner.id);

    return NextResponse.json({
      success: true,
      owner: { id: owner.id, email: owner.email },
      dibersihkan: demoLama.map((p) => p.nama),
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
