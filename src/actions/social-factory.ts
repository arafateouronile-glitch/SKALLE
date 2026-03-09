"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEnoughCredits, useCredits } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";
import { inngest } from "@/inngest/client";
import {
  initializeBrandStrategy,
  type MarketingPersona,
} from "@/lib/services/social/content-factory";
import {
  generateSocialCampaign,
  type AdInsights,
} from "@/lib/services/social/factory";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getAuthenticatedWorkspace(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non autorisé" as const, userId: null, workspace: null };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { error: "Workspace non trouvé" as const, userId: null, workspace: null };

  return { error: null, userId: session.user.id, workspace };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INITIALIZE BRAND STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

export async function initializeStrategy(workspaceId: string) {
  const { error, userId } = await getAuthenticatedWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  const op: OperationType = "social_factory_strategy";
  const creditCheck = await hasEnoughCredits(userId!, op);
  if (!creditCheck.hasCredits) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${creditCheck.cost}, Disponibles: ${creditCheck.currentCredits}`,
      data: null,
    };
  }

  const result = await initializeBrandStrategy(workspaceId);
  if (!result.success) {
    return { success: false as const, error: result.error ?? "Erreur inconnue", data: null };
  }

  await useCredits(userId!, op);

  return { success: true as const, data: result.persona as MarketingPersona, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. START CONTENT FACTORY (déclenche Inngest)
// ═══════════════════════════════════════════════════════════════════════════

export async function startContentFactory(
  workspaceId: string,
  input: {
    vision: string;
    niche: string;
    objectives: string[];
    month: number;
    year: number;
  }
) {
  const { error, userId } = await getAuthenticatedWorkspace(workspaceId);
  if (error) return { success: false as const, error, contentPlanId: null };

  // Vérifier les crédits pour strategy + concepts (les posts seront décomptés dans Inngest)
  const strategyOp: OperationType = "social_factory_strategy";
  const conceptsOp: OperationType = "social_factory_concepts";
  const strategyCost = (await hasEnoughCredits(userId!, strategyOp)).cost;
  const conceptsCost = (await hasEnoughCredits(userId!, conceptsOp)).cost;
  const totalMinCost = strategyCost + conceptsCost;

  const creditCheck = await hasEnoughCredits(userId!, strategyOp);
  if (creditCheck.currentCredits < totalMinCost) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Minimum requis: ${totalMinCost}, Disponibles: ${creditCheck.currentCredits}`,
      contentPlanId: null,
    };
  }

  // Créer le ContentPlan
  const contentPlan = await prisma.contentPlan.create({
    data: {
      name: `Plan ${input.month}/${input.year}`,
      month: input.month,
      year: input.year,
      status: "PENDING",
      vision: input.vision,
      niche: input.niche,
      objectives: input.objectives,
      workspaceId,
    },
  });

  // Déclencher le job Inngest
  await inngest.send({
    name: "social-factory/generate",
    data: {
      contentPlanId: contentPlan.id,
      workspaceId,
      userId: userId!,
      vision: input.vision,
      niche: input.niche,
      objectives: input.objectives,
      month: input.month,
      year: input.year,
    },
  });

  return { success: true as const, contentPlanId: contentPlan.id, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. GET CONTENT PLAN (polling)
// ═══════════════════════════════════════════════════════════════════════════

export async function getContentPlan(contentPlanId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé", data: null };

  const plan = await prisma.contentPlan.findUnique({
    where: { id: contentPlanId },
    include: {
      posts: {
        where: { deletedAt: null },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          excerpt: true,
          imageUrl: true,
          keywords: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
        },
      },
      workspace: {
        select: { userId: true },
      },
    },
  });

  if (!plan) return { success: false as const, error: "Plan non trouvé", data: null };
  if (plan.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé", data: null };
  }

  return { success: true as const, data: plan, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPDATE CONCEPT STATUS (approuver/rejeter)
// ═══════════════════════════════════════════════════════════════════════════

export async function updateConceptStatus(
  contentPlanId: string,
  conceptIndex: number,
  approved: boolean
) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé" };

  const plan = await prisma.contentPlan.findUnique({
    where: { id: contentPlanId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!plan || plan.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé" };
  }

  // Mettre à jour le concept dans conceptsData
  const concepts = (plan.conceptsData as Array<Record<string, unknown>>) ?? [];
  if (conceptIndex >= 0 && conceptIndex < concepts.length) {
    concepts[conceptIndex] = { ...concepts[conceptIndex], approved };
    await prisma.contentPlan.update({
      where: { id: contentPlanId },
      data: { conceptsData: JSON.parse(JSON.stringify(concepts)) },
    });
  }

  return { success: true as const, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. RESCHEDULE POST (drag-drop calendrier)
// ═══════════════════════════════════════════════════════════════════════════

export async function reschedulePost(postId: string, newDate: Date) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé" };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!post || post.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé" };
  }

  await prisma.post.update({
    where: { id: postId },
    data: { scheduledAt: newDate },
  });

  return { success: true as const, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. PUBLISH POST — Buffer (priorité) ou Ayrshare (fallback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mappe le PostType Prisma vers le réseau Ayrshare.
 */
const POSTTYPE_TO_AYRSHARE: Record<string, string> = {
  LINKEDIN: "linkedin",
  X: "twitter",
  INSTAGRAM: "instagram",
  TIKTOK: "tiktok",
  FACEBOOK: "facebook",
};

export async function publishPost(
  postId: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string; provider?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non autorisé" };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!post || post.workspace.userId !== session.user.id || post.workspaceId !== workspaceId) {
    return { success: false, error: "Post non trouvé ou non autorisé" };
  }

  if (post.status === "PUBLISHED") {
    return { success: false, error: "Ce post est déjà publié" };
  }

  const network = POSTTYPE_TO_AYRSHARE[post.type];

  // Tentative 1 : Buffer
  const { scheduleBufferPost } = await import("@/lib/services/integrations/buffer");
  const bufferResult = await scheduleBufferPost(workspaceId, {
    text: post.content,
    scheduledAt: post.scheduledAt ?? undefined,
    media: post.imageUrl ? { picture: post.imageUrl } : undefined,
  });

  if (bufferResult.success) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return { success: true, provider: "buffer" };
  }

  // Tentative 2 : Ayrshare
  if (network) {
    const { publishAyrsharePost } = await import("@/lib/services/integrations/ayrshare");
    const ayrResult = await publishAyrsharePost(workspaceId, {
      post: post.content,
      platforms: [network as import("@/lib/services/integrations/ayrshare").AyrshareNetwork],
      mediaUrls: post.imageUrl ? [post.imageUrl] : undefined,
      scheduleDate: post.scheduledAt ?? undefined,
    });

    if (ayrResult.success) {
      await prisma.post.update({
        where: { id: postId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      return { success: true, provider: "ayrshare" };
    }

    return {
      success: false,
      error: `Buffer: ${bufferResult.error} | Ayrshare: ${ayrResult.error}`,
    };
  }

  return { success: false, error: bufferResult.error ?? "Aucun fournisseur disponible" };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. GENERATE SOCIAL CAMPAIGN FROM SEO ARTICLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une campagne sociale multi-plateforme à partir d'un article SEO.
 * Crédits : social_factory_post (texte) + social_factory_image × images générées.
 */
export async function generateSocialCampaignAction(
  workspaceId: string,
  input: {
    seoArticleContent: string;
    keyword: string;
    adInsights?: AdInsights;
    contentPlanId?: string;
    generateImages?: boolean;
  }
) {
  const { error, userId } = await getAuthenticatedWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  // Vérifier les crédits (texte multi-format)
  const op: OperationType = "social_factory_post";
  const creditCheck = await hasEnoughCredits(userId!, op);
  if (!creditCheck.hasCredits) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${creditCheck.cost}, Disponibles: ${creditCheck.currentCredits}`,
      data: null,
    };
  }

  const result = await generateSocialCampaign({
    ...input,
    workspaceId,
    userId: userId!,
  });

  if (!result.success) {
    return { success: false as const, error: result.error ?? "Erreur inconnue", data: null };
  }

  // Déduire les crédits après succès
  await useCredits(userId!, op);

  return { success: true as const, data: result.data!, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LIST CONTENT PLANS (pour un workspace)
// ═══════════════════════════════════════════════════════════════════════════

export async function listContentPlans(workspaceId: string) {
  const { error } = await getAuthenticatedWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  const plans = await prisma.contentPlan.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      month: true,
      year: true,
      status: true,
      totalConcepts: true,
      completed: true,
      failed: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  return { success: true as const, data: plans, error: null };
}
