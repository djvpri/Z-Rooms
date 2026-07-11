import { NextRequest, NextResponse } from "next/server";
import { seedDemoData } from "@/app/lib/demo-seed";

const SECRET_PREFIX = "zrooms-demo-";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Validate token format
    if (!token.startsWith(SECRET_PREFIX)) {
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    // Seed demo data
    const result = await seedDemoData();

    return NextResponse.json(
      {
        success: true,
        message: "Demo data setup completed",
        data: {
          demoUser: {
            id: result.userId,
            email: "demo@zomet.my.id",
          },
          properti: {
            id: result.propertiId,
            nama: "Demo Kos Sejahtera",
            isDemo: true,
            demoExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          },
          stats: {
            kamars: result.kamarIds.length,
            penyewas: result.penyewaIds.length,
            sewas: result.sewaIds.length,
            tagihans: result.tagihanIds.length,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Demo setup error:", error);
    return NextResponse.json(
      { error: "Failed to setup demo data" },
      { status: 500 }
    );
  }
}
