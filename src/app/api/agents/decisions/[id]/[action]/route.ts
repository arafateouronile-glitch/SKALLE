import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await params;
  if (!["approve", "reject"].includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const workspace = await getOrCreateWorkspace(session);

  const decision = await prisma.agentDecision.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.agentDecision.update({ where: { id }, data: { status } });

  return NextResponse.json({ ok: true });
}
