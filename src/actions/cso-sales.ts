"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SalesCloserAgent, analyzeReplySentiment } from "@/lib/services/sales/closer";
import type { PrepareProspectOutreachResult, SentimentResult } from "@/lib/services/sales/closer";
import { generateClosingResponse } from "@/lib/services/sales/replier";
import type { ClosingResponseResult } from "@/lib/services/sales/replier";
import {
  createQuickPaymentLink as createQuickPaymentLinkService,
  getQuickPaymentLinkStatus,
} from "@/lib/services/sales/payments";
import {
  processAndSaveSignals,
  scanSignalsWithoutSaving,
  saveSignalToCrm,
  type AnalyzedSignal,
} from "@/lib/services/sales/intent-signals";
import {
  scanLocalBusinesses,
  bulkProcessLocalLeads,
  type LocalLeadEvaluated,
} from "@/lib/services/sales/local-scraper";
import { hasEnoughCredits, useCredits, CREDIT_COSTS, type OperationType } from "@/lib/credits";

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!ws) throw new Error("Workspace non trouvé");
  return ws;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 PREPARE PROSPECT OUTREACH (Elite Sales Closer)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une stratégie de contact CSO pour un prospect (hooks, follow-ups, objections)
 * et retourne le lien direct messagerie (Click-to-Send).
 * Coût : 10 crédits. Bloqué si quota quotidien atteint ou accès CSO désactivé.
 */
export async function prepareProspectOutreachAction(
  prospectId: string,
  options: {
    workspaceId: string;
    runEnrichment?: boolean;
    runAdIntelligence?: boolean;
    interactionContent?: string;
    platform?: "LINKEDIN" | "INSTAGRAM" | "FACEBOOK";
    profileUrl?: string;
    metaUserId?: string;
  }
): Promise<PrepareProspectOutreachResult> {
  try {
    const session = await requireAuth();
    await requireWorkspace(options.workspaceId, session.user!.id!);

    const result = await SalesCloserAgent.prepareProspectOutreach(prospectId, {
      userId: session.user!.id!,
      runEnrichment: options.runEnrichment ?? true,
      runAdIntelligence: options.runAdIntelligence ?? false,
      interactionContent: options.interactionContent,
      platform: options.platform ?? "LINKEDIN",
      profileUrl: options.profileUrl,
      metaUserId: options.metaUserId,
    });

    return result;
  } catch (error) {
    console.error("prepareProspectOutreachAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la préparation",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 SENTIMENT ANALYSIS (Le Radar)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse le sentiment d'une réponse prospect et suggère la prochaine action
 * (lien calendrier/paiement si positif, relance si neutre/négatif).
 */
export async function analyzeReplySentimentAction(replyText: string): Promise<SentimentResult> {
  await requireAuth();
  return analyzeReplySentiment(replyText);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CLOSING AGENT (Master Closer — Reply Assistant)
// ═══════════════════════════════════════════════════════════════════════════

const CLOSING_OP: OperationType = "cso_closing_response";

/**
 * Génère 2 options de réponse (A douce, B directe) + intention + note stratégique.
 * Coût : 5 crédits. Option customInstruction pour personnalisation ("Il a l'air pressé, raccourcis").
 */
export async function generateClosingResponseAction(
  prospectId: string,
  incomingMessage: string,
  options: {
    workspaceId: string;
    customInstruction?: string;
  }
): Promise<{ success: boolean; data?: ClosingResponseResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(options.workspaceId, session.user!.id!);

    const check = await hasEnoughCredits(session.user!.id!, CLOSING_OP);
    if (!check.hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${CREDIT_COSTS[CLOSING_OP]}, Disponibles : ${check.currentCredits}.`,
      };
    }

    const data = await generateClosingResponse(prospectId, incomingMessage, {
      workspaceId: options.workspaceId,
      customInstruction: options.customInstruction,
    });

    if (!data) {
      return { success: false, error: "Prospect introuvable ou erreur de génération." };
    }

    await useCredits(session.user!.id!, CLOSING_OP);
    await prisma.aPIUsage.create({
      data: {
        service: "cso",
        operation: CLOSING_OP,
        credits: CREDIT_COSTS[CLOSING_OP],
        workspaceId: options.workspaceId,
      },
    });

    return { success: true, data };
  } catch (error) {
    console.error("generateClosingResponseAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la génération",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💳 ONE-CLICK CHECKOUT (Stripe Payment Links)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère un lien de paiement Stripe (montant + description) pour le prospect.
 */
export async function createQuickPaymentLinkAction(
  workspaceId: string,
  prospectId: string,
  amountEuros: number,
  description: string
): Promise<{ success: boolean; id?: string; url?: string; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const result = await createQuickPaymentLinkService({
      amountEuros,
      description,
      prospectId,
      workspaceId,
    });
    return {
      success: result.success,
      id: result.id,
      url: result.url,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Récupère le statut d'un lien de paiement (CREATED | PAID) pour la puce verte.
 */
export async function getQuickPaymentLinkStatusAction(
  linkId: string,
  workspaceId: string
): Promise<"CREATED" | "PAID" | null> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    return getQuickPaymentLinkStatus(linkId, workspaceId);
  } catch {
    return null;
  }
}

/**
 * Sauvegarde une réponse gagnante dans l'Objection Bank (ML de vente).
 */
export async function saveToObjectionBankAction(
  workspaceId: string,
  data: {
    objectionType: string;
    objectionLabel: string;
    responseText: string;
    outcome?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    await prisma.objectionBank.create({
      data: {
        workspaceId,
        objectionType: data.objectionType,
        objectionLabel: data.objectionLabel,
        responseText: data.responseText,
        outcome: data.outcome ?? null,
      },
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 LEAD SCORING DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoredProspectForDashboard {
  id: string;
  name: string;
  company: string;
  jobTitle: string | null;
  linkedInUrl: string;
  platform: string | null;
  handle: string | null;
  score: number;
  sentiment: string;
  temperature: string;
  lastInteractionAt: Date | null;
  aiSummary: string | null;
  suggestedHook: string | null;
  notes: string | null;
  status: string;
}

/**
 * Récupère les prospects du workspace avec scoring pour le Lead Scoring Dashboard.
 * Tri par score décroissant. Filtres optionnels : highScoreOnly (≥40), platform.
 */
export async function getScoredProspectsForDashboard(
  workspaceId: string,
  filters?: { highScoreOnly?: boolean; platform?: string }
): Promise<{ success: boolean; data?: ScoredProspectForDashboard[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const where: { workspaceId: string; score?: { gte: number }; platform?: string } = {
      workspaceId,
    };
    if (filters?.highScoreOnly) where.score = { gte: 40 };
    if (filters?.platform) where.platform = filters.platform;

    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: [{ score: "desc" }, { lastInteractionAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        company: true,
        jobTitle: true,
        linkedInUrl: true,
        platform: true,
        handle: true,
        score: true,
        sentiment: true,
        temperature: true,
        lastInteractionAt: true,
        aiSummary: true,
        suggestedHook: true,
        notes: true,
        status: true,
      },
    });

    return {
      success: true,
      data: prospects as ScoredProspectForDashboard[],
    };
  } catch (error) {
    console.error("getScoredProspectsForDashboard:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors du chargement",
    };
  }
}

/**
 * Recalcule et met à jour le score d'un prospect (formule I×W_int + S×W_sent + A×W_auth).
 */
export async function recalculateProspectScoreAction(
  prospectId: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const { computeLeadScore, prospectToScoringInput, updateProspectScoring } = await import(
      "@/lib/services/sales/lead-scoring"
    );
    const prospect = await prisma.prospect.findFirst({
      where: { id: prospectId, workspaceId },
    });
    if (!prospect) return { success: false, error: "Prospect non trouvé" };
    const input = prospectToScoringInput(prospect);
    const result = computeLeadScore(input);
    await updateProspectScoring(prospectId, result);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

/**
 * Stats globales pour les cartes du dashboard (Hot count, taux conversion estimé).
 */
export async function getLeadScoringStats(workspaceId: string): Promise<{
  success: boolean;
  hotCount?: number;
  warmCount?: number;
  coldCount?: number;
  total?: number;
  estimatedConversionRate?: number;
  error?: string;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const [hot, warm, cold, total] = await Promise.all([
      prisma.prospect.count({ where: { workspaceId, temperature: "HOT" } }),
      prisma.prospect.count({ where: { workspaceId, temperature: "WARM" } }),
      prisma.prospect.count({ where: { workspaceId, temperature: "COLD" } }),
      prisma.prospect.count({ where: { workspaceId } }),
    ]);

    const weightedHot = hot * 0.5;
    const weightedWarm = warm * 0.2;
    const weightedCold = cold * 0.02;
    const estimatedConversionRate =
      total > 0
        ? Math.round(((weightedHot + weightedWarm + weightedCold) / total) * 100)
        : 0;

    return {
      success: true,
      hotCount: hot,
      warmCount: warm,
      coldCount: cold,
      total,
      estimatedConversionRate: Math.min(100, estimatedConversionRate),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 RADAR À SIGNAUX (Intent Signal Engine — Job Boards)
// ═══════════════════════════════════════════════════════════════════════════

const JOB_BOARD_OP: OperationType = "job_board_signals";
const LOCAL_MAPS_OP: OperationType = "local_maps_scan";

/**
 * Lance la recherche d'offres d'emploi (keyword + lieu), analyse IA, crée les leads en "Nouveau".
 * Coût : 15 crédits (10 offres max). Déduction avant exécution.
 */
export async function runIntentSignalsAction(
  workspaceId: string,
  keyword: string,
  location: string
): Promise<{
  success: boolean;
  created?: number;
  error?: string;
  creditsUsed?: number;
  currentCredits?: number;
  isMockData?: boolean;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const userId = session.user!.id!;
    const { hasCredits, currentCredits, cost } = await hasEnoughCredits(userId, JOB_BOARD_OP);
    if (!hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${cost}, disponibles : ${currentCredits}`,
        currentCredits,
      };
    }

    const result = await processAndSaveSignals(userId, workspaceId, keyword, location);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        creditsUsed: result.creditsUsed,
      };
    }

    return {
      success: true,
      created: result.created,
      creditsUsed: result.creditsUsed,
      isMockData: result.isMockData,
    };
  } catch (error) {
    console.error("runIntentSignalsAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors du Radar à Signaux",
    };
  }
}

/**
 * Scan le marché (fetch + analyse IA) sans sauvegarder. Retourne les signaux pour l'UI Radar.
 * Coût : 15 crédits. Les cartes peuvent ensuite être "Ajouter au CRM" une par une.
 */
export async function scanJobSignalsAction(
  workspaceId: string,
  keyword: string,
  location: string
): Promise<{
  success: boolean;
  signals?: AnalyzedSignal[];
  error?: string;
  creditsUsed?: number;
  currentCredits?: number;
  isMockData?: boolean;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const userId = session.user!.id!;

    const { hasCredits, currentCredits, cost } = await hasEnoughCredits(userId, JOB_BOARD_OP);
    if (!hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${cost}, disponibles : ${currentCredits}`,
        currentCredits,
      };
    }

    const result = await scanSignalsWithoutSaving(userId, keyword, location);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        creditsUsed: result.creditsUsed,
      };
    }
    return {
      success: true,
      signals: result.signals,
      creditsUsed: result.creditsUsed,
      isMockData: result.isMockData,
    };
  } catch (error) {
    console.error("scanJobSignalsAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors du scan",
    };
  }
}

/**
 * Ajoute un signal (carte du Radar) au CRM.
 */
export async function addSignalToCrmAction(
  workspaceId: string,
  signal: AnalyzedSignal
): Promise<{ success: boolean; prospectId?: string; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    return await saveSignalToCrm(workspaceId, signal);
  } catch (error) {
    console.error("addSignalToCrmAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'ajout au CRM",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🗺️ LOCAL RADAR (Maps Lead Gen — Chalutier)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan local : fetch + qualification IA (Filtre à Douleur). Retourne les leads sans les sauvegarder.
 */
export async function scanLocalRadarAction(
  workspaceId: string,
  query: string,
  limit: number
): Promise<{
  success: boolean;
  leads?: LocalLeadEvaluated[];
  error?: string;
  creditsUsed?: number;
  currentCredits?: number;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const userId = session.user!.id!;

    const { hasCredits, currentCredits, cost } = await hasEnoughCredits(userId, LOCAL_MAPS_OP);
    if (!hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${cost}, disponibles : ${currentCredits}`,
        currentCredits,
      };
    }

    const result = await scanLocalBusinesses(userId, query, limit);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        creditsUsed: result.creditsUsed,
      };
    }
    return {
      success: true,
      leads: result.leads,
      creditsUsed: result.creditsUsed,
    };
  } catch (error) {
    console.error("scanLocalRadarAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors du scan local",
    };
  }
}

/**
 * Import en masse des leads locaux sélectionnés dans le CRM.
 */
export async function bulkImportLocalLeadsAction(
  workspaceId: string,
  leads: LocalLeadEvaluated[]
): Promise<{ success: boolean; imported?: number; prospects?: { id: string; name: string; email: string | null; company: string; jobTitle: string | null }[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const result = await bulkProcessLocalLeads(workspaceId, leads);
    return { success: true, imported: result.imported, prospects: result.prospects };
  } catch (error) {
    console.error("bulkImportLocalLeadsAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'import",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 CALENDAR LINK — Lien de réservation injecté dans les séquences
// ═══════════════════════════════════════════════════════════════════════════

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  scanNewbornLeads,
  bulkSaveNewbornLeads,
  type NewbornSearchCriteria,
  type NewbornLeadEnriched,
} from "@/lib/services/sales/newborn-leads";

const calendarLinkSchema = z.object({
  calendarLink: z.string().url("L'URL doit être valide (ex: https://cal.com/votrenpm)").optional().or(z.literal("")),
});

/**
 * Met à jour le lien calendrier du workspace.
 * Ce lien est automatiquement injecté via {{calendar_link}} dans les séquences générées.
 */
export async function updateCalendarLinkAction(
  workspaceId: string,
  calendarLink: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const parsed = calendarLinkSchema.safeParse({ calendarLink });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "URL invalide" };
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { calendarLink: calendarLink || null },
    });

    revalidatePath(`/sales-os`);
    return { success: true };
  } catch (error) {
    console.error("updateCalendarLinkAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}

/**
 * Récupère le lien calendrier du workspace.
 */
export async function getCalendarLinkAction(
  workspaceId: string
): Promise<{ success: boolean; calendarLink?: string | null; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { calendarLink: true },
    });
    return { success: true, calendarLink: workspace?.calendarLink };
  } catch (error) {
    return { success: false, error: "Erreur lors de la récupération" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏢 NEWBORN RADAR (Registre des nouvelles entreprises)
// ═══════════════════════════════════════════════════════════════════════════

const NEWBORN_OP: OperationType = "newborn_radar_scan";

/**
 * Scan du registre INSEE : récupère les nouvelles entreprises, filtre les SCI,
 * génère les accroches IA. Retourne les leads sans les sauvegarder.
 * Coût : 5 crédits. L'enrichissement Dropcontact est optionnel (+2 crédits/lead).
 */
export async function scanNewbornRadarAction(
  workspaceId: string,
  criteria: NewbornSearchCriteria,
  enrich = false
): Promise<{
  success: boolean;
  leads?: NewbornLeadEnriched[];
  total?: number;
  error?: string;
  creditsUsed?: number;
  currentCredits?: number;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const userId = session.user!.id!;

    const { hasCredits, currentCredits, cost } = await hasEnoughCredits(userId, NEWBORN_OP);
    if (!hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${cost}, disponibles : ${currentCredits}`,
        currentCredits,
      };
    }

    const result = await scanNewbornLeads(userId, criteria, enrich);
    if (!result.success) {
      return { success: false, error: result.error, creditsUsed: result.creditsUsed };
    }

    return {
      success: true,
      leads: result.leads,
      total: result.total,
      creditsUsed: result.creditsUsed,
    };
  } catch (error) {
    console.error("scanNewbornRadarAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors du scan",
    };
  }
}

/**
 * Importe en masse les leads sélectionnés dans le CRM.
 * source = "NEW_COMPANY_REGISTRY", status = "NEW".
 */
export async function bulkImportNewbornLeadsAction(
  workspaceId: string,
  leads: NewbornLeadEnriched[]
): Promise<{ success: boolean; imported?: number; prospects?: { id: string; name: string; email: string | null; company: string; jobTitle: string | null }[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const result = await bulkSaveNewbornLeads(workspaceId, leads);
    return { success: true, imported: result.imported, prospects: result.prospects };
  } catch (error) {
    console.error("bulkImportNewbornLeadsAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'import",
    };
  }
}

/**
 * Importe plusieurs signaux en masse dans le CRM et retourne les prospects créés.
 * Utilisé par le Signals Radar pour lancer une campagne directement.
 */
export async function bulkAddSignalsToCrmAction(
  workspaceId: string,
  signals: AnalyzedSignal[]
): Promise<{ success: boolean; imported?: number; prospects?: { id: string; name: string; email: string | null; company: string; jobTitle: string | null }[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const prospects: { id: string; name: string; email: string | null; company: string; jobTitle: string | null }[] = [];
    let imported = 0;

    for (const signal of signals) {
      const res = await saveSignalToCrm(workspaceId, signal);
      if (res.success && res.prospectId) {
        prospects.push({
          id: res.prospectId,
          name: signal.companyName,
          email: null,
          company: signal.companyName,
          jobTitle: signal.jobTitle,
        });
        imported++;
      }
    }

    return { success: true, imported, prospects };
  } catch (error) {
    console.error("bulkAddSignalsToCrmAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'import",
    };
  }
}
