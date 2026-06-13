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
  productFeatures?: string[]; // fonctionnalités à citer nommément (ex: ["eIDAS", "BPF en 1 clic"])
  websiteUrl?: string;        // URL du site à inclure dans les messages (ex: "https://eduzen.fr")
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

const GENERATOR_SYSTEM = `Tu es un expert copywriter B2B outreach ultra-personnalisé. Tes messages obtiennent 30-40% de taux de réponse car ils montrent que tu as VRAIMENT lu le profil du prospect — pas un template.

## ÉTAPE 1 — ANALYSER L'ARCHÉTYPE DU PROSPECT (obligatoire)

Lis attentivement le titre/headline du prospect et identifie son archétype :

**UTILISATEUR DIRECT** — il est lui-même la cible finale du produit
→ Signes : gérant, directeur, fondateur, responsable de l'activité cible
→ Angle : sa frustration quotidienne est [la douleur]. Notre produit élimine cette douleur → il retrouve du temps pour son vrai métier (former, vendre, créer...).

**PRESCRIPTEUR / CONSULTANT / INTERMÉDIAIRE** — il gère ou conseille des clients qui sont la cible finale
→ Signes : consultant, assistante, freelance, bras droit, prestataire, accompagnateur, expert auprès de X, auditeur, formateur de formateurs
→ Angle DOUBLE : (1) notre outil le rend plus productif sur chaque dossier client = il prend plus de clients = il gagne plus. (2) programme partenaire avec commission récurrente sur chaque client équipé = revenu passif. TOUJOURS mentionner les deux angles.

**ENTERPRISE / RÉSEAU** — grande structure avec 15+ collaborateurs, multi-sites, national
→ Signes : "150 formateurs", "national", "réseau", "groupe", "multi-sites", "franchise", plusieurs établissements
→ Angle : à leur échelle, [la douleur] devient un défi opérationnel majeur. Notre outil centralise, automatise et garantit la conformité pour l'ensemble du réseau sans alourdir le quotidien des équipes.

## ÉTAPE 2 — CONSTRUIRE LE MESSAGE

- **Les 2 premières phrases** montrent que tu as lu son profil (cite son rôle exact, sa réalité quotidienne, un détail précis)
- **La douleur nommée** est SPÉCIFIQUE à son archétype — jamais générique ("gestion administrative" → trop vague ; "courir après les feuilles d'émargement de 12 clients" → parfait)
- **La valeur** est présentée en termes de gain concret pour CET archétype (temps, argent, risque évité)
- **Pour les prescripteurs** : toujours mentionner le programme partenaire/commission si disponible dans l'offre
- **Si des fonctionnalités produit nommées sont fournies** (ex. eIDAS, BPF, piste d'audit) : cite-les NOMMÉMENT quand elles sont pertinentes pour l'archétype. Ne les invente jamais — utilise uniquement celles listées dans le contexte.
- **CTA** unique et à faible friction (10 min, échange rapide, "ça vous parle ?")

## ÉTAPE 3 — RÈGLES ABSOLUES

- JAMAIS "Je me permets" / "Je voulais juste" / "solutions" / "Cordialement," seul
- LinkedIn note de connexion : MAX 280 chars, pas de pitch, observation + question légère
- LinkedIn message post-connexion : commence par "Bonjour [Prénom], merci pour la connexion !" — 180-250 mots — conversationnel, empathique, montrer qu'on a vraiment lu
- MIROIR DE VOCABULAIRE : identifie 3-4 expressions EXACTES du prospect dans sa headline/about et réutilise-les littéralement (ex : si il écrit "OF débordés", répète "OF débordés" — jamais "organismes de formation surchargés")
- PROGRAMME PARTENAIRE : si le prospect est un prescripteur ET que le contexte de marque mentionne un % de commission, cite ce % nommément dans le message (ex: "20% de commission récurrente à vie")
- Email : commence par le prénom, objet < 7 mots, 100-140 mots, signe avec "[Ton Prénom]"
- Le message doit donner l'impression que l'expéditeur a passé 10 minutes à lire le profil

Réponds en JSON strict, sans markdown.`;

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

  const expSummary = research.linkedInExperiences?.slice(0, 3)
    .map((e) => `${e.title} @ ${e.company}${e.description ? ` — "${e.description.slice(0, 100)}"` : ""}`)
    .join(" | ") ?? "";

  const researchContext = [
    research.companyTrigger ? `🔥 TRIGGER FORT : ${research.companyTrigger}` : null,
    research.hiringSignals.length > 0 ? `💼 RECRUTEMENTS : ${research.hiringSignals.join(", ")}` : null,
    research.recentLinkedInActivity ? `📝 ACTIVITÉ LINKEDIN : "${research.recentLinkedInActivity}"` : null,
    research.recentJobChange ? `🆕 CHANGEMENT DE POSTE RÉCENT (fenêtre idéale 3-9 mois)` : null,
    research.linkedInHeadline ? `👤 HEADLINE LINKEDIN : "${research.linkedInHeadline}"` : null,
    research.linkedInAbout ? `📋 SECTION "À PROPOS" LINKEDIN (source du miroir vocabulaire) :\n"${research.linkedInAbout.slice(0, 1000)}"` : null,
    expSummary ? `💼 EXPÉRIENCES : ${expSummary}` : null,
    research.techStack.length > 0 ? `🛠️ STACK DÉTECTÉE : ${research.techStack.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const featuresSection = brand.productFeatures?.length
    ? `\n## FONCTIONNALITÉS PRODUIT (à citer nommément si pertinentes)\n${brand.productFeatures.map((f) => `- ${f}`).join("\n")}\n`
    : "";

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
${brand.websiteUrl ? `Site web : ${brand.websiteUrl}` : ""}
${featuresSection}
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

  const expSummary = research.linkedInExperiences?.slice(0, 3).map(
    (e) => `${e.title} @ ${e.company}${e.description ? ` — "${e.description.slice(0, 120)}"` : ""}`
  ).join(" | ") ?? "";

  const researchSummary = [
    research.linkedInHeadline ? `Headline LinkedIn : "${research.linkedInHeadline}"` : null,
    research.linkedInAbout ? `Section "À propos" LinkedIn : "${research.linkedInAbout.slice(0, 800)}"` : null,
    expSummary ? `Expériences : ${expSummary}` : null,
    research.companyTrigger ? `Trigger entreprise : ${research.companyTrigger}` : null,
    research.hiringSignals[0] ? `Recrutement : ${research.hiringSignals[0]}` : null,
    research.recentLinkedInActivity ? `Activité LinkedIn récente : "${research.recentLinkedInActivity}"` : null,
    `Douleur identifiée : ${research.topPainPoint}`,
    research.urgencySignal !== "N/A" ? `Urgence : ${research.urgencySignal}` : null,
    research.icebreakerLine ? `Icebreaker suggéré : "${research.icebreakerLine}"` : null,
  ].filter(Boolean).join("\n");

  const instructions: Record<typeof actionType, string> = {
    LINKEDIN: `Génère le MESSAGE POST-CONNEXION (envoyé après acceptation de l'invitation). Commence OBLIGATOIREMENT par "Bonjour [Prénom], merci pour la connexion !". 180-250 mots. MIROIR OBLIGATOIRE : identifie 3-4 expressions exactes du prospect dans sa headline/about et réutilise-les littéralement dans ton message (ex : s'il dit "OF débordés", tu écris "OF débordés", pas autre chose). Identifie l'archétype. Nomme sa douleur en reprenant ses propres mots. Présente la solution. Si archétype=prescripteur ET commission disponible dans le contexte marque : cite le % exact. CTA : échange de 10 min.
"angle" : archétype identifié + angle choisi (ex: "Prescripteur → double productivité + commission 20%")
Retourne : { "content": "...", "angle": "..." }`,
    EMAIL: `Génère un email (objet + corps 100-140 mots). Corps commence par le prénom. Analyse l'archétype du prospect depuis son titre.
Retourne : { "subject": "...", "content": "...", "angle": "..." }`,
    FOLLOWUP: `Génère un message de relance (${lastMessage ? "contexte : " + lastMessage.slice(0, 100) : "pas de contexte"}).
Angle différent du premier message. 60-80 mots max. CTA différent du précédent.
Retourne : { "subject": "...", "content": "...", "angle": "..." }`,
  };

  const system = new SystemMessage({
    content: [{
      type: "text",
      text: GENERATOR_SYSTEM,
      cache_control: { type: "ephemeral" },
    }],
  });

  const csoFeaturesSection = brand.productFeatures?.length
    ? `\nFonctionnalités à citer nommément si pertinentes :\n${brand.productFeatures.map((f) => `- ${f}`).join("\n")}`
    : "";

  const human = new HumanMessage(`
## PROSPECT
Prénom : ${prospect.firstName}
Nom complet : ${prospect.name}
TITRE / HEADLINE LINKEDIN : "${prospect.jobTitle || "non disponible"}"
Entreprise : ${prospect.company || "non disponible"}

## SIGNAUX TERRAIN
${researchSummary || "Pas de signal externe — utilise le titre LinkedIn pour personnaliser"}

## NOTRE PRODUIT — ${brand.companyName}
Offre : ${brand.offer}
Valeur unique : ${brand.uniqueValue}
Résultat concret : ${brand.targetResult}
${brand.socialProof ? `Références : ${brand.socialProof}` : ""}
${brand.websiteUrl ? `Site web : ${brand.websiteUrl}` : ""}${csoFeaturesSection}
Ton : ${brand.tone}

## MISSION
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
  const icp = (bv.icp ?? {}) as Record<string, unknown>;

  const keywords = Array.isArray(bv.keywords) ? (bv.keywords as string[]) : [];
  const icpPainPoints = Array.isArray(icp.painPoints) ? (icp.painPoints as string[]) : [];
  const icpJobTitles = Array.isArray(icp.jobTitles) ? (icp.jobTitles as string[]) : [];
  const targetAudience = (bv.targetAudience as string) ?? "";

  const rawOffer = (bv.offer ?? persona.uniqueValueProp) as string | undefined;
  const productKeywords = keywords
    .filter((k) => !["essai gratuit", "formation"].includes(k.toLowerCase()))
    .slice(0, 5);
  const offer =
    rawOffer ??
    (targetAudience
      ? [
          `Logiciel de gestion pour ${targetAudience}.`,
          productKeywords.length > 0 ? `Automatise : ${productKeywords.join(", ")}.` : null,
          icpPainPoints.length > 0 ? `Résout : ${icpPainPoints.slice(0, 2).join(" et ")}.` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : (process.env.COMPANY_OFFER ?? "Solution d'automatisation commerciale IA"));

  const toneStr = (persona.tone ?? bv.tone ?? "professional") as string;
  const tone: BrandContext["tone"] =
    toneStr.includes("amical") || toneStr.includes("friend") ? "friendly" : "professional";

  const uniqueValue =
    ((persona.uniqueValueProp as string | undefined) ??
      (bv.differentiator as string | undefined)) ??
    (icpPainPoints.length > 0
      ? `Élimine ${icpPainPoints[0]}${icpJobTitles.length > 0 ? ` pour les ${icpJobTitles[0]}` : ""}`
      : "Solution spécialisée pour votre secteur");

  const targetResult =
    (bv.targetResult as string | undefined) ??
    (targetAudience
      ? `Supprimer la charge administrative pour ${targetAudience.split(" ").slice(0, 6).join(" ")}`
      : "Automatiser les tâches chronophages pour se concentrer sur le cœur de métier");

  const productFeatures = Array.isArray(bv.productFeatures)
    ? (bv.productFeatures as string[]).filter((f) => typeof f === "string" && f.length > 0)
    : undefined;

  const websiteUrl = (bv.websiteUrl as string | undefined)?.trim() || undefined;

  return {
    companyName: workspaceName,
    offer,
    tone,
    uniqueValue,
    targetResult,
    socialProof: (bv.socialProof ?? persona.socialProof ?? "") as string,
    ...(productFeatures?.length ? { productFeatures } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
  };
}
