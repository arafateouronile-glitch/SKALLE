/**
 * Image Generation Service
 *
 * Utilise OpenAI gpt-image-1 (même modèle que generate-avatar).
 * Le résultat base64 est uploadé vers Supabase (bucket video-ads)
 * pour fournir une URL publique permanente — nécessaire pour Bannerbear
 * et tout contexte qui stocke l'URL en base de données.
 *
 * Prérequis .env :
 *   OPENAI_API_KEY     — génération d'image
 *   SUPABASE_URL       — upload stockage
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { useCredits } from "@/lib/credits";
import { uploadToStorage } from "@/lib/supabase-storage";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (conservés pour compatibilité avec les imports existants)
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
  textFidelity?: number;
  renderMode?: "standard" | "high_definition";
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

type OpenAIImageSize = "1024x1024" | "1536x1024" | "1024x1536";

function mapAspectRatioToSize(ratio: NanaBananaAspectRatio = "16:9"): OpenAIImageSize {
  if (ratio === "9:16") return "1024x1536";
  if (ratio === "1:1") return "1024x1024";
  return "1536x1024"; // 16:9 et 4:3 → paysage
}

// ═══════════════════════════════════════════════════════════════════════════
// APPEL API INTERNE
// ═══════════════════════════════════════════════════════════════════════════

async function generateImageInternal(
  prompt: string,
  options: NanaBananaOptions = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[ImageGen] OPENAI_API_KEY manquant — image non générée.");
    return null;
  }

  const size = mapAspectRatioToSize(options.aspectRatio);

  const fullPrompt = options.negativePrompt
    ? `${prompt}. Avoid: ${options.negativePrompt}`
    : prompt;

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: fullPrompt,
        n: 1,
        size,
        quality: "high",
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ImageGen] API error ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;

    // Upload vers Supabase → URL publique permanente
    const buffer = Buffer.from(b64, "base64");
    const storagePath = `generated-images/${crypto.randomUUID()}.png`;
    return await uploadToStorage(buffer, storagePath, "image/png");
  } catch (error) {
    console.error("[ImageGen] Génération échouée:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE — avec déduction de crédits
// ═══════════════════════════════════════════════════════════════════════════

export async function generateNanoBananaImage(
  prompt: string,
  userId: string,
  workspaceId: string,
  options: NanaBananaOptions = {}
): Promise<{ url: string | null; creditsUsed: number }> {
  void workspaceId; // conservé pour compatibilité signature

  const creditResult = await useCredits(userId, "image_generation_seo");
  if (!creditResult.success) {
    console.warn(`[ImageGen] Crédits insuffisants pour ${userId}: ${creditResult.error}`);
    return { url: null, creditsUsed: 0 };
  }

  const url = await generateImageInternal(prompt, options);
  return { url, creditsUsed: creditResult.success ? 5 : 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSION SANS CRÉDITS (Inngest / contextes sans session)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateNanoBananaImageRaw(
  prompt: string,
  options: NanaBananaOptions = {}
): Promise<string | null> {
  return generateImageInternal(prompt, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER — Prompt optimisé pour les articles SEO
// ═══════════════════════════════════════════════════════════════════════════

export function buildSEOArticleImagePrompt(
  keyword: string,
  sectionTitle: string,
  rawPrompt?: string
): { prompt: string; options: NanaBananaOptions } {
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
      textFidelity: 1.0,
      renderMode: "high_definition",
      negativePrompt:
        "blurry text, distorted letters, garish colors, watermark, low resolution, stock photo clichés",
    },
  };
}
