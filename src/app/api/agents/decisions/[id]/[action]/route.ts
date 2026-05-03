import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action } = await params;
  if (!["approve", "reject"].includes(action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const decision = await prisma.agentDecision.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.agentDecision.update({ where: { id }, data: { status } });

  return NextResponse.json({ ok: true });
}
