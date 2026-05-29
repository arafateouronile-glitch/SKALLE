/**
 * Persona Enhancer — optimise un persona brut avec l'IA pour maximiser
 * la qualité des leads sur chaque canal (Apify, Job Board, INSEE, Local Maps)
 * et génère les templates d'outreach personnalisés.
 */

import { getClaude } from "@/lib/ai/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FRENCH_SECTORS } from "@/lib/services/sales/newborn-leads";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RawPersona {
  name: string;
  industry: string;
  jobTitles: string[];
  companySizes: string[];  // ex: ["1-10", "11-50", "51-200"]
  locations: string[];
  keywords: string[];
  painPoints: string[];
}

export interface EnhancedPersona {
  // Apify peakydev/leads-scraper-ppe
  apifyQueries: string[];           // ex: ["CMO SaaS Paris 50-200 employees"]

  // Intent Signals (job boards)
  jobBoardKeywords: string[];       // ex: ["recrutement responsable marketing B2B"]
  jobBoardLocations: string[];      // ex: ["Paris", "Lyon"]

  // Newborn Radar (INSEE)
  newbornSectorCodes: string[];     // ex: ["62", "63"] (NAF 2 premiers chiffres)
  newbornLocations: string[];       // ex: ["75", "69"] (codes postaux / dept)

  // Local Maps (Google Maps)
  localMapQuery: string;            // ex: "agence marketing digital"
  localMapLocations: string[];      // ex: ["Paris", "Marseille"]

  // Outreach templates
  linkedInRequestNote: string;      // Max 300 chars, {{firstname}} allowed
  emailSubject: string;             // Subject line
  emailBody: string;                // Body avec {{firstname}}, {{company}}

  // Sequence strategy
  sequenceVariant: "linkedin_first" | "email_first" | "parallel";
}

// ─── Enhancement ─────────────────────────────────────────────────────────────

const SECTOR_LIST = FRENCH_SECTORS.slice(0, 20)
  .map((s) => `${s.code} — ${s.label}`)
  .join("\n");

export async function enhancePersona(raw: RawPersona): Promise<EnhancedPersona> {
  const llm = getClaude();

  const system = new SystemMessage({
    content: [
      {
        type: "text",
        text: `Tu es un expert en génération de leads B2B et en copywriting de prospection.
Tu reçois un persona cible brut et tu dois l'optimiser pour maximiser les résultats sur 4 canaux de prospection.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaires.

Codes NAF disponibles pour le canal INSEE (Newborn Radar) :
${SECTOR_LIST}

Structure JSON attendue :
{
  "apifyQueries": string[],
  "jobBoardKeywords": string[],
  "jobBoardLocations": string[],
  "newbornSectorCodes": string[],
  "newbornLocations": string[],
  "localMapQuery": string,
  "localMapLocations": string[],
  "linkedInRequestNote": string,
  "emailSubject": string,
  "emailBody": string,
  "sequenceVariant": "linkedin_first" | "email_first" | "parallel"
}

Règles :
- apifyQueries : 2-4 queries précises (prénom + titre + ville si possible, max 80 chars chacune)
- jobBoardKeywords : 3-5 mots-clés d'offres d'emploi révélant un besoin pour ton service
- newbornSectorCodes : codes NAF à 2 chiffres (ex: "62", "56")
- newbornLocations : codes postaux/dept courts (ex: "75", "69", "33")
- localMapQuery : 1 requête Google Maps optimale pour trouver ce type d'entreprise
- linkedInRequestNote : message de connexion naturel, 1 phrase max, sans "bonjour" générique, avec {{firstname}}
- emailSubject : objet court et accrocheur, personnalisé avec la douleur principale
- emailBody : email court (3 phrases max), commence par {{firstname}},, va droit au but sur la douleur
- sequenceVariant : "linkedin_first" si le persona est sur LinkedIn, "email_first" si pas LinkedIn, "parallel" si les deux`,
        cache_control: { type: "ephemeral" },
      },
    ],
  });

  const human = new HumanMessage(
    JSON.stringify({
      persona: raw,
      instruction: "Génère l'objet JSON EnhancedPersona optimisé pour ce persona.",
    })
  );

  const response = await llm.invoke([system, human]);
  const text = typeof response.content === "string"
    ? response.content
    : (response.content as Array<{ text?: string }>)[0]?.text ?? "";

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as EnhancedPersona;
}
