import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { prospectId } = (await req.json()) as { prospectId: string };
  if (!prospectId) {
    return NextResponse.json({ error: "prospectId requis" }, { status: 400 });
  }

  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: { in: workspaceIds } },
    select: { id: true },
  });
  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { status: "MEETING_BOOKED", lastInteractionAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
