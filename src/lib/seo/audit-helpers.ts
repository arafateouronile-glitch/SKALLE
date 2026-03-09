/**
 * 🔧 SEO Audit Helpers
 * 
 * Fonctions utilitaires pour travailler avec le nouveau format optimisé
 * des audits SEO stockés dans Prisma
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES POUR LE NOUVEAU FORMAT
// ═══════════════════════════════════════════════════════════════════════════

export interface MetadataFormat {
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

export interface TargetKeywordFormat {
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

export interface CompetitorFormat {
  domain: string;
  strength: string[];
  weakness: string[];
  topPages: string[];
  authorityScore: number;
  contentLength: number | null;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
}

export interface ActionPlanFormat {
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 FONCTIONS DE RÉCUPÉRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère le dernier audit SEO pour un workspace
 */
export async function getLatestSEOAudit(workspaceId: string) {
  const audit = await prisma.sEOAudit.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  if (!audit) return null;

  // Les migrations ont été appliquées, utiliser directement les nouveaux champs
  // Fallback vers report pour les anciens audits qui n'ont pas encore les nouveaux champs
  const reportData = audit.report as any;
  const hasNewFields = audit.metadata !== null && audit.metadata !== undefined;

  return {
    id: audit.id,
    url: audit.url,
    // Utiliser globalScore si disponible, sinon fallback sur score ou report (pour anciens audits)
    globalScore: (audit as any).globalScore ?? audit.score ?? reportData?.globalScore ?? 0,
    // Extraire depuis les nouveaux champs (priorité) ou depuis report (fallback pour anciens audits)
    metadata: hasNewFields 
      ? (audit.metadata as MetadataFormat | null)
      : (reportData?.metadata as MetadataFormat | null),
    targetKeywords: hasNewFields 
      ? (audit.targetKeywords as TargetKeywordFormat[] | null)
      : (reportData?.targetKeywords as TargetKeywordFormat[] | null),
    competitors: hasNewFields
      ? (audit.competitors as CompetitorFormat[] | null)
      : (reportData?.competitors as CompetitorFormat[] | null),
    actionPlan: hasNewFields
      ? (audit.actionPlan as ActionPlanFormat | null)
      : (reportData?.actionPlan as ActionPlanFormat | null),
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  };
}

/**
 * Récupère les mots-clés prioritaires pour la génération d'articles
 * 
 * Cette fonction est utilisée par l'Auto-pilot pour choisir les sujets
 * avec la plus forte probabilité de dépasser les concurrents
 */
export async function getPriorityKeywords(workspaceId: string): Promise<TargetKeywordFormat[]> {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.targetKeywords) {
    return [];
  }

  // Filtrer les mots-clés prioritaires (priority: true)
  return audit.targetKeywords.filter((kw) => kw.priority);
}

/**
 * Récupère les Quick Wins pour affichage dans le dashboard
 */
export async function getQuickWins(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return [];
  }

  return audit.actionPlan.quickWins || [];
}

/**
 * Récupère les actions techniques prioritaires
 */
export async function getTechnicalActions(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return [];
  }

  return audit.actionPlan.technicalActions || [];
}

/**
 * Récupère les gaps sémantiques identifiés
 */
export async function getSemanticGaps(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return [];
  }

  return audit.actionPlan.semanticGap || [];
}

/**
 * Récupère l'analyse SWOT
 */
export async function getSWOTAnalysis(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return null;
  }

  return audit.actionPlan.swot || null;
}

/**
 * Récupère les pages prioritaires pour le maillage interne
 */
export async function getPriorityPages(workspaceId: string): Promise<string[]> {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return [];
  }

  return audit.actionPlan.internalLinkingStrategy?.priorityPages || [];
}

/**
 * Récupère les concurrents principaux avec leurs forces/faiblesses
 */
export async function getTopCompetitors(workspaceId: string, limit: number = 5) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.competitors) {
    return [];
  }

  // Trier par score d'autorité décroissant
  return audit.competitors
    .sort((a, b) => b.authorityScore - a.authorityScore)
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FONCTIONS POUR L'AUTO-PILOT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les mots-clés à utiliser pour la génération d'articles
 * 
 * Cette fonction combine :
 * - Les mots-clés prioritaires de l'audit
 * - Le brandVoice du workspace
 * 
 * Utilisée par l'Auto-pilot pour générer des articles pertinents
 */
export async function getKeywordsForArticleGeneration(workspaceId: string) {
  const priorityKeywords = await getPriorityKeywords(workspaceId);
  
  // Filtrer les mots-clés "easy" ou "medium" (Quick Wins)
  const quickWins = priorityKeywords.filter(
    (kw) => kw.difficulty === "easy" || kw.difficulty === "medium"
  );

  return {
    allPriority: priorityKeywords,
    quickWins,
    // Mots-clés triés par impact estimé (basé sur volume et difficulté)
    sortedByImpact: priorityKeywords.sort((a, b) => {
      const scoreA = getKeywordImpactScore(a);
      const scoreB = getKeywordImpactScore(b);
      return scoreB - scoreA;
    }),
  };
}

/**
 * Calcule un score d'impact pour un mot-clé
 * Utilisé pour prioriser les mots-clés dans la génération d'articles
 */
function getKeywordImpactScore(keyword: TargetKeywordFormat): number {
  let score = 0;

  // Volume élevé = +3, moyen = +2, faible = +1
  if (keyword.volumeEstimate === "high") score += 3;
  else if (keyword.volumeEstimate === "medium") score += 2;
  else score += 1;

  // Difficulté facile = +3, moyen = +2, difficile = +1
  if (keyword.difficulty === "easy") score += 3;
  else if (keyword.difficulty === "medium") score += 2;
  else score += 1;

  // Priorité = +2
  if (keyword.priority) score += 2;

  return score;
}

/**
 * Récupère les recommandations de maillage interne
 * 
 * Utilisée par l'Auto-pilot pour insérer automatiquement des backlinks
 * vers les pages prioritaires identifiées lors de l'audit
 */
export async function getInternalLinkingStrategy(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit || !audit.actionPlan) {
    return {
      priorityPages: [],
      suggestedStructure: "",
      hubPages: [],
    };
  }

  return audit.actionPlan.internalLinkingStrategy || {
    priorityPages: [],
    suggestedStructure: "",
    hubPages: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 STATISTIQUES & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les statistiques de l'audit SEO
 */
export async function getSEOAuditStats(workspaceId: string) {
  const audit = await getLatestSEOAudit(workspaceId);
  
  if (!audit) {
    return null;
  }

  const totalKeywords = audit.targetKeywords?.length || 0;
  const priorityKeywords = audit.targetKeywords?.filter((kw) => kw.priority).length || 0;
  const quickWinsCount = audit.actionPlan?.quickWins?.length || 0;
  const technicalActionsCount = audit.actionPlan?.technicalActions?.length || 0;
  const competitorsCount = audit.competitors?.length || 0;

  return {
    globalScore: audit.globalScore,
    totalKeywords,
    priorityKeywords,
    quickWinsCount,
    technicalActionsCount,
    competitorsCount,
    lastUpdated: audit.updatedAt,
  };
}
