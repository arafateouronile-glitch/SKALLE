/**
 * 🗺️ B2B Local Volume Scraper (Google Maps API)
 *
 * "Chalutier" : volume de leads locaux (plombiers, dentistes, restaurants).
 * Filtre à Douleur : NO_WEBSITE, BAD_REPUTATION, LOW_VISIBILITY → Hook IA personnalisé.
 */

import { getClaude } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { prisma } from "@/lib/prisma";
import { useCredits, CREDIT_COSTS, type OperationType } from "@/lib/credits";
import { randomBytes } from "crypto";
import { searchGoogleMaps } from "@/lib/ai/serper";

const MIN_LEADS = 10;
const MAX_LEADS = 100;
const LOCAL_MAPS_OPERATION: OperationType = "local_maps_scan";

// ═══════════════════════════════════════════════════════════════════════════
// 📡 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type LocalPainTag = "NO_WEBSITE" | "BAD_REPUTATION" | "LOW_VISIBILITY" | null;

export interface LocalBusinessRaw {
  name: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
}

export interface LocalLeadEvaluated extends LocalBusinessRaw {
  tag: LocalPainTag;
  suggestedHook: string;
  aiSummary: string; // tags + résumé pour le CRM
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INTÉGRATION API (Apify / Outscraper ou mock)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les entreprises locales via Serper Maps (Google Maps).
 * Fallback : Outscraper si configuré, sinon mock data.
 */
export async function fetchLocalBusinesses(
  query: string,
  limit: number
): Promise<LocalBusinessRaw[]> {
  const capped = Math.min(MAX_LEADS, Math.max(MIN_LEADS, limit));

  // 1. Serper Maps (priorité : clé déjà configurée)
  if (process.env.SERPER_API_KEY) {
    try {
      const places = await searchGoogleMaps(query, Math.min(capped, 20));
      if (places.length > 0) {
        return places.map((p) => ({
          name: p.title,
          phone: p.phone ?? null,
          website: p.website ?? null,
          rating: p.rating ?? null,
          reviewCount: p.ratingCount ?? null,
          address: p.address ?? null,
        }));
      }
    } catch (err) {
      console.error("[LocalScraper] Serper Maps error:", err);
    }
  }

  // 2. Outscraper (optionnel)
  const apiKey = process.env.OUTSCRAPER_API_KEY ?? process.env.APIFY_API_KEY;
  if (apiKey && process.env.USE_OUTSCRAPER === "true") {
    try {
      const res = await fetch(
        `https://api.app.outscraper.com/maps/search?query=${encodeURIComponent(query)}&limit=${capped}`,
        { headers: { "X-API-KEY": apiKey } }
      );
      if (res.ok) {
        const data = (await res.json()) as unknown[];
        const flat = (Array.isArray(data) ? data : [data]).flat();
        return normalizeOutscraperResults(flat).slice(0, capped);
      }
    } catch (err) {
      console.error("[LocalScraper] Outscraper error:", err);
    }
  }

  // 3. Mock data (dev fallback)
  return getMockLocalBusinesses(query, capped);
}

function normalizeOutscraperResults(results: unknown[]): LocalBusinessRaw[] {
  return results.map((r: any) => ({
    name: r.title ?? r.name ?? "Entreprise",
    phone: r.phone ?? null,
    website: r.website ?? null,
    rating: typeof r.rating === "number" ? r.rating : parseFloat(r.rating) || null,
    reviewCount: typeof r.reviewsCount === "number" ? r.reviewsCount : parseInt(r.reviewsCount, 10) || null,
    address: r.address ?? r.fullAddress ?? null,
  }));
}

function getMockLocalBusinesses(query: string, limit: number): LocalBusinessRaw[] {
  const [activity, city] = query.split(/\s+à\s+|\s+in\s+/i).map((s) => s.trim());
  const place = city || "Paris";
  const names = [
    "Bernard & Fils",
    "Pro Services",
    "Artisans du Coin",
    "Qualité Plus",
    "Express Local",
    "Top Pro",
    "Rapid Service",
    "Expert Home",
    "Confort & Co",
    "Solution Pro",
  ];
  return Array.from({ length: limit }, (_, i) => ({
    name: `${names[i % names.length]} ${i + 1}`,
    phone: `0${1 + (i % 9)}${String(i).padStart(8, "0")}`,
    website: i % 3 === 0 ? null : `https://${names[i % names.length].toLowerCase().replace(/\s/g, "")}.fr`,
    rating: i % 4 === 0 ? 3.2 : 4.5 + (i % 5) * 0.1,
    reviewCount: i % 5 === 0 ? 3 : 15 + (i % 50),
    address: `${i + 10} rue de la République, ${place}`,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. AGENT QUALIFICATEUR (Filtre à Douleur)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Détermine le tag de "douleur" (règles pures) puis génère l'accroche via LLM.
 */
export async function evaluateLocalLead(business: LocalBusinessRaw): Promise<LocalLeadEvaluated> {
  let tag: LocalPainTag = null;
  if (business.website == null || business.website.trim() === "") {
    tag = "NO_WEBSITE";
  } else if (business.rating != null && business.rating < 4.0) {
    tag = "BAD_REPUTATION";
  } else if (business.reviewCount != null && business.reviewCount < 10) {
    tag = "LOW_VISIBILITY";
  }

  const hook = await generateHookForTag(tag, business);
  const tagsLabel = tag ? `Tag: ${tag}. ` : "";
  const aiSummary = `${tagsLabel}${business.rating != null ? `Note: ${business.rating}/5. ` : ""}${business.reviewCount != null ? `${business.reviewCount} avis.` : ""} ${hook.slice(0, 120)}...`;

  return {
    ...business,
    tag,
    suggestedHook: hook,
    aiSummary: aiSummary.trim(),
  };
}

const HOOK_SYSTEM = `Tu es un expert en prospection B2B locale (SMS / Cold Call). Rédige UN SEUL message court d'accroche (2-3 phrases max) pour contacter cette entreprise locale. Pas de bla-bla, ton direct et professionnel. Propose une solution concrète (site web, avis, visibilité) selon le problème détecté.`;

async function generateHookForTag(tag: LocalPainTag, business: LocalBusinessRaw): Promise<string> {
  const llm = getClaude();
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", HOOK_SYSTEM],
    [
      "human",
      "Entreprise: {name}. Adresse: {address}. Tél: {phone}. Site: {website}. Note Google: {rating}. Nombre d'avis: {reviewCount}.\n\nProblème détecté (Tag): {tag}. Rédige l'accroche SMS/Cold Call.",
    ],
  ]);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const hook = await chain.invoke({
    name: business.name,
    address: business.address ?? "—",
    phone: business.phone ?? "—",
    website: business.website ?? "Aucun",
    rating: business.rating ?? "—",
    reviewCount: business.reviewCount ?? "—",
    tag: tag ?? "Aucun (prospection générale)",
  });
  return hook.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. INJECTION MASSIVE CRM
// ═══════════════════════════════════════════════════════════════════════════

export interface ProspectBasic {
  id: string;
  name: string;
  email: string | null;
  company: string;
  jobTitle: string | null;
}

export interface BulkLocalResult {
  success: boolean;
  imported: number;
  prospects: ProspectBasic[];
  error?: string;
}

/**
 * Insère les leads locaux en base. source = LOCAL_MAPS, status = NEW.
 * aiSummary = tags + hook résumé. suggestedHook = accroche complète.
 */
export async function bulkProcessLocalLeads(
  workspaceId: string,
  leads: LocalLeadEvaluated[]
): Promise<BulkLocalResult> {
  let imported = 0;
  const prospects: ProspectBasic[] = [];
  for (const lead of leads) {
    try {
      const uniqueEmail = `local+${randomBytes(8).toString("hex")}@maps.skalle`;
      const prospect = await prisma.prospect.create({
        data: {
          name: lead.name,
          company: lead.name,
          email: uniqueEmail,
          linkedInUrl: lead.website || "https://www.google.com/maps",
          phone: lead.phone ?? undefined,
          location: lead.address ?? undefined,
          notes: lead.address ?? undefined,
          status: "NEW",
          source: "LOCAL_MAPS",
          suggestedHook: lead.suggestedHook,
          aiSummary: lead.aiSummary,
          platform: "LOCAL",
          workspaceId,
        },
        select: { id: true, name: true, email: true, company: true, jobTitle: true },
      });
      prospects.push(prospect);
      imported++;
    } catch (err) {
      console.error(`[LocalScraper] Failed to create ${lead.name}:`, err);
    }
  }
  return { success: true, imported, prospects };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SCAN COMPLET (fetch + evaluate + optional save) — pour l'UI
// ═══════════════════════════════════════════════════════════════════════════

export interface ScanLocalResult {
  success: boolean;
  leads?: LocalLeadEvaluated[];
  error?: string;
  creditsUsed?: number;
}

/**
 * Récupère les entreprises, les qualifie (tag + hook IA), retourne la liste.
 * Déduit les crédits avant exécution. Ne sauvegarde pas en base.
 */
export async function scanLocalBusinesses(
  userId: string,
  query: string,
  limit: number
): Promise<ScanLocalResult> {
  const cost = CREDIT_COSTS[LOCAL_MAPS_OPERATION];
  const creditResult = await useCredits(userId, LOCAL_MAPS_OPERATION, { query, limit });
  if (!creditResult.success) {
    return { success: false, error: creditResult.error ?? "Crédits insuffisants", creditsUsed: cost };
  }

  const capped = Math.min(MAX_LEADS, Math.max(MIN_LEADS, limit));
  let raw: LocalBusinessRaw[];
  try {
    raw = await fetchLocalBusinesses(query, capped);
  } catch (err) {
    console.error("[LocalScraper] fetch failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur lors de la récupération",
      creditsUsed: cost,
    };
  }

  const results = await Promise.allSettled(
    raw.map((business) => evaluateLocalLead(business))
  );

  const leads: LocalLeadEvaluated[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      leads.push(result.value);
    } else {
      console.error(`[LocalScraper] evaluate failed for ${raw[i].name}:`, result.reason);
    }
  });

  return { success: true, leads, creditsUsed: cost };
}
