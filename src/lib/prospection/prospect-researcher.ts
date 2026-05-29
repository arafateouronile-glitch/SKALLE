/**
 * Prospect Researcher — collecte des signaux réels sur chaque prospect
 * avant la génération de messages.
 *
 * Sources :
 * - Serper (news entreprise, offres d'emploi, LinkedIn posts)
 * - linkedinProfileTool (headline, about, activité récente)
 * - Inférence IA sur les signaux collectés
 */

import { searchGoogle } from "@/lib/ai/serper";
import { linkedinProfileTool } from "@/lib/ai/tools";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProspectInput {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  linkedInUrl?: string | null;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
  intentScore?: number | null;
  source?: string | null;
}

export interface ProspectResearch {
  // Company triggers (les plus puissants pour l'icebreaker)
  companyTrigger: string | null;        // ex: "vient de lever €8M Series A il y a 2 semaines"
  companyStage: string;                 // ex: "startup en hypercroissance post-levée"
  hiringSignals: string[];              // ex: ["recrute Head of Marketing", "10 postes ouverts"]
  recentNews: string[];                 // headlines récentes
  techStack: string[];                  // technologies détectées

  // Person triggers
  linkedInHeadline: string | null;
  recentLinkedInActivity: string | null; // sujet de leur dernier post/commentaire
  jobTenure: string | null;             // "en poste depuis 7 mois" — fenêtre idéale: 3-9 mois
  recentJobChange: boolean;

  // Derived intelligence
  topPainPoint: string;                 // douleur #1 pour ce rôle + contexte entreprise
  urgencySignal: string;               // pourquoi MAINTENANT est le bon moment
  icebreakerLine: string;              // première ligne personnalisée prête à l'emploi
  suggestedAngle: "growth" | "efficiency" | "competitive" | "timing" | "pain";

  // Metadata
  researchedAt: string;
  confidence: "high" | "medium" | "low";
  serperUsed: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJobTenure(notes: string | null): { tenure: string | null; recentChange: boolean } {
  if (!notes) return { tenure: null, recentChange: false };
  const match = notes.match(/(\d+)\s*(mois|an)/i);
  if (match) {
    const months = match[2].toLowerCase().startsWith("an")
      ? parseInt(match[1]) * 12
      : parseInt(match[1]);
    return {
      tenure: match[0],
      recentChange: months <= 9,
    };
  }
  return { tenure: null, recentChange: false };
}

function inferPainPoint(jobTitle: string, companyStage: string, hiringSignals: string[]): string {
  const title = jobTitle.toLowerCase();
  const isHiring = hiringSignals.length > 0;

  if (title.includes("cmo") || title.includes("marketing") || title.includes("growth")) {
    if (isHiring) return "scaler l'acquisition sans diluer la qualité des leads";
    return "prouver le ROI marketing et générer plus de pipeline qualifié";
  }
  if (title.includes("ceo") || title.includes("président") || title.includes("founder")) {
    if (companyStage.includes("levée") || companyStage.includes("série")) {
      return "accélérer la croissance et tenir les objectifs post-levée pour les investisseurs";
    }
    return "générer un pipeline commercial prévisible et réduire le cycle de vente";
  }
  if (title.includes("sales") || title.includes("commercial") || title.includes("cro")) {
    return "augmenter le taux de conversion et réduire le temps de cycle de vente";
  }
  if (title.includes("cto") || title.includes("tech") || title.includes("engineer")) {
    return "livrer plus vite sans sacrifier la qualité et gérer la dette technique";
  }
  if (title.includes("cfo") || title.includes("finance")) {
    return "optimiser les coûts d'acquisition et améliorer le retour sur investissement commercial";
  }
  return "gagner en efficacité et obtenir des résultats mesurables plus rapidement";
}

// ─── Main Research Function ───────────────────────────────────────────────────

export async function researchProspect(
  prospect: ProspectInput
): Promise<ProspectResearch> {
  const hasSerper = !!process.env.SERPER_API_KEY;
  const companyName = prospect.company?.trim() || "";
  const personName = prospect.name?.trim() || "";
  const jobTitle = prospect.jobTitle || "";

  let companyTrigger: string | null = null;
  let hiringSignals: string[] = [];
  let recentNews: string[] = [];
  let techStack: string[] = [];
  let linkedInHeadline: string | null = null;
  let recentLinkedInActivity: string | null = null;
  let serperUsed = false;

  // ── 1. Company news + hiring signals via Serper ──────────────────────────────
  if (hasSerper && companyName) {
    try {
      // Funding / news
      const newsResults = await searchGoogle(
        `"${companyName}" levée fonds financement recrutement 2024 2025`,
        5
      );
      serperUsed = true;

      for (const r of newsResults) {
        const snippet = (r.snippet ?? "").toLowerCase();
        const title = (r.title ?? "").toLowerCase();

        // Funding detection
        if (
          snippet.includes("lève") || snippet.includes("levée") || snippet.includes("financement") ||
          snippet.includes("série") || snippet.includes("million") || snippet.includes("fundrais") ||
          title.includes("lève") || title.includes("levée") || title.includes("série")
        ) {
          const amountMatch = (r.snippet ?? "").match(/(\d+[\s,.]?\d*)\s*(millions?|M€|M\$|€|k€)/i);
          const serieMatch = (r.snippet ?? "").match(/[Ss]érie?\s*[A-D]/);
          if (amountMatch || serieMatch) {
            companyTrigger = `${r.title?.slice(0, 120)}`;
            break;
          }
        }

        // Hiring signals
        if (
          snippet.includes("recrute") || snippet.includes("recrutement") ||
          snippet.includes("hiring") || title.includes("recrute")
        ) {
          hiringSignals.push(r.title?.slice(0, 80) ?? "Recrutements actifs");
        }

        recentNews.push(r.title?.slice(0, 100) ?? "");
      }

      // Tech stack via job description keywords
      const jobResults = await searchGoogle(
        `${companyName} stack technique ingénieur développeur offre emploi`,
        3
      );
      const techKeywords = [
        "React", "Next.js", "Python", "Salesforce", "HubSpot", "Pipedrive",
        "Stripe", "AWS", "TypeScript", "Node.js", "PostgreSQL", "Notion",
      ];
      const allJobText = jobResults.map((r) => r.snippet ?? "").join(" ");
      techStack = techKeywords.filter((t) =>
        allJobText.toLowerCase().includes(t.toLowerCase())
      );
    } catch {
      // Serper optional — continue without
    }
  }

  // ── 2. LinkedIn profile via existing tool ─────────────────────────────────
  if (prospect.linkedInUrl && !prospect.linkedInUrl.includes("linkedin.com/company/")) {
    try {
      const raw = await linkedinProfileTool.func({
        linkedinUrl: prospect.linkedInUrl,
        fullName: personName,
        company: companyName,
      } as Parameters<typeof linkedinProfileTool.func>[0]);

      const data = JSON.parse(raw as string) as {
        headline?: string;
        about?: string;
        recentPosts?: Array<{ text?: string; content?: string }>;
        error?: string;
      };

      if (!data.error) {
        linkedInHeadline = data.headline ?? null;
        const latestPost = data.recentPosts?.[0];
        if (latestPost) {
          const postText = (latestPost.text ?? latestPost.content ?? "").slice(0, 150);
          if (postText.length > 20) recentLinkedInActivity = postText;
        }
      }
    } catch {
      // LinkedIn optional
    }
  }

  // ── 3. Infer tenure from notes / source ──────────────────────────────────
  const { tenure, recentChange } = extractJobTenure(prospect.notes ?? null);

  // ── 4. Determine company stage ───────────────────────────────────────────
  let companyStage = "PME établie";
  if (companyTrigger) {
    if (companyTrigger.toLowerCase().includes("série a") || companyTrigger.toLowerCase().includes("seed")) {
      companyStage = "startup en hypercroissance post-levée";
    } else if (companyTrigger.toLowerCase().includes("série b") || companyTrigger.toLowerCase().includes("série c")) {
      companyStage = "scale-up en phase d'accélération";
    }
  } else if (hiringSignals.length >= 2) {
    companyStage = "entreprise en forte expansion";
  }

  // ── 5. Derive pain point + urgency ──────────────────────────────────────
  const topPainPoint = inferPainPoint(jobTitle, companyStage, hiringSignals);

  let urgencySignal = "fenêtre d'opportunité standard";
  if (companyTrigger) urgencySignal = "post-levée = pression investisseurs pour la croissance";
  else if (recentChange) urgencySignal = "nouveau dans ce rôle (3-9 mois) = période idéale pour adopter de nouveaux outils";
  else if (hiringSignals.length > 0) urgencySignal = "recrutement actif = croissance en cours, besoin de solutions scalables";

  // ── 6. Confidence score ──────────────────────────────────────────────────
  let confidence: "high" | "medium" | "low" = "low";
  if (companyTrigger && linkedInHeadline) confidence = "high";
  else if (companyTrigger || linkedInHeadline || hiringSignals.length > 0) confidence = "medium";

  // ── 7. Suggested angle ───────────────────────────────────────────────────
  let suggestedAngle: ProspectResearch["suggestedAngle"] = "pain";
  if (companyTrigger) suggestedAngle = "timing";
  else if (recentChange) suggestedAngle = "timing";
  else if (hiringSignals.length > 0) suggestedAngle = "growth";
  else if (recentLinkedInActivity) suggestedAngle = "competitive";

  // ── 8. Icebreaker line (AI-generated when we have good signals) ──────────
  let icebreakerLine = `En tant que ${jobTitle} chez ${companyName}`;
  if (companyTrigger) {
    icebreakerLine = `J'ai vu l'annonce : ${companyTrigger.slice(0, 100)}`;
  } else if (recentLinkedInActivity) {
    icebreakerLine = `J'ai lu votre post sur "${recentLinkedInActivity.slice(0, 60)}…"`;
  } else if (hiringSignals[0]) {
    icebreakerLine = `J'ai remarqué que ${companyName} recrute activement en ce moment`;
  } else if (prospect.source === "JOB_BOARD_SIGNAL") {
    icebreakerLine = `J'ai vu que ${companyName} cherche à renforcer son équipe`;
  }

  // ── 9. For high-confidence prospects, use Claude to craft a sharper icebreaker
  if (hasSerper && confidence !== "low" && (companyTrigger || recentLinkedInActivity)) {
    try {
      const llm = getClaude();
      const system = new SystemMessage({
        content: [{
          type: "text",
          text: `Tu es expert en cold outreach B2B. Tu dois écrire UNE seule phrase d'accroche (icebreaker) pour ouvrir un message LinkedIn.
Règles strictes :
- Max 140 caractères
- Commence par "J'ai vu", "J'ai lu", "En lisant", ou directement par le fait
- Très spécifique, jamais générique
- Pas de flatterie vide ("bravo pour votre succès")
- Retourne UNIQUEMENT la phrase, rien d'autre`,
          cache_control: { type: "ephemeral" },
        }],
      });
      const human = new HumanMessage(
        `Prospect : ${personName}, ${jobTitle} chez ${companyName}
Signal principal : ${companyTrigger ?? recentLinkedInActivity ?? hiringSignals[0]}
Écris l'icebreaker :`
      );
      const r = await llm.invoke([system, human]);
      const txt = (typeof r.content === "string" ? r.content : (r.content as Array<{ text?: string }>)[0]?.text ?? "").trim();
      if (txt.length > 10 && txt.length <= 200) icebreakerLine = txt;
    } catch { /* keep default */ }
  }

  return {
    companyTrigger,
    companyStage,
    hiringSignals: hiringSignals.slice(0, 3),
    recentNews: recentNews.filter(Boolean).slice(0, 4),
    techStack: techStack.slice(0, 5),
    linkedInHeadline,
    recentLinkedInActivity,
    jobTenure: tenure,
    recentJobChange: recentChange,
    topPainPoint,
    urgencySignal,
    icebreakerLine,
    suggestedAngle,
    researchedAt: new Date().toISOString(),
    confidence,
    serperUsed,
  };
}

/**
 * Batch — recherche en parallèle (max 3 concurrent pour éviter rate-limit)
 */
export async function researchProspectsBatch(
  prospects: ProspectInput[],
  maxConcurrent = 3
): Promise<Map<string, ProspectResearch>> {
  const results = new Map<string, ProspectResearch>();

  for (let i = 0; i < prospects.length; i += maxConcurrent) {
    const batch = prospects.slice(i, i + maxConcurrent);
    const settled = await Promise.allSettled(
      batch.map((p) => researchProspect(p))
    );
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        results.set(batch[idx].id, r.value);
      }
    });
  }

  return results;
}
