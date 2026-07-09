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
import { findQualifiedLeads } from "@/lib/prospection/enrichment";
import { inngest } from "@/inngest/client";

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
    const result = await bulkProcessLocalLeads(workspaceId, leads, session.user!.id!);
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
    const result = await bulkSaveNewbornLeads(workspaceId, leads, session.user!.id!);
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
 * Sauvegarde le hook et les messages générés par le Reply Assistant.
 * Appelé en arrière-plan après chaque génération — non bloquant.
 */
export async function saveProspectGeneratedMessagesAction(
  prospectId: string,
  workspaceId: string,
  payload: {
    incomingMessage: string;
    optionA: string;
    optionB: string;
    strategicNote: string;
    intention: string;
  }
): Promise<{ success: boolean }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    await prisma.prospect.update({
      where: { id: prospectId, workspaceId },
      data: {
        suggestedHook: payload.optionA,
        messages: {
          incomingMessage: payload.incomingMessage,
          optionA: payload.optionA,
          optionB: payload.optionB,
          strategicNote: payload.strategicNote,
          intention: payload.intention,
          generatedAt: new Date().toISOString(),
        },
      },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Met à jour le statut d'un prospect (avancement dans le pipeline).
 */
export async function updateProspectStatusAction(
  prospectId: string,
  workspaceId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    await prisma.$executeRaw`UPDATE "Prospect" SET status = ${status}::"ProspectStatus" WHERE id = ${prospectId} AND "workspaceId" = ${workspaceId}`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 APOLLO PEOPLE SEARCH — Recherche de contacts qualifiés (275M LinkedIn)
// ═══════════════════════════════════════════════════════════════════════════

export interface ApolloProspectLead {
  name: string;
  email?: string;
  company: string;
  jobTitle?: string;
  linkedInUrl?: string;
  emailVerified?: boolean;
  emailScore?: number;
  industry?: string;
  location?: string;
  companySize?: string;
}

/**
 * Recherche des contacts LinkedIn via Apollo.io par poste(s) + localisation.
 * Retourne jusqu'à 25 leads enrichis (email inclus si disponible).
 */
export async function apolloProspectSearchAction(
  workspaceId: string,
  params: { jobTitles: string[]; locations: string[]; perPage?: number }
): Promise<{ success: boolean; leads?: ApolloProspectLead[]; error?: string }> {
  try {
    if (!process.env.APOLLO_API_KEY) {
      return { success: false, error: "APOLLO_API_KEY non configurée — ajoutez-la dans .env.local" };
    }

    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const result = await findQualifiedLeads({
      jobTitles: params.jobTitles,
      locations: params.locations,
      provider: "apollo",
      limit: params.perPage ?? 25,
    });

    if (!result.success || !result.leads) {
      return { success: false, error: result.error ?? "Aucun résultat Apollo" };
    }

    return {
      success: true,
      leads: result.leads.map((l) => ({
        name: l.name,
        email: l.email,
        company: l.company,
        jobTitle: l.jobTitle,
        linkedInUrl: l.linkedInUrl,
        emailVerified: l.emailVerified,
        emailScore: l.emailScore,
        industry: l.industry,
        location: l.location,
        companySize: l.companySize,
      })),
    };
  } catch (error) {
    console.error("apolloProspectSearchAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erreur Apollo" };
  }
}

/**
 * Sauvegarde des leads Apollo dans le CRM (upsert sur email+workspace).
 * Les leads sans email déclenchent un enrichissement Inngest automatique.
 */
export async function bulkSaveApolloLeadsAction(
  workspaceId: string,
  leads: ApolloProspectLead[]
): Promise<{
  success: boolean;
  imported?: number;
  prospects?: { id: string; name: string }[];
  error?: string;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const saved: { id: string; name: string }[] = [];

    for (const lead of leads) {
      try {
        // Never store LinkedIn search result URLs — they are not real profile URLs
        // and cause the wrong profile to be scraped when researching the prospect.
        const linkedInUrl = lead.linkedInUrl ?? "";

        const baseData = {
          name: lead.name,
          company: lead.company,
          jobTitle: lead.jobTitle ?? null,
          email: lead.email ?? null,
          emailVerified: lead.emailVerified ?? false,
          linkedInUrl,
          industry: lead.industry ?? null,
          location: lead.location ?? null,
          companySize: lead.companySize ?? null,
          source: "LINKEDIN" as const,
          temperature: lead.emailVerified ? "WARM" : "COLD",
          score: lead.emailVerified ? 75 : lead.email ? 65 : 55,
          workspaceId,
          enrichmentData: {
            provider: "apollo",
            emailScore: lead.emailScore ?? null,
            enrichedAt: new Date().toISOString(),
          },
        };

        let prospect;
        if (lead.email) {
          prospect = await prisma.prospect.upsert({
            where: { email_workspaceId: { email: lead.email, workspaceId } },
            update: {
              jobTitle: baseData.jobTitle,
              industry: baseData.industry,
              location: baseData.location,
              emailVerified: baseData.emailVerified,
              score: baseData.score,
              temperature: baseData.temperature,
              enrichmentData: baseData.enrichmentData,
            },
            create: { ...baseData, status: "NEW" },
            select: { id: true, name: true },
          });
        } else {
          // Dedup by name+company when no email is available
          const existing = await prisma.prospect.findFirst({
            where: {
              workspaceId,
              name: { equals: lead.name, mode: "insensitive" },
              company: { equals: lead.company, mode: "insensitive" },
            },
            select: { id: true, name: true },
          });

          if (existing) {
            prospect = existing;
          } else {
            prospect = await prisma.prospect.create({
              data: { ...baseData, status: "NEW" },
              select: { id: true, name: true },
            });
            await inngest.send({
              name: "prospect/created",
              data: { prospectId: prospect.id, workspaceId, userId: session.user!.id! },
            });
          }
        }

        saved.push({ id: prospect.id, name: prospect.name });
      } catch {
        // Skip duplicates / DB constraint violations
      }
    }

    return { success: true, imported: saved.length, prospects: saved };
  } catch (error) {
    console.error("bulkSaveApolloLeadsAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erreur lors de l'import" };
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

// ═══════════════════════════════════════════════════════════════════════════
// 📬 QUEUE LINKEDIN WORKFLOW — Connexion J0 → DM J+1 à 10h
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retourne le prochain jour ouvré à 10h UTC, en s'assurant d'avoir au moins
 * `minDaysAhead` jours d'avance par rapport à `from`.
 */
function nextWeekday10amUtc(from: Date, minDaysAhead: number): Date {
  const d = new Date(from.getTime() + minDaysAhead * 24 * 60 * 60 * 1_000);
  d.setUTCHours(10, 0, 0, 0);
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2); // Samedi → Lundi
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1); // Dimanche → Lundi
  return d;
}

/**
 * Met en file un workflow LinkedIn en 2 étapes :
 *   1. Demande de connexion (scheduledAt: null → prochain cron 10h)
 *   2. DM (scheduledAt: lendemain ouvré 10h UTC)
 *
 * Les deux steps sont indépendants — si la connexion est déjà acceptée,
 * le DM partira quand même à J+1.
 */
export async function queueLinkedInMessageAction(
  prospectId: string,
  workspaceId: string,
  message: string
): Promise<{ success: boolean; stepIds?: { connect: string; message: string }; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    // Guard: prevent duplicate queue (prospect already has PENDING LinkedIn steps)
    const existingPending = await prisma.sequenceStep.findFirst({
      where: {
        status: "PENDING",
        channel: "LINKEDIN",
        sequence: { prospectId, workspaceId },
      },
      select: { id: true },
    });
    if (existingPending) {
      return { success: false, error: "Ce prospect a déjà des étapes LinkedIn en attente" };
    }

    // Find or create the sequence for this prospect
    let sequence = await prisma.outreachSequence.findFirst({
      where: { prospectId, workspaceId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (!sequence) {
      const prospect = await prisma.prospect.findUnique({
        where: { id: prospectId, workspaceId },
        select: { name: true },
      });
      sequence = await prisma.outreachSequence.create({
        data: {
          prospectId,
          workspaceId,
          name: `LinkedIn — ${prospect?.name ?? "Prospect"}`,
          isActive: true,
        },
        select: { id: true },
      });
    }

    // Next step number
    const lastStep = await prisma.sequenceStep.findFirst({
      where: { sequenceId: sequence.id },
      orderBy: { stepNumber: "desc" },
      select: { stepNumber: true },
    });
    const baseStep = (lastStep?.stepNumber ?? 0) + 1;

    // J0 : demande de connexion (note vide — meilleur taux d'acceptation)
    const connectStep = await prisma.sequenceStep.create({
      data: {
        sequenceId: sequence.id,
        stepNumber: baseStep,
        channel: "LINKEDIN",
        content: "",
        status: "PENDING",
        linkedInAction: "connect",
        scheduledAt: null, // prochain cron 10h
      },
      select: { id: true },
    });

    // J+1 : DM, prochain jour ouvré à 10h UTC
    const messageScheduledAt = nextWeekday10amUtc(new Date(), 1);
    const messageStep = await prisma.sequenceStep.create({
      data: {
        sequenceId: sequence.id,
        stepNumber: baseStep + 1,
        channel: "LINKEDIN",
        content: message,
        status: "PENDING",
        linkedInAction: "message",
        scheduledAt: messageScheduledAt,
      },
      select: { id: true },
    });

    return { success: true, stepIds: { connect: connectStep.id, message: messageStep.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}
