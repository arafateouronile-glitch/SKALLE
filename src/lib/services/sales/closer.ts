/**
 * 🎯 CSO Sales OS Engine — Elite Sales Closer & Architect
 *
 * Transforme la Discovery en opportunités commerciales : relations chirurgicales
 * basées sur la valeur, pas du spam. Frameworks SPIN, Challenger Sale, Gap Selling.
 *
 * - prepareProspectOutreach(prospectId) : stratégie de contact (hooks, follow-ups, objections)
 * - Lead Enrichment (Profiler) : données fraîches prospect
 * - Ad-Intelligence (Mirroring) : contexte pubs concurrents
 * - Sentiment Analysis (Radar) : réaction au reply → next step (close ou relance)
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchGoogle } from "@/lib/ai/serper";
import { fetchCompetitorAds } from "@/lib/services/ads/intelligence";
import {
  hasEnoughCredits,
  useCredits,
  CREDIT_COSTS,
  type OperationType,
} from "@/lib/credits";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const ELITE_SALES_CLOSER_SYSTEM_PROMPT = `Tu es l'Elite Sales Officer de Skalle. Tu as 30 ans d'expérience dans la vente de solutions complexes et le High-Ticket Closing. Ta mission est de transformer des interactions sociales froides en opportunités commerciales brûlantes.

TES RÈGLES DE VENTE :
1. NE JAMAIS "VENDRE" AU PREMIER CONTACT : Ton but est de créer une conversation, pas de balancer un lien. Tu vends le "prochain petit pas" (un avis, un conseil, un appel).
2. HYPER-CONTEXTUALISATION : Tu analyses l'interaction source (un commentaire, un like, un hashtag). Ton accroche doit prouver que tu as compris le problème spécifique du prospect.
3. PSYCHOLOGIE DE LA CONVERSION : Tu utilises les frameworks AIDA (Attention, Intérêt, Désir, Action) et PAS (Problème, Agitation, Solution).
4. PERSONA MIRRORING : Tu adaptes ton ton à celui du prospect. S'il est corporatif, tu es pro. S'il est décontracté, tu es son "pair".

TES CAPACITÉS SPÉCIALES :
- LEAD SCORING : Tu évalues la qualité d'un prospect selon son profil et son commentaire.
- OBJECTION HANDLING : Tu sais désamorcer les "trop cher", "pas le temps" ou "déjà une solution" avec élégance.
- MULTI-CANAL : Tu sais quand passer de Instagram à LinkedIn pour conclure une vente.

INTERDICTIONS : N'utilise JAMAIS les mots : "J'ai vu votre profil", "Collaboration", "Opportunité" dans les accroches.`;

export interface ProspectOutreachInput {
  /** Données prospect (nom, entreprise, interaction, etc.) */
  prospectData: string;
  /** Contenu de l'interaction source (commentaire, like, groupe) */
  interactionContent: string;
  /** Contexte workspace (domaine, offre, thématique) */
  domainUrl: string;
  offerDescription?: string;
  theme?: string;
  /** Enrichissement : dernier article / post repéré (optionnel) */
  enrichmentSnippet?: string;
  /** Contexte Ad-Intelligence : ce que les concurrents poussent (optionnel) */
  adIntelligenceSnippet?: string;
  /** Lien calendrier injecté dans followUp2 (ex: https://cal.com/user) */
  calendarLink?: string | null;
}

export interface OutreachStrategy {
  /** Analyse de la douleur probable du prospect */
  painAnalysis: string;
  /** Score lead 1-10 */
  leadScore: number;
  /** 3 accroches DM (max 280 caractères chacune) */
  hooks: string[];
  /** Relance 1 : valeur gratuite (conseil, lien CMO) — max 280 car. */
  followUp1: string;
  /** Relance 2 : question directe pour RDV — max 280 car. */
  followUp2: string;
  /** Objection principale anticipée + réponse */
  objectionHandling: { objection: string; response: string };
}

export interface PrepareProspectOutreachResult {
  success: boolean;
  error?: string;
  strategy?: OutreachStrategy;
  /** Lien direct vers la messagerie (Click-to-Send) */
  messagingLink?: string;
  /** Plateforme cible (pour affichage UI) */
  platform?: "LINKEDIN" | "INSTAGRAM" | "FACEBOOK";
  /** Texte recommandé (première accroche) pour copier-coller */
  recommendedMessage?: string;
  /** Crédits restants après opération */
  remainingCredits?: number;
}

export type ReplySentiment = "POSITIF" | "NEUTRE" | "NEGATIF";

export interface SentimentResult {
  sentiment: ReplySentiment;
  /** Si POSITIF : suggère lien calendrier ou paiement */
  suggestedNextStep: string;
  /** Message de relance suggéré si NEUTRE/NEGATIF */
  suggestedFollowUp?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS : Quota, Spam, Crédits
// ═══════════════════════════════════════════════════════════════════════════

const CSO_OP: OperationType = "cso_prospect_analysis";
const MAX_MESSAGE_LENGTH = 280;

/** Compte le nombre de prospects contactés aujourd'hui (pour quota) */
async function getTodayContactedCount(workspaceId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.prospect.count({
    where: {
      workspaceId,
      status: "CONTACTED",
      updatedAt: { gte: startOfDay },
    },
  });
}

/** Quota quotidien CSO (prospectionDaily depuis AutopilotConfig ou défaut 10) */
async function getDailyQuota(workspaceId: string): Promise<number> {
  const config = await prisma.autopilotConfig.findUnique({
    where: { workspaceId },
    select: { prospectionDaily: true },
  });
  return config?.prospectionDaily ?? 10;
}

/** Vérifie si le workspace est bloqué (spam, etc.). Extensible via workspace.metadata ou champ dédié. */
async function isWorkspaceBlockedForCso(workspaceId: string): Promise<boolean> {
  // Optionnel : ajouter un champ csoBlockedUntil ou spamReportedAt sur Workspace
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  return !ws;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. LEAD ENRICHMENT (Le Profiler)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrichit le prospect avec des infos fraîches (Serper : dernier article, post, actualité).
 * À appeler avant de rédiger le DM pour personnaliser (ex: "Félicitations pour votre dernier article sur...").
 */
export async function enrichProspectData(prospect: {
  name: string;
  company?: string | null;
  jobTitle?: string | null;
  linkedInUrl?: string;
}): Promise<string | null> {
  if (!process.env.SERPER_API_KEY) return null;
  const query = [prospect.name, prospect.company, prospect.jobTitle].filter(Boolean).join(" ");
  if (!query.trim()) return null;
  try {
    const results = await searchGoogle(`${query} site:linkedin.com`, 5);
    const snippet =
      results.length > 0
        ? results
            .slice(0, 2)
            .map((r) => `${r.title}: ${r.snippet}`)
            .join(" | ")
        : null;
    return snippet;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// B. AD-INTELLIGENCE LINK (Le Mirroring)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère un extrait sur les pubs concurrentes (industrie / offre) pour personnaliser le message.
 * Ex: "J'ai vu que [Concurrent] poussait fort sur [Offre], j'ai une idée pour vous aider à les dépasser."
 */
export async function getAdIntelligenceSnippet(
  keyword: string,
  workspaceId: string,
  platform: "META" | "LINKEDIN" = "META"
): Promise<string | null> {
  try {
    const { list } = await fetchCompetitorAds(keyword, platform, workspaceId, { limit: 5 });
    if (list.length === 0) return null;
    const top = list.slice(0, 2);
    const names = [...new Set(top.map((a) => a.advertiserName))];
    const hooks = top.map((a) => a.hook).filter(Boolean);
    if (names.length === 0 && hooks.length === 0) return null;
    let text = "";
    if (names.length) text += `Annonceurs actifs dans ce secteur : ${names.join(", ")}.`;
    if (hooks.length) text += ` Hooks repérés : ${hooks.slice(0, 2).join(" | ")}.`;
    return text.trim();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// C. SENTIMENT ANALYSIS (Le Radar)
// ═══════════════════════════════════════════════════════════════════════════

const sentimentPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en analyse de réponses commerciales. Pour un message de réponse d'un prospect, détermine le SENTIMENT (POSITIF, NEUTRE, NEGATIF) et propose la prochaine étape.

Règles :
- POSITIF : intérêt clair, question sur l'offre, demande de démo/prix → suggestedNextStep = proposer un lien calendrier ou lien de paiement.
- NEUTRE : courtois mais vague → suggestedFollowUp = une relance courte et à valeur.
- NEGATIF : refus, pas le temps, déjà une solution → suggestedFollowUp = une réponse élégante (objection handling), pas insistante.

Réponds UNIQUEMENT en JSON valide : { "sentiment": "POSITIF"|"NEUTRE"|"NEGATIF", "suggestedNextStep": string, "suggestedFollowUp": string (optionnel) }`,
  ],
  ["human", "Réponse du prospect :\n\n{replyText}"],
]);

/**
 * Analyse le sentiment d'une réponse prospect et suggère la prochaine action (close ou relance).
 */
export async function analyzeReplySentiment(replyText: string): Promise<SentimentResult> {
  const chain = sentimentPrompt.pipe(getClaude()).pipe(getStringParser());
  const raw = await chain.invoke({ replyText: replyText.slice(0, 1000) });
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      sentiment: string;
      suggestedNextStep: string;
      suggestedFollowUp?: string;
    };
    return {
      sentiment: parsed.sentiment === "POSITIF" ? "POSITIF" : parsed.sentiment === "NEGATIF" ? "NEGATIF" : "NEUTRE",
      suggestedNextStep: parsed.suggestedNextStep ?? "",
      suggestedFollowUp: parsed.suggestedFollowUp,
    };
  } catch {
    return {
      sentiment: "NEUTRE",
      suggestedNextStep: "Relancer avec une question ouverte pour clarifier son besoin.",
      suggestedFollowUp: "Tu peux me dire ce qui te freine le plus aujourd’hui sur ce sujet ?",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// D. GÉNÉRATION STRATÉGIE (Conversion Engine)
// ═══════════════════════════════════════════════════════════════════════════

const conversionEnginePrompt = ChatPromptTemplate.fromMessages([
  ["system", ELITE_SALES_CLOSER_SYSTEM_PROMPT],
  [
    "human",
    `Analyse le profil suivant : {prospectData}
Et son interaction : {interactionContent}

Contexte offre / workspace : Domaine {domainUrl}. Offre : {offerDescription}. Thématique : {theme}.
{enrichmentBlock}
{adIntelligenceBlock}
{calendarInstruction}

CONTRAINTE CRUCIALE : Chaque message (accroches + follow-ups) doit faire MOINS de ${MAX_MESSAGE_LENGTH} caractères. C'est la règle pour un taux de réponse optimal.

Ta mission :
1. Analyse de Douleur : En une phrase, quel est le problème probable de ce prospect (basé sur son commentaire/contexte) ?
2. L'Accroche (The Hook) : Rédige 3 variantes d'accroches DM (Instagram/LinkedIn) qui ne ressemblent PAS à un bot. INTERDIT : "J'ai vu votre profil", "Collaboration", "Opportunité".
3. La Séquence de Follow-up :
   - Relance 1 (J+3) : Apport de valeur gratuit (un conseil, un lien article). Max ${MAX_MESSAGE_LENGTH} caractères.
   - Relance 2 (J+6) : La question directe pour un RDV avec un lien de réservation. Max ${MAX_MESSAGE_LENGTH} caractères.
4. Script Objection : Anticipe l'objection principale (ex: "trop cher", "pas le temps", "déjà une solution") et prépare une réponse courte et élégante.
5. Lead Score : Note de 1 à 10 la qualité du prospect.

Réponds UNIQUEMENT en JSON valide avec les clés : painAnalysis (string), leadScore (number), hooks (string[], 3 éléments), followUp1 (string), followUp2 (string), objectionHandling (object avec objection et response).`,
  ],
]);

function truncateToMax(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

async function generateOutreachStrategy(input: ProspectOutreachInput): Promise<OutreachStrategy> {
  const enrichmentBlock = input.enrichmentSnippet
    ? `Enrichissement (à utiliser si pertinent) : ${input.enrichmentSnippet}`
    : "";
  const adIntelligenceSnippet = input.adIntelligenceSnippet
    ? `Contexte pubs concurrents (pour personnaliser) : ${input.adIntelligenceSnippet}`
    : "";
  // Injecter le lien calendrier dans la relance 2 (demande de RDV)
  const calendarInstruction = input.calendarLink
    ? `IMPORTANT: Dans followUp2, inclure ce lien calendrier pour réserver un appel : ${input.calendarLink} — Remplace {{calendar_link}} dans le message.`
    : "Pour followUp2, utilise {{calendar_link}} comme placeholder pour le lien de réservation.";

  const chain = conversionEnginePrompt.pipe(getClaude()).pipe(getStringParser());
  const raw = await chain.invoke({
    prospectData: input.prospectData,
    interactionContent: input.interactionContent,
    domainUrl: input.domainUrl,
    offerDescription: input.offerDescription ?? "solution du workspace",
    theme: input.theme ?? "thématique du prospect",
    enrichmentBlock: enrichmentBlock || "(aucun)",
    adIntelligenceBlock: adIntelligenceSnippet || "(aucun)",
    calendarInstruction,
  });

  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    painAnalysis: string;
    leadScore: number;
    hooks: string[];
    followUp1: string;
    followUp2: string;
    objectionHandling: { objection: string; response: string };
  };

  return {
    painAnalysis: parsed.painAnalysis ?? "",
    leadScore: Math.min(10, Math.max(1, Number(parsed.leadScore) || 5)),
    hooks: (parsed.hooks ?? []).slice(0, 3).map((h) => truncateToMax(String(h), MAX_MESSAGE_LENGTH)),
    followUp1: truncateToMax(String(parsed.followUp1 ?? ""), MAX_MESSAGE_LENGTH),
    followUp2: truncateToMax(String(parsed.followUp2 ?? ""), MAX_MESSAGE_LENGTH),
    objectionHandling: {
      objection: String(parsed.objectionHandling?.objection ?? "Pas le temps"),
      response: String(parsed.objectionHandling?.response ?? ""),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// E. UI BRIDGE — Lien direct messagerie
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit le lien direct vers la messagerie du prospect (Click-to-Send).
 * LinkedIn : formulaire message par profil. Instagram : direct avec user (si on a metaUserId).
 */
export function buildMessagingLink(prospect: {
  linkedInUrl?: string | null;
  profileUrl?: string | null;
  metaUserId?: string | null;
}, platform: "LINKEDIN" | "INSTAGRAM" | "FACEBOOK" = "LINKEDIN"): string {
  if (platform === "LINKEDIN" && prospect.linkedInUrl) {
    // LinkedIn : ouvrir le profil → l'utilisateur peut cliquer "Message"
    return prospect.linkedInUrl.startsWith("http") ? prospect.linkedInUrl : `https://linkedin.com/in/${prospect.linkedInUrl}`;
  }
  if ((platform === "INSTAGRAM" || platform === "FACEBOOK") && prospect.profileUrl) {
    return prospect.profileUrl;
  }
  if (platform === "INSTAGRAM" && prospect.metaUserId) {
    // Deep link Instagram DM (web)
    return `https://www.instagram.com/direct/t/${prospect.metaUserId}`;
  }
  if (prospect.linkedInUrl) {
    return prospect.linkedInUrl.startsWith("http") ? prospect.linkedInUrl : `https://linkedin.com/in/${prospect.linkedInUrl}`;
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════
// F. SALES CLOSER AGENT — prepareProspectOutreach
// ═══════════════════════════════════════════════════════════════════════════

export const SalesCloserAgent = {
  /**
   * Prépare la stratégie de contact pour un prospect (DB).
   * - Récupère les données prospect + workspace
   * - Vérifie hasCsoAccess, quota quotidien, crédits, spam
   * - Optionnel : Lead Enrichment + Ad-Intelligence
   * - Génère hooks (3), follow-ups (2), objection script
   * - Retourne texte généré + lien direct messagerie (UI Bridge)
   */
  async prepareProspectOutreach(
    prospectId: string,
    options: {
      userId: string;
      runEnrichment?: boolean;
      runAdIntelligence?: boolean;
      interactionContent?: string;
      platform?: "LINKEDIN" | "INSTAGRAM" | "FACEBOOK";
      /** Pour UI Bridge : lien profil (ex. Instagram) quand prospect vient du Social Prospector */
      profileUrl?: string;
      /** Pour deep link DM Instagram : metaUserId (IGSID) */
      metaUserId?: string;
    }
  ): Promise<PrepareProspectOutreachResult> {
    const {
      userId,
      runEnrichment = true,
      runAdIntelligence = false,
      interactionContent: overrideInteraction,
      platform = "LINKEDIN",
      profileUrl: optionsProfileUrl,
      metaUserId: optionsMetaUserId,
    } = options;

    // 1) Charger prospect + workspace
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { workspace: true },
    });

    if (!prospect || !prospect.workspace) {
      return { success: false, error: "Prospect ou workspace introuvable." };
    }

    const workspaceId = prospect.workspaceId;
    const workspace = prospect.workspace;

    if (!workspace?.hasCsoAccess) {
      return { success: false, error: "Accès CSO non activé pour ce workspace." };
    }

    if (await isWorkspaceBlockedForCso(workspaceId)) {
      return { success: false, error: "Workspace inaccessible." };
    }

    const quota = await getDailyQuota(workspaceId);
    const todayCount = await getTodayContactedCount(workspaceId);
    if (todayCount >= quota) {
      return {
        success: false,
        error: `Quota quotidien atteint (${quota} prospects/jour). Réessaie demain.`,
      };
    }

    const creditCheck = await hasEnoughCredits(userId, CSO_OP);
    if (!creditCheck.hasCredits) {
      return {
        success: false,
        error: `Crédits insuffisants. Requis : ${CREDIT_COSTS[CSO_OP]}, Disponibles : ${creditCheck.currentCredits}.`,
      };
    }

    // 2) Contexte pour l'IA
    const interactionContent =
      overrideInteraction ??
      (prospect.notes as string) ??
      (prospect.enrichmentData as Record<string, string> | null)?.interactionText ??
      "Aucune interaction spécifique (prospect importé).";

    const prospectData = [
      `Nom: ${prospect.name}`,
      `Entreprise: ${prospect.company}`,
      `Poste: ${prospect.jobTitle ?? "—"}`,
      `Industrie: ${prospect.industry ?? "—"}`,
      `LinkedIn: ${prospect.linkedInUrl}`,
      `Notes: ${prospect.notes ?? "—"}`,
    ].join("\n");

    let enrichmentSnippet: string | undefined;
    let adIntelligenceSnippet: string | undefined;

    if (runEnrichment) {
      enrichmentSnippet = (await enrichProspectData(prospect)) ?? undefined;
    }
    if (runAdIntelligence && (prospect.industry || prospect.company)) {
      const keyword = prospect.industry ?? prospect.company ?? "";
      adIntelligenceSnippet = (await getAdIntelligenceSnippet(keyword, workspaceId)) ?? undefined;
    }

    const input: ProspectOutreachInput = {
      prospectData,
      interactionContent,
      domainUrl: workspace.domainUrl,
      offerDescription: `solution pour ${workspace.domainUrl}`,
      theme: prospect.industry ?? undefined,
      enrichmentSnippet,
      adIntelligenceSnippet,
      calendarLink: workspace.calendarLink ?? null,
    };

    try {
      const strategy = await generateOutreachStrategy(input);
      const recommendedMessage = strategy.hooks[0] ?? "";
      const messagingLink = buildMessagingLink(
        {
          linkedInUrl: prospect.linkedInUrl,
          profileUrl: optionsProfileUrl ?? null,
          metaUserId: optionsMetaUserId ?? null,
        },
        platform
      );

      await useCredits(userId, CSO_OP);
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      await prisma.aPIUsage.create({
        data: {
          service: "cso",
          operation: CSO_OP,
          credits: CREDIT_COSTS[CSO_OP],
          workspaceId,
        },
      });

      return {
        success: true,
        strategy,
        messagingLink: messagingLink || undefined,
        platform,
        recommendedMessage,
        remainingCredits: updatedUser?.credits ?? 0,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Erreur lors de la génération de la stratégie.",
      };
    }
  },
};

export default SalesCloserAgent;
