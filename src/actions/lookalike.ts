"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  extractTraits,
  synthesizeICP,
  scoreSimilarity,
  type SynthesizedICP,
  type LookalikeResult,
} from "@/lib/prospection/lookalike-analysis";
import { scrapeLeads } from "@/lib/prospection/scraper";
import { searchGoogle } from "@/lib/ai/serper";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorise");
  }
  return session;
}

/**
 * Trouve des profils similaires a ceux d'une liste de prospects
 */
export async function findLookalikes(
  workspaceId: string,
  listId: string,
  options?: { limit?: number }
): Promise<{
  success: boolean;
  results?: LookalikeResult[];
  icp?: SynthesizedICP;
  error?: string;
}> {
  try {
    const session = await requireAuth();

    // Verifier le workspace
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouve" };
    }

    // Verifier la liste
    const list = await prisma.prospectList.findFirst({
      where: { id: listId, workspaceId },
    });
    if (!list) {
      return { success: false, error: "Liste non trouvee" };
    }

    // Charger les prospects de la liste
    const entries = await prisma.prospectListEntry.findMany({
      where: { prospectListId: listId },
      include: { prospect: true },
    });
    const prospects = entries.map((e) => e.prospect);

    if (prospects.length < 3) {
      return {
        success: false,
        error: "La liste doit contenir au moins 3 prospects pour l'analyse",
      };
    }

    const limit = options?.limit || 50;

    // Etape 1 : Extraire les traits + Synthetiser l'ICP via AI
    const traits = extractTraits(prospects);
    const icp = await synthesizeICP(traits);

    // Etape 2 : Collecter les prospects existants pour deduplication
    const existingProspects = await prisma.prospect.findMany({
      where: { workspaceId },
      select: { email: true, linkedInUrl: true, company: true },
    });
    const existingEmails = new Set(
      existingProspects
        .map((p) => p.email?.toLowerCase())
        .filter((e): e is string => !!e)
    );
    const existingLinkedInUrls = new Set(
      existingProspects
        .map((p) => p.linkedInUrl?.toLowerCase())
        .filter((u): u is string => !!u && u.length > 0)
    );
    const originalCompanies = new Set(
      existingProspects
        .map((p) => p.company?.toLowerCase())
        .filter((c): c is string => !!c)
    );

    // Etape 3 : Recherche via scrapeLeads (Google → LinkedIn)
    const allResults: LookalikeResult[] = [];
    const seenUrls = new Set<string>();

    try {
      const scraperResult = await scrapeLeads({
        jobTitles: icp.targetJobTitles.slice(0, 3),
        industries: icp.targetIndustries.slice(0, 2),
        locations: icp.targetLocations.slice(0, 2),
        keywords: icp.keywords.slice(0, 3),
        limit: Math.min(limit + 20, 100),
        requireEmail: false,
      });

      if (scraperResult.success && scraperResult.leads) {
        for (const lead of scraperResult.leads) {
          if (lead.email && existingEmails.has(lead.email.toLowerCase()))
            continue;
          if (
            lead.linkedInUrl &&
            existingLinkedInUrls.has(lead.linkedInUrl.toLowerCase())
          )
            continue;

          const urlKey =
            lead.linkedInUrl?.toLowerCase() ||
            lead.email?.toLowerCase() ||
            lead.name.toLowerCase();
          if (seenUrls.has(urlKey)) continue;
          seenUrls.add(urlKey);

          const { score, reasons } = scoreSimilarity(
            lead,
            icp,
            originalCompanies
          );

          allResults.push({
            name: lead.name,
            company: lead.company,
            jobTitle: lead.jobTitle,
            email: lead.email,
            linkedInUrl: lead.linkedInUrl,
            location: lead.location,
            industry: lead.industry,
            similarityScore: score,
            matchReasons: reasons,
          });
        }
      }
    } catch (error) {
      console.error("Scraper lookalike error:", error);
    }

    // Etape 4 : Recherche complementaire via Serper avec les queries AI
    for (const query of icp.searchQueries.slice(0, 5)) {
      try {
        const googleResults = await searchGoogle(query, 10);

        for (const result of googleResults) {
          const linkedInMatch = result.link.match(
            /(https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/
          );
          if (!linkedInMatch) continue;

          const linkedInUrl = linkedInMatch[1];
          if (existingLinkedInUrls.has(linkedInUrl.toLowerCase())) continue;
          if (seenUrls.has(linkedInUrl.toLowerCase())) continue;
          seenUrls.add(linkedInUrl.toLowerCase());

          // Parser le titre Google pour extraire nom/poste/entreprise
          const cleanTitle = result.title
            .replace(/\s*[\|–—-]\s*LinkedIn\s*$/i, "")
            .trim();
          const titleParts = cleanTitle.split(/\s+[-–—|]\s+/);

          const name = titleParts[0]?.trim();
          const jobTitle = titleParts[1]?.trim();
          const company = titleParts[2]?.trim();

          if (!name || name.length < 2) continue;

          const { score, reasons } = scoreSimilarity(
            { jobTitle, company, location: undefined, industry: undefined },
            icp,
            originalCompanies
          );

          allResults.push({
            name,
            company: company || "Non specifie",
            jobTitle,
            linkedInUrl,
            similarityScore: score,
            matchReasons: reasons,
          });
        }
      } catch (error) {
        console.error(`Serper lookalike error for query "${query}":`, error);
      }
    }

    // Etape 5 : Trier par score decroissant et limiter
    allResults.sort((a, b) => b.similarityScore - a.similarityScore);
    const finalResults = allResults.slice(0, limit);

    return { success: true, results: finalResults, icp };
  } catch (error) {
    console.error("Find lookalikes error:", error);
    return { success: false, error: String(error) };
  }
}
