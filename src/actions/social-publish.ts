"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PostType, Status } from "@prisma/client";
import { publishToFacebookPage, publishToInstagram } from "@/lib/services/meta/publishing";
import { publishLinkedInPost } from "@/lib/services/integrations/linkedin-api";
import { refreshTokenIfNeeded } from "@/lib/services/meta/token-manager";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PublishPostResult {
  success: boolean;
  platformPostId?: string;
  permalink?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH POST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Publie un Post (DRAFT ou SCHEDULED) sur le réseau social correspondant
 * à son `type` (LINKEDIN, FACEBOOK, INSTAGRAM).
 *
 * Met à jour le statut en PUBLISHED et enregistre le platformPostId.
 */
export async function publishPostAction(postId: string): Promise<PublishPostResult> {
  try {
    const session = await requireAuth();

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { userId: session.user!.id! },
        deletedAt: null,
      },
      include: { workspace: true },
    });

    if (!post) {
      return { success: false, error: "Post introuvable" };
    }

    if (post.status === "PUBLISHED") {
      return { success: false, error: "Ce post est déjà publié" };
    }

    const workspaceId = post.workspaceId;
    let platformPostId: string | undefined;
    let permalink: string | undefined;

    // ──────────────────────────────────────────────
    // LinkedIn
    // ──────────────────────────────────────────────
    if (post.type === "LINKEDIN") {
      const result = await publishLinkedInPost(workspaceId, post.content, post.imageUrl ?? undefined);
      if (!result.success) {
        return { success: false, error: result.error ?? "Erreur publication LinkedIn" };
      }
      platformPostId = result.postId;
      permalink = result.postUrl ?? undefined;
    }

    // ──────────────────────────────────────────────
    // Facebook Page
    // ──────────────────────────────────────────────
    else if (post.type === "FACEBOOK") {
      const metaAccount = await prisma.metaSocialAccount.findFirst({
        where: { workspaceId, isActive: true },
      });
      if (!metaAccount) {
        return {
          success: false,
          error: "Aucune Page Facebook connectée. Connectez-en une dans les paramètres d'intégration.",
        };
      }

      const pageToken = await refreshTokenIfNeeded(metaAccount.id);
      const result = await publishToFacebookPage(
        pageToken,
        metaAccount.facebookPageId,
        post.content,
        post.imageUrl
      );
      platformPostId = result.platformPostId;
      permalink = result.permalink;
    }

    // ──────────────────────────────────────────────
    // Instagram
    // ──────────────────────────────────────────────
    else if (post.type === "INSTAGRAM") {
      const metaAccount = await prisma.metaSocialAccount.findFirst({
        where: { workspaceId, isActive: true, instagramAccountId: { not: null } },
      });
      if (!metaAccount?.instagramAccountId) {
        return {
          success: false,
          error: "Aucun compte Instagram Business connecté. Associez une Page Facebook liée à un compte Instagram.",
        };
      }

      const pageToken = await refreshTokenIfNeeded(metaAccount.id);
      const result = await publishToInstagram(
        pageToken,
        metaAccount.instagramAccountId,
        post.content,
        post.imageUrl
      );
      platformPostId = result.platformPostId;
      permalink = result.permalink;
    }

    // ──────────────────────────────────────────────
    // Type non supporté pour publication directe
    // ──────────────────────────────────────────────
    else {
      return {
        success: false,
        error: `Publication directe non disponible pour le type "${post.type}". Utilisez Buffer ou Ayrshare.`,
      };
    }

    // Marquer le post comme publié
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        // Stocker le permalink dans cmsPostId si disponible
        ...(permalink && { cmsPostId: permalink }),
      },
    });

    return { success: true, platformPostId, permalink };
  } catch (error) {
    console.error("[publishPostAction]", error);
    // Marquer le post en FAILED
    try {
      await prisma.post.update({
        where: { id: postId },
        data: { status: "FAILED" },
      });
    } catch {
      // ignore
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la publication",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE POST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Planifie un post pour publication future.
 * Le job Inngest `scheduled-publisher` le publiera à l'heure prévue.
 */
export async function schedulePostAction(
  postId: string,
  scheduledAt: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { userId: session.user!.id! },
        deletedAt: null,
      },
    });

    if (!post) return { success: false, error: "Post introuvable" };
    if (post.status === "PUBLISHED") return { success: false, error: "Post déjà publié" };

    if (scheduledAt <= new Date()) {
      return { success: false, error: "La date de planification doit être dans le futur" };
    }

    await prisma.post.update({
      where: { id: postId },
      data: { status: "SCHEDULED", scheduledAt },
    });

    return { success: true };
  } catch (error) {
    console.error("[schedulePostAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNSCHEDULE / REVERT TO DRAFT
// ═══════════════════════════════════════════════════════════════════════════

export async function unschedulePostAction(
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { userId: session.user!.id! },
        deletedAt: null,
        status: "SCHEDULED",
      },
    });

    if (!post) return { success: false, error: "Post planifié introuvable" };

    await prisma.post.update({
      where: { id: postId },
      data: { status: "DRAFT", scheduledAt: null },
    });

    return { success: true };
  } catch (error) {
    console.error("[unschedulePostAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET CALENDAR POSTS
// ═══════════════════════════════════════════════════════════════════════════

export interface CalendarPost {
  id: string;
  type: PostType;
  title: string | null;
  content: string;
  imageUrl: string | null;
  status: Status;
  scheduledAt: string | null; // ISO string (serializable)
  publishedAt: string | null;
  createdAt: string;
  cmsPostId: string | null; // permalink after publish
}

/**
 * Récupère tous les posts sociaux (hors SEO_ARTICLE) d'un workspace.
 * Retourne séparément les posts planifiés/publiés et les brouillons sans date.
 */
export async function getCalendarPostsAction(workspaceId: string): Promise<{
  success: boolean;
  scheduled: CalendarPost[];
  drafts: CalendarPost[];
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });
    if (!workspace) return { success: false, scheduled: [], drafts: [], error: "Workspace non trouvé" };

    const allPosts = await prisma.post.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        type: { not: "SEO_ARTICLE" },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        imageUrl: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        cmsPostId: true,
      },
    });

    const toCalendarPost = (p: typeof allPosts[0]): CalendarPost => ({
      ...p,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    });

    const scheduled = allPosts
      .filter((p) => p.scheduledAt !== null || p.status === "PUBLISHED")
      .map(toCalendarPost);

    const drafts = allPosts
      .filter((p) => p.scheduledAt === null && p.status !== "PUBLISHED")
      .map(toCalendarPost);

    return { success: true, scheduled, drafts };
  } catch (error) {
    console.error("[getCalendarPostsAction]", error);
    return { success: false, scheduled: [], drafts: [], error: "Erreur" };
  }
}
