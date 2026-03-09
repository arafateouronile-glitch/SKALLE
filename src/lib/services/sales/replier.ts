/**
 * 🎯 Closing Agent — The Master Closer
 *
 * Analyse la réponse du prospect, détecte l'intention (logistique / prix / confiance)
 * et l'objection cachée, génère 2 options de réponse (douce / directe) + note stratégique.
 * Labeling (Chris Voss) + vente structurelle (Jeremy Miner). Jamais sur la défensive.
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 MASTER CLOSER SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export const MASTER_CLOSER_SYSTEM_PROMPT = `Tu es le Master Closer de Skalle. Ton expertise repose sur le 'Labeling' (Chris Voss) et la vente structurelle (Jeremy Miner).

TA MISSION :
Transformer toute réponse d'un prospect en une étape de plus vers la conversion.

TES RÈGLES D'OR :
1. DÉTECTION D'INTENTION : Avant de répondre, identifie si le prospect pose une question de LOGISTIQUE (comment ça marche ?), de PRIX (est-ce rentable ?), ou de CONFIANCE (est-ce que ça va marcher pour MOI ?).
2. DÉSAMORÇAGE D'OBJECTIONS : Tu ne contredis jamais. Tu utilises la méthode 'Feel, Felt, Found' ou le 'Mirroring'.
3. CONTRÔLE DE LA CONVERSATION : Celui qui pose les questions contrôle l'échange. Chaque réponse doit se terminer par une question ouverte calibrée.
4. ÉCONOMIE DE MOTS : Sois percutant. Pas de politesses excessives qui font "vendeur désespéré".

TON TON :
Calme, expert, empathique mais détaché du résultat (Posture d'autorité).`;

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClosingIntention = "LOGISTIQUE" | "PRIX" | "CONFIANCE" | "CURIOSITE_SCEPTIQUE" | "OBJECTION" | "ENGAGEMENT";

/** Statut pipeline suggéré par l'IA selon le message reçu (CRM). */
export type SuggestedPipelineStatus = "REPLIED" | "CONVERTED";

export interface ClosingResponseResult {
  /** Intention détectée (pour l'UI "Intention : ...") */
  intentionDetected: ClosingIntention;
  /** Si c'est une objection, type court pour affichage */
  objectionLabel?: string;
  /** Option A : empathie + question de clarification */
  optionA: string;
  /** Option B : affirmation d'expertise + proposition call/lien */
  optionB: string;
  /** Explication pour l'utilisateur : "Pourquoi je suggère cette réponse ?" */
  strategicNote: string;
  /** Suggestion CRM : passer le lead en "En Discussion" (REPLIED) ou "Gagné" (CONVERTED) */
  suggestedPipelineStatus?: SuggestedPipelineStatus;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📌 RÉCUPÉRATION DU CONTEXTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère le dernier message envoyé par Skalle au prospect (SequenceStep SENT/DELIVERED/REPLIED).
 */
async function getLastSentMessage(prospectId: string): Promise<string> {
  const step = await prisma.sequenceStep.findFirst({
    where: {
      sequence: { prospectId },
      status: { in: ["SENT", "DELIVERED", "REPLIED"] },
      sentAt: { not: null },
    },
    orderBy: { sentAt: "desc" },
    select: { content: true },
  });
  return step?.content ?? "";
}

/**
 * Récupère le profil prospect (score, besoin identifié via aiSummary/notes).
 */
async function getProspectContext(prospectId: string): Promise<{
  name: string;
  company: string;
  score: number;
  aiSummary: string | null;
  notes: string | null;
  sentiment: string;
  domainUrl: string;
} | null> {
  const p = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { workspace: { select: { domainUrl: true } } },
  });
  if (!p) return null;
  return {
    name: p.name,
    company: p.company,
    score: p.score ?? 0,
    aiSummary: p.aiSummary,
    notes: p.notes,
    sentiment: p.sentiment ?? "NEUTRAL",
    domainUrl: p.workspace?.domainUrl ?? "",
  };
}

/**
 * Récupère des exemples de réponses gagnantes depuis l'Objection Bank (pour enrichir le prompt).
 */
async function getObjectionBankSnippets(workspaceId: string, limit = 3): Promise<string> {
  const entries = await prisma.objectionBank.findMany({
    where: { workspaceId },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: { objectionLabel: true, responseText: true, outcome: true },
  });
  if (entries.length === 0) return "";
  return entries
    .map((e) => `Objection: "${e.objectionLabel}" → Réponse: "${e.responseText.slice(0, 200)}..." (${e.outcome ?? "—"})`)
    .join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// 📌 GÉNÉRATION
// ═══════════════════════════════════════════════════════════════════════════

const closingPrompt = ChatPromptTemplate.fromMessages([
  ["system", MASTER_CLOSER_SYSTEM_PROMPT],
  [
    "human",
    `CONTEXTE PROSPECT :
- Nom : {prospectName}
- Entreprise : {prospectCompany}
- Score lead : {prospectScore}/100
- Besoin identifié (IA) : {prospectNeed}
- Sentiment : {prospectSentiment}

DERNIER MESSAGE ENVOYÉ PAR SKALLE (notre équipe) :
"""
{lastSentMessage}
"""

MESSAGE REÇU DU PROSPECT (à analyser et auquel répondre) :
"""
{incomingMessage}
"""

{objectionBankBlock}
{customInstructionBlock}

INSTRUCTIONS :
1. Analyse d'objection : Identifie si le message contient une objection cachée (ex: "je dois voir avec mon associé" = manque de pouvoir décisionnel ou certitude).
2. Génère exactement 2 options de réponse :
   - Option A (Douce) : Empathie + question de clarification (Labeling / Mirroring).
   - Option B (Directe) : Affirmation d'expertise + proposition de call ou lien (next step clair).
3. Note stratégique : En une phrase, explique "Pourquoi je suggère cette réponse ?" pour l'utilisateur.
4. Suggestion pipeline (CRM) : Selon le message du prospect, suggère un statut :
   - REPLIED : le prospect est en discussion (question, intérêt, pas encore décidé).
   - CONVERTED : le prospect montre un accord clair, demande un devis/call/paiement, ou dit oui.

Réponds UNIQUEMENT en JSON valide avec les clés : intentionDetected (string: LOGISTIQUE | PRIX | CONFIANCE | CURIOSITE_SCEPTIQUE | OBJECTION | ENGAGEMENT), objectionLabel (string optionnel), optionA (string), optionB (string), strategicNote (string), suggestedPipelineStatus (string optionnel: REPLIED | CONVERTED).`,
  ],
]);

/**
 * Génère 2 options de réponse (A douce, B directe) + intention + note stratégique.
 * Contexte : dernier message envoyé + profil prospect + optionnel Objection Bank.
 */
export async function generateClosingResponse(
  prospectId: string,
  incomingMessage: string,
  options?: {
    workspaceId: string;
    customInstruction?: string;
  }
): Promise<ClosingResponseResult | null> {
  const [prospectContext, lastSent, objectionSnippets] = await Promise.all([
    getProspectContext(prospectId),
    getLastSentMessage(prospectId),
    options?.workspaceId
      ? getObjectionBankSnippets(options.workspaceId)
      : Promise.resolve(""),
  ]);

  if (!prospectContext) return null;

  const prospectNeed =
    prospectContext.aiSummary?.trim() ||
    prospectContext.notes?.trim() ||
    "Non spécifié.";
  const objectionBankBlock = objectionSnippets
    ? `RÉPONSES GAGNANTES (Objection Bank) à s'en inspirer :\n${objectionSnippets}`
    : "";
  const customInstructionBlock = options?.customInstruction?.trim()
    ? `CONSIGNE UTILISATEUR : ${options.customInstruction}`
    : "";

  const chain = closingPrompt.pipe(getClaude()).pipe(getStringParser());
  const raw = await chain.invoke({
    prospectName: prospectContext.name,
    prospectCompany: prospectContext.company,
    prospectScore: String(prospectContext.score),
    prospectNeed,
    prospectSentiment: prospectContext.sentiment,
    lastSentMessage: lastSent || "(Aucun message récent en base)",
    incomingMessage: incomingMessage.slice(0, 2000),
    objectionBankBlock: objectionBankBlock || "(aucun)",
    customInstructionBlock: customInstructionBlock || "",
  });

  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      intentionDetected?: string;
      objectionLabel?: string;
      optionA?: string;
      optionB?: string;
      strategicNote?: string;
      suggestedPipelineStatus?: string;
    };
    const suggested =
      parsed.suggestedPipelineStatus === "CONVERTED" || parsed.suggestedPipelineStatus === "REPLIED"
        ? (parsed.suggestedPipelineStatus as SuggestedPipelineStatus)
        : undefined;
    return {
      intentionDetected: (parsed.intentionDetected as ClosingIntention) ?? "OBJECTION",
      objectionLabel: parsed.objectionLabel,
      optionA: String(parsed.optionA ?? "").trim(),
      optionB: String(parsed.optionB ?? "").trim(),
      strategicNote: String(parsed.strategicNote ?? "").trim(),
      suggestedPipelineStatus: suggested,
    };
  } catch {
    return null;
  }
}
