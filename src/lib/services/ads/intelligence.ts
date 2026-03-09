/**
 * 📢 Ad-Intelligence & Creative Benchmarking Engine
 *
 * - fetchCompetitorAds : bibliothèques d'ads (Meta via API officielle, autres en mock)
 * - analyzeAdCreative : analyse Vision + texte (GPT-4o) → hook, framework, visuel, couleurs
 * - generateAdRemix : script + brief créatif adapté à la marque (sans plagier)
 * - computeEfficiencyScore : score longévité + clarté CTA
 *
 * Meta Ad Library (vraies annonces) :
 * - Obtenir l’accès : https://www.facebook.com/ads/library/api → "Access the API" puis créer une app
 * - Renseigner META_FB_ACCESS_TOKEN (token avec accès ads_archive)
 * - Optionnel : META_AD_LIBRARY_COUNTRY=FR (ou US, GB, ALL). Format pays : ['FR'] côté Meta
 * En cas d’erreur 500 : vérifier que l’app a bien été approuvée pour l’Ad Library API (pas seulement Marketing API).
 *
 * Coût : 20 crédits par analyse complète (vision). Gestion via credits.ts
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AdPlatform = "META" | "TIKTOK" | "LINKEDIN" | "PINTEREST";

export interface RawScrapedAd {
  platform: AdPlatform;
  adLibraryId: string;
  advertiserName: string;
  advertiserDomain?: string | null;
  industry?: string | null;
  adContent: string;
  mediaUrl: string | null;
  isActive: boolean;
  daysActive: number;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  startDate?: string;
}

export interface AdAnalysisResult {
  hook: string;
  framework: "AIDA" | "PAS" | "BRIDGE" | "OTHER";
  visualAnalysis: string;
  colors: string[];
  ctaDetected: string | null;
}

export interface AdRemixResult {
  generatedScript: string;
  visualBrief: string;
  targetNetwork: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SCRAPER DE BIBLIOTHÈQUES (Meta, TikTok, LinkedIn)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les publicités concurrentes pour un mot-clé / plateforme.
 * En production : utiliser un proxy résidentiel (BrightData, Smartproxy) pour éviter les bans.
 * Meta Ad Library : extraire texte, image/vidéo, date de début. Prioriser ads actives > 30 jours.
 */
export async function fetchCompetitorAds(
  keyword: string,
  platform: AdPlatform,
  workspaceId: string,
  options?: { limit?: number; minDaysActive?: number }
) {
  const limit = options?.limit ?? 20;
  const minDaysActive = options?.minDaysActive ?? 0;

  // Proxy résidentiel : injecter en production (BrightData, Smartproxy)
  const proxyUrl = process.env.AD_SCRAPER_PROXY_URL; // ex: http://user:pass@gate.smartproxy.com:7000

  let rawAds: RawScrapedAd[] = [];
  let metaFallback = false;
  // TikTok, LinkedIn, Pinterest n'ont pas d'API intégrée — données de démo toujours utilisées
  let platformFallback = false;

  if (platform === "META") {
    const out = await fetchMetaAdLibrary(keyword, proxyUrl, limit);
    if (Array.isArray(out)) {
      rawAds = out;
    } else {
      const obj = out as { ads: RawScrapedAd[]; fallback?: boolean };
      rawAds = obj.ads;
      metaFallback = obj.fallback ?? false;
    }
    // Meta sans token = données de démo
    if (!process.env.META_FB_ACCESS_TOKEN?.trim()) platformFallback = true;
  } else if (platform === "TIKTOK") {
    rawAds = await fetchTikTokAdLibrary(keyword, proxyUrl, limit);
    platformFallback = true; // toujours démo — API TikTok Ad Library non intégrée
  } else if (platform === "LINKEDIN") {
    rawAds = await fetchLinkedInAdLibrary(keyword, proxyUrl, limit);
    platformFallback = true; // toujours démo — API LinkedIn Ad Library non intégrée
  } else if (platform === "PINTEREST") {
    rawAds = await fetchPinterestAdLibrary(keyword, proxyUrl, limit);
    platformFallback = true; // toujours démo — API Pinterest Ads non intégrée
  }

  const filtered = rawAds.filter((ad) => ad.daysActive >= minDaysActive);

  const rawByLibraryId = new Map(filtered.map((a) => [a.adLibraryId, a]));

  // Upsert avec les champs de base uniquement (compatible si le client Prisma n’a pas encore les colonnes filtre)
  const adLibraryIds: string[] = [];
  for (const ad of filtered) {
    await prisma.scrapedAd.upsert({
      where: { adLibraryId: ad.adLibraryId },
      create: {
        platform: ad.platform,
        adLibraryId: ad.adLibraryId,
        advertiserName: ad.advertiserName,
        adContent: ad.adContent,
        mediaUrl: ad.mediaUrl,
        isActive: ad.isActive,
        daysActive: ad.daysActive,
        workspaceId,
      },
      update: {
        isActive: ad.isActive,
        daysActive: ad.daysActive,
        adContent: ad.adContent,
      },
    });
    adLibraryIds.push(ad.adLibraryId);
  }

  if (adLibraryIds.length === 0) return { list: [], metaFallback, platformFallback };
  const persisted = await prisma.scrapedAd.findMany({
    where: { workspaceId, adLibraryId: { in: adLibraryIds } },
    orderBy: [{ daysActive: "desc" }],
  });

  // Enrichir avec domaine, industrie, vues, likes, commentaires (depuis raw) pour les filtres UI
  const list = persisted.map((p) => {
    const raw = rawByLibraryId.get(p.adLibraryId);
    const row = p as Record<string, unknown>;
    return {
      ...p,
      advertiserDomain: row.advertiserDomain ?? raw?.advertiserDomain ?? null,
      industry: row.industry ?? raw?.industry ?? null,
      viewCount: row.viewCount ?? raw?.viewCount ?? null,
      likeCount: row.likeCount ?? raw?.likeCount ?? null,
      commentCount: row.commentCount ?? raw?.commentCount ?? null,
    };
  });
  return { list, metaFallback, platformFallback };
}

const META_GRAPH_VERSION = "v22.0";
// Champs minimaux pour limiter les erreurs 500 côté Meta (bug connu)
const META_ADS_ARCHIVE_FIELDS = "id,ad_creative_bodies,ad_delivery_start_time,ad_delivery_stop_time,page_name,page_id";

interface MetaArchivedAd {
  id: string;
  ad_creative_bodies?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  page_name?: string;
  page_id?: string;
  publisher_platforms?: string[];
}

function parseMetaDeliveryDays(startTime?: string, stopTime?: string): number {
  if (!startTime) return 0;
  const start = new Date(startTime).getTime();
  const end = stopTime ? new Date(stopTime).getTime() : Date.now();
  if (end < start) return 0;
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

async function fetchMetaAdLibrary(
  keyword: string,
  _proxyUrl: string | undefined,
  limit: number
): Promise<RawScrapedAd[] | { ads: RawScrapedAd[]; fallback: boolean }> {
  const accessToken = process.env.META_FB_ACCESS_TOKEN;
  if (!accessToken?.trim()) {
    return getMockAds("META", keyword, limit);
  }

  const country = (process.env.META_AD_LIBRARY_COUNTRY || "FR").trim();
  // Format attendu par Meta (ex. curl) : ['US'] ou ['FR','US']
  const parts = country === "ALL" ? ["ALL"] : country.split(",").map((c) => c.trim()).filter(Boolean);
  const countriesParam = parts.length ? `[${parts.map((c) => `'${c}'`).join(",")}]` : "['FR']";

  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: keyword.trim() || "marketing",
    ad_type: "ALL",
    ad_active_status: "ALL",
    ad_reached_countries: countriesParam,
    fields: META_ADS_ARCHIVE_FIELDS,
    limit: String(Math.min(limit, 25)),
  });

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/ads_archive?${params.toString()}`;
  let rawAds: RawScrapedAd[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, { next: { revalidate: 0 }, signal: controller.signal });
    clearTimeout(timeoutId);
    const errText = await res.text();
    if (!res.ok) {
      console.error("[Meta Ad Library] API error:", res.status, errText);
      const is500 = res.status === 500;
      const isUnknown = errText.includes("unknown error");
      if (is500 && isUnknown) {
        console.warn("[Meta Ad Library] Erreur 500 connue côté Meta. Données de démo utilisées.");
        return { ads: getMockAds("META", keyword, limit), fallback: true as const };
      }
      let errMsg = "Meta Ad Library a renvoyé une erreur.";
      try {
        const errJson = JSON.parse(errText) as { error?: { message?: string; code?: number } };
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch {
        // keep errMsg
      }
      throw new Error(`${errMsg} (HTTP ${res.status}). Vérifiez META_FB_ACCESS_TOKEN et que votre app Meta a bien accès à l’Ad Library API.`);
    }
    const json = JSON.parse(errText) as { data?: MetaArchivedAd[]; error?: { message: string } };
    if (json.error) {
      console.error("[Meta Ad Library]", json.error.message);
      throw new Error(`Meta Ad Library : ${json.error.message}. Vérifiez le token et les droits de votre app.`);
    }
    const data = json.data ?? [];
    rawAds = data.map((ad: MetaArchivedAd) => {
      const bodies = ad.ad_creative_bodies ?? [];
      const adContent = bodies[0] ?? "";
      const daysActive = parseMetaDeliveryDays(ad.ad_delivery_start_time, ad.ad_delivery_stop_time);
      const hasStop = !!ad.ad_delivery_stop_time;
      const stopTime = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : 0;
      const isActive = !hasStop || stopTime > Date.now();
      return {
        platform: "META" as const,
        adLibraryId: `META-${ad.id}`,
        advertiserName: ad.page_name ?? "Unknown",
        advertiserDomain: null,
        industry: null,
        adContent,
        mediaUrl: ad.ad_snapshot_url ?? null,
        isActive,
        daysActive,
        viewCount: null,
        likeCount: null,
        commentCount: null,
      };
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const causeStr = e instanceof Error && e.cause ? String(e.cause) : "";
    const isNetwork =
      errMsg.includes("fetch failed") ||
      errMsg.includes("abort") ||
      causeStr.includes("ETIMEDOUT") ||
      causeStr.includes("ECONNRESET");
    if (isNetwork) {
      console.warn("[Meta Ad Library] Timeout ou erreur réseau. Données de démo utilisées.");
    } else {
      console.error("[Meta Ad Library] fetch failed", e);
    }
    return { ads: getMockAds("META", keyword, limit), fallback: true as const };
  }

  if (rawAds.length === 0) {
    return { ads: getMockAds("META", keyword, limit), fallback: true as const };
  }
  return rawAds;
}

async function fetchTikTokAdLibrary(
  keyword: string,
  _proxyUrl: string | undefined,
  limit: number
): Promise<RawScrapedAd[]> {
  if (!process.env.TIKTOK_AD_LIBRARY_URL) {
    return getMockAds("TIKTOK", keyword, limit);
  }
  return getMockAds("TIKTOK", keyword, limit);
}

async function fetchLinkedInAdLibrary(
  keyword: string,
  _proxyUrl: string | undefined,
  limit: number
): Promise<RawScrapedAd[]> {
  if (!process.env.LINKEDIN_AD_LIBRARY_URL) {
    return getMockAds("LINKEDIN", keyword, limit);
  }
  return getMockAds("LINKEDIN", keyword, limit);
}

async function fetchPinterestAdLibrary(
  keyword: string,
  _proxyUrl: string | undefined,
  limit: number
): Promise<RawScrapedAd[]> {
  if (!process.env.PINTEREST_ADS_API_URL) {
    return getMockAds("PINTEREST", keyword, limit);
  }
  return getMockAds("PINTEREST", keyword, limit);
}

const MOCK_BRANDS = [
  { name: "ScaleFlow", domain: "scaleflow.io", industry: "Tech / SaaS" },
  { name: "Mercury Pay", domain: "mercurypay.com", industry: "Finance" },
  { name: "FormaPro", domain: "formapro.fr", industry: "Formation" },
  { name: "Shopify Plus Partner", domain: "shopify-partner.co", industry: "E-commerce" },
  { name: "Clinique Digitale", domain: "cliniquedigitale.com", industry: "Santé" },
  { name: "Luxe & Co", domain: "luxeandco.com", industry: "Luxe" },
  { name: "DataDriven Agency", domain: "datadriven.agency", industry: "Tech / SaaS" },
  { name: "Finance & Vous", domain: "financeetvous.fr", industry: "Finance" },
  { name: "LearnHub", domain: "learnhub.io", industry: "Formation" },
  { name: "BrandStory", domain: "brandstory.io", industry: "E-commerce" },
  { name: "HealthTech Pro", domain: "healthtechpro.com", industry: "Santé" },
  { name: "Maison Élégance", domain: "maison-elegance.fr", industry: "Luxe" },
];

const MOCK_COPY_TEMPLATES = [
  (kw: string) => `Vous cherchez une solution pour ${kw} ? Nous avons aidé 2 000+ entreprises. Découvrez comment. →`,
  (kw: string) => `🚀 La méthode qui transforme votre approche ${kw}. Essai gratuit 14 jours. Sans engagement.`,
  (kw: string) => `"Avant je perdais des heures sur ${kw}. Maintenant c'est réglé en 10 min." — Marie, directrice marketing.`,
  (kw: string) => `Pourquoi les tops performeurs utilisent notre outil pour ${kw} ? Réponse en 60 secondes.`,
  (kw: string) => `Offre limitée : -40% sur notre formation ${kw}. Places limitées. Réservez votre spot.`,
  (kw: string) => `Le problème avec ${kw} ? La plupart se trompent d'outil. Voici ce qui marche vraiment.`,
  (kw: string) => `3 erreurs à éviter en ${kw}. La n°2 coûte cher. (Spoiler : on a la solution.)`,
  (kw: string) => `Rejoignez 15 000+ professionnels qui ont transformé leur ${kw}. Démo gratuite.`,
  (kw: string) => `Notre client a 3x son ROI en 90 jours. Leur secret ? Une stratégie ${kw} sur mesure.`,
  (kw: string) => `Nouveau : le guide ultime pour maîtriser ${kw}. Téléchargez-le gratuitement.`,
  (kw: string) => `Ils ont dit que c'était impossible. Nous avons révolutionné le ${kw}. Et vous ?`,
  (kw: string) => `⏰ Plus que 24h pour profiter de notre offre ${kw}. Ne ratez pas cette opportunité.`,
];

// IDs de photos Picsum variées (personnes, produits, paysages) pour des miniatures distinctes et visibles
const MOCK_IMAGE_IDS = [
  10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
];

function getMockAds(platform: AdPlatform, keyword: string, limit: number): RawScrapedAd[] {
  const ads: RawScrapedAd[] = [];
  const count = Math.min(limit, 12);
  const seed = keyword.length + platform.length;
  for (let i = 0; i < count; i++) {
    const daysActive = 7 + (i * 8) + (seed % 30);
    const viewCount = Math.floor(15000 + (i + 1) * 35000 + Math.random() * 200000);
    const likeCount = Math.floor(viewCount * (0.015 + (i % 5) * 0.008));
    const commentCount = Math.floor(likeCount * (0.15 + (i % 4) * 0.1));
    const brand = MOCK_BRANDS[i % MOCK_BRANDS.length];
    const copyFn = MOCK_COPY_TEMPLATES[i % MOCK_COPY_TEMPLATES.length];
    const imageId = MOCK_IMAGE_IDS[(seed + i * 7) % MOCK_IMAGE_IDS.length];
    ads.push({
      platform,
      adLibraryId: `${platform}-${keyword.replace(/\s/g, "-")}-${Date.now()}-${i}`,
      advertiserName: brand.name,
      advertiserDomain: brand.domain,
      industry: brand.industry,
      adContent: copyFn(keyword),
      mediaUrl: `https://picsum.photos/id/${imageId}/600/800`,
      isActive: i % 3 !== 2,
      daysActive,
      viewCount,
      likeCount,
      commentCount,
    });
  }
  return ads;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ANALYSE IA VISION + TEXTE (GPT-4o)
// ═══════════════════════════════════════════════════════════════════════════

const ANALYSIS_SYSTEM_PROMPT = `Tu es un expert en analyse publicitaire et copywriting. Tu analyses des créas (visuel + texte) pour en extraire la "formule" sans jamais copier le contenu.

Pour chaque publicité, fournis une analyse au format JSON strict avec exactement ces clés:
- "hook": l'accroche visuelle ou textuelle en une phrase (ce qui capte l'attention).
- "framework": un seul parmi "AIDA", "PAS", "BRIDGE", "OTHER" selon la structure du message (Attention/Intérêt/Désir/Action, Problème/Agitation/Solution, ou pont vers la solution).
- "visualAnalysis": description du style en 2-3 phrases (UGC, motion, pro, témoignage, démo produit, etc.) et composition.
- "colors": tableau de 3 à 5 couleurs dominantes (noms en français ou hex, ex: ["bleu marine", "#FF5733"]).
- "ctaDetected": le call-to-action explicite s'il y en a un, sinon null.

Réponds UNIQUEMENT avec le JSON valide, sans markdown ni texte avant/après.`;

export async function analyzeAdCreative(adId: string): Promise<AdAnalysisResult | null> {
  const ad = await prisma.scrapedAd.findUnique({
    where: { id: adId },
  });

  if (!ad) return null;

  const textContent = `Texte de la publicité:\n${ad.adContent}\n\nAnnonceur: ${ad.advertiserName}. Plateforme: ${ad.platform}. Actif depuis ${ad.daysActive} jours.`;

  const messages: Array<{ role: "system" | "user"; content: unknown }> = [
    { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
    { role: "user", content: textContent },
  ];

  if (ad.mediaUrl) {
    messages[1] = {
      role: "user",
      content: [
        { type: "text", text: textContent },
        {
          type: "image_url",
          image_url: { url: ad.mediaUrl },
        },
      ],
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY manquant pour l'analyse vision");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1024,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Vision error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const parsed = parseAnalysisJson(raw);
  if (!parsed) return null;

  await prisma.scrapedAd.update({
    where: { id: adId },
    data: {
      hook: parsed.hook,
      framework: parsed.framework,
      visualAnalysis: parsed.visualAnalysis,
      colors: parsed.colors,
      efficiencyScore: computeEfficiencyScore(ad.daysActive, parsed.ctaDetected),
    },
  });

  return parsed;
}

function parseAnalysisJson(raw: string): AdAnalysisResult | null {
  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      hook: String(o.hook ?? ""),
      framework: ["AIDA", "PAS", "BRIDGE", "OTHER"].includes(String(o.framework))
        ? (o.framework as AdAnalysisResult["framework"])
        : "OTHER",
      visualAnalysis: String(o.visualAnalysis ?? ""),
      colors: Array.isArray(o.colors) ? o.colors.map(String) : [],
      ctaDetected: o.ctaDetected != null ? String(o.ctaDetected) : null,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. EFFICIENCY SCORE
// ═══════════════════════════════════════════════════════════════════════════

export function computeEfficiencyScore(daysActive: number, ctaDetected: string | null): number {
  let score = 0;
  if (daysActive >= 90) score += 50;
  else if (daysActive >= 60) score += 40;
  else if (daysActive >= 30) score += 30;
  else if (daysActive >= 14) score += 20;
  else score += 10;

  if (ctaDetected && ctaDetected.trim().length > 0) score += 50;
  else score += 20;

  return Math.min(100, score);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. AD-REMIX (Conversion)
// ═══════════════════════════════════════════════════════════════════════════

const REMIX_SYSTEM_PROMPT = `Tu es un expert en création publicitaire. Tu reçois l'analyse d'une publicité performante (structure, hook, framework) et le Brand Voice du workspace cible.

Ta mission : produire un NOUVEAU script et brief visuel qui S'INSPIRE de la structure gagnante (formule) mais adapte le FOND au produit/marque du client. Tu ne dois JAMAIS copier-coller le texte original. Tu réécris tout dans le ton de la marque.

Réponds en JSON strict avec:
- "generatedScript": le script de vente complet (texte seul), adapté à la cible.
- "visualBrief": le brief créatif pour un monteur ou une API (Nano Banana) : description des scènes, style visuel, couleurs, durée, CTA à afficher.`;

export async function generateAdRemix(
  sourceAdId: string,
  targetWorkspaceId: string,
  targetNetwork: string
): Promise<AdRemixResult | null> {
  const [ad, workspace] = await Promise.all([
    prisma.scrapedAd.findUnique({
      where: { id: sourceAdId },
    }),
    prisma.workspace.findUnique({
      where: { id: targetWorkspaceId },
      select: { brandVoice: true, name: true },
    }),
  ]);

  if (!ad || !workspace) return null;

  const brandVoice = (workspace.brandVoice as Record<string, unknown>) ?? {};
  const brandContext = `Marque: ${workspace.name}. Ton: ${brandVoice.tone ?? "professional"}. Style: ${brandVoice.style ?? "moderne"}.`;

  const analysisContext = `
Publicité source (ne pas copier, s'en inspirer structurellement):
- Hook: ${ad.hook ?? "—"}
- Framework: ${ad.framework ?? "—"}
- Analyse visuelle: ${ad.visualAnalysis ?? "—"}
- Couleurs: ${(ad.colors ?? []).join(", ")}
- Texte original (référence): ${ad.adContent.slice(0, 500)}
`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 2048,
      messages: [
        { role: "system", content: REMIX_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${brandContext}\n\n${analysisContext}\n\nRéseau cible: ${targetNetwork}. Génère le script et le brief visuel.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Remix error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  const parsed = parseRemixJson(raw, targetNetwork);
  if (!parsed) return null;

  await prisma.creativeBrief.create({
    data: {
      sourceAdId: ad.id,
      targetNetwork,
      generatedScript: parsed.generatedScript,
      visualBrief: parsed.visualBrief,
      workspaceId: targetWorkspaceId,
    },
  });

  return {
    generatedScript: parsed.generatedScript,
    visualBrief: parsed.visualBrief,
    targetNetwork,
  };
}

function parseRemixJson(raw: string, targetNetwork: string): AdRemixResult | null {
  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      generatedScript: String(o.generatedScript ?? ""),
      visualBrief: String(o.visualBrief ?? ""),
      targetNetwork,
    };
  } catch {
    return null;
  }
}
