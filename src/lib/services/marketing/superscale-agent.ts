/**
 * 🚀 Superscale Ad Agent — End-to-End Ad Creative Engine
 *
 * Pipeline en 5 étapes (orchestré par Inngest) :
 *   1. RESEARCH   — Scrape Meta Ad Library pour les pubs actives du marché
 *   2. COPY       — LLM génère 3 variantes (AIDA/PAS) avec textes + prompts image
 *   3. VISUAL     — Nano Banana génère le fond (clean background, sans texte)
 *   4. ASSEMBLY   — Bannerbear/Placid incruste les textes en 3 formats (1:1, 9:16, 16:9)
 *   5. PERSIST    — Sauvegarde dans AdCampaign / AdVariant (Prisma)
 *
 * Variables d'env requises :
 *   OPENAI_API_KEY ou ANTHROPIC_API_KEY — copywriting
 *   NANO_BANANA_API_KEY                 — génération de fonds
 *   BANNERBEAR_API_KEY                  — resizing multi-format (optionnel, fallback gracieux)
 *   BANNERBEAR_TEMPLATE_SQUARE         — template ID 1:1
 *   BANNERBEAR_TEMPLATE_STORY          — template ID 9:16
 *   BANNERBEAR_TEMPLATE_LANDSCAPE      — template ID 16:9
 *   META_FB_ACCESS_TOKEN               — export vers Facebook Ads (optionnel)
 */

import { prisma } from "@/lib/prisma";
import { fetchCompetitorAds } from "@/lib/services/ads/intelligence";
import { generateNanoBananaImageRaw } from "@/lib/services/image/nano-banana";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AdVariantDraft {
  angle: string;
  framework: "AIDA" | "PAS" | "BRIDGE";
  primaryText: string;
  headline: string;
  subheadline: string;
  imagePrompt: string;
}

export interface AdVariantResult extends AdVariantDraft {
  backgroundUrl: string | null;
  squareUrl: string | null;
  storyUrl: string | null;
  landscapeUrl: string | null;
}

export interface CompetitorInsights {
  topHooks: string[];
  dominantFrameworks: string[];
  dominantColors: string[];
  avgDaysActive: number;
  adsAnalyzed: number;
  usedFallback: boolean;
}

export interface SuperscaleRunResult {
  campaignId: string;
  variants: AdVariantResult[];
  competitorInsights: CompetitorInsights;
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 1 : RESEARCH — Analyser les pubs concurrentes
// ═══════════════════════════════════════════════════════════════════════════

export async function researchTopAds(
  niche: string,
  workspaceId: string
): Promise<CompetitorInsights> {
  const { list, metaFallback } = await fetchCompetitorAds(niche, "META", workspaceId, {
    limit: 15,
    minDaysActive: 0,
  });

  const hooks = list
    .filter((ad) => ad.hook)
    .map((ad) => ad.hook as string)
    .slice(0, 5);

  const frameworkCounts: Record<string, number> = {};
  const colorSet = new Set<string>();
  let totalDays = 0;

  for (const ad of list) {
    if (ad.framework) {
      frameworkCounts[ad.framework] = (frameworkCounts[ad.framework] ?? 0) + 1;
    }
    if (Array.isArray(ad.colors)) {
      for (const c of ad.colors as string[]) colorSet.add(c);
    }
    totalDays += ad.daysActive ?? 0;
  }

  // Si pas encore analysées, extraire les hooks bruts du contenu des pubs
  const topHooks =
    hooks.length > 0
      ? hooks
      : list
          .map((ad) => ad.adContent?.slice(0, 120))
          .filter(Boolean)
          .slice(0, 5) as string[];

  const dominantFrameworks = Object.entries(frameworkCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([f]) => f)
    .slice(0, 3);

  return {
    topHooks,
    dominantFrameworks: dominantFrameworks.length ? dominantFrameworks : ["AIDA", "PAS"],
    dominantColors: [...colorSet].slice(0, 6),
    avgDaysActive: list.length ? Math.round(totalDays / list.length) : 0,
    adsAnalyzed: list.length,
    usedFallback: metaFallback,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 2 : COPYWRITING — Générer 3 variantes avec GPT-4o / Claude
// ═══════════════════════════════════════════════════════════════════════════

const COPY_SYSTEM_PROMPT = `Tu es un expert en copywriting publicitaire (AIDA, PAS, BRIDGE) et en marketing digital.
Ta mission : générer 3 variantes de publicités Facebook/Instagram originales pour un produit/service donné.
Chaque variante doit avoir un angle marketing différent (ex: peur, gain, simplicité, urgence, preuve sociale).

Réponds UNIQUEMENT avec un JSON valide contenant un tableau "variants" de 3 objets, chacun avec :
- "angle": string — l'angle marketing (ex: "Gain de temps", "Peur de l'échec", "Preuve sociale")
- "framework": "AIDA" | "PAS" | "BRIDGE" — la structure rhétorique utilisée
- "primaryText": string — le texte du post Facebook (150-250 mots, avec emojis, storytelling, CTA fort)
- "headline": string — le gros titre de l'image (5-8 mots percutants, sans ponctuation finale)
- "subheadline": string — le sous-titre de l'image (10-15 mots, bénéfice principal)
- "imagePrompt": string — prompt en anglais pour générer un fond visuel professionnel (clean, sans texte)

Pour le "imagePrompt" : décrire une scène professionnelle, cinématique, sans texte ni logo.
Inspiré des styles : editorial photography, lifestyle, minimalist product shot.`;

export async function generateAdVariants(
  insights: CompetitorInsights,
  niche: string,
  brandContext?: string
): Promise<AdVariantDraft[]> {
  const hooksContext =
    insights.topHooks.length > 0
      ? `\nAccroches gagnantes du marché :\n${insights.topHooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
      : "";

  const userPrompt = `Produit/service : ${niche}
${brandContext ? `Contexte de marque : ${brandContext}` : ""}
${hooksContext}
Frameworks dominants du marché : ${insights.dominantFrameworks.join(", ")}

Génère 3 variantes publicitaires originales et percutantes pour ce produit.
Chaque variante doit avoir un angle DIFFÉRENT et des textes 100% originaux (pas de copie des accroches ci-dessus).`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY requis pour le copywriting Superscale");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: COPY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Copywriting error: ${response.status} ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Réponse LLM vide pour le copywriting");

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(raw) as { variants?: unknown[] };
  } catch {
    throw new Error("JSON invalide retourné par le LLM copywriting");
  }

  const variants = parsed.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("Aucune variante retournée par le LLM");
  }

  return variants.slice(0, 3).map((v) => {
    const obj = v as Record<string, unknown>;
    return {
      angle: String(obj.angle ?? "Bénéfice clé"),
      framework: (["AIDA", "PAS", "BRIDGE"].includes(String(obj.framework))
        ? obj.framework
        : "AIDA") as AdVariantDraft["framework"],
      primaryText: String(obj.primaryText ?? ""),
      headline: String(obj.headline ?? ""),
      subheadline: String(obj.subheadline ?? ""),
      imagePrompt: String(obj.imagePrompt ?? "Professional lifestyle photography, clean background"),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 3 : VISUAL — Générer le fond via Nano Banana (clean, sans texte)
// ═══════════════════════════════════════════════════════════════════════════

export async function generateAdBackground(imagePrompt: string): Promise<string | null> {
  const enrichedPrompt = [
    imagePrompt,
    "Clean background with NO text, NO logo, NO watermark",
    "Professional advertising photography quality",
    "High contrast, vibrant colors suitable for social media ads",
    "16:9 format, sharp and modern",
  ].join(". ");

  return generateNanoBananaImageRaw(enrichedPrompt, {
    aspectRatio: "16:9",
    styleReference: "editorial_photography",
    textFidelity: 0.0, // Pas de texte — fond pur
    renderMode: "high_definition",
    negativePrompt: "text, letters, words, watermark, logo, blurry, low quality, distorted",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 4 : ASSEMBLY — Incrustation texte + 3 formats via Bannerbear
// ═══════════════════════════════════════════════════════════════════════════

interface BannerbearImage {
  uid: string;
  status: "pending" | "generating" | "generated" | "failed";
  image_url?: string;
  image_url_jpg?: string;
}

async function pollBannerbear(uid: string, apiKey: string, maxWait = 60_000): Promise<string | null> {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`https://api.bannerbear.com/v2/images/${uid}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BannerbearImage;
    if (data.status === "generated") return data.image_url ?? data.image_url_jpg ?? null;
    if (data.status === "failed") return null;
  }
  return null;
}

async function createBannerbearImage(
  templateId: string,
  backgroundUrl: string,
  headline: string,
  subheadline: string,
  apiKey: string
): Promise<string | null> {
  const res = await fetch("https://api.bannerbear.com/v2/images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      template: templateId,
      modifications: [
        { name: "background", image_url: backgroundUrl },
        { name: "headline", text: headline },
        { name: "subheadline", text: subheadline },
      ],
    }),
  });

  if (!res.ok) {
    console.error(`[Bannerbear] Error ${res.status}:`, await res.text());
    return null;
  }

  const data = (await res.json()) as BannerbearImage;
  if (data.status === "generated") return data.image_url ?? data.image_url_jpg ?? null;
  return pollBannerbear(data.uid, apiKey);
}

export async function assembleAndResizeAd(
  backgroundUrl: string,
  headline: string,
  subheadline: string
): Promise<{ squareUrl: string | null; storyUrl: string | null; landscapeUrl: string | null }> {
  const apiKey = process.env.BANNERBEAR_API_KEY;

  if (!apiKey) {
    // Fallback gracieux : retourner le fond brut dans les 3 slots
    console.warn("[Superscale] BANNERBEAR_API_KEY absent — formats non générés, fond brut utilisé.");
    return { squareUrl: backgroundUrl, storyUrl: backgroundUrl, landscapeUrl: backgroundUrl };
  }

  const templateSquare = process.env.BANNERBEAR_TEMPLATE_SQUARE;
  const templateStory = process.env.BANNERBEAR_TEMPLATE_STORY;
  const templateLandscape = process.env.BANNERBEAR_TEMPLATE_LANDSCAPE;

  const [squareUrl, storyUrl, landscapeUrl] = await Promise.all([
    templateSquare
      ? createBannerbearImage(templateSquare, backgroundUrl, headline, subheadline, apiKey)
      : Promise.resolve(backgroundUrl),
    templateStory
      ? createBannerbearImage(templateStory, backgroundUrl, headline, subheadline, apiKey)
      : Promise.resolve(backgroundUrl),
    templateLandscape
      ? createBannerbearImage(templateLandscape, backgroundUrl, headline, subheadline, apiKey)
      : Promise.resolve(backgroundUrl),
  ]);

  return { squareUrl, storyUrl, landscapeUrl };
}

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATEUR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export async function runSuperscaleAdPipeline(
  campaignId: string,
  niche: string,
  workspaceId: string,
  brandContext?: string
): Promise<SuperscaleRunResult> {
  // ÉTAPE 1 : Research
  const insights = await researchTopAds(niche, workspaceId);

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: { competitorInsights: JSON.parse(JSON.stringify(insights)) },
  });

  // ÉTAPE 2 : Copywriting (3 variantes)
  const drafts = await generateAdVariants(insights, niche, brandContext);

  // ÉTAPES 3 & 4 : Visual + Assembly (en parallèle pour chaque variante)
  const variants = await Promise.all(
    drafts.map(async (draft): Promise<AdVariantResult> => {
      const backgroundUrl = await generateAdBackground(draft.imagePrompt);

      let squareUrl: string | null = null;
      let storyUrl: string | null = null;
      let landscapeUrl: string | null = null;

      if (backgroundUrl) {
        const formats = await assembleAndResizeAd(backgroundUrl, draft.headline, draft.subheadline);
        squareUrl = formats.squareUrl;
        storyUrl = formats.storyUrl;
        landscapeUrl = formats.landscapeUrl;
      }

      return { ...draft, backgroundUrl, squareUrl, storyUrl, landscapeUrl };
    })
  );

  // ÉTAPE 5 : Persistance
  await prisma.$transaction(
    variants.map((v) =>
      prisma.adVariant.create({
        data: {
          campaignId,
          angle: v.angle,
          framework: v.framework,
          primaryText: v.primaryText,
          headline: v.headline,
          subheadline: v.subheadline,
          imagePrompt: v.imagePrompt,
          backgroundUrl: v.backgroundUrl,
          squareUrl: v.squareUrl,
          storyUrl: v.storyUrl,
          landscapeUrl: v.landscapeUrl,
        },
      })
    )
  );

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: { status: "READY" },
  });

  return { campaignId, variants, competitorInsights: insights };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT VERS META ADS (brouillon)
// ═══════════════════════════════════════════════════════════════════════════

interface MetaAdDraftResult {
  variantId: string;
  metaAdId: string | null;
  success: boolean;
  error?: string;
}

/**
 * Pousse une variante vers Meta Ads Manager en mode brouillon.
 * Nécessite META_FB_ACCESS_TOKEN avec permissions ads_management.
 */
export async function exportVariantToMeta(
  variantId: string,
  adAccountId: string,
  pageId: string
): Promise<MetaAdDraftResult> {
  const variant = await prisma.adVariant.findUnique({
    where: { id: variantId },
    include: { campaign: true },
  });

  if (!variant) return { variantId, metaAdId: null, success: false, error: "Variante introuvable" };

  const accessToken = process.env.META_FB_ACCESS_TOKEN;
  if (!accessToken) {
    return { variantId, metaAdId: null, success: false, error: "META_FB_ACCESS_TOKEN manquant" };
  }

  try {
    // 1. Créer le creative
    const creativeRes = await fetch(
      `https://graph.facebook.com/v22.0/act_${adAccountId}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          name: `Superscale — ${variant.angle} — ${variant.campaign.niche}`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              message: variant.primaryText,
              name: variant.headline,
              description: variant.subheadline,
              ...(variant.squareUrl ? { picture: variant.squareUrl } : {}),
            },
          },
          degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
        }),
      }
    );

    if (!creativeRes.ok) {
      const err = await creativeRes.text();
      return { variantId, metaAdId: null, success: false, error: `Meta Creative error: ${err.slice(0, 200)}` };
    }

    const creativeData = (await creativeRes.json()) as { id?: string };
    const creativeId = creativeData.id;
    if (!creativeId) return { variantId, metaAdId: null, success: false, error: "Creative ID non retourné" };

    // 2. Créer l'annonce en brouillon (status PAUSED)
    const adRes = await fetch(`https://graph.facebook.com/v22.0/act_${adAccountId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        name: `[Superscale Draft] ${variant.angle}`,
        creative: { creative_id: creativeId },
        status: "PAUSED", // Brouillon prêt à publier
      }),
    });

    if (!adRes.ok) {
      const err = await adRes.text();
      return { variantId, metaAdId: null, success: false, error: `Meta Ad error: ${err.slice(0, 200)}` };
    }

    const adData = (await adRes.json()) as { id?: string };
    const metaAdId = adData.id ?? null;

    if (metaAdId) {
      await prisma.adVariant.update({
        where: { id: variantId },
        data: { metaAdId, exportedAt: new Date() },
      });
    }

    return { variantId, metaAdId, success: !!metaAdId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { variantId, metaAdId: null, success: false, error };
  }
}
