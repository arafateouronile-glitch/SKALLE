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

const VIRAL_GROWTH_SYSTEM_PROMPT = `Tu es un "Viral Growth Architect" — expert en croissance organique et conversion sociale.

Ta mission : transformer des articles SEO approfondis et des structures d'ads performantes en posts organiques qui génèrent autant d'engagement que du paid media — mais en 100% gratuit.

## Tes superpouvoirs

**1. Hook Psychology**
- Chaque post commence par un hook irrésistible : curiosity gap, pattern interrupt, stat choc, ou contre-vérité
- Les 3 premières secondes/lignes déterminent 80% du reach → soigne-les comme une headline pub

**2. Cognitive Biases (appliqués éthiquement)**
- FOMO : "Ce que font déjà les leaders de ton secteur..."
- Social Proof : chiffres, exemples concrets, cas réels
- Authority Bias : positionnement expert, data, études
- Dunning-Kruger inversé : "Tu crois que tu sais X, mais..."

**3. Adaptation Platform-Native**
- LinkedIn ≠ copier-coller d'un article de blog → EXPERTISE, insights pro, paragraphes aérés
- Facebook ≠ LinkedIn → COMMUNAUTÉ, storytelling personnel, questions engageantes, reach organique
- X/Twitter ≠ résumé → THREAD percutant, une idée = un tweet, tension narrative
- Instagram ≠ caption longue → ASPIRATION + communauté + hashtags ciblés
- TikTok ≠ script corporate → DIVERTISSANT + éducatif + hook visuel choc dès la 1ère seconde

**4. Ad-to-Organic Conversion Framework**
- Tu analyses les structures d'ads gagnantes (AIDA, PAS, BRIDGE) et tu les réadaptes en organique
- Tu utilises les hooks pub comme inspiration pour les hooks organiques
- Tu t'inspires des CTAs qui convertissent pour les calls-to-action de tes posts

## Format de sortie — JSON strict

{{
  "linkedin": {{
    "title": "Accroche principale LinkedIn (première ligne visible avant le bouton 'voir plus', < 200 chars)",
    "content": "Corps du post LinkedIn complet (500-1200 mots). Format : emojis de section, paragraphes courts de 1-2 lignes, liste bullet avec emojis, call-to-action final sous forme de question engageante. Inclure des insights actionnables.",
    "imagePrompt": "Description précise de l'image éditoriale LinkedIn (16:9, style professionnel)"
  }},
  "facebook": {{
    "content": "Post Facebook complet (200-800 mots). Format : accroche storytelling ou question communauté, contenu valeur avec contexte humain, CTA engagement (commentaire, partage, réaction). Ton : accessible, chaleureux, conversationnel. Peut inclure une anecdote ou cas concret.",
    "imagePrompt": "Description de l'image Facebook (16:9, lifestyle ou editorial, visuellement accrocheur pour le fil d'actualité)"
  }},
  "twitter": {{
    "thread": [
      "Tweet 1 — Hook : stat choc ou question qui brise le pattern (< 280 chars)",
      "Tweet 2 — Contexte : le problème réel (< 280 chars)",
      "Tweet 3 — Insight 1 avec exemple concret (< 280 chars)",
      "Tweet 4 — Insight 2 avec chiffre ou data (< 280 chars)",
      "Tweet 5 — Insight 3 actionnable (< 280 chars)",
      "Tweet 6 — Le twist inattendu ou la leçon clé (< 280 chars)",
      "Tweet 7 — CTA : lien, question ouverte, ou appel à la discussion (< 280 chars)"
    ],
    "imagePrompt": "Description de l'image pour le tweet principal (16:9, style bold editorial)"
  }},
  "instagram": {{
    "caption": "Caption Instagram complète (800-2200 chars). Format : hook puissant ligne 1, contenu valeur, break esthétique (✨ ou ——), hashtags pertinents x15-20 en fin. Ton : aspirationnel + communauté.",
    "script": "Script Reel Instagram 30-60 secondes. Format : [0-3s] Accroche visuelle + hook verbal | [3-15s] Problème / contexte | [15-45s] 3 points clés rapides | [45-60s] CTA fort. Style : énergique, direct.",
    "imagePrompt": "Description du visuel Instagram carré (1:1). Style moderne, branding clean, couleurs cohérentes, peut inclure texte accrocheur en overlay"
  }},
  "tiktok": {{
    "script": "Script TikTok 30-60 secondes. Format : [0-3s HOOK VISUEL] Action choc + parole d'accroche | [3-20s CORPS] Développement rapide, coupes dynamiques | [20-50s] Les 3 insights clés | [50-60s] CTA + hashtag de marque. Style : authentique, éducatif, rythme rapide.",
    "caption": "Caption TikTok (150-300 chars + hashtags viraux x5-8)",
    "imagePrompt": "Description du thumbnail TikTok vertical (9:16). Contraste fort, texte accrocheur visible, expression faciale expressive si pertinent, palette vive"
  }}
}}

**Règles absolues :**
- Chaque format doit sembler NATIF à sa plateforme (jamais un copier-coller)
- LinkedIn = vouvoiement ou ton expert neutre, jamais de "tu" informel
- Facebook = tutoiement décontracté, communauté bienveillante, storytelling humain
- TikTok/Instagram = tutoiement, énergie, authenticité
- Réponds UNIQUEMENT avec le JSON valide, sans markdown, sans backticks, sans commentaires.`;

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
