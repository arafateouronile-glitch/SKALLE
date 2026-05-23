/**
 * POST /api/social/veille/create-post
 *
 * Crée un post social depuis la veille virale.
 * action:
 *   "draft"    → Post DRAFT (brouillon dans le calendrier)
 *   "schedule" → Post SCHEDULED avec scheduledAt
 *   "publish"  → Post PUBLISHED immédiatement via LinkedIn API
 *
 * Body: { content, platform, action, scheduledAt? }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { publishLinkedInPost, getLinkedInStatus } from "@/lib/services/integrations/linkedin-api";
import type { PostType, Status } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await getOrCreateWorkspace(session);

  const body = await req.json() as {
    content: string;
    platform: "LINKEDIN" | "X";
    action: "draft" | "schedule" | "publish";
    scheduledAt?: string;
    sourcePostId?: string; // ViralPost id (for traceability)
  };

  const { content, platform, action, scheduledAt, sourcePostId } = body;
  if (!content?.trim()) return NextResponse.json({ error: "content requis" }, { status: 400 });

  let status: Status = "DRAFT";
  let publishedAt: Date | undefined;
  let cmsPostId: string | undefined;

  if (action === "schedule") {
    if (!scheduledAt) return NextResponse.json({ error: "scheduledAt requis pour schedule" }, { status: 400 });
    status = "SCHEDULED";
  }

  if (action === "publish") {
    if (platform !== "LINKEDIN") {
      return NextResponse.json({ error: "Publication directe uniquement pour LinkedIn" }, { status: 400 });
    }
    const li = await getLinkedInStatus(workspace.id);
    if (!li.connected) {
      return NextResponse.json({ error: "LinkedIn non connecté. Connecte ton compte dans Intégrations." }, { status: 422 });
    }
    try {
      const result = await publishLinkedInPost(workspace.id, content);
      cmsPostId = result.postId ?? undefined;
      status = "PUBLISHED";
      publishedAt = new Date();
    } catch (e) {
      return NextResponse.json({ error: `Erreur LinkedIn : ${(e as Error).message}` }, { status: 502 });
    }
  }

  const post = await prisma.post.create({
    data: {
      type: platform as PostType,
      content,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      publishedAt,
      cmsPostId,
      workspaceId: workspace.id,
      ...(sourcePostId ? { sources: { viralPostId: sourcePostId } } : {}),
    },
    select: { id: true, status: true, scheduledAt: true },
  });

  return NextResponse.json({ success: true, post });
}
