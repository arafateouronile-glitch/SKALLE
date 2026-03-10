/**
 * 🧠 Agent Brain - Cerveau Central Autonome
 *
 * Moteur décisionnel qui analyse les données quotidiennement
 * et prend des décisions marketing stratégiques.
 *
 * Boucle ReAct : Observation → Analyse → Planification → Stockage
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClaude, getOpenAI, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchGoogle } from "@/lib/ai/serper";
import { PLAN_LIMITS } from "@/lib/credits";
import { getTopPages, getDecliningPages } from "@/lib/services/integrations/google-search-console";

// ═══════════════════════════════════════════════════════════════════════════
// ZOD SCHEMA — Source of truth pour les décisions de l'agent
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_TYPES = [
  "SEO_ARTICLE",
  "SOCIAL_POST",
  "AD_REMIX",
  "PROSPECT_DM",
  "DISCOVERY_SCAN",
  "SEO_REGENERATE",    // Régénérer un article existant dont la position Google chute
  "COMPETITOR_REACT",  // Créer du contenu en réaction à un nouveau contenu concurrent
] as const;

export const AgentDecisionSchema = z.object({
  reasoning: z.string().min(10, "reasoning trop court"),
  actionType: z.enum(ACTION_TYPES),
  actionData: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().min(1).max(5),
  impact: z.string().default("Impact non estimé"),
});

const AgentDecisionArraySchema = z
  .array(AgentDecisionSchema)
  .min(1, "L'agent doit proposer au moins 1 décision")
  .max(5);

// Les types sont déduits du schéma Zod — une seule source de vérité
export type ActionType = (typeof ACTION_TYPES)[number];
export type AgentDecisionInput = z.infer<typeof AgentDecisionSchema>;

// Décision de fallback retournée lorsque tous les essais de parsing échouent
const FALLBACK_DECISION: AgentDecisionInput = {
  reasoning:
    "Parsing échoué après self-correction — décision de sécurité. L'agent reprendra normalement au prochain cycle.",
  actionType: "DISCOVERY_SCAN",
  actionData: { note: "fallback_after_parse_failure" },
  priority: 5,
  impact: "Nul (décision de sécurité)",
};

// ═══════════════════════════════════════════════════════════════════════════
// SAFE PARSING AVEC SELF-CORRECTION LOOP
// ═══════════════════════════════════════════════════════════════════════════

/** Supprime les éventuels blocs ```json … ``` ajoutés par le LLM */
function stripMarkdownJson(raw: string): string {
  return raw.replace(/^```json?\s*/m, "").replace(/```\s*$/m, "").trim();
}

const MAX_SELF_CORRECTION_RETRIES = 2; // 3 tentatives au total

/**
 * Parse et valide la réponse brute du LLM via Zod.
 *
 * Si la validation échoue, les erreurs Zod sont renvoyées au LLM
 * via `onRetry` pour une auto-correction (Self-Correction Loop).
 * Après MAX_SELF_CORRECTION_RETRIES, retourne FALLBACK_DECISION.
 *
 * @param rawResponse  Réponse brute du LLM
 * @param onRetry      Callback qui renvoie la correction du LLM étant donné
 *                     la description des erreurs Zod
 */
async function safeParseAgentResponse(
  rawResponse: string,
  onRetry: (zodErrorDescription: string) => Promise<string>
): Promise<AgentDecisionInput[]> {
  let current = rawResponse;

  for (let attempt = 0; attempt <= MAX_SELF_CORRECTION_RETRIES; attempt++) {
    const cleaned = stripMarkdownJson(current);
    const isLastAttempt = attempt === MAX_SELF_CORRECTION_RETRIES;

    // 1. JSON syntaxique
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const msg = `JSON syntaxiquement invalide: ${e instanceof Error ? e.message : e}`;
      console.warn(`[Brain] ${msg} (tentative ${attempt + 1})`);
      if (isLastAttempt) {
        console.error("[Brain] Self-correction épuisée → fallback");
        return [FALLBACK_DECISION];
      }
      current = await onRetry(msg);
      continue;
    }

    // 2. Validation Zod
    const result = AgentDecisionArraySchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }

    const zodErrors = result.error.issues
      .map((e) => `  • ${e.path.join(".") || "racine"}: ${e.message}`)
      .join("\n");
    console.warn(
      `[Brain] Validation Zod échouée (tentative ${attempt + 1}):\n${zodErrors}`
    );

    if (isLastAttempt) {
      console.error("[Brain] Self-correction épuisée → fallback");
      return [FALLBACK_DECISION];
    }

    current = await onRetry(zodErrors);
  }

  return [FALLBACK_DECISION]; // unreachable, satisfait TypeScript
}

interface ObservationData {
  recentPosts: Array<{
    type: string;
    title: string | null;
    status: string;
    keywords: string[];
    createdAt: Date;
  }>;
  postStats: { total: number; published: number; draft: number; scheduled: number };
  topKeywords: Array<{ keyword: string; volume: number | null; difficulty: string }>;
  recentAds: Array<{
    id: string;
    advertiserName: string;
    hook: string | null;
    framework: string | null;
    efficiencyScore: number | null;
  }>;
  prospectStats: { total: number; new: number; contacted: number; replied: number };
  trendingTopics: Array<{ title: string; snippet: string }>;
  workspaceObjectives: string[];
  brandVoice: Record<string, unknown>;
  // Nouvelles sources d'intelligence
  gscTopPages: Array<{ page: string; clicks: number; avgPosition: number }>;
  gscDecliningPages: Array<{ page: string; currentAvgPosition: number; keyword: string }>;
  recentConversions: { count: number; totalValue: number; avgDealValue: number };
  sectorNews: Array<{ title: string; snippet: string }>;
  competitorAlerts: Array<{ competitorDomain: string; contentTitle: string | null; matchedKeyword: string | null }>;
  performanceInsights: Record<string, unknown>; // Insights du weekly learning précédent
  // Décisions récentes approuvées/rejetées par l'utilisateur (feedback immédiat)
  recentDecisionFeedback: Array<{
    actionType: string;
    status: "APPROVED" | "REJECTED" | "EXECUTED";
    performanceScore: number | null;
  }>;
}

interface GuardrailCheck {
  safe: boolean;
  alerts: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. OBSERVATION - Collecte des données
// ═══════════════════════════════════════════════════════════════════════════

async function observe(workspaceId: string): Promise<ObservationData> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Récupérer le workspace et ses objectifs
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      brandVoice: true,
      domainUrl: true,
      autopilotConfig: {
        select: { seoKeywords: true, competitorUrls: true },
      },
    },
  });

  const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};
  const persona = brandVoice.marketingPersona as Record<string, unknown> | undefined;

  // Posts des 7 derniers jours
  const recentPosts = await prisma.post.findMany({
    where: { workspaceId, createdAt: { gte: sevenDaysAgo }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { type: true, title: true, status: true, keywords: true, createdAt: true },
  });

  // Stats des posts
  const postCounts = await prisma.post.groupBy({
    by: ["status"],
    where: { workspaceId, deletedAt: null },
    _count: true,
  });
  const postStats = {
    total: postCounts.reduce((s, c) => s + c._count, 0),
    published: postCounts.find((c) => c.status === "PUBLISHED")?._count ?? 0,
    draft: postCounts.find((c) => c.status === "DRAFT")?._count ?? 0,
    scheduled: postCounts.find((c) => c.status === "SCHEDULED")?._count ?? 0,
  };

  // Top keywords
  const topKeywords = await prisma.keywordResearch.findMany({
    where: { workspaceId },
    orderBy: [{ volume: "desc" }, { createdAt: "desc" }],
    take: 10,
    select: { keyword: true, volume: true, difficulty: true },
  });

  // Ads concurrents récents
  const recentAds = await prisma.scrapedAd.findMany({
    where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
    orderBy: { efficiencyScore: "desc" },
    take: 5,
    select: {
      id: true,
      advertiserName: true,
      hook: true,
      framework: true,
      efficiencyScore: true,
    },
  });

  // Stats des prospects
  const prospectCounts = await prisma.prospect.groupBy({
    by: ["status"],
    where: { workspaceId },
    _count: true,
  });
  const prospectStats = {
    total: prospectCounts.reduce((s, c) => s + c._count, 0),
    new: prospectCounts.find((c) => c.status === "NEW")?._count ?? 0,
    contacted: prospectCounts.find((c) => c.status === "CONTACTED")?._count ?? 0,
    replied: prospectCounts.find((c) => c.status === "REPLIED")?._count ?? 0,
  };

  // Tendances du jour (via Serper)
  let trendingTopics: Array<{ title: string; snippet: string }> = [];
  let sectorNews: Array<{ title: string; snippet: string }> = [];
  const niche = persona?.contentPillars
    ? (persona.contentPillars as string[])[0]
    : workspace?.domainUrl;

  if (niche) {
    try {
      const [trendsResults, newsResults] = await Promise.allSettled([
        searchGoogle(`${niche} tendances actualités ${new Date().getFullYear()}`, 5),
        searchGoogle(`${niche} news concurrence marché ${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`, 5),
      ]);
      if (trendsResults.status === "fulfilled") {
        trendingTopics = trendsResults.value.map((r) => ({ title: r.title, snippet: r.snippet }));
      }
      if (newsResults.status === "fulfilled") {
        sectorNews = newsResults.value.map((r) => ({ title: r.title, snippet: r.snippet }));
      }
    } catch (e) {
      console.warn("[Brain] Échec recherche tendances/news:", e);
    }
  }

  // ──── NOUVELLES SOURCES D'INTELLIGENCE ────

  // Données Google Search Console (depuis cache synchro à 6h)
  let gscTopPages: Array<{ page: string; clicks: number; avgPosition: number }> = [];
  let gscDecliningPages: Array<{ page: string; currentAvgPosition: number; keyword: string }> = [];
  try {
    const [topPages, decliningPages] = await Promise.all([
      getTopPages(workspaceId),
      getDecliningPages(workspaceId),
    ]);
    gscTopPages = topPages.slice(0, 5).map((p) => ({ page: p.page, clicks: p.clicks, avgPosition: p.avgPosition }));
    gscDecliningPages = decliningPages.slice(0, 5);
  } catch {
    // GSC non connecté — pas critique
  }

  // Conversions récentes (7j) pour calculer le ROI des actions passées
  const convertedProspects = await prisma.prospect.findMany({
    where: { workspaceId, status: "CONVERTED", updatedAt: { gte: sevenDaysAgo } },
    select: { value: true },
  });
  const totalConversionValue = convertedProspects.reduce((s, p) => s + (p.value ?? 0), 0);
  const recentConversions = {
    count: convertedProspects.length,
    totalValue: totalConversionValue,
    avgDealValue: convertedProspects.length > 0 ? Math.round(totalConversionValue / convertedProspects.length) : 0,
  };

  // Alertes concurrents non lues (48h)
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const unreadAlerts = await prisma.competitorAlert.findMany({
    where: { workspaceId, isRead: false, createdAt: { gte: twoDaysAgo } },
    take: 5,
    select: { competitorDomain: true, contentTitle: true, matchedKeyword: true, id: true },
  });
  // Marquer comme lus après injection dans l'observation
  if (unreadAlerts.length > 0) {
    await prisma.competitorAlert.updateMany({
      where: { id: { in: unreadAlerts.map((a) => a.id) } },
      data: { isRead: true },
    });
  }

  // ──── FIN NOUVELLES SOURCES ────

  // Extraire les objectifs
  const latestPlan = await prisma.contentPlan.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { objectives: true },
  });

  // Insights du weekly learning précédent (pour que l'agent apprenne)
  const performanceInsights = (brandVoice.performanceInsights as Record<string, unknown>) ?? {};

  // Décisions des 14 derniers jours avec le feedback utilisateur (approuvé/rejeté)
  // Permet au brain d'apprendre en temps réel sans attendre le cycle weekly
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentDecisionFeedback = await prisma.agentDecision.findMany({
    where: {
      workspaceId,
      status: { in: ["APPROVED", "REJECTED", "EXECUTED"] },
      createdAt: { gte: fourteenDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { actionType: true, status: true, performanceScore: true },
  });

  return {
    recentPosts,
    postStats,
    topKeywords,
    recentAds,
    prospectStats,
    trendingTopics,
    workspaceObjectives: latestPlan?.objectives ?? [],
    brandVoice,
    // Nouvelles sources
    gscTopPages,
    gscDecliningPages,
    recentConversions,
    sectorNews,
    competitorAlerts: unreadAlerts,
    performanceInsights,
    recentDecisionFeedback: recentDecisionFeedback as Array<{
      actionType: string;
      status: "APPROVED" | "REJECTED" | "EXECUTED";
      performanceScore: number | null;
    }>,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ANALYSE - Claude Chain of Thought
// ═══════════════════════════════════════════════════════════════════════════

// Description du schéma injectée dans le prompt de self-correction
const SCHEMA_DESCRIPTION = `Array JSON (1 à 5 objets), chaque objet doit avoir EXACTEMENT :
{
  "reasoning": string (min 10 caractères),
  "actionType": "SEO_ARTICLE" | "SOCIAL_POST" | "AD_REMIX" | "PROSPECT_DM" | "DISCOVERY_SCAN",
  "actionData": object (clés string, valeurs quelconques),
  "priority": integer entre 1 et 5 inclus,
  "impact": string (facultatif)
}`;

async function analyze(data: ObservationData): Promise<AgentDecisionInput[]> {
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `Tu es un CMO (Chief Marketing Officer) expert avec 20 ans d'expérience en growth marketing, SEO, et sales. Tu analyses les données marketing d'une entreprise et proposes des actions concrètes qui maximisent le ROI.

RÈGLES STRICTES :
- Propose exactement 3 à 5 actions prioritaires
- Chaque action doit avoir un "reasoning" détaillé (Chain of Thought) qui explique POURQUOI tu recommandes cette action en te basant sur les données fournies
- Priorise les actions selon l'urgence (1=urgent, 5=optionnel)
- Estime l'impact de chaque action en termes concrets (ex: "+15% clics GSC", "3 leads potentiels")
- Si des pages GSC sont en déclin (position > 15), priorise SEO_REGENERATE en priority 1-2
- Si des alertes concurrents existent, propose COMPETITOR_REACT en priority 1-2
- Si les conversions récentes sont élevées, renforce PROSPECT_DM pour capitaliser sur la dynamique
- Tiens compte des insights de performance passés pour éviter de répéter les actions peu efficaces
- Si un type d'action a un taux d'approbation < 50% dans le feedback récent, évite de le proposer sauf si les données le justifient clairement
- Si un type d'action a un score moyen < 40/100, déprioritise-le (priority 4-5 maximum)

Types d'actions disponibles (SEULS ces 7 sont acceptés) :
- SEO_ARTICLE : Rédiger un nouvel article SEO sur un sujet à fort potentiel
- SEO_REGENERATE : Régénérer/optimiser un article existant dont la position Google chute (utilise actionData.existingUrl)
- SOCIAL_POST : Créer un post social (LinkedIn, X, Instagram, TikTok)
- AD_REMIX : Remixer une publicité concurrente performante
- PROSPECT_DM : Relancer des prospects dormants pour générer des conversions
- DISCOVERY_SCAN : Scanner un concurrent pour trouver des opportunités de contenu
- COMPETITOR_REACT : Créer du contenu en réaction directe à un nouveau contenu concurrent (utilise actionData.competitorUrl)

⚠️ FORMAT IMPÉRATIF — Ta réponse sera validée par un schéma Zod strict.
Réponds UNIQUEMENT avec un tableau JSON brut, sans texte avant ni après, sans markdown, sans \`\`\`.
Schéma attendu :
${SCHEMA_DESCRIPTION}`,
    ],
    [
      "human",
      `DONNÉES DU JOUR :

📊 POSTS (7 derniers jours) :
- Total workspace : {postTotal} posts ({postPublished} publiés, {postDraft} brouillons, {postScheduled} planifiés)
- Récents : {recentPostsSummary}

🔑 KEYWORDS TOP :
{keywordsSummary}

🔥 ADS CONCURRENTS RÉCENTS :
{adsSummary}

👥 PROSPECTS :
- Total : {prospectTotal} ({prospectNew} nouveaux, {prospectContacted} contactés, {prospectReplied} répondus)

📈 TENDANCES DU JOUR :
{trendsSummary}

📰 ACTUALITÉ SECTEUR :
{sectorNewsSummary}

📊 PERFORMANCES GOOGLE SEARCH CONSOLE :
- Top pages : {gscTopPagesSummary}
- Pages en déclin (position > 15 mais impressions élevées) : {gscDecliningPagesSummary}

💰 CONVERSIONS RÉCENTES (7j) :
{conversionsSummary}

🔔 ALERTES CONCURRENTS (nouveaux contenus détectés) :
{competitorAlertsSummary}

📋 FEEDBACK UTILISATEUR RÉCENT (14j) — décisions approuvées ou rejetées :
{recentDecisionFeedbackSummary}

🧠 INSIGHTS DE PERFORMANCE PASSÉS (weekly learning) :
{performanceInsightsSummary}

🎯 OBJECTIFS :
{objectives}

Analyse ces données et propose 3-5 actions prioritaires pour aujourd'hui. Tiens compte des données GSC et des alertes concurrents pour prioriser. Réponds UNIQUEMENT en JSON brut.`,
    ],
  ]);

  const recentPostsSummary =
    data.recentPosts.length > 0
      ? data.recentPosts
          .slice(0, 5)
          .map((p) => `${p.type}: "${p.title ?? "Sans titre"}" (${p.status})`)
          .join("\n")
      : "Aucun post récent";

  const keywordsSummary =
    data.topKeywords.length > 0
      ? data.topKeywords
          .map(
            (k) =>
              `- "${k.keyword}" (volume: ${k.volume ?? "N/A"}, difficulté: ${k.difficulty})`
          )
          .join("\n")
      : "Aucun keyword analysé";

  const adsSummary =
    data.recentAds.length > 0
      ? data.recentAds
          .map(
            (a) =>
              `- ${a.advertiserName}: "${a.hook ?? "N/A"}" (framework: ${a.framework ?? "N/A"}, score: ${a.efficiencyScore})`
          )
          .join("\n")
      : "Aucune nouvelle publicité détectée";

  const trendsSummary =
    data.trendingTopics.length > 0
      ? data.trendingTopics
          .map((t) => `- ${t.title}: ${t.snippet.slice(0, 100)}`)
          .join("\n")
      : "Pas de tendance notable";

  const sectorNewsSummary =
    data.sectorNews.length > 0
      ? data.sectorNews.map((n) => `- ${n.title}: ${n.snippet.slice(0, 100)}`).join("\n")
      : "Pas d'actualité secteur notable";

  const gscTopPagesSummary =
    data.gscTopPages.length > 0
      ? data.gscTopPages
          .map((p) => `- ${p.page} (${p.clicks} clics, position ${p.avgPosition})`)
          .join("\n")
      : "GSC non connecté ou aucune donnée";

  const gscDecliningPagesSummary =
    data.gscDecliningPages.length > 0
      ? data.gscDecliningPages
          .map((p) => `- ${p.page} → position ${p.currentAvgPosition} pour "${p.keyword}" — RÉGÉNÉRATION RECOMMANDÉE`)
          .join("\n")
      : "Aucune page en déclin détectée";

  const conversionsSummary =
    data.recentConversions.count > 0
      ? `${data.recentConversions.count} deals closés, ${data.recentConversions.totalValue}€ de pipeline généré (deal moyen: ${data.recentConversions.avgDealValue}€)`
      : "Aucune conversion cette semaine — relancer les prospects chauds";

  const competitorAlertsSummary =
    data.competitorAlerts.length > 0
      ? data.competitorAlerts
          .map((a) => `- ${a.competitorDomain}: "${a.contentTitle ?? "nouveau contenu"}" (keyword: ${a.matchedKeyword ?? "N/A"})`)
          .join("\n")
      : "Aucune alerte concurrent";

  const performanceInsightsSummary =
    Object.keys(data.performanceInsights).length > 0
      ? `Meilleur type d'action: ${(data.performanceInsights.bestPerformingType as string) ?? "N/A"} | Actions recommandées: ${((data.performanceInsights.nextCycleRecommendations as string[]) ?? []).join(", ")}`
      : "Pas encore d'insights (premier cycle)";

  // Feedback immédiat : taux d'approbation par type d'action sur 14 jours
  const feedbackByType: Record<string, { approved: number; rejected: number; avgScore: number; scoreCount: number }> = {};
  for (const d of data.recentDecisionFeedback) {
    if (!feedbackByType[d.actionType]) {
      feedbackByType[d.actionType] = { approved: 0, rejected: 0, avgScore: 0, scoreCount: 0 };
    }
    if (d.status === "REJECTED") feedbackByType[d.actionType].rejected += 1;
    else feedbackByType[d.actionType].approved += 1;
    if (d.performanceScore != null) {
      feedbackByType[d.actionType].avgScore += d.performanceScore;
      feedbackByType[d.actionType].scoreCount += 1;
    }
  }
  const recentDecisionFeedbackSummary =
    Object.keys(feedbackByType).length > 0
      ? Object.entries(feedbackByType)
          .map(([type, stats]) => {
            const total = stats.approved + stats.rejected;
            const approvalRate = Math.round((stats.approved / total) * 100);
            const avgScore = stats.scoreCount > 0 ? Math.round(stats.avgScore / stats.scoreCount) : null;
            return `- ${type}: ${approvalRate}% approuvé (${total} décisions)${avgScore !== null ? `, score moyen: ${avgScore}/100` : ""}`;
          })
          .join("\n")
      : "Aucune décision récente (premier cycle)";

  const claude = getClaude();
  const parser = getStringParser();

  const invokeParams = {
    postTotal: data.postStats.total.toString(),
    postPublished: data.postStats.published.toString(),
    postDraft: data.postStats.draft.toString(),
    postScheduled: data.postStats.scheduled.toString(),
    recentPostsSummary,
    keywordsSummary,
    adsSummary,
    prospectTotal: data.prospectStats.total.toString(),
    prospectNew: data.prospectStats.new.toString(),
    prospectContacted: data.prospectStats.contacted.toString(),
    prospectReplied: data.prospectStats.replied.toString(),
    trendsSummary,
    sectorNewsSummary,
    gscTopPagesSummary,
    gscDecliningPagesSummary,
    conversionsSummary,
    competitorAlertsSummary,
    recentDecisionFeedbackSummary,
    performanceInsightsSummary,
    objectives:
      data.workspaceObjectives.length > 0
        ? data.workspaceObjectives.join(", ")
        : "Non définis (croissance générale)",
  };

  // Appel initial au LLM
  const rawResponse = await prompt.pipe(claude).pipe(parser).invoke(invokeParams);

  // Self-correction : si Zod échoue, on renvoie les erreurs à Claude
  const selfCorrect = async (errorDescription: string): Promise<string> => {
    console.log("[Brain] Self-correction — renvoi des erreurs au LLM...");
    const correctionPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `Tu es un expert JSON. Tu dois corriger un JSON invalide pour qu'il respecte strictement le schéma suivant :

${SCHEMA_DESCRIPTION}

Réponds UNIQUEMENT avec le JSON corrigé, sans texte avant ni après, sans markdown.`,
      ],
      [
        "human",
        `Le JSON que tu as fourni contient des erreurs de validation Zod :

${errorDescription}

JSON original à corriger :
${rawResponse}

Renvoie le JSON corrigé.`,
      ],
    ]);
    return correctionPrompt.pipe(claude).pipe(parser).invoke({});
  };

  const decisions = await safeParseAgentResponse(rawResponse, selfCorrect);
  return decisions.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PLANIFICATION - Prépare les assets pour chaque décision
// ═══════════════════════════════════════════════════════════════════════════

async function planAndStore(
  workspaceId: string,
  decisions: AgentDecisionInput[]
): Promise<string[]> {
  const decisionIds: string[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Pré-charger les keywords déjà en cours pour la déduplication SEO
  const existingDraftKeywords = await prisma.post.findMany({
    where: {
      workspaceId,
      status: { in: ["DRAFT", "SCHEDULED"] },
      type: "SEO_ARTICLE",
      createdAt: { gte: thirtyDaysAgo },
      deletedAt: null,
    },
    select: { keywords: true },
  });
  const draftKeywordSet = new Set(
    existingDraftKeywords.flatMap((p) => p.keywords.map((k) => k.toLowerCase()))
  );

  // Pré-charger les décisions PENDING récentes pour déduplication multi-type
  const recentPendingDecisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId,
      status: "PENDING",
      createdAt: { gte: sevenDaysAgo },
    },
    select: { actionType: true, actionData: true },
  });

  for (const decision of decisions) {
    // ── Déduplication ──────────────────────────────────────────────────────
    const keyword = ((decision.actionData.keyword as string) ?? "").toLowerCase();
    const platform = (decision.actionData.platform as string) ?? "LINKEDIN";

    if (decision.actionType === "SEO_ARTICLE" && keyword && draftKeywordSet.has(keyword)) {
      console.log(`[Brain] Déduplication: SEO_ARTICLE "${keyword}" déjà en DRAFT/SCHEDULED — ignoré`);
      continue;
    }

    if (decision.actionType === "SOCIAL_POST") {
      const duplicate = recentPendingDecisions.some(
        (d) =>
          d.actionType === "SOCIAL_POST" &&
          ((d.actionData as Record<string, unknown>)?.keyword as string)?.toLowerCase() === keyword &&
          ((d.actionData as Record<string, unknown>)?.platform as string) === platform
      );
      if (duplicate) {
        console.log(`[Brain] Déduplication: SOCIAL_POST "${keyword}" sur ${platform} déjà PENDING — ignoré`);
        continue;
      }
    }

    if (decision.actionType === "DISCOVERY_SCAN" || decision.actionType === "COMPETITOR_REACT") {
      const competitorUrl = (decision.actionData.competitorUrl as string) ?? "";
      const recentScan = await prisma.agentDecision.findFirst({
        where: {
          workspaceId,
          actionType: decision.actionType,
          createdAt: { gte: fourteenDaysAgo },
        },
      });
      const sameCompetitor =
        competitorUrl &&
        recentScan &&
        ((recentScan.actionData as Record<string, unknown>)?.competitorUrl as string) === competitorUrl;
      if (sameCompetitor) {
        console.log(`[Brain] Déduplication: ${decision.actionType} sur "${competitorUrl}" déjà fait il y a < 14j — ignoré`);
        continue;
      }
    }

    if (decision.actionType === "PROSPECT_DM") {
      const recentDm = recentPendingDecisions.some((d) => d.actionType === "PROSPECT_DM");
      if (recentDm) {
        console.log(`[Brain] Déduplication: PROSPECT_DM déjà PENDING cette semaine — ignoré`);
        continue;
      }
    }
    // ── Fin déduplication ──────────────────────────────────────────────────

    let linkedPostId: string | null = null;

    // Pour les actions qui génèrent un post, créer un brouillon
    if (decision.actionType === "SEO_ARTICLE" || decision.actionType === "SOCIAL_POST") {
      // keyword et platform déjà extraits dans le bloc déduplication
      const openai = getOpenAI();
      const parser = getStringParser();

      if (decision.actionType === "SOCIAL_POST") {
        // A/B Testing : générer 2 variantes (AIDA vs PAS) pour les posts sociaux
        const abPrompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            `Tu es un expert en copywriting et marketing de contenu ${platform}.
Génère 2 variantes de post pour ${platform} sur le même sujet, avec des angles différents.
Variante A : Framework AIDA (Attention → Intérêt → Désir → Action)
Variante B : Framework PAS (Problème → Agitation → Solution)
Adapte la longueur et le style au réseau. Chaque variante doit être complète et prête à publier.
Réponds en JSON strict : { "A": "contenu variante AIDA", "B": "contenu variante PAS" }`,
          ],
          [
            "human",
            `Sujet/Keyword: ${keyword}\nRaisonnement stratégique: ${decision.reasoning}\n\nGénère les 2 variantes.`,
          ],
        ]);

        const abRaw = await abPrompt.pipe(openai).pipe(parser).invoke({});
        let contentA = "";
        let contentB = "";
        try {
          const abParsed = JSON.parse(abRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()) as {
            A: string;
            B: string;
          };
          contentA = abParsed.A ?? "";
          contentB = abParsed.B ?? "";
        } catch {
          // Fallback si le parsing échoue : utiliser le brouillon complet comme variante A
          contentA = abRaw;
          contentB = "";
        }

        const postType = platform as "LINKEDIN" | "X" | "INSTAGRAM" | "TIKTOK";

        // Créer la variante A (liée à la décision)
        const postA = await prisma.post.create({
          data: {
            type: postType,
            title: keyword || decision.reasoning.slice(0, 100),
            content: contentA,
            keywords: keyword ? [keyword] : [],
            status: "DRAFT",
            workspaceId,
            abTestVariant: "A",
          },
        });
        linkedPostId = postA.id;

        // Créer la variante B (si on a du contenu)
        if (contentB) {
          await prisma.post.create({
            data: {
              type: postType,
              title: `[B] ${keyword || decision.reasoning.slice(0, 100)}`,
              content: contentB,
              keywords: keyword ? [keyword] : [],
              status: "DRAFT",
              workspaceId,
              abTestVariant: "B",
            },
          });
        }
      } else {
        // SEO_ARTICLE : brouillon simple (pas de A/B test)
        const draftPrompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            "Tu es un rédacteur SEO expert. Génère un brouillon d'article de 500 mots sur le sujet donné. Format Markdown.",
          ],
          [
            "human",
            `Sujet/Keyword: ${keyword}\nRaisonnement stratégique: ${decision.reasoning}\n\nGénère le brouillon.`,
          ],
        ]);

        const content = await draftPrompt.pipe(openai).pipe(parser).invoke({});

        const post = await prisma.post.create({
          data: {
            type: "SEO_ARTICLE",
            title: keyword || decision.reasoning.slice(0, 100),
            content,
            keywords: keyword ? [keyword] : [],
            status: "DRAFT",
            workspaceId,
          },
        });

        linkedPostId = post.id;
      }

      // Enregistrer le keyword dans le set pour dédupliquer dans le même cycle
      if (keyword) draftKeywordSet.add(keyword.toLowerCase());
    }

    // Stocker la décision
    const agentDecision = await prisma.agentDecision.create({
      data: {
        reasoning: decision.reasoning,
        actionType: decision.actionType,
        actionData: JSON.parse(JSON.stringify(decision.actionData)),
        priority: decision.priority,
        impact: decision.impact,
        status: "PENDING",
        linkedPostId,
        workspaceId,
      },
    });

    decisionIds.push(agentDecision.id);
  }

  return decisionIds;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CYCLE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exécute le cycle quotidien complet de l'Agent Brain
 * Observation → Analyse → Planification → Stockage
 */
export async function runDailyMarketingCycle(
  workspaceId: string
): Promise<{ success: boolean; decisionIds?: string[]; error?: string }> {
  try {
    console.log(`[Brain] Démarrage cycle pour workspace ${workspaceId}`);

    // 1. Observation
    const data = await observe(workspaceId);
    console.log(`[Brain] Observation terminée: ${data.recentPosts.length} posts, ${data.topKeywords.length} keywords`);

    // 2. Analyse (Claude Chain of Thought)
    const decisions = await analyze(data);
    console.log(`[Brain] Analyse terminée: ${decisions.length} décisions proposées`);

    // 3. Planification + Stockage
    const decisionIds = await planAndStore(workspaceId, decisions);
    console.log(`[Brain] ${decisionIds.length} décisions stockées`);

    // 4. Learning adaptatif : déclenche learnFromPerformance si ≥5 décisions
    //    exécutées depuis le dernier apprentissage (sans attendre le cycle weekly)
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { brandVoice: true },
      });
      const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};
      const lastLearningAt = (brandVoice.performanceInsights as Record<string, unknown>)?.updatedAt as string | undefined;
      const lastLearningDate = lastLearningAt ? new Date(lastLearningAt) : new Date(0);

      const executedSinceLastLearning = await prisma.agentDecision.count({
        where: {
          workspaceId,
          status: "EXECUTED",
          executedAt: { gte: lastLearningDate },
        },
      });

      if (executedSinceLastLearning >= 5) {
        console.log(`[Brain] ${executedSinceLastLearning} décisions exécutées depuis le dernier learning → déclenchement anticipé`);
        learnFromPerformance(workspaceId).catch((e) =>
          console.warn("[Brain] Learning adaptatif échoué (non bloquant):", e)
        );
      }
    } catch (e) {
      console.warn("[Brain] Vérification learning adaptatif échouée (non bloquant):", e);
    }

    // 5. Logger dans AutopilotLog
    await prisma.autopilotLog.create({
      data: {
        workspaceId,
        agentType: "brain",
        action: `Cycle quotidien: ${decisions.length} décisions générées`,
        status: "success",
        details: JSON.parse(JSON.stringify({ decisionIds, decisionCount: decisions.length })),
        creditsUsed: 20,
      },
    });

    return { success: true, decisionIds };
  } catch (error) {
    console.error("[Brain] Erreur cycle:", error);

    await prisma.autopilotLog.create({
      data: {
        workspaceId,
        agentType: "brain",
        action: "Cycle quotidien échoué",
        status: "failed",
        details: JSON.parse(JSON.stringify({
          error: error instanceof Error ? error.message : "Erreur inconnue",
        })),
        creditsUsed: 0,
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXÉCUTION DE DÉCISION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exécute une décision approuvée
 */
export async function executeDecision(
  decisionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const decision = await prisma.agentDecision.findUnique({
      where: { id: decisionId },
      include: { linkedPost: true },
    });

    if (!decision || decision.status !== "APPROVED") {
      return { success: false, error: "Décision non trouvée ou non approuvée" };
    }

    let result: Record<string, unknown> = {};

    switch (decision.actionType) {
      case "SEO_ARTICLE":
      case "SOCIAL_POST":
        // Le post DRAFT est déjà créé - on le marque comme SCHEDULED
        if (decision.linkedPostId) {
          await prisma.post.update({
            where: { id: decision.linkedPostId },
            data: { status: "SCHEDULED", scheduledAt: new Date() },
          });
          result = { action: "post_scheduled", postId: decision.linkedPostId };
        }
        break;

      case "SEO_REGENERATE":
        // Régénérer un article existant dont la position Google chute
        if (decision.linkedPostId) {
          await prisma.post.update({
            where: { id: decision.linkedPostId },
            data: { status: "SCHEDULED", scheduledAt: new Date() },
          });
          result = { action: "regeneration_scheduled", postId: decision.linkedPostId };
        } else {
          const existingUrl = (decision.actionData as Record<string, unknown>)?.existingUrl as string | undefined;
          result = { action: "regeneration_queued", existingUrl: existingUrl ?? null, note: "Article à régénérer identifié" };
        }
        break;

      case "COMPETITOR_REACT":
        // Créer du contenu en réaction à un contenu concurrent
        if (decision.linkedPostId) {
          await prisma.post.update({
            where: { id: decision.linkedPostId },
            data: { status: "SCHEDULED", scheduledAt: new Date() },
          });
          result = { action: "competitor_reaction_scheduled", postId: decision.linkedPostId };
        } else {
          const competitorUrl = (decision.actionData as Record<string, unknown>)?.competitorUrl as string | undefined;
          result = { action: "competitor_reaction_queued", competitorUrl: competitorUrl ?? null };
        }
        break;

      case "PROSPECT_DM":
        // Marquer les prospects à relancer
        const prospectCount = (decision.actionData as Record<string, unknown>)?.prospectCount ?? 5;
        const prospects = await prisma.prospect.findMany({
          where: { workspaceId: decision.workspaceId, status: "NEW" },
          take: prospectCount as number,
          select: { id: true },
        });
        result = { action: "prospects_identified", count: prospects.length };
        break;

      case "AD_REMIX":
        result = { action: "brief_generated", note: "Brief créatif prêt pour révision" };
        break;

      case "DISCOVERY_SCAN":
        result = { action: "scan_queued", note: "Scan concurrent programmé" };
        break;
    }

    // Mettre à jour la décision
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: {
        status: "EXECUTED",
        executedAt: new Date(),
        result: JSON.parse(JSON.stringify(result)),
      },
    });

    return { success: true };
  } catch (error) {
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "FAILED" },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. SCORING DES DÉCISIONS PASSÉES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score les décisions exécutées en mesurant leur impact réel.
 * Appelé par learnFromPerformance() avant l'analyse Claude.
 *
 * Métriques :
 * - SEO_ARTICLE / SEO_REGENERATE : seoScore du post lié (0-100)
 * - SOCIAL_POST : 80 si publié, 50 si schedulé
 * - PROSPECT_DM : taux de progression des prospects (REPLIED=60, CONVERTED=100)
 * - DISCOVERY_SCAN / AD_REMIX / COMPETITOR_REACT : 70 (utile par défaut)
 */
async function scoreDecisionPerformance(workspaceId: string): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const executedDecisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId,
      status: "EXECUTED",
      performanceScore: null, // Seulement ceux pas encore scorés
      createdAt: { gte: thirtyDaysAgo },
    },
    include: { linkedPost: { select: { seoScore: true, status: true } } },
  });

  for (const decision of executedDecisions) {
    let performanceScore: number;

    switch (decision.actionType) {
      case "SEO_ARTICLE":
      case "SEO_REGENERATE":
        if (decision.linkedPost?.seoScore != null) {
          performanceScore = decision.linkedPost.seoScore;
        } else if (decision.linkedPost?.status === "PUBLISHED") {
          performanceScore = 65; // publié sans score SEO calculé
        } else {
          performanceScore = 30; // brouillon non publié
        }
        break;

      case "SOCIAL_POST":
      case "COMPETITOR_REACT":
        if (decision.linkedPost?.status === "PUBLISHED") {
          performanceScore = 80;
        } else if (decision.linkedPost?.status === "SCHEDULED") {
          performanceScore = 60;
        } else {
          performanceScore = 40;
        }
        break;

      case "PROSPECT_DM": {
        // Vérifier le taux de progression des prospects ciblés
        const prospectCount = (decision.actionData as Record<string, unknown>)?.prospectCount ?? 5;
        const recentProspects = await prisma.prospect.findMany({
          where: { workspaceId, status: { in: ["REPLIED", "CONVERTED"] }, updatedAt: { gte: thirtyDaysAgo } },
          take: prospectCount as number,
          select: { status: true },
        });
        const converted = recentProspects.filter((p) => p.status === "CONVERTED").length;
        const replied = recentProspects.filter((p) => p.status === "REPLIED").length;
        const total = Math.max(prospectCount as number, 1);
        performanceScore = Math.min(100, Math.round((converted * 100 + replied * 60) / (total as number)));
        break;
      }

      case "DISCOVERY_SCAN": {
        // Vérifier si un post concurrent ou SEO a été créé dans les 7 jours suivant la décision
        const sevenDaysAfter = new Date(decision.createdAt);
        sevenDaysAfter.setDate(sevenDaysAfter.getDate() + 7);
        const followUpPost = await prisma.post.findFirst({
          where: {
            workspaceId,
            createdAt: { gte: decision.createdAt, lte: sevenDaysAfter },
            status: { in: ["PUBLISHED", "SCHEDULED"] },
            type: { in: ["SEO_ARTICLE", "LINKEDIN", "X", "INSTAGRAM"] },
          },
        });
        performanceScore = followUpPost ? 75 : 45;
        break;
      }

      case "AD_REMIX": {
        // Vérifier si un post a été créé dans les 7 jours
        const sevenDaysAfterAdRemix = new Date(decision.createdAt);
        sevenDaysAfterAdRemix.setDate(sevenDaysAfterAdRemix.getDate() + 7);
        const adFollowUpPost = await prisma.post.findFirst({
          where: {
            workspaceId,
            createdAt: { gte: decision.createdAt, lte: sevenDaysAfterAdRemix },
            status: { in: ["PUBLISHED", "SCHEDULED"] },
          },
        });
        performanceScore = adFollowUpPost ? 70 : 40;
        break;
      }

      default:
        performanceScore = 50;
    }

    await prisma.agentDecision.update({
      where: { id: decision.id },
      data: { performanceScore },
    });
  }

  console.log(`[Brain] Scoring terminé: ${executedDecisions.length} décisions scorées`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. APPRENTISSAGE (Feedback Loop)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse les performances et met à jour les insights
 */
export async function learnFromPerformance(
  workspaceId: string
): Promise<{ success: boolean; insights?: Record<string, unknown> }> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Scorer les décisions exécutées non encore scorées
    await scoreDecisionPerformance(workspaceId);

    // Posts publiés des 30 derniers jours
    const publishedPosts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: "PUBLISHED",
        publishedAt: { gte: thirtyDaysAgo },
        deletedAt: null,
      },
      select: { type: true, keywords: true, title: true, seoScore: true },
    });

    // Décisions exécutées AVEC leur score de performance
    const executedDecisions = await prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "EXECUTED",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { actionType: true, priority: true, impact: true, result: true, performanceScore: true },
    });

    // 2. Sélectionner les gagnants A/B test (posts avec abTestScore défini)
    const abTestPairs = await prisma.post.findMany({
      where: {
        workspaceId,
        abTestVariant: { not: null },
        abTestScore: { not: null },
        createdAt: { gte: thirtyDaysAgo },
        deletedAt: null,
      },
      select: { id: true, title: true, abTestVariant: true, abTestScore: true, type: true },
    });

    // Grouper par titre de base (supprimer "[B] " prefix pour matcher les paires)
    const abGroups: Record<string, typeof abTestPairs> = {};
    for (const post of abTestPairs) {
      const baseTitle = (post.title ?? "").replace(/^\[B\]\s*/, "");
      if (!abGroups[baseTitle]) abGroups[baseTitle] = [];
      abGroups[baseTitle].push(post);
    }

    let abWinnerCount = { A: 0, B: 0 };
    for (const [, posts] of Object.entries(abGroups)) {
      const postA = posts.find((p) => p.abTestVariant === "A");
      const postB = posts.find((p) => p.abTestVariant === "B");
      if (!postA || !postB) continue;

      const scoreA = postA.abTestScore ?? 0;
      const scoreB = postB.abTestScore ?? 0;
      const winnerId = scoreA >= scoreB ? postA.id : postB.id;
      const loserId = scoreA >= scoreB ? postB.id : postA.id;
      const winner = scoreA >= scoreB ? "A" : "B";
      abWinnerCount[winner]++;

      // Marquer le gagnant si pas encore fait
      await prisma.post.updateMany({
        where: { id: winnerId, abTestWinner: null },
        data: { abTestWinner: true },
      });
      await prisma.post.updateMany({
        where: { id: loserId, abTestWinner: null },
        data: { abTestWinner: false },
      });
    }

    const dominantAbFramework = abWinnerCount.A >= abWinnerCount.B ? "AIDA" : "PAS";
    const totalAbTests = abWinnerCount.A + abWinnerCount.B;

    // 3. Calculer le score moyen par type d'action
    const performanceByType: Record<string, { total: number; count: number }> = {};
    for (const d of executedDecisions) {
      if (d.performanceScore != null) {
        if (!performanceByType[d.actionType]) {
          performanceByType[d.actionType] = { total: 0, count: 0 };
        }
        performanceByType[d.actionType].total += d.performanceScore;
        performanceByType[d.actionType].count += 1;
      }
    }
    const avgPerformanceByType: Record<string, number> = {};
    for (const [type, { total, count }] of Object.entries(performanceByType)) {
      avgPerformanceByType[type] = Math.round(total / count);
    }
    const bestPerformingType = Object.entries(avgPerformanceByType).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "N/A";

    // Analyser les patterns avec Claude
    const claude = getClaude();
    const parser = getStringParser();

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `Tu es un analyste marketing expert. Analyse les performances des 30 derniers jours et identifie les patterns gagnants pour optimiser la stratégie des prochaines semaines.

Réponds en JSON avec ces champs :
- bestPerformingTypes: array des types de contenu qui marchent le mieux (ex: ["SEO_ARTICLE", "LINKEDIN"])
- bestKeywords: array des keywords avec le plus de succès
- bestPostingDays: array des jours de la semaine optimaux (ex: ["LUNDI", "MERCREDI"])
- recommendedMix: objet avec % recommandé par type (ex: {"SEO_ARTICLE": 50, "SOCIAL_POST": 30, "PROSPECT_DM": 20})
- insights: array de 3-5 insights actionnables en français
- nextCycleRecommendations: array de 3 recommandations pour le prochain cycle quotidien
- performanceByActionType: objet avec le score moyen par type d'action (fourni dans les données)
- bestPerformingType: le type d'action avec le meilleur impact (fourni dans les données)
- successRateByType: objet avec le taux de succès par type (score > 70 = succès)`,
      ],
      [
        "human",
        `Posts publiés (30j) : ${publishedPosts.length}
Types : ${JSON.stringify(publishedPosts.reduce((acc: Record<string, number>, p) => { acc[p.type] = (acc[p.type] ?? 0) + 1; return acc; }, {}))}
Keywords utilisés : ${[...new Set(publishedPosts.flatMap((p) => p.keywords))].slice(0, 20).join(", ")}
SEO Scores moyens : ${publishedPosts.filter((p) => p.seoScore).length > 0 ? (publishedPosts.reduce((s, p) => s + (p.seoScore ?? 0), 0) / publishedPosts.filter((p) => p.seoScore).length).toFixed(0) : "N/A"}

Décisions agent exécutées : ${executedDecisions.length}
Scores de performance par type : ${JSON.stringify(avgPerformanceByType)}
Meilleur type d'action : ${bestPerformingType}
Types d'actions : ${JSON.stringify(executedDecisions.reduce((acc: Record<string, number>, d) => { acc[d.actionType] = (acc[d.actionType] ?? 0) + 1; return acc; }, {}))}

A/B Tests analysés : ${totalAbTests} paires
Framework gagnant : ${dominantAbFramework} (A:${abWinnerCount.A} victoires vs B:${abWinnerCount.B} victoires)

Analyse et donne tes insights pour maximiser le ROI des prochains cycles.`,
      ],
    ]);

    const result = await prompt.pipe(claude).pipe(parser).invoke({});
    let insights: Record<string, unknown>;
    try {
      insights = JSON.parse(stripMarkdownJson(result));
    } catch (e) {
      console.error("[Brain] learnFromPerformance — parsing échoué:", e);
      return { success: false };
    }

    // Sauvegarder dans le brandVoice du workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { brandVoice: true },
    });
    const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};

    // Enrichir les insights avec les données calculées (sans dépendre de Claude pour ça)
    const enrichedInsights = {
      ...insights,
      performanceByActionType: avgPerformanceByType,
      bestPerformingType,
      abTestResults: {
        totalPairs: totalAbTests,
        aWins: abWinnerCount.A,
        bWins: abWinnerCount.B,
        dominantFramework: dominantAbFramework,
        recommendation: totalAbTests > 0
          ? `Utiliser le framework ${dominantAbFramework} en priorité (${dominantAbFramework === "AIDA" ? abWinnerCount.A : abWinnerCount.B}/${totalAbTests} victoires)`
          : "Pas assez de données A/B test pour conclure",
      },
      updatedAt: new Date().toISOString(),
    };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        brandVoice: JSON.parse(JSON.stringify({
          ...brandVoice,
          performanceInsights: enrichedInsights,
        })),
      },
    });

    return { success: true, insights: enrichedInsights };
  } catch (error) {
    console.error("[Brain] Erreur apprentissage:", error);
    return { success: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. GUARDRAILS - Système d'arrêt d'urgence
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie les guardrails avant d'exécuter un cycle
 */
export async function checkGuardrails(workspaceId: string): Promise<GuardrailCheck> {
  const alerts: string[] = [];
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  // 1. Taux d'échec des 24 dernières heures
  const recentLogs = await prisma.autopilotLog.findMany({
    where: { workspaceId, createdAt: { gte: oneDayAgo } },
    select: { status: true },
  });

  if (recentLogs.length > 5) {
    const failedCount = recentLogs.filter((l) => l.status === "failed").length;
    const failRate = failedCount / recentLogs.length;
    if (failRate > 0.5) {
      alerts.push(`Taux d'échec critique: ${Math.round(failRate * 100)}% dans les 24 dernières heures`);
    }
  }

  // 2. Crédits restants
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { user: { select: { credits: true, plan: true } } },
  });

  if (workspace?.user) {
    const monthlyLimit = PLAN_LIMITS[workspace.user.plan].monthlyCredits;
    const creditsPercent = (workspace.user.credits / monthlyLimit) * 100;
    if (creditsPercent < 10) {
      alerts.push(`Crédits critiques: ${workspace.user.credits} restants (${creditsPercent.toFixed(0)}% du plan)`);
    }
  }

  // 3. Si des alertes critiques, désactiver l'autopilot
  if (alerts.length > 0) {
    await prisma.autopilotConfig.updateMany({
      where: { workspaceId },
      data: { isActive: false },
    });

    await prisma.autopilotLog.create({
      data: {
        workspaceId,
        agentType: "brain",
        action: `GUARDRAIL DÉCLENCHÉ: ${alerts.join(" | ")}`,
        status: "failed",
        details: JSON.parse(JSON.stringify({ alerts })),
        creditsUsed: 0,
      },
    });
  }

  return { safe: alerts.length === 0, alerts };
}
