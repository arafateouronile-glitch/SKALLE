"use server";

/**
 * 🎯 SEO Actions - Server Actions Typées
 * 
 * Pont sécurisé entre le frontend React et la base de données PostgreSQL
 * avec typage TypeScript complet pour les champs JSON
 */

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { runSEOIntelligence } from "@/lib/seo/discovery";
import { withCredits } from "@/lib/credits";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 INTERFACES TYPESCRIPT POUR LES CHAMPS JSON
// ═══════════════════════════════════════════════════════════════════════════

export interface SEOAuditMetadata {
  title: string | null;
  description: string | null;
  h1: string | null;
  h2s: string[];
  lang: string;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  theme: string;
}

export interface SEOAuditTargetKeyword {
  term: string;
  intent: "commercial" | "informationnel" | "navigationnel" | "transactionnel";
  difficulty: "easy" | "medium" | "hard";
  priority: boolean;
  volumeEstimate: "low" | "medium" | "high";
  competitors: Array<{
    domain: string;
    title: string;
    position: number;
  }>;
}

export interface SEOAuditCompetitor {
  domain: string;
  strength: string[];
  weakness: string[];
  topPages: string[];
  authorityScore: number;
  contentLength: number | null;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
}

export interface SEOAuditActionPlan {
  technicalActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    description: string;
    estimatedImpact: number;
  }>;
  semanticGap: Array<{
    topic: string;
    competitors: string[];
    recommendation: string;
  }>;
  quickWins: Array<{
    keyword: string;
    difficulty: "easy" | "medium" | "hard";
    opportunity: string;
    estimatedImpact: number;
  }>;
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  internalLinkingStrategy: {
    priorityPages: string[];
    suggestedStructure: string;
    hubPages: string[];
  };
}

export interface SEOAuditData {
  id: string;
  url: string;
  globalScore: number;
  metadata: SEOAuditMetadata | null;
  targetKeywords: SEOAuditTargetKeyword[] | null;
  competitors: SEOAuditCompetitor[] | null;
  actionPlan: SEOAuditActionPlan | null;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 FONCTIONS SERVER ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère le dernier audit SEO en date pour un Workspace donné
 * 
 * @param workspaceId - ID du workspace
 * @returns Audit SEO typé ou null si aucun audit trouvé
 */
export async function getLatestAudit(workspaceId: string): Promise<SEOAuditData | null> {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Non autorisé");
    }

    // Vérifier que le workspace appartient à l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspace) {
      throw new Error("Workspace non trouvé ou accès refusé");
    }

    // Récupérer le dernier audit
    const audit = await prisma.sEOAudit.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (!audit) {
      return null;
    }

    // Caster les données JSON pour le typage TypeScript
    return {
      id: audit.id,
      url: audit.url,
      // Utiliser globalScore si disponible, sinon fallback sur score ou report
      globalScore: (audit as any).globalScore ?? audit.score ?? (audit.report as any)?.globalScore ?? 0,
      // Extraire depuis les nouveaux champs ou depuis report
      metadata: ((audit.metadata !== null && audit.metadata !== undefined) 
        ? (audit.metadata as unknown as SEOAuditMetadata | null)
        : ((audit.report as any)?.metadata as unknown as SEOAuditMetadata | null)),
      targetKeywords: ((audit.targetKeywords !== null && audit.targetKeywords !== undefined)
        ? (audit.targetKeywords as unknown as SEOAuditTargetKeyword[] | null)
        : ((audit.report as any)?.targetKeywords as unknown as SEOAuditTargetKeyword[] | null)),
      competitors: ((audit.competitors !== null && audit.competitors !== undefined)
        ? (audit.competitors as unknown as SEOAuditCompetitor[] | null)
        : ((audit.report as any)?.competitors as unknown as SEOAuditCompetitor[] | null)),
      actionPlan: ((audit.actionPlan !== null && audit.actionPlan !== undefined)
        ? (audit.actionPlan as unknown as SEOAuditActionPlan | null)
        : ((audit.report as any)?.actionPlan as unknown as SEOAuditActionPlan | null)),
      createdAt: audit.createdAt,
      updatedAt: audit.updatedAt,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération de l'audit SEO:", error);
    throw new Error(
      error instanceof Error ? error.message : "Impossible de récupérer l'audit."
    );
  }
}

/**
 * Lance une nouvelle analyse SEO Intelligence (Discovery)
 * 
 * @param workspaceId - ID du workspace
 * @param url - URL du site à analyser
 * @returns Succès ou erreur
 */
export async function triggerSeoAnalysis(
  workspaceId: string,
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Vérifier que le workspace appartient à l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé ou accès refusé" };
    }

    // Valider l'URL
    try {
      new URL(url);
    } catch {
      return { success: false, error: "URL invalide" };
    }

    // Lancer l'analyse avec gestion des crédits
    const result = await withCredits("seo_intelligence", workspaceId, async () => {
      await runSEOIntelligence(url, workspaceId);
      return { success: true };
    });

    if (result.success) {
      // Force la mise à jour des données sur la page Strategy Center
      revalidatePath("/dashboard/seo/strategy");
      revalidatePath("/dashboard/seo-factory");
      
      return { success: true };
    } else {
      return { success: false, error: result.error || "L'analyse a échoué" };
    }
  } catch (error) {
    console.error("Erreur lors du lancement de l'analyse SEO:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "L'analyse a échoué.",
    };
  }
}

/**
 * Récupère tous les audits SEO pour un workspace (avec pagination)
 * 
 * @param workspaceId - ID du workspace
 * @param limit - Nombre d'audits à récupérer (défaut: 10)
 * @returns Liste des audits typés
 */
export async function getAllAudits(
  workspaceId: string,
  limit: number = 10
): Promise<SEOAuditData[]> {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Non autorisé");
    }

    // Vérifier que le workspace appartient à l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspace) {
      throw new Error("Workspace non trouvé ou accès refusé");
    }

    // Récupérer les audits
    const audits = await prisma.sEOAudit.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Caster les données JSON pour le typage TypeScript
    return audits.map((audit) => {
      const reportData = audit.report as any;
      const hasNewFields = audit.metadata !== null && audit.metadata !== undefined;
      
      return {
        id: audit.id,
        url: audit.url,
        // Utiliser globalScore si disponible, sinon fallback sur score ou report
        globalScore: (audit as any).globalScore ?? audit.score ?? reportData?.globalScore ?? 0,
        // Extraire depuis les nouveaux champs ou depuis report
        metadata: hasNewFields
          ? (audit.metadata as unknown as SEOAuditMetadata | null)
          : (reportData?.metadata as unknown as SEOAuditMetadata | null),
        targetKeywords: hasNewFields
          ? (audit.targetKeywords as unknown as SEOAuditTargetKeyword[] | null)
          : (reportData?.targetKeywords as unknown as SEOAuditTargetKeyword[] | null),
        competitors: hasNewFields
          ? (audit.competitors as unknown as SEOAuditCompetitor[] | null)
          : (reportData?.competitors as unknown as SEOAuditCompetitor[] | null),
        actionPlan: hasNewFields
          ? (audit.actionPlan as unknown as SEOAuditActionPlan | null)
          : (reportData?.actionPlan as unknown as SEOAuditActionPlan | null),
        createdAt: audit.createdAt,
        updatedAt: audit.updatedAt,
      };
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des audits SEO:", error);
    throw new Error(
      error instanceof Error ? error.message : "Impossible de récupérer les audits."
    );
  }
}

/**
 * Récupère un audit SEO spécifique par son ID
 * 
 * @param workspaceId - ID du workspace
 * @param auditId - ID de l'audit
 * @returns Audit SEO typé ou null si non trouvé
 */
export async function getAuditById(
  workspaceId: string,
  auditId: string
): Promise<SEOAuditData | null> {
  try {
    // Vérifier l'authentification
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Non autorisé");
    }

    // Vérifier que le workspace appartient à l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userId: session.user.id,
      },
    });

    if (!workspace) {
      throw new Error("Workspace non trouvé ou accès refusé");
    }

    // Récupérer l'audit
    const audit = await prisma.sEOAudit.findFirst({
      where: {
        id: auditId,
        workspaceId,
      },
    });

    if (!audit) {
      return null;
    }

    // Caster les données JSON pour le typage TypeScript
    return {
      id: audit.id,
      url: audit.url,
      // Utiliser globalScore si disponible, sinon fallback sur score ou report
      globalScore: (audit as any).globalScore ?? audit.score ?? (audit.report as any)?.globalScore ?? 0,
      // Extraire depuis les nouveaux champs ou depuis report
      metadata: ((audit.metadata !== null && audit.metadata !== undefined) 
        ? (audit.metadata as unknown as SEOAuditMetadata | null)
        : ((audit.report as any)?.metadata as unknown as SEOAuditMetadata | null)),
      targetKeywords: ((audit.targetKeywords !== null && audit.targetKeywords !== undefined)
        ? (audit.targetKeywords as unknown as SEOAuditTargetKeyword[] | null)
        : ((audit.report as any)?.targetKeywords as unknown as SEOAuditTargetKeyword[] | null)),
      competitors: ((audit.competitors !== null && audit.competitors !== undefined)
        ? (audit.competitors as unknown as SEOAuditCompetitor[] | null)
        : ((audit.report as any)?.competitors as unknown as SEOAuditCompetitor[] | null)),
      actionPlan: ((audit.actionPlan !== null && audit.actionPlan !== undefined)
        ? (audit.actionPlan as unknown as SEOAuditActionPlan | null)
        : ((audit.report as any)?.actionPlan as unknown as SEOAuditActionPlan | null)),
      createdAt: audit.createdAt,
      updatedAt: audit.updatedAt,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération de l'audit SEO:", error);
    throw new Error(
      error instanceof Error ? error.message : "Impossible de récupérer l'audit."
    );
  }
}
