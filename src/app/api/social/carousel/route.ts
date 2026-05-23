/**
 * POST /api/social/carousel
 *
 * Reçoit un PDF généré côté client (multipart/form-data),
 * l'upload sur LinkedIn comme document, crée un Post DRAFT avec les slides.
 *
 * Body (multipart):
 *   - pdf: File (PDF)
 *   - caption: string (texte du post)
 *   - title: string (titre du document)
 *   - slides: JSON stringified array of { title, body }
 *   - publishNow: "true" | "false"
 *   - scheduledAt?: ISO string
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadLinkedInDocument,
  publishLinkedInDocumentPost,
} from "@/lib/services/integrations/linkedin-api";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const formData = await req.formData();
  const pdfFile = formData.get("pdf") as File | null;
  const caption = (formData.get("caption") as string) || "";
  const title = (formData.get("title") as string) || "Carrousel";
  const slidesRaw = (formData.get("slides") as string) || "[]";
  const publishNow = formData.get("publishNow") === "true";
  const scheduledAtRaw = formData.get("scheduledAt") as string | null;

  if (!pdfFile) {
    return NextResponse.json({ error: "PDF manquant" }, { status: 400 });
  }

  const pdfBuffer = await pdfFile.arrayBuffer();
  let slides: unknown[] = [];
  try { slides = JSON.parse(slidesRaw); } catch { /* ignore */ }

  let postId: string | undefined;
  let postUrl: string | undefined;
  let linkedInPostId: string | undefined;
  let status: "DRAFT" | "SCHEDULED" | "PUBLISHED" = "DRAFT";

  if (publishNow) {
    // Upload PDF vers LinkedIn
    const uploadResult = await uploadLinkedInDocument(workspace.id, pdfBuffer, `${title}.pdf`);
    if (!uploadResult.success || !uploadResult.assetUrn) {
      return NextResponse.json(
        { error: uploadResult.error ?? "Échec upload LinkedIn" },
        { status: 502 }
      );
    }

    const publishResult = await publishLinkedInDocumentPost(
      workspace.id,
      caption,
      uploadResult.assetUrn,
      title
    );
    if (!publishResult.success) {
      return NextResponse.json(
        { error: publishResult.error ?? "Échec publication LinkedIn" },
        { status: 502 }
      );
    }

    linkedInPostId = publishResult.postId;
    postUrl = publishResult.postUrl;
    status = "PUBLISHED";
  } else if (scheduledAtRaw) {
    status = "SCHEDULED";
  }

  // Créer le Post en DB
  const post = await prisma.post.create({
    data: {
      type: "LINKEDIN",
      content: caption,
      title,
      status,
      isCarousel: true,
      slides: slides as object[],
      cmsPostId: linkedInPostId,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw) : null,
      workspaceId: workspace.id,
    },
  });

  return NextResponse.json({
    postId: post.id,
    linkedInPostId,
    postUrl,
    status,
  });
}
