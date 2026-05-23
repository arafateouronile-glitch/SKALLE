import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleBookmark } from "@/lib/services/social/viral-monitor";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function POST(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { postId } = await params;
  const workspace = await getOrCreateWorkspace(session);

  const updated = await toggleBookmark(postId, workspace.id);
  return NextResponse.json({ isBookmarked: updated.isBookmarked });
}
