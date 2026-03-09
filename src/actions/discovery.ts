"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCredits } from "@/lib/credits";
import { getTopPagesForDomain, searchGoogleFull, searchGoogle } from "@/lib/ai/serper";
import { z } from "zod";

const domainSchema = z.string().min(3);

interface DiscoveryResult {
  topPages: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  relatedKeywords: string[];
  keywordsShort: string[];
  keywordsMedium: string[];
  keywordsLongTail: string[];
  opportunities: Array<{
    keyword: string;
    difficulty: "easy" | "medium" | "hard";
    potential: number;
  }>;
}

export async function analyzeCompetitor(
  workspaceId: string,
  domain: string
): Promise<{ success: boolean; data?: DiscoveryResult; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const parsed = domainSchema.safeParse(domain);
    if (!parsed.success) {
      return { success: false, error: "Domaine invalide" };
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    return await withCredits("competitor_analysis", workspaceId, async () => {
    // Clean domain
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];

    // Get top pages for the domain
    const topPages = await getTopPagesForDomain(cleanDomain);

    // Extract keywords from top pages
    const keywordsFromTitles = topPages
      .map((p) => p.title.toLowerCase())
      .flatMap((t) => t.split(/[\s\-|:,]+/))
      .filter((k) => k.length > 3)
      .slice(0, 5);

    // Build query for related keywords - fallback to domain name if no keywords
    const domainName = cleanDomain.replace(/\.[a-z]{2,}$/, ""); // "amazon.com" -> "amazon"
    const keywordsQuery =
      keywordsFromTitles.slice(0, 3).join(" ").trim() || domainName || cleanDomain;

    // Get related keywords: Serper relatedSearches/peopleAlsoAsk, then fallback from organic results
    const extractFromResponse = (response: Awaited<ReturnType<typeof searchGoogleFull>>) => {
      const rs = (response.relatedSearches || []).map((r: { query?: string } | string) =>
        typeof r === "string" ? r : (r as { query?: string })?.query ?? ""
      );
      const paa = (response.peopleAlsoAsk || [])
        .map((r: { question?: string }) => r.question)
        .filter(Boolean) as string[];
      return [...rs, ...paa.map((q) => String(q).replace(/\?$/, "").trim())].filter((k) => k.length > 2);
    };

    const extractFromOrganic = (organic: Array<{ title?: string; snippet?: string }>) => {
      const stopWords = new Set(
        "le la les un une des du de et ou mais que qui dont donc avec sans sous sur pour par".split(" ")
      );
      const words = organic
        .flatMap((r) => `${r.title ?? ""} ${r.snippet ?? ""}`.toLowerCase().split(/\s+/))
        .map((w) => w.replace(/[^a-zàâäéèêëïîôùûüç0-9-]/gi, ""))
        .filter((w) => w.length > 3 && !stopWords.has(w));
      const counted = new Map<string, number>();
      for (const w of words) {
        counted.set(w, (counted.get(w) ?? 0) + 1);
      }
      return [...counted.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([k]) => k);
    };

    let fullResponse = await searchGoogleFull(keywordsQuery, 10);
    let relatedKeywords = extractFromResponse(fullResponse);

    if (relatedKeywords.length === 0 && domainName && domainName !== keywordsQuery) {
      fullResponse = await searchGoogleFull(domainName, 10);
      relatedKeywords = extractFromResponse(fullResponse);
    }

    // Fallback final: extraire des titres/snippets des résultats organiques
    if (relatedKeywords.length === 0 && fullResponse.organic?.length) {
      relatedKeywords = extractFromOrganic(fullResponse.organic);
    }

    // Dernier recours: mots issus des top pages du site
    if (relatedKeywords.length === 0 && keywordsFromTitles.length > 0) {
      relatedKeywords = [...new Set(keywordsFromTitles)].slice(0, 10);
    }
    if (relatedKeywords.length === 0 && topPages.length > 0) {
      relatedKeywords = extractFromOrganic(
        topPages.map((p) => ({ title: p.title, snippet: p.snippet }))
      );
    }

    relatedKeywords = [...new Set(relatedKeywords)].filter((k) => k.length > 1);

    // Modifiers pour générer moyen / long-tail (contexte français)
    const modifiersMedium = ["meilleur", "gratuit", "prix", "avis", "comparatif", "guide", "2024", "alternatives"];
    const modifiersLong = ["comment choisir", "guide complet", "pour débutants", "avantages et inconvénients", "vs", "tutoriel", "formation", "exemples"];

    // Classer en court (1-2 mots), moyen (3-4), long (5+)
    const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    let keywordsShort: string[] = [];
    let keywordsMedium: string[] = [];
    let keywordsLongTail: string[] = [];

    for (const k of relatedKeywords) {
      const w = wordCount(k);
      if (w <= 2) keywordsShort.push(k);
      else if (w <= 4) keywordsMedium.push(k);
      else keywordsLongTail.push(k);
    }

    // Enrichir : générer moyen/long à partir du domaine et des courts
    const seeds = domainName ? [domainName, ...keywordsShort.slice(0, 5)] : keywordsShort.slice(0, 6);
    for (const seed of seeds) {
      if (wordCount(seed) >= 3) continue;
      for (const mod of modifiersMedium) {
        const phrase = `${mod} ${seed}`.trim();
        if (!keywordsMedium.includes(phrase) && wordCount(phrase) >= 2) {
          keywordsMedium.push(phrase);
        }
      }
      for (const mod of modifiersLong) {
        const phrase = `${mod} ${seed}`.trim();
        if (!keywordsLongTail.includes(phrase) && wordCount(phrase) >= 3) {
          keywordsLongTail.push(phrase);
        }
      }
    }

    keywordsShort = [...new Set(keywordsShort)].filter((k) => k.length > 1).slice(0, 25);
    keywordsMedium = [...new Set(keywordsMedium)].filter((k) => k.length > 2).slice(0, 25);
    keywordsLongTail = [...new Set(keywordsLongTail)].filter((k) => k.length > 3).slice(0, 25);

    // Mots trop génériques à exclure des opportunités (single-word)
    const genericWords = new Set(
      "logiciel solution service outil plateforme site web gratuit prix meilleur comment guide".split(" ")
    );

    // Opportunités : privilégier long-tail et moyen, exclure le générique
    const candidatesForOpportunities = [
      ...keywordsLongTail,
      ...keywordsMedium,
      ...keywordsShort.filter((k) => wordCount(k) >= 2 || !genericWords.has(k.toLowerCase().trim())),
    ]
      .filter((k) => wordCount(k) >= 2 || (wordCount(k) === 1 && k.length > 4 && !genericWords.has(k.toLowerCase())))
      .slice(0, 18);

    const opportunities = candidatesForOpportunities.slice(0, 12).map((keyword, index) => {
      const w = wordCount(keyword);
      const difficulty: "easy" | "medium" | "hard" =
        w >= 4 ? "easy" : w >= 2 ? "medium" : "hard";
      const potential = w >= 4 ? Math.max(85 - index * 4, 50) : Math.max(70 - index * 5, 25);
      return {
        keyword,
        difficulty,
        potential,
      };
    });

    const allKeywords = [...keywordsShort, ...keywordsMedium, ...keywordsLongTail];
    const relatedKeywordsFinal = [...new Set(allKeywords)].slice(0, 40);

    return {
      topPages,
      relatedKeywords: relatedKeywordsFinal,
      keywordsShort,
      keywordsMedium,
      keywordsLongTail,
      opportunities,
    };
    });
  } catch (error) {
    console.error("Discovery error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function searchKeywords(
  workspaceId: string,
  query: string
): Promise<{ success: boolean; data?: Array<{ title: string; link: string; snippet: string }>; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    return await withCredits("keyword_analysis", workspaceId, async () => {
      const results = await searchGoogle(query, 10);
      return results.map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
      }));
    });
  } catch (error) {
    console.error("Search error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
