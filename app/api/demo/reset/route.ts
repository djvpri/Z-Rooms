import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDemoData, seedDemoData } from "@/app/lib/demo-seed";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ isDemo: false });

  const properti = await prisma.properti.findFirst({
    where: { ownerId: session.user.id },
    select: { isDemo: true },
  });
  return NextResponse.json({ isDemo: !!properti?.isDemo });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const properti = await prisma.properti.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, isDemo: true },
  });

  if (!properti?.isDemo) {
    return NextResponse.json({ error: "Bukan akun demo" }, { status: 403 });
  }

  await resetDemoData(properti.id);
  const result = await seedDemoData();
  return NextResponse.json({ ok: true, propertiId: result.propertiId });
}
