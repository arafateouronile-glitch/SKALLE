/**
 * 🛠️ Agent Tools - Outils utilisables par les agents IA
 * 
 * Ces outils permettent aux agents d'interagir avec:
 * - Le web (recherche, scraping)
 * - La base de données
 * - Les APIs externes
 * - La génération de contenu
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as cheerio from "cheerio";

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 WEB SEARCH TOOL - Recherche Google via Serper
// ═══════════════════════════════════════════════════════════════════════════

export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description: "Recherche sur Google pour trouver des informations actuelles. Utilise cet outil pour trouver des sources, des données de marché, des tendances.",
  schema: z.object({
    query: z.string().describe("La requête de recherche"),
    numResults: z.number().optional().default(10).describe("Nombre de résultats souhaités"),
  }),
  func: async ({ query, numResults = 10 }) => {
    if (!process.env.SERPER_API_KEY) {
      return JSON.stringify({ error: "API Serper non configurée", results: [] });
    }

    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: numResults }),
      });

      const data = await response.json();
      const results = data.organic?.map((r: { title: string; link: string; snippet: string }) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })) || [];

      return JSON.stringify({ query, results });
    } catch (error) {
      return JSON.stringify({ error: String(error), results: [] });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 WEB SCRAPER TOOL - Extraction de contenu web
// ═══════════════════════════════════════════════════════════════════════════

export const webScraperTool = new DynamicStructuredTool({
  name: "scrape_webpage",
  description: "Extrait le contenu textuel d'une page web. Utilise cet outil pour analyser le contenu d'un site concurrent ou obtenir des informations détaillées.",
  schema: z.object({
    url: z.string().url().describe("L'URL de la page à scraper"),
    selector: z.string().optional().describe("Sélecteur CSS optionnel pour cibler une partie spécifique"),
  }),
  func: async ({ url, selector }) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SkalleBot/1.0)",
        },
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      // Supprimer les éléments non pertinents
      $("script, style, nav, footer, header, aside, .ad, .advertisement").remove();

      const content = selector ? $(selector).text() : $("body").text();
      const title = $("title").text();
      const metaDescription = $('meta[name="description"]').attr("content") || "";
      const h1 = $("h1").first().text();
      const h2s = $("h2").map((_, el) => $(el).text()).get().slice(0, 10);

      return JSON.stringify({
        url,
        title,
        metaDescription,
        h1,
        h2s,
        content: content.replace(/\s+/g, " ").trim().slice(0, 8000),
      });
    } catch (error) {
      return JSON.stringify({ error: String(error), url });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 📊 SEO ANALYZER TOOL - Analyse SEO On-Page
// ═══════════════════════════════════════════════════════════════════════════

export const seoAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_seo",
  description: "Analyse le SEO on-page d'une URL et retourne un score avec des recommandations.",
  schema: z.object({
    url: z.string().url().describe("L'URL de la page à analyser"),
  }),
  func: async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SkalleBot/1.0)" },
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      const issues: string[] = [];
      let score = 100;

      // Title analysis
      const title = $("title").text();
      if (!title) {
        issues.push("❌ Pas de balise title");
        score -= 15;
      } else if (title.length < 30 || title.length > 60) {
        issues.push(`⚠️ Title non optimal (${title.length} caractères, idéal: 30-60)`);
        score -= 5;
      }

      // Meta description
      const metaDesc = $('meta[name="description"]').attr("content");
      if (!metaDesc) {
        issues.push("❌ Pas de meta description");
        score -= 10;
      } else if (metaDesc.length < 120 || metaDesc.length > 160) {
        issues.push(`⚠️ Meta description non optimale (${metaDesc.length} chars, idéal: 120-160)`);
        score -= 5;
      }

      // H1 analysis
      const h1Count = $("h1").length;
      if (h1Count === 0) {
        issues.push("❌ Pas de balise H1");
        score -= 15;
      } else if (h1Count > 1) {
        issues.push(`⚠️ Plusieurs H1 détectés (${h1Count})`);
        score -= 5;
      }

      // Images without alt
      const imagesNoAlt = $("img:not([alt]), img[alt='']").length;
      if (imagesNoAlt > 0) {
        issues.push(`⚠️ ${imagesNoAlt} images sans attribut alt`);
        score -= Math.min(imagesNoAlt * 2, 10);
      }

      // Internal/External links
      const internalLinks = $("a[href^='/'], a[href^='" + url + "']").length;
      const externalLinks = $("a[href^='http']").length - internalLinks;

      // Content length
      const textContent = $("body").text().replace(/\s+/g, " ").trim();
      const wordCount = textContent.split(" ").length;
      if (wordCount < 300) {
        issues.push(`⚠️ Contenu trop court (${wordCount} mots, minimum recommandé: 300)`);
        score -= 10;
      }

      // Structured data
      const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
      if (!hasStructuredData) {
        issues.push("💡 Pas de données structurées (Schema.org)");
        score -= 5;
      }

      return JSON.stringify({
        url,
        score: Math.max(0, score),
        title,
        metaDescription: metaDesc || null,
        h1: $("h1").first().text(),
        wordCount,
        internalLinks,
        externalLinks,
        imagesNoAlt,
        hasStructuredData,
        issues,
        recommendations: issues.length > 0 
          ? issues.map(i => i.replace(/[❌⚠️💡]\s*/, ""))
          : ["✅ Aucun problème majeur détecté"],
      });
    } catch (error) {
      return JSON.stringify({ error: String(error), url, score: 0 });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 📈 KEYWORD ANALYZER TOOL - Analyse de mots-clés
// ═══════════════════════════════════════════════════════════════════════════

export const keywordAnalyzerTool = new DynamicStructuredTool({
  name: "analyze_keyword",
  description: "Analyse un mot-clé pour le SEO via Serper (Google). Retourne une estimation heuristique de la difficulté basée sur la présence de Wikipedia/grandes marques dans les résultats, des suggestions long-tail et les questions associées. Note: volume non disponible via cette méthode, difficulté = estimation.",
  schema: z.object({
    keyword: z.string().describe("Le mot-clé à analyser"),
  }),
  func: async ({ keyword }) => {
    if (!process.env.SERPER_API_KEY) {
      return JSON.stringify({ error: "API Serper non configurée" });
    }

    try {
      // Recherche le mot-clé pour analyser la compétition
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: keyword, num: 10 }),
      });

      const data = await response.json();
      const results = data.organic || [];

      // Analyse de la compétition
      const topDomains = results.map((r: { link: string }) => new URL(r.link).hostname);
      const hasWikipedia = topDomains.some((d: string) => d.includes("wikipedia"));
      const hasBigBrands = topDomains.filter((d: string) => 
        ["amazon", "facebook", "google", "microsoft", "apple"].some(b => d.includes(b))
      ).length;

      // Estimation de la difficulté
      let difficulty: "easy" | "medium" | "hard" = "medium";
      if (hasWikipedia || hasBigBrands > 3) {
        difficulty = "hard";
      } else if (hasBigBrands === 0 && !hasWikipedia) {
        difficulty = "easy";
      }

      // Suggestions de long-tail
      const relatedSearches = data.relatedSearches?.map((r: { query: string }) => r.query) || [];
      const peopleAlsoAsk = data.peopleAlsoAsk?.map((q: { question: string }) => q.question) || [];

      return JSON.stringify({
        keyword,
        difficulty,
        topCompetitors: topDomains.slice(0, 5),
        hasWikipedia,
        bigBrandsCount: hasBigBrands,
        relatedKeywords: relatedSearches.slice(0, 5),
        questions: peopleAlsoAsk.slice(0, 5),
        recommendation: difficulty === "hard" 
          ? "Ciblez des variantes long-tail de ce mot-clé"
          : difficulty === "easy"
          ? "Opportunité intéressante, faible concurrence"
          : "Concurrence modérée, contenu de qualité requis",
      });
    } catch (error) {
      return JSON.stringify({ error: String(error), keyword });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 IMAGE GENERATOR TOOL - Génération d'images IA
// ═══════════════════════════════════════════════════════════════════════════

export const imageGeneratorTool = new DynamicStructuredTool({
  name: "generate_image",
  description: "Génère une image avec l'IA basée sur un prompt. Utile pour créer des visuels de blog, réseaux sociaux, etc.",
  schema: z.object({
    prompt: z.string().describe("Description détaillée de l'image à générer"),
    style: z.enum(["professional", "creative", "minimalist", "vibrant"]).optional().default("professional"),
  }),
  func: async ({ prompt, style = "professional" }) => {
    const styleModifiers: Record<string, string> = {
      professional: "clean, corporate, modern design, subtle colors",
      creative: "artistic, colorful, unique composition, eye-catching",
      minimalist: "simple, white space, minimal elements, elegant",
      vibrant: "bold colors, energetic, dynamic, striking",
    };

    const enhancedPrompt = `${prompt}. Style: ${styleModifiers[style]}. High quality, 4K.`;

    if (!process.env.NANO_BANANA_API_KEY) {
      return JSON.stringify({
        status: "not_configured",
        message: "Génération d'image non disponible — configurez NANO_BANANA_API_KEY dans .env",
        imageUrl: null,
      });
    }

    try {
      const { generateNanoBananaImageRaw } = await import("@/lib/services/image/nano-banana");
      const imageUrl = await generateNanoBananaImageRaw(enhancedPrompt, {
        aspectRatio: "16:9",
        styleReference: "business_minimalist",
        renderMode: "high_definition",
      });
      return JSON.stringify({ status: "success", prompt: enhancedPrompt, imageUrl });
    } catch (error) {
      return JSON.stringify({ status: "error", error: String(error), imageUrl: null });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 📝 CONTENT WRITER TOOL - Génération de contenu structuré
// ═══════════════════════════════════════════════════════════════════════════

export const contentWriterTool = new DynamicStructuredTool({
  name: "write_content",
  description: "Génère du contenu structuré (article, post, script) basé sur des paramètres spécifiques.",
  schema: z.object({
    type: z.enum(["seo_article", "linkedin_post", "twitter_thread", "tiktok_script", "email"]),
    topic: z.string().describe("Le sujet principal"),
    keywords: z.array(z.string()).optional().describe("Mots-clés à inclure"),
    tone: z.enum(["professional", "casual", "technical", "friendly"]).optional().default("professional"),
    length: z.enum(["short", "medium", "long"]).optional().default("medium"),
  }),
  func: async ({ type, topic, keywords = [], tone = "professional", length = "medium" }) => {
    // Cet outil sera utilisé par les agents pour générer du contenu
    // La vraie génération se fait via l'agent lui-même avec le LLM
    return JSON.stringify({
      task: "content_generation",
      type,
      topic,
      keywords,
      tone,
      length,
      guidelines: getContentGuidelines(type, length),
    });
  },
});

function getContentGuidelines(type: string, length: string): string {
  const lengthGuide = {
    short: "300-500 mots",
    medium: "800-1200 mots",
    long: "1500-2500 mots",
  };

  const guides: Record<string, string> = {
    seo_article: `Article SEO optimisé. Longueur: ${lengthGuide[length as keyof typeof lengthGuide]}. Structure H1/H2/H3, paragraphes courts, mots-clés naturels.`,
    linkedin_post: "Post LinkedIn engageant. Hook accrocheur, paragraphes espacés, CTA, 3-5 hashtags. Max 1300 caractères.",
    twitter_thread: "Thread X de 5-7 tweets. Premier tweet = hook viral. Chaque tweet max 280 chars. Numéroter (1/, 2/, etc.).",
    tiktok_script: "Script TikTok 30-60 secondes. Hook 3 premières secondes. Format: [VISUEL] + texte parlé.",
    email: "Email marketing persuasif. Objet accrocheur, corps scannable, CTA clair.",
  };

  return guides[type] || "Contenu de qualité professionnelle";
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINKEDIN PROFILE TOOL - Extraction de profil LinkedIn via web search
// ═══════════════════════════════════════════════════════════════════════════

export const linkedinProfileTool = new DynamicStructuredTool({
  name: "get_linkedin_profile",
  description: "Récupère les informations publiques d'un profil LinkedIn (nom, poste, entreprise, activité récente) via Google. Stratégie 1: scraping direct du profil public. Stratégie 2: recherche Google pour extraire le snippet LinkedIn.",
  schema: z.object({
    linkedinUrl: z.string().describe("L'URL du profil LinkedIn (ex: https://linkedin.com/in/jean-dupont)"),
    fullName: z.string().optional().describe("Nom complet de la personne (optionnel, améliore la recherche)"),
    company: z.string().optional().describe("Entreprise actuelle (optionnel, améliore la recherche)"),
  }),
  func: async ({ linkedinUrl, fullName, company }) => {
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/]+)/);
    const username = usernameMatch ? usernameMatch[1] : null;

    // Stratégie 1 : scraping direct du profil public LinkedIn
    try {
      const response = await fetch(linkedinUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);

        // LinkedIn public profile expose ces balises meta
        const name = $('meta[property="og:title"]').attr("content")
          ?? $("title").text().replace(" | LinkedIn", "").trim();
        const description = $('meta[property="og:description"]').attr("content")
          ?? $('meta[name="description"]').attr("content")
          ?? "";
        const image = $('meta[property="og:image"]').attr("content") ?? null;

        if (name && name !== "LinkedIn") {
          return JSON.stringify({
            source: "direct_scrape",
            url: linkedinUrl,
            username,
            name,
            headline: description.split(" | ")[0] ?? description,
            rawDescription: description.slice(0, 500),
            hasPhoto: !!image,
          });
        }
      }
    } catch {
      // LinkedIn peut bloquer — on passe à la stratégie 2
    }

    // Stratégie 2 : recherche Google via Serper pour extraire le snippet LinkedIn
    if (!process.env.SERPER_API_KEY) {
      return JSON.stringify({
        source: "unavailable",
        url: linkedinUrl,
        username,
        error: "SERPER_API_KEY non configurée — impossible d'enrichir le profil",
      });
    }

    try {
      const query = fullName && company
        ? `"${fullName}" "${company}" site:linkedin.com/in`
        : username
        ? `site:linkedin.com/in/${username}`
        : `${fullName ?? ""} ${company ?? ""} LinkedIn`;

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 3 }),
      });

      const data = await response.json();
      const topResult = data.organic?.[0];

      if (topResult) {
        // Google expose souvent : "Nom | Poste chez Entreprise | LinkedIn"
        const titleParts = (topResult.title as string ?? "").replace(" | LinkedIn", "").split(" | ");
        const extractedName = titleParts[0]?.trim() ?? "";
        const headline = titleParts[1]?.trim() ?? topResult.snippet?.split(".")[0] ?? "";

        // Chercher les posts récents dans les autres résultats
        const recentActivity = data.organic
          ?.slice(0, 3)
          .filter((r: { link: string }) => r.link?.includes("linkedin.com"))
          .map((r: { title: string; snippet: string }) => r.snippet?.slice(0, 150))
          .filter(Boolean)
          .join(" | ");

        return JSON.stringify({
          source: "google_search",
          url: linkedinUrl,
          username,
          name: extractedName || fullName || username,
          headline,
          snippet: topResult.snippet?.slice(0, 300),
          recentActivity: recentActivity || null,
          searchQuery: query,
        });
      }
    } catch (error) {
      return JSON.stringify({ source: "error", url: linkedinUrl, username, error: String(error) });
    }

    return JSON.stringify({
      source: "not_found",
      url: linkedinUrl,
      username,
      name: fullName ?? username,
      note: "Profil non trouvé publiquement. Personnalise le message avec les infos disponibles (nom, entreprise, titre).",
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 📦 EXPORT ALL TOOLS
// ═══════════════════════════════════════════════════════════════════════════

export const allTools = [
  webSearchTool,
  webScraperTool,
  seoAnalyzerTool,
  keywordAnalyzerTool,
  imageGeneratorTool,
  contentWriterTool,
  linkedinProfileTool,
];

export const toolsByCategory = {
  research: [webSearchTool, webScraperTool, keywordAnalyzerTool],
  seo: [seoAnalyzerTool, keywordAnalyzerTool],
  content: [contentWriterTool, imageGeneratorTool],
  prospection: [linkedinProfileTool, webSearchTool],
};
