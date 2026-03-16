"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeoContentMode =
  | "article"
  | "affiliation"
  | "ecommerce"
  | "discovery"
  | "local";

export type SeoSiteType =
  | "saas"
  | "ecommerce"
  | "services"
  | "blog_affiliation"
  | "media"
  | "local_business"
  | "marketplace"
  | "portfolio";

export interface SeoPublicationStrategy {
  frequency: "1/week" | "2/week" | "3/week" | "daily";
  language: "fr" | "en" | "es" | "de" | "pt";
  targetAudience: string;
  goals: string[];
  contentPillars: string[];
  contentMode: SeoContentMode;
  // Contexte métier — calibre les prompts de génération
  businessActivity: string;  // ex: "Logiciel de comptabilité pour PME"
  siteType: SeoSiteType;     // ex: "saas", "ecommerce", "blog_affiliation"…
}

export interface SeoSetupState {
  domainUrl: string;
  strategy: SeoPublicationStrategy | null;
  isComplete: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const seoSetupSchema = z.object({
  domainUrl: z.string().url("URL invalide (ex: https://monsite.com)"),
  strategy: z.object({
    frequency: z.enum(["1/week", "2/week", "3/week", "daily"]),
    language: z.enum(["fr", "en", "es", "de", "pt"]),
    targetAudience: z.string().min(5, "Décrivez votre audience cible"),
    goals: z.array(z.string()).min(1, "Choisissez au moins un objectif"),
    contentPillars: z
      .array(z.string().min(1))
      .min(1, "Ajoutez au moins un pilier de contenu"),
    contentMode: z.enum(["article", "affiliation", "ecommerce", "discovery", "local"]),
    businessActivity: z.string().min(3, "Décrivez votre activité"),
    siteType: z.enum([
      "saas",
      "ecommerce",
      "services",
      "blog_affiliation",
      "media",
      "local_business",
      "marketplace",
      "portfolio",
    ]),
  }),
});

// ─── Actions ──────────────────────────────────────────────────────────────────

async function requireWorkspace(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non autorisé" as const, ws: null };
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true, domainUrl: true, brandVoice: true },
  });
  if (!ws) return { error: "Workspace non trouvé" as const, ws: null };
  return { error: null, ws };
}

/** Charger l'état de configuration SEO du workspace */
export async function getSeoSetup(workspaceId: string): Promise<{
  success: boolean;
  data?: SeoSetupState;
  error?: string;
}> {
  const { error, ws } = await requireWorkspace(workspaceId);
  if (error) return { success: false, error };

  const brandVoice = (ws!.brandVoice as Record<string, unknown>) ?? {};
  const strategy =
    (brandVoice.seoPublicationStrategy as SeoPublicationStrategy) ?? null;

  return {
    success: true,
    data: {
      domainUrl: ws!.domainUrl ?? "",
      strategy,
      isComplete: !!(ws!.domainUrl?.trim() && strategy?.contentMode && strategy?.siteType),
    },
  };
}

/** Sauvegarder la configuration SEO (URL + stratégie de publication) */
export async function saveSeoSetup(
  workspaceId: string,
  input: z.infer<typeof seoSetupSchema>
): Promise<{ success: boolean; error?: string }> {
  const { error, ws } = await requireWorkspace(workspaceId);
  if (error) return { success: false, error };

  const parsed = seoSetupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const existingBrandVoice = (ws!.brandVoice as Record<string, unknown>) ?? {};
  const updatedBrandVoice = {
    ...existingBrandVoice,
    seoPublicationStrategy: parsed.data.strategy,
  };

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      domainUrl: parsed.data.domainUrl,
      brandVoice: JSON.parse(JSON.stringify(updatedBrandVoice)),
    },
  });

  return { success: true };
}
