import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { Prospect } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TraitFrequency {
  value: string;
  frequency: number;
}

export interface LookalikeTraits {
  jobTitles: TraitFrequency[];
  industries: TraitFrequency[];
  locations: TraitFrequency[];
  companies: TraitFrequency[];
  companySizes: TraitFrequency[];
  totalProspects: number;
}

export interface SynthesizedICP {
  summary: string;
  targetJobTitles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  targetCompanySizes: string[];
  searchQueries: string[];
  keywords: string[];
}

export interface LookalikeResult {
  name: string;
  company: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  linkedInUrl?: string;
  location?: string;
  industry?: string;
  similarityScore: number;
  matchReasons: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT TRAITS - Analyse des traits communs d'une liste
// ═══════════════════════════════════════════════════════════════════════════

function countFrequencies(items: (string | null | undefined)[]): TraitFrequency[] {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item && item.trim()) {
      const normalized = item.trim().toLowerCase();
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([value, frequency]) => ({ value, frequency }))
    .sort((a, b) => b.frequency - a.frequency);
}

export function extractTraits(prospects: Prospect[]): LookalikeTraits {
  return {
    jobTitles: countFrequencies(prospects.map((p) => p.jobTitle)),
    industries: countFrequencies(prospects.map((p) => p.industry)),
    locations: countFrequencies(prospects.map((p) => p.location)),
    companies: countFrequencies(prospects.map((p) => p.company)),
    companySizes: countFrequencies(prospects.map((p) => p.companySize)),
    totalProspects: prospects.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNTHESIZE ICP - Utilise Claude pour generer un ICP + requetes de recherche
// ═══════════════════════════════════════════════════════════════════════════

const lookalikeICPPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en prospection B2B et en ciblage de profils similaires (Lookalike Audiences).

A partir des caracteristiques frequentes d'une liste de prospects existants, tu dois:
1. Synthetiser un Ideal Customer Profile (ICP)
2. Generer 3-5 requetes de recherche Google optimisees pour trouver des profils LinkedIn similaires

REGLES pour les requetes Google:
- Chaque requete doit commencer par "site:linkedin.com/in"
- Combiner titre de poste + industrie/mot-cle + localisation
- Varier les combinaisons pour couvrir differents angles
- Utiliser des guillemets pour les expressions multi-mots
- Ne pas repeter la meme combinaison

Reponds UNIQUEMENT en JSON valide avec cette structure exacte:
{{
  "summary": "Description de l'ICP en 2-3 phrases en francais",
  "targetJobTitles": ["titre1", "titre2"],
  "targetIndustries": ["industrie1"],
  "targetLocations": ["lieu1"],
  "targetCompanySizes": ["taille1"],
  "searchQueries": [
    "site:linkedin.com/in query1",
    "site:linkedin.com/in query2"
  ],
  "keywords": ["keyword1", "keyword2"]
}}`,
  ],
  [
    "human",
    `Voici les caracteristiques frequentes de {totalProspects} prospects existants:

**Titres de poste (top 10):**
{jobTitles}

**Industries (top 10):**
{industries}

**Localisations (top 10):**
{locations}

**Entreprises (top 10):**
{companies}

**Tailles d'entreprise:**
{companySizes}

Genere l'ICP et les requetes de recherche optimisees.`,
  ],
]);

function formatTop(items: TraitFrequency[], max: number = 10): string {
  if (items.length === 0) return "Non disponible";
  return items
    .slice(0, max)
    .map((item) => `- ${item.value} (${item.frequency}x)`)
    .join("\n");
}

function buildFallbackQueries(traits: LookalikeTraits): string[] {
  const queries: string[] = [];
  const topTitles = traits.jobTitles.slice(0, 3);
  const topLocations = traits.locations.slice(0, 2);
  const topIndustries = traits.industries.slice(0, 2);

  for (const title of topTitles) {
    const parts = [`site:linkedin.com/in`, `"${title.value}"`];
    if (topIndustries[0]) parts.push(topIndustries[0].value);
    if (topLocations[0]) parts.push(topLocations[0].value);
    queries.push(parts.join(" "));
  }

  return queries.slice(0, 5);
}

export async function synthesizeICP(traits: LookalikeTraits): Promise<SynthesizedICP> {
  const chain = lookalikeICPPrompt.pipe(getClaude()).pipe(getStringParser());

  const result = await chain.invoke({
    totalProspects: String(traits.totalProspects),
    jobTitles: formatTop(traits.jobTitles),
    industries: formatTop(traits.industries),
    locations: formatTop(traits.locations),
    companies: formatTop(traits.companies),
    companySizes: formatTop(traits.companySizes),
  });

  try {
    const cleaned = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as SynthesizedICP;
  } catch {
    // Fallback deterministe si l'AI retourne du JSON invalide
    return {
      summary: "Profil type base sur l'analyse de la liste existante.",
      targetJobTitles: traits.jobTitles.slice(0, 5).map((t) => t.value),
      targetIndustries: traits.industries.slice(0, 3).map((t) => t.value),
      targetLocations: traits.locations.slice(0, 3).map((t) => t.value),
      targetCompanySizes: traits.companySizes.slice(0, 3).map((t) => t.value),
      searchQueries: buildFallbackQueries(traits),
      keywords: traits.jobTitles.slice(0, 3).map((t) => t.value),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORE SIMILARITY - Scorer un lead par rapport a l'ICP
// ═══════════════════════════════════════════════════════════════════════════

export function scoreSimilarity(
  lead: {
    jobTitle?: string;
    industry?: string;
    location?: string;
    company?: string;
    companySize?: string;
  },
  icp: SynthesizedICP,
  originalCompanies: Set<string>
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Titre de poste (40 pts max)
  if (lead.jobTitle) {
    const titleLower = lead.jobTitle.toLowerCase();
    const exactMatch = icp.targetJobTitles.some(
      (t) =>
        titleLower.includes(t.toLowerCase()) ||
        t.toLowerCase().includes(titleLower)
    );
    if (exactMatch) {
      score += 40;
      reasons.push(`Titre: ${lead.jobTitle}`);
    } else {
      const keywordMatch = icp.keywords.some((k) =>
        titleLower.includes(k.toLowerCase())
      );
      if (keywordMatch) {
        score += 20;
        reasons.push(`Titre similaire: ${lead.jobTitle}`);
      }
    }
  }

  // Industrie (25 pts)
  if (lead.industry) {
    const industryLower = lead.industry.toLowerCase();
    const match = icp.targetIndustries.some((i) =>
      industryLower.includes(i.toLowerCase())
    );
    if (match) {
      score += 25;
      reasons.push(`Industrie: ${lead.industry}`);
    }
  }

  // Localisation (20 pts)
  if (lead.location) {
    const locationLower = lead.location.toLowerCase();
    const match = icp.targetLocations.some((l) =>
      locationLower.includes(l.toLowerCase())
    );
    if (match) {
      score += 20;
      reasons.push(`Localisation: ${lead.location}`);
    }
  }

  // Taille entreprise (10 pts)
  if (lead.companySize) {
    const match = icp.targetCompanySizes.some(
      (s) => s.toLowerCase() === lead.companySize!.toLowerCase()
    );
    if (match) {
      score += 10;
      reasons.push(`Taille: ${lead.companySize}`);
    }
  }

  // Bonus nouvelle entreprise (5 pts)
  if (lead.company && !originalCompanies.has(lead.company.toLowerCase())) {
    score += 5;
    reasons.push("Nouvelle entreprise");
  }

  return { score: Math.min(100, score), reasons };
}
