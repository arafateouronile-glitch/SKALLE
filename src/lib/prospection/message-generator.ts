/**
 * Message Generator — génère des séquences hyper-personnalisées
 * à partir des données research + contexte de marque.
 *
 * Chaque message est ancré sur un signal spécifique, jamais générique.
 * Taux de réponse cible : 25-40% (vs 3-8% pour les templates).
 */

import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { ProspectResearch } from "./prospect-researcher";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProspectProfile {
  id: string;
  name: string;
  firstName: string;
  company: string;
  jobTitle: string;
  email?: string | null;
  linkedInUrl?: string | null;
}

export interface BrandContext {
  companyName: string;
  offer: string;
  tone: "formal" | "professional" | "friendly";
  uniqueValue: string;
  targetResult: string;   // ex: "doubler le pipeline en 90 jours"
  socialProof?: string;   // ex: "clients : Doctolib, Qonto, Alan"
}

export interface OutreachSequence {
  linkedInRequest: string;            // Note de connexion (<300 chars)
  linkedInMessage1: string;           // 1er message après acceptation (valeur)
  emailSubject: string;               // Objet email principal
  emailBody: string;                  // Corps email (~120 mots)
  emailFollowUpSubject: string;       // Objet relance (J+5)
  emailFollowUpBody: string;          // Corps relance (~80 mots)
  linkedInFollowUp: string;           // Follow-up LinkedIn (J+7, ~80 chars)
  personalizedReason: string;         // Explication interne du pourquoi de la personnalisation
  angle: string;                      // Angle choisi (ex: "timing post-levée")
}

// ─── System prompt (cached) ───────────────────────────────────────────────────

const GENERATOR_SYSTEM = `Tu es le meilleur copywriter B2B outreach d'Europe. Tes messages obtiennent 30-40% de taux de réponse.

Principes fondamentaux de tes messages :

**1. TRIGGER → PONT → VALEUR → CTA**
Chaque message suit ce schéma :
- TRIGGER : le fait précis que tu as observé (levée, post, recrutement, etc.)
- PONT : lien logique avec la douleur que ça crée
- VALEUR : ce que tu apportes SPÉCIFIQUEMENT pour résoudre ça
- CTA : une seule action, simple, à faible friction

**2. RÈGLES ABSOLUES**
- LinkedIn connexion : JAMAIS de pitch, JAMAIS de lien. Juste : trigger + observation + question légère
- Email : le nom de leur entreprise ou leur prénom apparaît dans les 4 premiers mots
- Aucun message ne peut commencer par "Je me permets" ou "Je voulais juste"
- Pas de "solutions" dans le corps des messages
- Pas de "Cordialement," comme seule signature — ajoute toujours le prénom de l'expéditeur

**3. LONGUEUR**
- LinkedIn connexion : strict max 280 caractères
- LinkedIn message 1 : 80-120 mots
- Email corps : 80-140 mots
- Email follow-up : 50-80 mots
- LinkedIn follow-up : strict max 120 caractères

**4. FORMULES QUI CONVERTISSENT**
- Ouvertures fortes : "J'ai vu que...", "En lisant...", "[Prénom], vous avez [action spécifique]..."
- Questions qui engagent : fermées ou très simples ("oui/non", "ça vous parle ?")
- CTA à faible friction : "15 min cette semaine ?" > "Planifier un appel de 30 minutes"

Réponds en JSON strict, sans markdown. Structure imposée.`;

// ─── Generator ───────────────────────────────────────────────────────────────

export async function generateOutreachSequence(
  prospect: ProspectProfile,
  research: ProspectResearch,
  brand: BrandContext
): Promise<OutreachSequence> {
  const llm = getClaude();

  const system = new SystemMessage({
    content: [{
      type: "text",
      text: GENERATOR_SYSTEM,
      cache_control: { type: "ephemeral" },
    }],
  });

  const toneLabel = {
    formal: "très professionnel, vouvoiement",
    professional: "professionnel mais direct, vouvoiement",
    friendly: "décontracté, tutoiement si naturel",
  }[brand.tone];

  const researchContext = [
    research.companyTrigger ? `🔥 TRIGGER FORT : ${research.companyTrigger}` : null,
    research.hiringSignals.length > 0 ? `💼 RECRUTEMENTS : ${research.hiringSignals.join(", ")}` : null,
    research.recentLinkedInActivity ? `📝 ACTIVITÉ LINKEDIN : "${research.recentLinkedInActivity}"` : null,
    research.recentJobChange ? `🆕 CHANGEMENT DE POSTE RÉCENT (fenêtre idéale 3-9 mois)` : null,
    research.linkedInHeadline ? `👤 HEADLINE LINKEDIN : "${research.linkedInHeadline}"` : null,
    research.techStack.length > 0 ? `🛠️ STACK DÉTECTÉE : ${research.techStack.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const human = new HumanMessage(`
## PROSPECT
Prénom : ${prospect.firstName}
Nom complet : ${prospect.name}
Poste : ${prospect.jobTitle}
Entreprise : ${prospect.company}
Email disponible : ${prospect.email ? "OUI" : "NON"}
LinkedIn disponible : ${prospect.linkedInUrl ? "OUI" : "NON"}

## SIGNALS DÉTECTÉS
${researchContext || "Pas de signal fort — utilise les infos disponibles"}

## CONTEXTE ENTREPRISE
Stage : ${research.companyStage}
Douleur principale identifiée : ${research.topPainPoint}
Angle recommandé : ${research.suggestedAngle}
Signal d'urgence : ${research.urgencySignal}
Icebreaker pré-calculé : "${research.icebreakerLine}"

## NOTRE OFFRE (${brand.companyName})
${brand.offer}
Résultat concret : ${brand.targetResult}
${brand.socialProof ? `Preuves sociales : ${brand.socialProof}` : ""}
Valeur unique : ${brand.uniqueValue}

## TON
${toneLabel}

## INSTRUCTIONS
Génère la séquence outreach complète. Utilise OBLIGATOIREMENT le trigger/signal le plus fort.
Ne copie pas l'icebreaker tel quel — retravaille-le pour le rendre encore plus précis.
Chaque message doit pouvoir être lu en 15 secondes et obtenir une réponse.

Retourne CE JSON EXACT (rien d'autre, pas de markdown) :
{
  "linkedInRequest": "...",
  "linkedInMessage1": "...",
  "emailSubject": "...",
  "emailBody": "...",
  "emailFollowUpSubject": "...",
  "emailFollowUpBody": "...",
  "linkedInFollowUp": "...",
  "personalizedReason": "...",
  "angle": "..."
}
`);

  const response = await llm.invoke([system, human]);
  const raw = typeof response.content === "string"
    ? response.content
    : (response.content as Array<{ text?: string }>)[0]?.text ?? "";

  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
  return JSON.parse(cleaned) as OutreachSequence;
}

/**
 * Version légère pour le CSO Agent — génère juste les messages clés
 * sans la séquence complète (plus rapide, moins de tokens)
 */
export async function generateCsoMessages(
  prospect: ProspectProfile,
  research: ProspectResearch,
  brand: BrandContext,
  actionType: "LINKEDIN" | "EMAIL" | "FOLLOWUP",
  lastMessage?: string
): Promise<{ subject?: string; content: string; angle: string }> {
  const llm = getClaude();

  const researchSummary = [
    research.companyTrigger ? `Trigger : ${research.companyTrigger}` : null,
    research.hiringSignals[0] ? `Recrutement : ${research.hiringSignals[0]}` : null,
    research.recentLinkedInActivity ? `Activité : "${research.recentLinkedInActivity}"` : null,
    `Douleur : ${research.topPainPoint}`,
    `Urgence : ${research.urgencySignal}`,
    `Icebreaker : "${research.icebreakerLine}"`,
  ].filter(Boolean).join("\n");

  const instructions: Record<typeof actionType, string> = {
    LINKEDIN: `Génère une note de connexion LinkedIn. MAX 280 chars. Pas de pitch. Utilise le trigger.
Retourne : { "content": "...", "angle": "..." }`,
    EMAIL: `Génère un email (objet + corps ~120 mots). Corps commence par le prénom.
Retourne : { "subject": "...", "content": "...", "angle": "..." }`,
    FOLLOWUP: `Génère un message de relance (${lastMessage ? "suite à : " + lastMessage.slice(0, 80) : "pas de contexte"}).
Angle différent du premier message. ~70 mots max.
Retourne : { "subject": "...", "content": "...", "angle": "..." }`,
  };

  const system = new SystemMessage({
    content: [{
      type: "text",
      text: GENERATOR_SYSTEM,
      cache_control: { type: "ephemeral" },
    }],
  });

  const human = new HumanMessage(`
PROSPECT : ${prospect.firstName} ${prospect.name} — ${prospect.jobTitle} @ ${prospect.company}
SIGNALS :
${researchSummary}
OFFRE : ${brand.offer} | Résultat : ${brand.targetResult}
TON : ${brand.tone}

${instructions[actionType]}`);

  const response = await llm.invoke([system, human]);
  const raw = typeof response.content === "string"
    ? response.content
    : (response.content as Array<{ text?: string }>)[0]?.text ?? "";

  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
  return JSON.parse(cleaned) as { subject?: string; content: string; angle: string };
}

// ─── Brand context builder ─────────────────────────────────────────────────

export function buildBrandContext(
  workspaceName: string,
  brandVoice: Record<string, unknown> | null
): BrandContext {
  const bv = brandVoice ?? {};
  const persona = (bv.marketingPersona ?? {}) as Record<string, unknown>;

  return {
    companyName: workspaceName,
    offer: (bv.offer ?? persona.uniqueValueProp ?? process.env.COMPANY_OFFER ?? "Solution d'automatisation commerciale IA") as string,
    tone: ((persona.tone ?? bv.tone ?? "professional") as string).includes("amical") || ((persona.tone ?? bv.tone ?? "") as string).includes("friend") ? "friendly" : "professional",
    uniqueValue: (persona.uniqueValueProp ?? bv.differentiator ?? "IA spécialisée en prospection B2B") as string,
    targetResult: (bv.targetResult ?? "doubler le pipeline commercial en 90 jours") as string,
    socialProof: (bv.socialProof ?? persona.socialProof ?? "") as string,
  };
}
