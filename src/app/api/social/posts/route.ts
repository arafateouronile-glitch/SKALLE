import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ posts: [] });

  const posts = await prisma.post.findMany({
    where: {
      workspaceId: workspace.id,
      type: { in: ["LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "TIKTOK"] },
      deletedAt: null,
    },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      status: true,
      createdAt: true,
      sources: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ posts });
}
