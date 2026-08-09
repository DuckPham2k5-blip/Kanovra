import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe used by Docker, PM2 and the deploy script.
 * Returns 503 when the database is unreachable so a bad deploy is caught
 * before traffic is switched over.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("health", error, { check: "database" });
    return NextResponse.json(
      {
        status: "error",
        database: "down",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
