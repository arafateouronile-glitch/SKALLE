/**
 * 🍌 Nano Banana Image Service
 *
 * Nano Banana = wrapper autour de Google Gemini 2.5 Flash Image (Imagen 3).
 * Avantage clé vs DALL-E 3 : rendu de texte dans l'image chirurgical (text_fidelity),
 * idéal pour les infographies SEO qui contiennent des mots-clés lisibles.
 *
 * Pricing : ~0,02 $/image (>50% moins cher que DALL-E 3 à 0,04 $)
 * Quota : 1 000 req/jour sur le tier payant
 *
 * Prérequis .env.local :
 *   NANO_BANANA_API_KEY=your_key_here
 *
 * Docs : https://www.nano-banana.ai/
 */

import { useCredits } from "@/lib/credits";

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type NanaBananaAspectRatio = "16:9" | "1:1" | "4:3" | "9:16";
export type NanaBananaStyleReference =
  | "business_minimalist"
  | "editorial_photography"
  | "flat_design"
  | "infographic"
  | "technical_diagram"
  | "photorealistic";

export interface NanaBananaOptions {
  aspectRatio?: NanaBananaAspectRatio;
  styleReference?: NanaBananaStyleReference;
  negativePrompt?: string;
  textFidelity?: number; // 0.0 – 1.0 — 1.0 = priorité maximale au rendu des glyphes
  renderMode?: "standard" | "high_definition";
}

interface NanaBananaResponse {
  url: string;
  width: number;
  height: number;
  model: string;
  prompt_used: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 APPEL API BRUT (sans gestion de crédits)
// ═══════════════════════════════════════════════════════════════════════════

async function callNanaBananaAPI(
  prompt: string,
  options: NanaBananaOptions = {}
): Promise<string | null> {
  const apiKey = process.env.NANO_BANANA_API_KEY;

  if (!apiKey) {
    console.warn("[NanoBanana] NANO_BANANA_API_KEY manquant — image non générée.");
    return null;
  }

  const {
    aspectRatio = "16:9",
    styleReference = "business_minimalist",
    negativePrompt = "texte flou, lettres déformées, couleurs criardes, filigrane, watermark, low quality, blurry",
    textFidelity = 1.0,
    renderMode = "high_definition",
  } = options;

  const payload = {
    model: "nano-banana-v1",
    prompt,
    aspect_ratio: aspectRatio,
    parameters: {
      text_fidelity: textFidelity,
      style_reference: styleReference,
      negative_prompt: negativePrompt,
      render_mode: renderMode,
    },
    response_format: "url",
  };

  try {
    const response = await fetch("https://api.nano-banana.ai/v1/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Model-Version": "nano-banana-v1",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000), // timeout 60s (génération HD peut être lente)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[NanoBanana] API error ${response.status}: ${errorText.slice(0, 200)}`
      );
      return null;
    }

    const data: NanaBananaResponse = await response.json();
    return data.url ?? null;
  } catch (error) {
    console.error("[NanoBanana] Génération échouée:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🍌 FONCTION PRINCIPALE — avec déduction de crédits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère une image avec Nano Banana et déduit les crédits Skalle.
 *
 * @param prompt     Description de l'image (peut contenir du texte lisible souhaité)
 * @param userId     ID de l'utilisateur Skalle (pour déduction crédits)
 * @param workspaceId  ID du workspace (pour audit trail)
 * @param options    Paramètres Nano Banana optionnels
 * @returns          URL de l'image générée, ou null si échec
 */
export async function generateNanoBananaImage(
  prompt: string,
  userId: string,
  workspaceId: string,
  options: NanaBananaOptions = {}
): Promise<{ url: string | null; creditsUsed: number }> {
  // 1. Vérifier et déduire les crédits AVANT la génération
  const creditResult = await useCredits(userId, "image_generation_seo");
  if (!creditResult.success) {
    console.warn(
      `[NanoBanana] Crédits insuffisants pour ${userId}: ${creditResult.error}`
    );
    return { url: null, creditsUsed: 0 };
  }

  // 2. Générer l'image
  const url = await callNanaBananaAPI(prompt, options);

  return { url, creditsUsed: creditResult.success ? 5 : 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 HELPER — Prompt optimisé pour les articles SEO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit un prompt Nano Banana optimisé pour les illustrations d'articles SEO.
 * text_fidelity: 1.0 garantit que les mots-clés insérés dans l'image restent lisibles.
 *
 * Exemple d'usage :
 *   buildSEOArticleImagePrompt("netlinking", "## Stratégie de backlinks")
 *   → "Professional editorial illustration for an SEO article about netlinking..."
 */
export function buildSEOArticleImagePrompt(
  keyword: string,
  sectionTitle: string,
  rawPrompt?: string
): { prompt: string; options: NanaBananaOptions } {
  // Si l'IA a déjà fourni un prompt détaillé, on l'enrichit
  const baseDescription =
    rawPrompt ||
    `Professional editorial illustration for an SEO article about "${sectionTitle}"`;

  const enrichedPrompt = [
    baseDescription,
    `Context: article about "${keyword}"`,
    "Style: clean, professional, modern business design",
    "Format: 16:9 wide editorial blog image",
    "No watermark, no text overlay unless explicitly requested",
  ].join(". ");

  return {
    prompt: enrichedPrompt,
    options: {
      aspectRatio: "16:9",
      styleReference: "editorial_photography",
      textFidelity: 1.0, // Arme secrète : rendu de texte chirurgical pour les infographies
      renderMode: "high_definition",
      negativePrompt:
        "blurry text, distorted letters, garish colors, watermark, low resolution, stock photo clichés",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 VERSION SANS CRÉDITS (pour tests / Inngest / contextes sans session)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Version allégée sans déduction de crédits.
 * À utiliser dans les Inngest functions ou les contextes sans session utilisateur.
 * Les crédits doivent être gérés par l'appelant.
 */
export async function generateNanoBananaImageRaw(
  prompt: string,
  options: NanaBananaOptions = {}
): Promise<string | null> {
  return callNanaBananaAPI(prompt, options);
}
