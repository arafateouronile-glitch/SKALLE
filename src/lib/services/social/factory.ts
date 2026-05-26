/**
 * 🚀 Social Growth Factory
 *
 * Transforme un article SEO + insights publicitaires en campagne sociale multi-plateforme.
 * Génère LinkedIn, X/Twitter, Instagram et TikTok en parallèle via Claude + Nano Banana.
 *
 * Objectif : < 15 secondes total (texte + images en parallèle)
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  generateNanoBananaImageRaw,
  type NanaBananaStyleReference,
} from "@/lib/services/image/nano-banana";

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AdInsights {
  /** Structure publicitaire gagnante (ex: AIDA, PAS, BRIDGE) */
  winning_ad_framework?: string;
  /** Hooks performants extraits des meilleures pubs */
  hooks?: string[];
  /** CTA qui convertit le mieux */
  cta?: string;
  /** Ton identifié dans les pubs gagnantes */
  tone?: string;
  /** Audience cible identifiée */
  targetAudience?: string;
}

export interface SocialCampaignInput {
  /** Contenu complet de l'article SEO (sera tronqué à 3 000 chars) */
  seoArticleContent: string;
  /** Mot-clé principal de l'article */
  keyword: string;
  /** Insights issus de l'Ad Intelligence (optionnel) */
  adInsights?: AdInsights;
  /** ID du workspace Skalle */
  workspaceId: string;
  /** ID de l'utilisateur (pour logs) */
  userId: string;
  /** ID du ContentPlan à lier (optionnel) */
  contentPlanId?: string;
  /** Générer les images via Nano Banana (défaut: true) */
  generateImages?: boolean;
}

export interface PlatformPost {
  postId: string;
  type: "LINKEDIN" | "X" | "INSTAGRAM" | "TIKTOK" | "FACEBOOK";
  content: string;
  imageUrl?: string | null;
}

export interface SocialCampaign {
  linkedin: PlatformPost;
  twitter: PlatformPost;
  instagram: PlatformPost;
  tiktok: PlatformPost;
  facebook: PlatformPost;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 PROMPT — Viral Growth Architect
// ═══════════════════════════════════════════════════════════════════════════

const VIRAL_GROWTH_SYSTEM_PROMPT = `Tu es un architecte de contenu viral — expert en psychologie de l'engagement et en conversion organique.

Ta mission : ne pas délivrer de l'information. Créer une réponse émotionnelle si forte que le lecteur ne peut pas scroller sans réagir.

L'algorithme LinkedIn mesure la vitesse d'engagement. Les commentaires pèsent plus que les likes, les sauvegardes plus que les commentaires. Il optimise pour l'intensité émotionnelle — pas pour la valeur informationnelle. Ton travail : ingénier cette intensité.

## Les 6 déclencheurs émotionnels du contenu viral

**1. Validation d'identité** — Articule ce que la cible ressent mais n'a jamais dit. Quand ils se sentent "vus", ils commentent par réflexe.
Ex : "Tu ne perds pas de clients à cause de ton offre. Tu les perds parce que tu as peur d'afficher ton vrai prix."

**2. Signal de statut** — Le lecteur partage ce qui le fait paraître bien. Question clé : qu'est-ce que partager ce post dit sur celui qui le partage ?

**3. Appartenance tribale** — In-group/out-group clair. Personne ne veut être du mauvais côté.
Ex : "Il y a deux types de fondateurs : ceux qui obsèdent sur leur nombre d'abonnés, et ceux qui obsèdent sur leur ARR."

**4. Inconfort productif** — L'inconfort crée l'action. Mais il doit avoir une sortie claire, sinon il repousse.
Ex : "Ton 'lead magnet', c'est un PDF fait en une après-midi. Tu demandes à des prospects de t'échanger leurs coordonnées contre quelque chose que tu ne paierais pas toi-même 5€."

**5. Curiosity gap** — Tension entre ce que le lecteur sait et ce qu'il VEUT savoir. Nombres précis + savoir exclusif = irresistible.
Ex : "Le post LinkedIn qui m'a booké 47 appels en 72h (framework exact ci-dessous)."

**6. Aspiration et possibilité** — L'outcome doit sembler ambitieux MAIS atteignable.
Ex : "Comment je suis passé de 0 à 42k€ MRR en 90 jours avec uniquement LinkedIn."

## Règle absolue sur les données et chiffres

- N'utilise JAMAIS de statistiques inventées ou non vérifiables
- Chaque chiffre doit être sourcé inline : "selon LinkedIn" / "d'après une étude HubSpot 2023" / "McKinsey rapporte que…"
- Si tu n'as pas de donnée vérifiable, remplace par : anecdote, observation directe, ou formulation sans chiffre — c'est plus honnête et souvent plus percutant
- Les chiffres personnels (résultats d'un client, expérience directe) sont autorisés : c'est de la preuve, pas de la statistique

## Structure émotionnelle à empiler

curiosity gap (hook) → validation d'identité (problème) → appartenance tribale (nous vs eux) → preuve de valeur → aspiration + crédibilité (offre/CTA)

## Adaptation plateforme-native

- **LinkedIn** : paragraphes de 1-2 lignes max, sauts de ligne après chaque idée, ton expert direct, CTA final sous forme de question ou micro-engagement. Jamais de mur de texte.
- **Facebook** : storytelling personnel, ton chaleureux, question communauté, CTA à commentaire
- **Twitter/X** : chaque tweet doit pouvoir être cité seul, tension narrative entre les tweets
- **Instagram** : ligne 1 = hook, puis valeur compressée, hashtags x15-20 en fin, ton aspirationnel
- **TikTok** : hook visuel + verbal dès 0-3s, rythme rapide, CTA fort à la fin

## Format de sortie — JSON strict

{{
  "linkedin": {{
    "title": "Première ligne visible avant 'voir plus' — DOIT arrêter le scroll. < 200 chars. Aucune question générique. Vise l'identité ou la douleur.",
    "content": "Corps complet (400-900 mots). Chaque paragraphe = 1-2 lignes. Saut de ligne après chaque idée. CTA final = question ou micro-engagement. Données sourcées uniquement.",
    "imagePrompt": "Description précise de l'image éditoriale LinkedIn (16:9, style professionnel)"
  }},
  "facebook": {{
    "content": "Post Facebook (200-600 mots). Accroche storytelling ou question directe. Données sourcées. CTA engagement.",
    "imagePrompt": "Description de l'image Facebook (16:9, lifestyle ou editorial)"
  }},
  "twitter": {{
    "thread": [
      "Tweet 1 — Hook : contre-vérité, chiffre sourcé, ou pattern interrupt (< 280 chars)",
      "Tweet 2 — Le problème réel (< 280 chars)",
      "Tweet 3 — Insight 1 avec exemple ou source (< 280 chars)",
      "Tweet 4 — Insight 2 (< 280 chars)",
      "Tweet 5 — Insight 3 actionnable (< 280 chars)",
      "Tweet 6 — Le twist ou la leçon clé (< 280 chars)",
      "Tweet 7 — CTA : question ouverte ou appel à la discussion (< 280 chars)"
    ],
    "imagePrompt": "Description de l'image pour le tweet principal (16:9, style bold editorial)"
  }},
  "instagram": {{
    "caption": "Caption complète (800-2200 chars). Hook ligne 1 — arrête le scroll. Valeur compressée. Break esthétique. Hashtags x15-20 en fin.",
    "script": "Script Reel 30-60s. [0-3s] Hook visuel + verbal | [3-15s] Problème | [15-45s] 3 insights | [45-60s] CTA.",
    "imagePrompt": "Description du visuel Instagram carré (1:1)"
  }},
  "tiktok": {{
    "script": "Script TikTok 30-60s. [0-3s HOOK] Choc + accroche | [3-20s] Développement | [20-50s] 3 insights | [50-60s] CTA.",
    "caption": "Caption TikTok (150-300 chars + 5-8 hashtags viraux)",
    "imagePrompt": "Thumbnail TikTok vertical (9:16). Contraste fort, texte visible."
  }}
}}

Réponds UNIQUEMENT avec le JSON valide. Sans markdown, sans backticks, sans commentaires.`;

const socialCampaignPrompt = ChatPromptTemplate.fromMessages([
  ["system", VIRAL_GROWTH_SYSTEM_PROMPT],
  [
    "human",
    `Voici le contenu à transformer en campagne sociale :

**Mot-clé principal :** {keyword}

**Extrait de l'article SEO :**
{articleExcerpt}

**Insights publicitaires (pour t'inspirer des structures qui convertissent) :**
{adInsightsText}

Génère maintenant la campagne complète pour les 4 plateformes en JSON.`,
  ],
]);

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractArticleExcerpt(content: string, maxChars = 3000): string {
  return content.slice(0, maxChars).trim();
}

function formatAdInsights(adInsights?: AdInsights): string {
  if (!adInsights) return "Aucun insight publicitaire fourni.";

  const parts: string[] = [];
  if (adInsights.winning_ad_framework) {
    parts.push(`Structure gagnante : ${adInsights.winning_ad_framework}`);
  }
  if (adInsights.hooks?.length) {
    parts.push(`Hooks performants : ${adInsights.hooks.slice(0, 3).join(" | ")}`);
  }
  if (adInsights.cta) {
    parts.push(`CTA efficace : ${adInsights.cta}`);
  }
  if (adInsights.tone) {
    parts.push(`Ton : ${adInsights.tone}`);
  }
  if (adInsights.targetAudience) {
    parts.push(`Audience cible : ${adInsights.targetAudience}`);
  }

  return parts.length > 0 ? parts.join("\n") : "Aucun insight publicitaire fourni.";
}

async function generateImageSafe(
  prompt: string,
  styleReference: NanaBananaStyleReference,
  aspectRatio: "16:9" | "1:1" | "9:16"
): Promise<string | null> {
  try {
    return await generateNanoBananaImageRaw(prompt, {
      aspectRatio,
      styleReference,
      textFidelity: 0.85,
      renderMode: "high_definition",
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTION PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une campagne sociale multi-plateforme à partir d'un article SEO.
 *
 * Pipeline :
 * 1. Génération LLM unique (LinkedIn + X + Instagram + TikTok) — ~8-10s
 * 2. Génération images Nano Banana en parallèle — ~5-8s (overlap avec sauvegarde DB)
 * 3. Sauvegarde DB en parallèle (Post × 4)
 *
 * @param input - Paramètres de la campagne
 * @returns Campagne sociale complète ou erreur
 */
export async function generateSocialCampaign(
  input: SocialCampaignInput
): Promise<{ success: boolean; data?: SocialCampaign; error?: string }> {
  const {
    seoArticleContent,
    keyword,
    adInsights,
    workspaceId,
    contentPlanId,
    generateImages = true,
  } = input;

  try {
    // ─── Étape 1 : Génération LLM (un seul appel pour tous les formats) ───────
    const articleExcerpt = extractArticleExcerpt(seoArticleContent);
    const adInsightsText = formatAdInsights(adInsights);

    const raw = await socialCampaignPrompt
      .pipe(getClaude())
      .pipe(getStringParser())
      .invoke({ keyword, articleExcerpt, adInsightsText });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: "Format de réponse invalide du LLM" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      linkedin: { title: string; content: string; imagePrompt: string };
      facebook: { content: string; imagePrompt: string };
      twitter: { thread: string[]; imagePrompt: string };
      instagram: { caption: string; script: string; imagePrompt: string };
      tiktok: { script: string; caption: string; imagePrompt: string };
    };

    // ─── Étape 2 : Génération images en parallèle (non-bloquant si échec) ────
    const imageResults = await Promise.all(
      generateImages
        ? [
            generateImageSafe(
              parsed.linkedin.imagePrompt,
              "editorial_photography",
              "16:9"
            ),
            generateImageSafe(
              parsed.facebook.imagePrompt,
              "editorial_photography",
              "16:9"
            ),
            generateImageSafe(
              parsed.twitter.imagePrompt,
              "editorial_photography",
              "16:9"
            ),
            generateImageSafe(
              parsed.instagram.imagePrompt,
              "business_minimalist",
              "1:1"
            ),
            generateImageSafe(
              parsed.tiktok.imagePrompt,
              "infographic",
              "9:16"
            ),
          ]
        : [
            Promise.resolve(null),
            Promise.resolve(null),
            Promise.resolve(null),
            Promise.resolve(null),
            Promise.resolve(null),
          ]
    );

    const [linkedinImage, facebookImage, twitterImage, instagramImage, tiktokImage] =
      imageResults;

    // ─── Étape 3 : Mise en forme du contenu par plateforme ───────────────────
    const linkedinContent = `${parsed.linkedin.title}\n\n${parsed.linkedin.content}`;
    const facebookContent = parsed.facebook.content;
    const twitterContent = parsed.twitter.thread
      .map((tweet, i) => (i === 0 ? tweet : `${i + 1}/${parsed.twitter.thread.length} ${tweet}`))
      .join("\n\n");
    const instagramContent = `${parsed.instagram.caption}\n\n---\n\n🎬 Script Reel\n${parsed.instagram.script}`;
    const tiktokContent = `🎬 Script TikTok\n${parsed.tiktok.script}\n\n---\n\n${parsed.tiktok.caption}`;

    // ─── Étape 4 : Sauvegarde DB en parallèle ───────────────────────────────
    const sharedPostData = {
      status: "DRAFT" as const,
      workspaceId,
      ...(contentPlanId ? { contentPlanId } : {}),
    };

    const [linkedinPost, facebookPost, twitterPost, instagramPost, tiktokPost] =
      await Promise.all([
        prisma.post.create({
          data: {
            ...sharedPostData,
            type: "LINKEDIN",
            title: parsed.linkedin.title,
            content: linkedinContent,
            keywords: [keyword],
            ...(linkedinImage ? { imageUrl: linkedinImage } : {}),
          },
          select: { id: true },
        }),
        prisma.post.create({
          data: {
            ...sharedPostData,
            type: "FACEBOOK",
            content: facebookContent,
            keywords: [keyword],
            ...(facebookImage ? { imageUrl: facebookImage } : {}),
          },
          select: { id: true },
        }),
        prisma.post.create({
          data: {
            ...sharedPostData,
            type: "X",
            content: twitterContent,
            keywords: [keyword],
            ...(twitterImage ? { imageUrl: twitterImage } : {}),
          },
          select: { id: true },
        }),
        prisma.post.create({
          data: {
            ...sharedPostData,
            type: "INSTAGRAM",
            content: instagramContent,
            keywords: [keyword],
            ...(instagramImage ? { imageUrl: instagramImage } : {}),
          },
          select: { id: true },
        }),
        prisma.post.create({
          data: {
            ...sharedPostData,
            type: "TIKTOK",
            content: tiktokContent,
            keywords: [keyword],
            ...(tiktokImage ? { imageUrl: tiktokImage } : {}),
          },
          select: { id: true },
        }),
      ]);

    return {
      success: true,
      data: {
        linkedin: {
          postId: linkedinPost.id,
          type: "LINKEDIN" as const,
          content: linkedinContent,
          imageUrl: linkedinImage,
        },
        facebook: {
          postId: facebookPost.id,
          type: "FACEBOOK" as const,
          content: facebookContent,
          imageUrl: facebookImage,
        },
        twitter: {
          postId: twitterPost.id,
          type: "X" as const,
          content: twitterContent,
          imageUrl: twitterImage,
        },
        instagram: {
          postId: instagramPost.id,
          type: "INSTAGRAM" as const,
          content: instagramContent,
          imageUrl: instagramImage,
        },
        tiktok: {
          postId: tiktokPost.id,
          type: "TIKTOK" as const,
          content: tiktokContent,
          imageUrl: tiktokImage,
        },
      },
    };
  } catch (error) {
    console.error("[SocialFactory] generateSocialCampaign error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur lors de la génération de la campagne sociale",
    };
  }
}
