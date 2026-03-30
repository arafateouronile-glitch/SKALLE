/**
 * 📎 Campaign Attachment — DELETE
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id, attachmentId } = await params;

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 404 });
  }

  // Vérifier que la pièce jointe appartient bien à une campagne du workspace
  const attachment = await prisma.campaignAttachment.findFirst({
    where: {
      id: attachmentId,
      campaignId: id,
      campaign: { workspaceId: workspace.id },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Pièce jointe non trouvée" }, { status: 404 });
  }

  await prisma.campaignAttachment.delete({ where: { id: attachmentId } });

  return NextResponse.json({ success: true });
}
