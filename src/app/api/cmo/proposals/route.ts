import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "IN_PROGRESS", "DONE", "FAILED"]);
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) return NextResponse.json({ proposals: [], nextCursor: null });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Number(searchParams.get("limit") ?? DEFAULT_LIMIT), MAX_LIMIT);

    const statusFilter = status && VALID_STATUSES.has(status) ? { status } : {};

    const proposals = await prisma.cMOProposal.findMany({
      where: { workspaceId: workspace.id, ...statusFilter },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { objective: { select: { title: true, type: true } } },
    });

    const hasMore = proposals.length > limit;
    const items = hasMore ? proposals.slice(0, limit) : proposals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({ proposals: items, nextCursor });
  } catch (e) {
    console.error("[GET /api/cmo/proposals]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
