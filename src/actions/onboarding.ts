"use server";

/**
 * 🚀 Onboarding - Wizard 4 étapes
 * 1. Nom du workspace + domaine
 * 2. Analyse de la brand voice
 * 3. Premier article SEO généré
 * 4. Activer l'autopilot (optionnel) + terminer
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeBrandVoice } from "@/actions/brand";
import { generateSingleArticle } from "@/actions/seo";
import { z } from "zod";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

/** Étape effective dérivée des données (pour rétrocompat) — async pour compat Server Actions */
export async function getEffectiveOnboardingStep(workspace: {
  onboardingStep?: number;
  domainUrl: string | null;
  brandVoice: unknown;
  _count?: { posts: number };
}): Promise<number> {
  if (workspace.onboardingStep === 0) return 0;
  if (!workspace.domainUrl?.trim()) return 1;
  if (!workspace.brandVoice) return 2;
  const postCount = workspace._count?.posts ?? 0;
  if (postCount === 0) return 3;
  return 4; // prêt à finir
}

export async function getOnboardingState(): Promise<{
  success: boolean;
  workspaceId?: string;
  step?: number;
  name?: string;
  domainUrl?: string | null;
  error?: string;
}> {
  try {
    const session = await requireAuth();
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        domainUrl: true,
        brandVoice: true,
        onboardingStep: true,
        _count: { select: { posts: true } },
      },
    });
    if (!workspace) {
      return { success: false, error: "Aucun workspace" };
    }
    const step = await getEffectiveOnboardingStep(workspace);
    return {
      success: true,
      workspaceId: workspace.id,
      step,
      name: workspace.name,
      domainUrl: workspace.domainUrl,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

const domainSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  domainUrl: z.string().url("URL invalide"),
});

export async function setOnboardingDomain(
  workspaceId: string,
  data: z.infer<typeof domainSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    const parsed = domainSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });
    if (!ws) return { success: false, error: "Workspace non trouvé" };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: parsed.data.name,
        domainUrl: parsed.data.domainUrl,
        onboardingStep: 2,
      },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runOnboardingBrandAnalysis(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true, domainUrl: true },
    });
    if (!ws?.domainUrl) return { success: false, error: "Domaine manquant" };
    const result = await analyzeBrandVoice(workspaceId, ws.domainUrl);
    if (!result.success) return { success: false, error: result.error };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { onboardingStep: 3 },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function generateOnboardingFirstArticle(
  workspaceId: string,
  keyword?: string
): Promise<{ success: boolean; articleId?: string; title?: string; error?: string }> {
  try {
    const session = await requireAuth();
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true, brandVoice: true },
    });
    if (!ws) return { success: false, error: "Workspace non trouvé" };
    const k = keyword?.trim() || "comment améliorer son référencement naturel";
    const result = await generateSingleArticle(workspaceId, k, undefined, {
      generateImages: false,
    });
    if (!result.success) return { success: false, error: result.error };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { onboardingStep: 4 },
    });
    return {
      success: true,
      articleId: result.data?.id,
      title: result.data?.title,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function completeOnboarding(
  workspaceId: string,
  enableAutopilot?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      include: { autopilotConfig: true },
    });
    if (!ws) return { success: false, error: "Workspace non trouvé" };
    if (enableAutopilot) {
      if (ws.autopilotConfig) {
        await prisma.autopilotConfig.update({
          where: { workspaceId },
          data: { isActive: true },
        });
      } else {
        await prisma.autopilotConfig.create({
          data: {
            workspaceId,
            isActive: true,
            seoEnabled: true,
            seoFrequency: "weekly",
            seoMinArticles: 2,
          },
        });
      }
    }
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        onboardingStep: 0,
        hasCmoAccess: true,
        hasCsoAccess: true,
      },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
