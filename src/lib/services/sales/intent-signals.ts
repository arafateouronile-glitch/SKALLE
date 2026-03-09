/**
 * 🎯 B2B Intent Signal Engine (Job Board Scraper)
 *
 * Génère des leads B2B à partir des offres d'emploi (signaux d'intention).
 * Workflow: API Jobs → LLM analyse l'offre → Hook personnalisé → Lead en "Nouveau" dans le CRM.
 */

import { getClaude } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { prisma } from "@/lib/prisma";
import { useCredits, CREDIT_COSTS, type OperationType } from "@/lib/credits";
import { searchGoogle } from "@/lib/ai/serper";
import { randomBytes } from "crypto";

const MAX_OFFERS_PER_CALL = 10;
const SIGNAL_OPERATION: OperationType = "job_board_signals";

// ═══════════════════════════════════════════════════════════════════════════
// 📡 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface JobSignal {
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  description: string;
  location?: string;
}

/** Signal analysé par l'IA (avec Hook + contexte enrichi) — pour affichage dans le Radar avant ajout au CRM */
export interface AnalyzedSignal extends JobSignal {
  hook: string;
  scannedAt: string; // ISO
  intentScore?: number;       // Score d'intention d'achat (0-100)
  techStack?: string[];       // Technologies détectées
  hasRecentFunding?: boolean; // Levée de fonds récente
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INTÉGRATION API (Scraping) — SerpApi Google Jobs ou mock
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les offres d'emploi via SerpApi Google Jobs (si clé configurée),
 * sinon via Serper + extraction Claude, sinon mock.
 */
export async function fetchJobSignals(
  keyword: string,
  location: string
): Promise<{ signals: JobSignal[]; isMockData: boolean }> {
  // 1. SerpApi (Google Jobs structuré — optimal)
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (serpApiKey) {
    try {
      const params = new URLSearchParams({
        engine: "google_jobs",
        q: `${keyword} ${location}`.trim(),
        api_key: serpApiKey,
      });
      const res = await fetch(
        `https://serpapi.com/search.json?${params.toString()}`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) throw new Error(`SerpApi error: ${res.status}`);
      const data = (await res.json()) as {
        jobs_results?: Array<{
          title?: string;
          company_name?: string;
          link?: string;
          description?: string;
          location?: string;
        }>;
      };
      const jobs = data.jobs_results ?? [];
      return {
        signals: jobs.slice(0, MAX_OFFERS_PER_CALL).map((j) => ({
          companyName: j.company_name ?? "Entreprise",
          jobTitle: j.title ?? keyword,
          jobUrl: j.link ?? "",
          description: j.description ?? "",
          location: j.location,
        })),
        isMockData: false,
      };
    } catch (err) {
      console.error("[IntentSignals] SerpApi error:", err);
    }
  }

  // 2. Serper + extraction Claude (fallback si SERPER_API_KEY configurée)
  if (process.env.SERPER_API_KEY) {
    try {
      const signals = await fetchJobSignalsFromSerper(keyword, location);
      if (signals.length > 0) return { signals, isMockData: false };
    } catch (err) {
      console.error("[IntentSignals] Serper fallback error:", err);
    }
  }

  // 3. Données de démonstration — configurez SERPAPI_API_KEY ou SERPER_API_KEY pour les vraies offres
  console.warn("[IntentSignals] Aucune API configurée — données de démonstration utilisées");
  return { signals: getMockJobSignals(keyword, location), isMockData: true };
}

/**
 * Fallback : recherche Serper + extraction structurée via Claude.
 * Renvoie de vraies entreprises qui recrutent, extraites des snippets Google.
 */
async function fetchJobSignalsFromSerper(
  keyword: string,
  location: string
): Promise<JobSignal[]> {
  const query = `"${keyword}" "${location}" site:welcometothejungle.com OR site:linkedin.com/jobs OR site:indeed.fr`;
  const results = await searchGoogle(query, 10);
  if (results.length === 0) return [];

  const rawText = results
    .map((r, i) => `[${i + 1}] Titre: ${r.title}\nURL: ${r.link}\nExtrait: ${r.snippet}`)
    .join("\n\n---\n\n");

  const llm = getClaude();
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `Tu es un extracteur d'offres d'emploi B2B. Analyse ces résultats Google et extrait les entreprises individuelles qui recrutent.
Cherche dans les extraits (snippets) les noms d'entreprises réels (pas les pages qui listent des centaines d'offres).
Retourne UNIQUEMENT un JSON array valide (sans markdown, sans \`\`\`), max 10 entrées:
[{"companyName":"...","jobTitle":"...","jobUrl":"...","description":"...","location":"..."}]
Si tu ne trouves aucune entreprise spécifique, retourne [].`,
    ],
    ["human", "Mot-clé : {keyword} | Lieu : {location}\n\n{rawText}"],
  ]);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const json = await chain.invoke({ keyword, location, rawText });

  const parsed = JSON.parse(json.trim()) as Array<{
    companyName?: string;
    jobTitle?: string;
    jobUrl?: string;
    description?: string;
    location?: string;
  }>;

  return parsed.slice(0, MAX_OFFERS_PER_CALL).map((j) => ({
    companyName: j.companyName ?? "Entreprise",
    jobTitle: j.jobTitle ?? keyword,
    jobUrl: j.jobUrl ?? "",
    description: j.description ?? "",
    location: j.location ?? location,
  }));
}

function getMockJobSignals(keyword: string, location: string): JobSignal[] {
  const companies = [
    "ScaleUp Media",
    "Growth Labs",
    "Content Studio",
    "Digital First",
    "Lead Factory",
    "Revenue Hub",
    "B2B Agency",
    "Growth Partners",
    "Content Engine",
    "Sales Lab",
  ];
  return companies.slice(0, MAX_OFFERS_PER_CALL).map((company, i) => ({
    companyName: company,
    jobTitle: keyword,
    jobUrl: `https://example.com/jobs/${i + 1}`,
    description: `Recherche d'un profil ${keyword} pour renforcer l'équipe. Mission: création de contenu, stratégie, animation des communautés. CDI basé à ${location || "Paris"}.`,
    location: location || "Paris",
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. INTELLIGENCE CONTEXTUELLE — Technographie + Signaux de croissance
// ═══════════════════════════════════════════════════════════════════════════

export interface CompanyContext {
  techStack: string[];          // Technologies détectées (CRM, Marketing, ERP)
  hasRecentFunding: boolean;    // Levée de fonds récente
  isGrowthPhase: boolean;       // Phase d'expansion (recrutements massifs)
  intentScore: number;          // 0-100 : signal d'achat
  contextSummary: string;       // Résumé pour le prompt IA
}

/**
 * Enrichit un signal avec le contexte de l'entreprise via Serper.
 * Détecte la tech stack, les levées de fonds et les signaux de croissance.
 * Ne génère jamais d'erreur — retourne un contexte vide si l'API échoue.
 */
export async function fetchCompanyContext(companyName: string): Promise<CompanyContext> {
  const defaultContext: CompanyContext = {
    techStack: [],
    hasRecentFunding: false,
    isGrowthPhase: false,
    intentScore: 50, // Signal de base : offre d'emploi = déjà 50
    contextSummary: "",
  };

  try {
    const currentYear = new Date().getFullYear();
    const [techResults, fundingResults] = await Promise.allSettled([
      searchGoogle(`"${companyName}" tech stack outils CRM marketing automation`, 3),
      searchGoogle(`"${companyName}" levée fonds financement series ${currentYear} ${currentYear - 1}`, 3),
    ]);

    const techStack: string[] = [];
    if (techResults.status === "fulfilled") {
      const combinedText = techResults.value.map((r) => r.snippet + " " + r.title).join(" ").toLowerCase();
      const techKeywords = ["hubspot", "salesforce", "marketo", "mailchimp", "klaviyo", "shopify", "wordpress", "notion", "slack", "zendesk", "intercom", "segment"];
      techKeywords.forEach((tech) => {
        if (combinedText.includes(tech)) techStack.push(tech);
      });
    }

    let hasRecentFunding = false;
    if (fundingResults.status === "fulfilled" && fundingResults.value.length > 0) {
      const combinedText = fundingResults.value.map((r) => r.snippet + " " + r.title).join(" ").toLowerCase();
      hasRecentFunding = combinedText.includes("levée") || combinedText.includes("series") || combinedText.includes("million") || combinedText.includes("funding");
    }

    // Calcul de l'intentScore
    let intentScore = 50; // Base : offre d'emploi
    if (hasRecentFunding) intentScore += 25; // Financement récent = budget disponible
    if (techStack.length > 0) intentScore += 10; // Déjà outillé = maturité digitale
    intentScore = Math.min(100, intentScore);

    const contextParts: string[] = [];
    if (techStack.length > 0) contextParts.push(`Tech stack détectée: ${techStack.join(", ")}`);
    if (hasRecentFunding) contextParts.push("Levée de fonds récente détectée → budget disponible");

    return {
      techStack,
      hasRecentFunding,
      isGrowthPhase: true, // On est déjà dans le flux job board = phase de croissance
      intentScore,
      contextSummary: contextParts.join(" | ") || "Aucun contexte enrichi",
    };
  } catch {
    return defaultContext;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE CERVEAU — Analyse IA de l'offre + Hook B2B enrichi
// ═══════════════════════════════════════════════════════════════════════════

const HOOK_SYSTEM_PROMPT = `Tu es un expert en closing B2B. Analyse cette offre d'emploi.
Rédige UN SEUL message court (Hook) pour le CEO ou DRH de cette entreprise.
Objectif : le convaincre d'utiliser notre Agent IA Skalle (149€/mois) au lieu de recruter ce poste à temps plein.
- Sois percutant, pas de bla-bla.
- Chiffre le ROI si possible (ex: "45 000 €/an + charges pour un junior vs 1 788 €/an pour Skalle").
- Ton direct, professionnel, une phrase d'accroche + une proposition de test.
- Maximum 2-3 phrases. Pas de formule de politesse longue.`;

/**
 * Analyse l'offre et génère un message d'accroche (Hook) pour le prospect.
 * Intègre le contexte de l'entreprise (tech stack, financement) si fourni.
 */
export async function analyzeJobAndGenerateHook(
  jobDescription: string,
  companyName: string,
  context?: CompanyContext
): Promise<string> {
  const llm = getClaude();

  const contextSection = context?.contextSummary
    ? `\n\nContexte enrichi de l'entreprise : ${context.contextSummary}`
    : "";

  const techHint = context?.techStack?.length
    ? `\nIls utilisent déjà: ${context.techStack.join(", ")} → adapte le message en montrant comment Skalle s'y intègre ou les remplace.`
    : "";

  const fundingHint = context?.hasRecentFunding
    ? "\nLevée de fonds récente → ils ont du budget : propose un essai premium."
    : "";

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", HOOK_SYSTEM_PROMPT + contextSection + techHint + fundingHint],
    [
      "human",
      "Entreprise : {companyName}\n\nOffre :\n{jobDescription}",
    ],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const hook = await chain.invoke({
    companyName,
    jobDescription: jobDescription.slice(0, 3000),
  });
  return hook.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ALIMENTATION DU CRM (Prisma)
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessSignalsResult {
  success: boolean;
  created: number;
  error?: string;
  creditsUsed?: number;
  isMockData?: boolean; // true quand aucune API n'est configurée (données de démo)
}

/**
 * Récupère les offres, les analyse avec l'IA, crée les Leads en status NEW
 * et source JOB_BOARD_SIGNAL. Limite 10 offres, déduction des crédits avant exécution.
 */
export async function processAndSaveSignals(
  userId: string,
  workspaceId: string,
  keyword: string,
  location: string
): Promise<ProcessSignalsResult> {
  const cost = CREDIT_COSTS[SIGNAL_OPERATION];

  // Déduire les crédits avant l'exécution
  const creditResult = await useCredits(userId, SIGNAL_OPERATION, {
    workspaceId,
    keyword,
    location,
  });

  if (!creditResult.success) {
    return {
      success: false,
      created: 0,
      error: creditResult.error ?? "Crédits insuffisants",
    };
  }

  let jobSignals: JobSignal[] = [];
  let isMockData = false;

  try {
    const result = await fetchJobSignals(keyword, location);
    jobSignals = result.signals;
    isMockData = result.isMockData;
  } catch (err) {
    console.error("[IntentSignals] fetchJobSignals failed:", err);
    return {
      success: false,
      created: 0,
      error: err instanceof Error ? err.message : "Erreur lors de la récupération des offres",
      creditsUsed: cost,
    };
  }

  let created = 0;

  for (const job of jobSignals) {
    try {
      // Enrichir le contexte de l'entreprise (technographie + signaux)
      const context = await fetchCompanyContext(job.companyName);

      const hook = await analyzeJobAndGenerateHook(
        job.description,
        job.companyName,
        context
      );

      // Email unique par lead (contrainte @@unique([email, workspaceId]))
      const uniqueEmail = `signal+${randomBytes(8).toString("hex")}@job.skalle`;

      await prisma.prospect.create({
        data: {
          name: job.companyName,
          email: uniqueEmail,
          linkedInUrl: job.jobUrl || `https://linkedin.com/company/${job.companyName.replace(/\s+/g, "-").toLowerCase()}`,
          company: job.companyName,
          jobTitle: job.jobTitle,
          location: job.location ?? undefined,
          notes: `Offre: ${job.jobTitle} — Source: Radar à Signaux${context.contextSummary ? ` | ${context.contextSummary}` : ""}`,
          status: "NEW",
          source: "JOB_BOARD_SIGNAL",
          suggestedHook: hook,
          platform: "LINKEDIN",
          intentScore: context.intentScore,
          workspaceId,
        },
      });
      created++;
    } catch (err) {
      console.error(`[IntentSignals] Failed to create lead for ${job.companyName}:`, err);
      // Continue avec les autres offres
    }
  }

  return {
    success: true,
    created,
    creditsUsed: cost,
    isMockData,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SCAN SANS SAUVEGARDE (pour UI Radar — afficher puis "Ajouter au CRM")
// ═══════════════════════════════════════════════════════════════════════════

export interface ScanSignalsResult {
  success: boolean;
  signals?: AnalyzedSignal[];
  error?: string;
  creditsUsed?: number;
  isMockData?: boolean;
}

/**
 * Récupère les offres, les analyse avec l'IA, retourne les signaux avec hooks sans les sauvegarder.
 * Déduit les crédits avant exécution.
 */
export async function scanSignalsWithoutSaving(
  userId: string,
  keyword: string,
  location: string
): Promise<ScanSignalsResult> {
  const cost = CREDIT_COSTS[SIGNAL_OPERATION];
  const creditResult = await useCredits(userId, SIGNAL_OPERATION, { keyword, location });
  if (!creditResult.success) {
    return { success: false, error: creditResult.error ?? "Crédits insuffisants", creditsUsed: cost };
  }

  let jobSignals: JobSignal[] = [];
  let isMockData = false;
  try {
    const fetched = await fetchJobSignals(keyword, location);
    jobSignals = fetched.signals;
    isMockData = fetched.isMockData;
  } catch (err) {
    console.error("[IntentSignals] fetchJobSignals failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur lors de la récupération des offres",
      creditsUsed: cost,
    };
  }

  const now = new Date().toISOString();
  const results = await Promise.allSettled(
    jobSignals.map(async (job) => {
      const context = await fetchCompanyContext(job.companyName);
      const hook = await analyzeJobAndGenerateHook(job.description, job.companyName, context);
      return {
        ...job,
        hook,
        intentScore: context.intentScore,
        techStack: context.techStack,
        hasRecentFunding: context.hasRecentFunding,
        scannedAt: now,
      } as AnalyzedSignal;
    })
  );

  const signals: AnalyzedSignal[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      signals.push(result.value);
    } else {
      console.error(`[IntentSignals] analyze failed for ${jobSignals[i].companyName}:`, result.reason);
    }
  });

  return { success: true, signals, creditsUsed: cost, isMockData };
}

/**
 * Enregistre un signal analysé dans le CRM (un seul prospect).
 */
export async function saveSignalToCrm(
  workspaceId: string,
  signal: AnalyzedSignal
): Promise<{ success: boolean; prospectId?: string; error?: string }> {
  try {
    const uniqueEmail = `signal+${randomBytes(8).toString("hex")}@job.skalle`;
    const prospect = await prisma.prospect.create({
      data: {
        name: signal.companyName,
        email: uniqueEmail,
        linkedInUrl: signal.jobUrl || `https://linkedin.com/company/${signal.companyName.replace(/\s+/g, "-").toLowerCase()}`,
        company: signal.companyName,
        jobTitle: signal.jobTitle,
        location: signal.location ?? undefined,
        notes: `Offre: ${signal.jobTitle} — Source: Radar à Signaux`,
        status: "NEW",
        source: "JOB_BOARD_SIGNAL",
        suggestedHook: signal.hook,
        platform: "LINKEDIN",
        intentScore: signal.intentScore,
        workspaceId,
      },
    });
    return { success: true, prospectId: prospect.id };
  } catch (err) {
    console.error("[IntentSignals] saveSignalToCrm failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur lors de l'ajout au CRM",
    };
  }
}
