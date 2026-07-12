import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { resetDemoData } from "@/app/lib/demo-seed";

const prisma = new PrismaClient();
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

    // Find expired demo properties
    const expiredDemos = await prisma.properti.findMany({
      where: {
        isDemo: true,
        demoExpiresAt: {
          lt: new Date(),
        },
      },
    });

    const resetResults = [];

    for (const demo of expiredDemos) {
      try {
        await resetDemoData(demo.id);
        resetResults.push({
          propertiId: demo.id,
          propertiNama: demo.nama,
          status: "reset_success",
        });
      } catch (error) {
        resetResults.push({
          propertiId: demo.id,
          propertiNama: demo.nama,
          status: "reset_failed",
          error: String(error),
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${resetResults.length} expired demo properties`,
        results: resetResults,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Demo reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo data", detail: String(error) },
      { status: 500 }
    );
  }
}
