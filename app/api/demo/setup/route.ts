import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedDemoData } from "@/app/lib/demo-seed";
import { cekDemoSecret } from "@/app/lib/demo-auth";

export async function POST(request: NextRequest) {
  try {
    if (!cekDemoSecret(request)) {
      return NextResponse.json({ error: "Missing or invalid auth" }, { status: 401 });
    }

    // Ensure demo columns exist
    await prisma.$executeRawUnsafe(`ALTER TABLE "Properti" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Properti" ADD COLUMN IF NOT EXISTS "demoExpiresAt" TIMESTAMP(3)`);

    // Owner WAJIB eksplisit lewat body ({ ownerEmail } / { ownerId }).
    // Sebelumnya tanpa body endpoint ini jatuh ke user pertama
    // (`findFirst orderBy createdAt asc`), sehingga properti demo ikut
    // ditempelkan ke akun produksi pemiliknya — user itu lalu melihat dua
    // properti di dashboard tanpa pernah memintanya.
    const body = await request.json().catch(() => ({} as any));
    const owner = body?.ownerId
      ? await prisma.user.findUnique({ where: { id: String(body.ownerId) } })
      : body?.ownerEmail
        ? await prisma.user.findUnique({ where: { email: String(body.ownerEmail) } })
        : null;

    if (!owner) {
      return NextResponse.json(
        { error: "ownerEmail atau ownerId wajib dikirim di body." },
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
