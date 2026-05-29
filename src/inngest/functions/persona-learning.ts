/**
 * Persona Learning — Analyse hebdomadaire des résultats de prospection
 *
 * Chaque lundi à 8h, compare les profils qui ont ACCEPTÉ les invitations
 * vs ceux qui n'ont PAS accepté pour chaque persona actif.
 * Claude génère des suggestions d'amélioration du persona (add/remove jobTitles, keywords, etc.)
 * Stockées dans persona.enhanced.suggestions pour validation dans l'UI.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { randomBytes } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionType =
  | "add_job_title"
  | "remove_job_title"
  | "add_keyword"
  | "remove_keyword"
  | "add_location"
  | "add_pain_point";

export interface PersonaSuggestion {
  id: string;
  type: SuggestionType;
  value: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  status: "pending" | "approved" | "rejected";
  generatedAt: string;
  acceptedCount?: number;
  totalCount?: number;
}

// ─── Analyse d'un persona ─────────────────────────────────────────────────────

function stripJson(raw: string): string {
  return raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
}

async function analyzePersona(persona: {
  id: string;
  name: string;
  raw: unknown;
  enhanced: unknown;
}): Promise<void> {
  const raw = (persona.raw ?? {}) as Record<string, unknown>;
  const enhanced = (persona.enhanced ?? {}) as Record<string, unknown>;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1_000);

  // Prospects liés à ce persona avec résultat connu
  const prospects = await prisma.prospect.findMany({
    where: {
      personaId: persona.id,
      lastInteractionAt: { gte: fourteenDaysAgo },
    },
    select: {
      status: true,
      name: true,
      jobTitle: true,
      company: true,
      enrichmentData: true,
    },
    take: 100,
  });

  if (prospects.length < 5) return; // Pas assez de données

  const accepted = prospects.filter((p) => p.status === "CONTACTED" || p.status === "RESPONDED");
  const notAccepted = prospects.filter((p) => p.status === "NEW");

  if (accepted.length === 0) return; // Aucune acceptation → pas de signal

  function formatProspect(p: (typeof prospects)[0]) {
    const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
    const li = (ed.linkedIn ?? {}) as Record<string, unknown>;
    return `- ${p.name} | ${p.jobTitle ?? "N/A"} | ${p.company} | Headline: "${li.headline ?? ""}"`;
  }

  const acceptedText = accepted.slice(0, 20).map(formatProspect).join("\n");
  const notAcceptedText = notAccepted.slice(0, 20).map(formatProspect).join("\n");

  const jobTitles = Array.isArray(raw.jobTitles) ? (raw.jobTitles as string[]) : [];
  const keywords = Array.isArray(raw.keywords) ? (raw.keywords as string[]) : [];
  const locations = Array.isArray(raw.locations) ? (raw.locations as string[]) : [];

  const system = new SystemMessage({
    content: `Tu es un expert en analyse ICP (Ideal Customer Profile) B2B.
Tu analyses des données de prospection LinkedIn pour améliorer les critères de ciblage d'un persona.
Tu réponds UNIQUEMENT avec du JSON valide, sans markdown.`,
  });

  const human = new HumanMessage(`
## PERSONA : "${persona.name}"
- Secteur : ${raw.industry ?? "N/A"}
- Titres ciblés : ${jobTitles.join(", ") || "N/A"}
- Keywords ICP : ${keywords.join(", ") || "N/A"}
- Localisations : ${locations.join(", ") || "N/A"}

## PROFILS QUI ONT ACCEPTÉ L'INVITATION (${accepted.length}) — signal positif
${acceptedText || "Aucun"}

## PROFILS QUI N'ONT PAS ACCEPTÉ (${notAccepted.length}) — signal négatif
${notAcceptedText || "Aucun"}

Analyse les patterns et génère entre 2 et 5 suggestions d'amélioration du persona.

Types disponibles :
- add_job_title : ajouter un titre de poste qui convertit bien
- remove_job_title : supprimer un titre qui ne convertit pas
- add_keyword : ajouter un mot-clé ICP performant
- remove_keyword : supprimer un mot-clé peu pertinent
- add_location : ajouter une localisation prometteuse
- add_pain_point : ajouter un point de douleur identifié

Réponds avec ce JSON exact (tableau de suggestions) :
[
  {
    "type": "add_job_title",
    "value": "assistante freelance formation",
    "reason": "Présent chez 4/5 profils ayant accepté, absent chez les refus",
    "confidence": "high",
    "acceptedCount": 4,
    "totalCount": 5
  }
]
`);

  try {
    const claude = getClaude();
    const parser = getStringParser();
    const response = await claude.invoke([system, human]);
    const raw_text = await parser.invoke(response);
    const clean = stripJson(raw_text);
    const parsed = JSON.parse(clean) as Array<Omit<PersonaSuggestion, "id" | "status" | "generatedAt">>;

    if (!Array.isArray(parsed) || !parsed.length) return;

    // Construire les nouvelles suggestions (ignorer les doublons avec suggestions existantes)
    const existingSuggestions = (enhanced.suggestions as PersonaSuggestion[] | undefined) ?? [];
    const pendingValues = new Set(
      existingSuggestions.filter((s) => s.status === "pending").map((s) => `${s.type}:${s.value}`)
    );

    const newSuggestions: PersonaSuggestion[] = parsed
      .filter((s) => s.type && s.value && s.reason)
      .filter((s) => !pendingValues.has(`${s.type}:${s.value}`))
      .slice(0, 5)
      .map((s) => ({
        id: randomBytes(8).toString("hex"),
        type: s.type,
        value: s.value,
        reason: s.reason,
        confidence: s.confidence ?? "medium",
        status: "pending",
        generatedAt: new Date().toISOString(),
        acceptedCount: s.acceptedCount,
        totalCount: s.totalCount,
      }));

    if (!newSuggestions.length) return;

    // Conserver les suggestions existantes non-pending (approved/rejected) + ajouter les nouvelles
    const keptOld = existingSuggestions.filter((s) => s.status !== "pending");
    const allSuggestions = [...keptOld, ...newSuggestions].slice(-20); // Max 20 suggestions en mémoire

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newEnhanced: any = {
      ...(enhanced as object),
      suggestions: allSuggestions,
      lastAnalyzedAt: new Date().toISOString(),
      analysisStats: {
        accepted: accepted.length,
        notAccepted: notAccepted.length,
        acceptanceRate: Math.round((accepted.length / prospects.length) * 100),
      },
    };

    await prisma.persona.update({
      where: { id: persona.id },
      data: { enhanced: newEnhanced },
    });

    console.log(`[PersonaLearning] ${newSuggestions.length} suggestion(s) générée(s) pour "${persona.name}"`);
  } catch (err) {
    console.error(`[PersonaLearning] Erreur analyse "${persona.name}":`, err);
  }
}

// ─── Inngest function ─────────────────────────────────────────────────────────

export const personaWeeklyLearning = inngest.createFunction(
  { id: "persona-weekly-learning", name: "Persona — Analyse hebdo & suggestions ICP" },
  { cron: "0 8 * * 1" }, // Lundi 8h
  async ({ step }) => {
    const personas = await step.run("fetch-active-personas", async () =>
      prisma.persona.findMany({
        where: { status: { in: ["ACTIVE", "RUNNING"] } },
        select: { id: true, name: true, raw: true, enhanced: true },
      })
    );

    for (const persona of personas) {
      await step.run(`analyze-${persona.id}`, () => analyzePersona(persona));
    }

    return { analyzed: personas.length };
  }
);

export const personaLearningManual = inngest.createFunction(
  { id: "persona-learning-manual", name: "Persona — Analyse manuelle" },
  { event: "persona/learning.manual" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    const personas = await step.run("fetch-personas", async () =>
      prisma.persona.findMany({
        where: { workspaceId, status: { in: ["ACTIVE", "RUNNING", "PAUSED"] } },
        select: { id: true, name: true, raw: true, enhanced: true },
      })
    );

    for (const persona of personas) {
      await step.run(`analyze-${persona.id}`, () => analyzePersona(persona));
    }

    return { analyzed: personas.length };
  }
);
