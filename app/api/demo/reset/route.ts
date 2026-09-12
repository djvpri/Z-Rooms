import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertiAktif } from "@/lib/properti";
import { resetDemoData, seedDemoData } from "@/app/lib/demo-seed";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ isDemo: false });

  const properti = await propertiAktif(session.user.id);
  return NextResponse.json({ isDemo: !!properti?.isDemo });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const properti = await propertiAktif(session.user.id);

  if (!properti?.isDemo) {
    return NextResponse.json({ error: "Bukan akun demo" }, { status: 403 });
  }

  // Seed ulang atas nama pemilik properti ini (session.user.id), bukan akun
  // demo hardcoded — kalau tidak, hasil reset nyasar ke akun lain.
  await resetDemoData(properti.id);
  const result = await seedDemoData(session.user.id);
  return NextResponse.json({ ok: true, propertiId: result.propertiId });
}
