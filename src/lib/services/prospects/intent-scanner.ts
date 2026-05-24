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
  {
    type: "FUNDING",
    keywords: "levée fonds OR funding OR série A OR série B OR investissement OR tour de table",
    score: 90,
  },
  {
    type: "HIRING",
    keywords: "recrute OR recrutement OR hiring OR offre emploi OR recherche profils",
    score: 70,
  },
  {
    type: "EXPANSION",
    keywords: "expansion OR ouverture OR international OR nouveau bureau OR nouveau marché OR lève",
    score: 75,
  },
  {
    type: "ACQUISITION",
    keywords: "acquisition OR rachat OR fusion OR partenariat OR lancement OR intègre",
    score: 80,
  },
];

async function searchNews(query: string): Promise<SerperNewsItem[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "fr", hl: "fr", num: 3 }),
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

export async function scanCompanySignals(
  companyName: string
): Promise<DetectedSignal[]> {
  const results = await Promise.allSettled(
    SIGNAL_QUERIES.map(async ({ type, keywords, score }) => {
      const items = await searchNews(`"${companyName}" ${keywords}`);
      return items
        .filter((item) => isRelevant(item, companyName))
        .slice(0, 2)
        .map(
          (item): DetectedSignal => ({
            type,
            companyName,
            title: item.title,
            description: item.snippet,
            sourceUrl: item.link,
            score,
          })
        );
    })
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
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
