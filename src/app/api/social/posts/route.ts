import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = new Set(["LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "TIKTOK"]);
const VALID_STATUSES = new Set(["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"]);
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(1, limitRaw), MAX_LIMIT);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");

  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  if (typeParam && !VALID_TYPES.has(typeParam)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ posts: [], nextCursor: null });

  const posts = await prisma.post.findMany({
    where: {
      workspaceId: workspace.id,
      type: typeParam
        ? { equals: typeParam as "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK" }
        : { in: ["LINKEDIN", "X", "INSTAGRAM", "FACEBOOK", "TIKTOK"] },
      status: statusParam ? (statusParam as "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED") : undefined,
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
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ posts: items, nextCursor });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    type: string;
    content: string;
    title?: string;
    sources?: Record<string, unknown>;
  };

  const { type, content, title, sources } = body;

  if (!type || !content?.trim()) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const post = await prisma.post.create({
    data: {
      type: type as "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK",
      content: content.trim(),
      title: title?.trim() ?? null,
      status: "DRAFT",
      workspaceId: workspace.id,
      sources: sources ? (sources as object) : undefined,
    },
  });

  return NextResponse.json({ post }, { status: 201 });
}
