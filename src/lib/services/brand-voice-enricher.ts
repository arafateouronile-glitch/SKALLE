/**
 * Enrichit le brandVoice d'un workspace en analysant son site web avec Claude.
 * Extrait : offre, valeur unique, fonctionnalités, audience, ton, preuves sociales.
 *
 * Stratégie de merge : les champs déjà remplis manuellement ne sont PAS écrasés.
 */

import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";

// ─── Fetch + nettoyage HTML ───────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
};

function htmlToText(html: string): string {
  // Extract meta tags first — reliable even on SPAs
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
  const metaDesc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,})["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']{10,})["'][^>]+name=["']description["']/i)?.[1]?.trim() ??
    "";
  const ogDesc =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,})["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']{10,})["'][^>]+property=["']og:description["']/i)?.[1]?.trim() ??
    "";

  const body = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [title, metaDesc, ogDesc, body].filter(Boolean).join(" | ").slice(0, 8_000);
}

async function fetchPage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = htmlToText(html);
    return text.length > 80 ? text : null;
  } catch {
    return null;
  }
}

async function serperFallback(domain: string): Promise<string | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `site:${domain}`, num: 6, gl: "fr" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      organic?: { title?: string; snippet?: string }[];
      knowledgeGraph?: { description?: string; title?: string };
    };
    const parts: string[] = [];
    if (data.knowledgeGraph?.title) parts.push(data.knowledgeGraph.title);
    if (data.knowledgeGraph?.description) parts.push(data.knowledgeGraph.description);
    for (const r of data.organic ?? []) {
      if (r.title) parts.push(r.title);
      if (r.snippet) parts.push(r.snippet);
    }
    const text = parts.join(" | ");
    return text.length > 80 ? text.slice(0, 6_000) : null;
  } catch {
    return null;
  }
}

async function fetchWebsiteText(url: string): Promise<string> {
  const base = url.replace(/\/$/, "");

  // Homepage + secondary pages in parallel
  const [homeText, aboutText, featuresText, pricingText] = await Promise.all([
    fetchPage(base).then((t) => t ?? fetchPage(base + "/")),
    fetchPage(base + "/about"),
    fetchPage(base + "/features"),
    fetchPage(base + "/pricing"),
  ]);

  const parts = [homeText, aboutText, featuresText, pricingText].filter(
    (t): t is string => !!t
  );

  if (parts.length > 0) {
    const combined = parts.join("\n\n").slice(0, 8_000);
    if (combined.length >= 80) return combined;
  }

  // Fallback: Google snippets via Serper (handles JS-rendered sites)
  try {
    const domain = new URL(url).hostname;
    const serperText = await serperFallback(domain);
    if (serperText) return serperText;
  } catch {
    // URL parsing failed — skip
  }

  throw new Error(
    "Impossible de récupérer le contenu du site. " +
      "Le site est peut-être une SPA sans rendu serveur (React/Next.js côté client). " +
      "Essayez l'URL d'une page statique comme /about ou /pricing."
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebsiteExtraction {
  offer: string;
  uniqueValue: string;
  targetResult: string;
  targetAudience: string;
  productFeatures: string[];
  socialProof: string | null;
  tone: "formal" | "professional" | "friendly";
}

// ─── Enrichissement ───────────────────────────────────────────────────────────

export async function enrichBrandVoiceFromWebsite(workspaceId: string): Promise<{
  enriched: boolean;
  extracted: WebsiteExtraction;
  mergedFields: string[];
}> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, brandVoice: true },
  });
  if (!workspace) throw new Error("Workspace introuvable");

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const websiteUrl = (bv.websiteUrl as string | undefined)?.trim();
  if (!websiteUrl) throw new Error("Aucune URL de site configurée dans le brand voice");

  const pageText = await fetchWebsiteText(websiteUrl);

  const claude = getClaude();

  const system = new SystemMessage({
    content: [
      {
        type: "text",
        text: `Tu es un expert en analyse de produit et marketing B2B.
À partir du contenu brut d'un site web, tu extrais les informations clés pour alimenter le contexte de marque d'un outil de prospection IA.
Sois précis, concret, et utilise le vocabulaire exact du site (pas de généralités).`,
        cache_control: { type: "ephemeral" },
      },
    ],
  });

  const human = new HumanMessage(`
Entreprise : ${workspace.name}
URL analysée : ${websiteUrl}

CONTENU DU SITE :
${pageText}

Extrais les informations de marque. Retourne CE JSON EXACT (rien d'autre, pas de markdown) :
{
  "offer": "Description du produit/service en 1-2 phrases concrètes (cite les termes du site)",
  "uniqueValue": "Ce qui différencie vraiment ce produit — une phrase précise",
  "targetResult": "Le résultat mesurable que le client obtient (ex: 'automatiser la gestion administrative en 1 clic')",
  "targetAudience": "À qui s'adresse ce produit — aussi précis que possible (ex: 'organismes de formation professionnelle')",
  "productFeatures": ["fonctionnalité nommée 1", "fonctionnalité nommée 2", "fonctionnalité nommée 3"],
  "socialProof": "Preuves sociales, clients cités, certifications, labels — ou null si aucune",
  "tone": "formal | professional | friendly"
}
`);

  const response = await claude.invoke([system, human]);
  const raw =
    typeof response.content === "string"
      ? response.content
      : ((response.content as Array<{ text?: string }>)[0]?.text ?? "");

  const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
  const extracted = JSON.parse(cleaned) as WebsiteExtraction;

  // Merge : les champs existants non vides priment sur ceux extraits automatiquement
  const merged: Record<string, unknown> = { ...extracted };
  const mergedFields: string[] = [];

  for (const key of Object.keys(extracted) as Array<keyof WebsiteExtraction>) {
    const existing = bv[key];
    const isSet =
      existing !== undefined &&
      existing !== null &&
      existing !== "" &&
      !(Array.isArray(existing) && (existing as unknown[]).length === 0);

    if (isSet) {
      // Le champ manuel prend le dessus — on ne touche pas
      merged[key] = existing;
    } else {
      mergedFields.push(key);
    }
  }

  // Champs système — toujours mis à jour
  merged.websiteUrl = websiteUrl;
  merged.websiteEnrichedAt = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { brandVoice: { ...bv, ...merged } as any },
  });

  return { enriched: true, extracted, mergedFields };
}
