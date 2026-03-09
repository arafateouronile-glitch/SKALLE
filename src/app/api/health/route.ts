import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health
 *
 * Endpoint de santé utilisé par Vercel et les outils de monitoring.
 * Vérifie la connectivité DB. Retourne 200 OK ou 503 Service Unavailable.
 */
export async function GET() {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        db: "connected",
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("[health] DB unreachable:", err);

    return NextResponse.json(
      {
        status: "error",
        db: "unreachable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
