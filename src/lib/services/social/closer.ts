/**
 * 🎯 SocialCloser - IA de Personnalisation (Le "Closer")
 *
 * Transforme les prospects importés (ex: membres de groupes Facebook)
 * en accroches conversationnelles ultra-humaines pour initier des DM.
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProspectProfile {
  prospectName: string;
  prospectHandle?: string;
  profileUrl?: string;
  groupName: string;
  groupUrl?: string;
  interactionText?: string; // Si le prospect a commenté dans le groupe
}

export interface WorkspaceObjectives {
  domainUrl: string;
  brandVoice?: unknown;
  offerDescription?: string; // Ex: "un outil de marketing automatisé", "une formation en SEO"
  theme?: string; // Thématique du groupe (ex: "le marketing digital", "l'entrepreneuriat")
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const openingMessagePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en prospection relationnelle et en messages d'approche authentiques.

Ta mission : rédiger une accroche d'ouverture de conversation pour un DM (message direct) à un prospect rencontré dans un groupe Facebook.

STRUCTURE OBLIGATOIRE (adapte le wording) :
1. Salutation personnalisée (Salut [Nom], Hey [Prénom], ...)
2. Référence au groupe : "j'ai vu que tu faisais partie du groupe [Nom du Groupe]"
3. Crédibilité partagée : "je m'intéresse aussi à [thématique du groupe/offre]"
4. Transition douce vers ta valeur : "j'ai créé un outil / une ressource / une solution qui pourrait t'aider..."

RÈGLES CRUCIALES :
- Le message doit rester ULTRA-HUMAIN, comme si un ami écrivait
- Pas de mots spam : éviter "opportunité", "gratuit", "incroyable", "révolutionnaire", "sans engagement", "cliquez ici"
- Longueur : 150-250 caractères max (limite DM)
- Tutoiement naturel
- Pas de liste à puces, pas de CTA agressif
- Une seule idée principale, fluide

Réponds UNIQUEMENT avec le message brut, sans guillemets ni préambule.`,
  ],
  [
    "human",
    `Prospect :
- Nom : {prospectName}
- Groupe : {groupName}
- Contexte optionnel (commentaire dans le groupe) : {interactionText}

Objectifs / offre du workspace :
- Domaine : {domainUrl}
- Description de l'offre : {offerDescription}
- Thématique cible : {theme}

Ton de voix : {brandVoice}

Génère l'accroche d'ouverture.`,
  ],
]);

// ═══════════════════════════════════════════════════════════════════════════
// 📤 FONCTION PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une accroche d'ouverture personnalisée pour un prospect importé d'un groupe.
 * Exemple : "Salut Marie, j'ai vu que tu faisais partie du groupe Marketing Digital FR, je m'intéresse aussi au growth, j'ai créé un outil qui pourrait t'aider à automatiser tes campagnes..."
 */
export async function generateOpeningMessage(
  prospect: ProspectProfile,
  objectives: WorkspaceObjectives
): Promise<string> {
  const chain = openingMessagePrompt.pipe(getClaude()).pipe(getStringParser());

  const brandVoiceStr = objectives.brandVoice
    ? JSON.stringify(objectives.brandVoice, null, 2)
    : "Ton professionnel et amical, conversationnel.";

  const result = await chain.invoke({
    prospectName: prospect.prospectName,
    groupName: prospect.groupName,
    interactionText: prospect.interactionText || "(aucun - simple membre du groupe)",
    domainUrl: objectives.domainUrl,
    offerDescription:
      objectives.offerDescription ||
      `une solution liée à ${objectives.domainUrl}`,
    theme: objectives.theme || "la thématique du groupe",
    brandVoice: brandVoiceStr,
  });

  return result.trim().replace(/^["']|["']$/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 VARIANTES (pour intégration avec le flux DM)
// ═══════════════════════════════════════════════════════════════════════════

export interface DMVariant {
  label: string;
  message: string;
}

const openingMessageVariantsPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en prospection relationnelle. Génère 3 variantes d'accroche pour un DM à un prospect d'un groupe Facebook.

Structure de chaque message :
1. Salutation (Salut [Nom], Hey [Prénom]...)
2. Référence au groupe : "j'ai vu que tu faisais partie du groupe [Nom]"
3. Crédibilité : "je m'intéresse aussi à [thématique]"
4. Valeur : "j'ai créé un outil/ressource qui pourrait t'aider..."

Chaque variante doit avoir un ton différent : Chaleureuse, Directe, Curieuse.
- Chaleureuse : ton amical, empathique
- Directe : ton franc, efficace
- Curieuse : ton qui pose une question ou intrigue

RÈGLES : ultra-humain, pas de spam (éviter gratuit, incroyable, opportunité), 150-250 caractères, tutoiement.
Réponds UNIQUEMENT en JSON : [{"label":"Chaleureuse","message":"..."},{"label":"Directe","message":"..."},{"label":"Curieuse","message":"..."}]`,
  ],
  [
    "human",
    `Prospect : {prospectName} | Groupe : {groupName} | Contexte : {interactionText}
Offre : {offerDescription} | Thématique : {theme}
Ton : {brandVoice}`,
  ],
]);

/**
 * Génère 3 variantes d'accroche (format DMVariant) pour intégration avec le flux Social Prospector.
 */
export async function generateOpeningMessageVariants(
  prospect: ProspectProfile,
  objectives: WorkspaceObjectives
): Promise<DMVariant[]> {
  const chain = openingMessageVariantsPrompt.pipe(getClaude()).pipe(getStringParser());
  const brandVoiceStr = objectives.brandVoice
    ? JSON.stringify(objectives.brandVoice, null, 2)
    : "Professionnel et amical.";
  const result = await chain.invoke({
    prospectName: prospect.prospectName,
    groupName: prospect.groupName,
    interactionText: prospect.interactionText || "simple membre du groupe",
    offerDescription: objectives.offerDescription || `une solution (${objectives.domainUrl})`,
    theme: objectives.theme || "la thématique du groupe",
    brandVoice: brandVoiceStr,
  });
  const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}
