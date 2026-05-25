/**
 * Intent signal scanner — détecte les signaux d'achat via Serper News.
 *
 * Pour chaque entreprise, lance 4 requêtes news en parallèle :
 *   FUNDING     → levée de fonds, série A/B/C, investissement
 *   HIRING      → recrutement, offres d'emploi
 *   EXPANSION   → ouverture, expansion, nouveau marché, international
 *   ACQUISITION → acquisition, rachat, partenariat, lancement produit
 *
 * Pour chaque secteur du persona :
 *   NEW_COMPANY → nouvelles entreprises créées/lancées dans ce secteur
 *
 * Retourne des IntentSignal[] prêts à être persistés.
 */

import type { SignalType } from "@prisma/client";

export interface DetectedSignal {
  type: SignalType;
  companyName: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  score: number;
}

interface SerperNewsItem {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
  source?: string;
}

interface SerperNewsResponse {
  news?: SerperNewsItem[];
}

const SIGNAL_QUERIES: Array<{
  type: SignalType;
  keywords: string;
  score: number;
}> = [
  // ── Financement ───────────────────────────────────────────────────────────
  {
    type: "FUNDING",
    keywords: "levée fonds OR funding OR série A OR série B OR investissement OR tour de table",
    score: 90,
  },
  {
    type: "SERIES_C",
    keywords: "série C OR série D OR late stage OR croissance OR growth round OR scale-up",
    score: 95,
  },
  {
    type: "IPO",
    keywords: "introduction bourse OR IPO OR cotation OR entrée bourse OR valorisation",
    score: 92,
  },
  // ── Recrutement & RH ─────────────────────────────────────────────────────
  {
    type: "HIRING",
    keywords: "recrute OR recrutement OR hiring OR offre emploi OR recherche profils OR CDI",
    score: 70,
  },
  {
    type: "LEADERSHIP_CHANGE",
    keywords: "nouveau directeur OR nouveau CEO OR nommé OR nomme OR rejoint OR directeur général OR DG OR CTO OR VP Sales",
    score: 85,
  },
  {
    type: "LAYOFF",
    keywords: "licenciements OR plan social OR réduction effectifs OR layoffs OR restructuration",
    score: 70,
  },
  // ── Croissance & marché ───────────────────────────────────────────────────
  {
    type: "EXPANSION",
    keywords: "expansion OR ouverture OR international OR nouveau bureau OR nouveau marché",
    score: 75,
  },
  {
    type: "MARKET_ENTRY",
    keywords: "nouveau segment OR entrée marché OR diversification OR nouvelle verticale OR pénètre",
    score: 80,
  },
  // ── Produit & tech ────────────────────────────────────────────────────────
  {
    type: "PRODUCT_LAUNCH",
    keywords: "lance OR lancé OR nouveau produit OR nouvelle fonctionnalité OR lancement OR release OR sortie",
    score: 80,
  },
  {
    type: "TECH_ADOPTION",
    keywords: "adopte OR intègre OR migre OR déploie OR intelligence artificielle OR IA OR cloud OR SaaS OR plateforme",
    score: 75,
  },
  // ── Corporate & deals ─────────────────────────────────────────────────────
  {
    type: "ACQUISITION",
    keywords: "acquisition OR rachat OR fusion OR partenariat OR lancement OR intègre",
    score: 80,
  },
  {
    type: "PARTNERSHIP",
    keywords: "partenariat OR collaboration OR accord OR contrat OR alliance OR deal",
    score: 72,
  },
  {
    type: "CUSTOMER_WIN",
    keywords: "nouveau client OR remporte OR sélectionné OR choisi OR contrat signé OR témoignage",
    score: 75,
  },
  {
    type: "REBRANDING",
    keywords: "rebranding OR rebrand OR nouveau nom OR nouvelle identité OR repositionnement",
    score: 65,
  },
  // ── Contexte externe ──────────────────────────────────────────────────────
  {
    type: "REGULATION",
    keywords: "réglementation OR conformité OR RGPD OR directive OR loi OR compliance OR obligation légale",
    score: 70,
  },
  {
    type: "PRICING_CHANGE",
    keywords: "nouveau tarif OR hausse prix OR baisse prix OR offre spéciale OR repricing OR forfait",
    score: 65,
  },
  // ── Visibilité & événements ───────────────────────────────────────────────
  {
    type: "AWARD",
    keywords: "lauréat OR prix OR récompense OR award OR classement OR palmarès OR trophée",
    score: 60,
  },
  {
    type: "CONFERENCE",
    keywords: "conférence OR keynote OR speaker OR présente OR salon OR forum OR événement OR webinar",
    score: 55,
  },
  {
    type: "NEWS",
    keywords: "annonce OR communiqué OR actualité OR presse OR médias OR interview OR parle de",
    score: 58,
  },
];

// ─── Classification rules ────────────────────────────────────────────────────
// Each entry = list of keywords to match against title+snippet (OR logic)
const CLASSIFICATION_RULES: Array<{
  type: SignalType;
  keywords: string[];
  score: number;
}> = SIGNAL_QUERIES.map(({ type, keywords, score }) => ({
  type,
  score,
  keywords: keywords.split(" OR ").map((k) => k.trim().toLowerCase()),
}));

function classifyNewsItem(item: SerperNewsItem): { type: SignalType; score: number } | null {
  const text = `${item.title ?? ""} ${item.snippet ?? ""}`.toLowerCase();
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { type: rule.type, score: rule.score };
    }
  }
  return null;
}

async function searchNews(query: string, num = 5): Promise<SerperNewsItem[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "fr", hl: "fr", num }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return [];
  const data: SerperNewsResponse = await res.json();
  return data.news ?? [];
}

function isRelevant(item: SerperNewsItem, company: string): boolean {
  const lower = (item.title + " " + (item.snippet ?? "")).toLowerCase();
  return lower.includes(company.toLowerCase().slice(0, 6));
}

// One broad query per company → classify locally (1 API call instead of 19)
export async function scanCompanySignals(
  companyName: string
): Promise<DetectedSignal[]> {
  const items = await searchNews(`"${companyName}"`, 10);
  const relevant = items.filter((item) => isRelevant(item, companyName));

  const signals: DetectedSignal[] = [];
  const usedTypes = new Set<SignalType>();

  for (const item of relevant) {
    const classification = classifyNewsItem(item);
    if (!classification) continue;
    // One signal per type per company scan (deduplicate locally)
    if (usedTypes.has(classification.type)) continue;
    usedTypes.add(classification.type);
    signals.push({
      type: classification.type,
      companyName,
      title: item.title,
      description: item.snippet,
      sourceUrl: item.link,
      score: classification.score,
    });
  }

  return signals;
}

export async function scanWorkspaceSignals(
  companies: Array<{ name: string; prospectId?: string }>
): Promise<Array<DetectedSignal & { prospectId?: string }>> {
  const signals: Array<DetectedSignal & { prospectId?: string }> = [];

  // Scan at most 10 companies at once to avoid rate-limit
  const batch = companies.slice(0, 10);

  const results = await Promise.allSettled(
    batch.map(async ({ name, prospectId }) => {
      const detected = await scanCompanySignals(name);
      return detected.map((s) => ({ ...s, prospectId }));
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") signals.push(...r.value);
  }

  return signals;
}

/**
 * Détecte les nouvelles entreprises créées dans les secteurs du persona.
 * Chaque résultat est un signal NEW_COMPANY sans prospectId (nouveau prospect potentiel).
 */
export async function scanNewCompaniesInSectors(
  industries: string[]
): Promise<DetectedSignal[]> {
  if (!industries.length) return [];

  const year = new Date().getFullYear();
  const signals: DetectedSignal[] = [];

  const results = await Promise.allSettled(
    industries.slice(0, 5).map(async (industry) => {
      const items = await searchNews(
        `startup OR "nouvelle entreprise" OR "société créée" OR lancée ${industry} ${year} France`
      );
      return items.slice(0, 3).map(
        (item): DetectedSignal => ({
          type: "NEW_COMPANY",
          companyName: extractCompanyName(item.title, industry),
          title: item.title,
          description: item.snippet,
          sourceUrl: item.link,
          score: 65,
        })
      );
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") signals.push(...r.value);
  }

  return signals;
}

function extractCompanyName(title: string, industry: string): string {
  // Try to extract a company name from the headline — fallback to industry label
  const colonParts = title.split(/[:\-–|]/);
  if (colonParts.length > 1) {
    const candidate = colonParts[0].trim();
    if (candidate.length > 2 && candidate.length < 60) return candidate;
  }
  return `Nouvelle entreprise (${industry})`;
}
