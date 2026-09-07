import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

// Never reveal internals (stack traces, connection strings, versions) in
// this response (brief §70) - it exists for load balancer / uptime
// checks, not debugging, and is unauthenticated by nature.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    logger.error({ event: "health.check_failed", error: String(error) });
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
