/**
 * 🔎 Discovery Agent - Agent Autonome d'Analyse Concurrentielle
 * 
 * Cet agent peut:
 * - Analyser les sites concurrents
 * - Identifier les opportunités SEO
 * - Découvrir les stratégies de contenu gagnantes
 * - Extraire la brand voice des concurrents
 * - Recommander des actions stratégiques
 */

import { createAgent, AgentResult } from "./base-agent";
import { 
  webSearchTool, 
  seoAnalyzerTool, 
  keywordAnalyzerTool,
  webScraperTool 
} from "../tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ OUTILS SPÉCIALISÉS DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

const analyzeCompetitorStrategyTool = new DynamicStructuredTool({
  name: "analyze_competitor_strategy",
  description: "Analyse la stratégie marketing d'un concurrent basée sur son contenu et sa présence web.",
  schema: z.object({
    domain: z.string().describe("Le domaine du concurrent à analyser"),
    scrapedContent: z.string().describe("Le contenu déjà scrapé du site"),
  }),
  func: async ({ domain, scrapedContent }) => {
    // Analyse du contenu pour extraire la stratégie
    const analysis = {
      domain,
      contentTypes: [] as string[],
      targetAudience: "",
      mainTopics: [] as string[],
      contentFrequency: "",
      strengths: [] as string[],
      weaknesses: [] as string[],
    };

    // Détecter les types de contenu
    if (scrapedContent.toLowerCase().includes("blog")) analysis.contentTypes.push("Blog");
    if (scrapedContent.toLowerCase().includes("case study") || scrapedContent.toLowerCase().includes("étude de cas")) {
      analysis.contentTypes.push("Case Studies");
    }
    if (scrapedContent.toLowerCase().includes("webinar") || scrapedContent.toLowerCase().includes("webinaire")) {
      analysis.contentTypes.push("Webinars");
    }
    if (scrapedContent.toLowerCase().includes("podcast")) analysis.contentTypes.push("Podcast");
    if (scrapedContent.toLowerCase().includes("ebook") || scrapedContent.toLowerCase().includes("guide")) {
      analysis.contentTypes.push("Lead Magnets");
    }

    // Estimation de la fréquence
    const dateMatches = scrapedContent.match(/\d{1,2}[\s\/\-]\w+[\s\/\-]\d{2,4}/g);
    if (dateMatches && dateMatches.length > 5) {
      analysis.contentFrequency = "Élevée (publications régulières)";
    } else {
      analysis.contentFrequency = "Modérée à faible";
    }

    return JSON.stringify(analysis);
  },
});

const findContentGapsTool = new DynamicStructuredTool({
  name: "find_content_gaps",
  description: "Identifie les lacunes de contenu entre votre site et un concurrent.",
  schema: z.object({
    competitorTopics: z.array(z.string()).describe("Les sujets couverts par le concurrent"),
    yourTopics: z.array(z.string()).optional().describe("Vos sujets actuels (optionnel)"),
    industry: z.string().describe("L'industrie/niche"),
  }),
  func: async ({ competitorTopics, yourTopics = [], industry }) => {
    // Identifier les gaps
    const gaps = competitorTopics.filter(topic => 
      !yourTopics.some(yt => 
        yt.toLowerCase().includes(topic.toLowerCase()) || 
        topic.toLowerCase().includes(yt.toLowerCase())
      )
    );

    // Suggestions basées sur l'industrie
    const industrySuggestions: Record<string, string[]> = {
      "marketing": ["automation", "analytics", "ROI", "growth hacking", "ABM"],
      "tech": ["AI", "cloud", "security", "DevOps", "SaaS"],
      "ecommerce": ["conversion", "checkout", "retention", "personalization", "UGC"],
      "finance": ["fintech", "blockchain", "regulation", "digital banking", "investissement"],
      "default": ["tendances", "guides", "comparatifs", "tutoriels", "études de cas"],
    };

    const suggestions = industrySuggestions[industry.toLowerCase()] || industrySuggestions["default"];

    return JSON.stringify({
      contentGaps: gaps,
      opportunities: gaps.slice(0, 5).map(g => ({
        topic: g,
        priority: "high",
        reason: "Le concurrent couvre ce sujet, pas vous",
      })),
      industrySuggestions: suggestions,
      recommendation: gaps.length > 3 
        ? "Focus urgent sur les lacunes de contenu identifiées"
        : "Bonne couverture, optimisez le contenu existant",
    });
  },
});

const generateCompetitorReportTool = new DynamicStructuredTool({
  name: "generate_competitor_report",
  description: "Génère un rapport d'analyse concurrentielle structuré.",
  schema: z.object({
    competitorName: z.string(),
    domain: z.string(),
    seoScore: z.number(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  func: async (data) => {
    const report = {
      title: `Rapport d'Analyse Concurrentielle: ${data.competitorName}`,
      date: new Date().toISOString().split("T")[0],
      summary: {
        competitor: data.competitorName,
        domain: data.domain,
        overallSEOScore: data.seoScore,
      },
      swotAnalysis: {
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        opportunities: data.opportunities,
        threats: data.threats,
      },
      actionPlan: data.recommendations.map((rec, i) => ({
        priority: i + 1,
        action: rec,
        timeframe: i < 2 ? "Immédiat (1-2 semaines)" : i < 4 ? "Court terme (1 mois)" : "Moyen terme (3 mois)",
      })),
    };

    return JSON.stringify(report, null, 2);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 DISCOVERY AGENT - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DISCOVERY_AGENT_PROMPT = `Tu es un analyste stratégique senior spécialisé en veille concurrentielle chez Skalle.

🎯 TA MISSION:
Analyser en profondeur les concurrents et identifier des opportunités stratégiques actionnables.

📋 TON PROCESSUS D'ANALYSE:

1. **IDENTIFICATION** 
   - Recherche le domaine/concurrent avec \`web_search\`
   - Vérifie qu'il s'agit bien d'un concurrent pertinent

2. **ANALYSE SEO**
   - Utilise \`analyze_seo\` pour scorer le site concurrent
   - Note les points forts et faibles techniques

3. **ANALYSE CONTENU**
   - Utilise \`scrape_webpage\` pour extraire le contenu
   - Utilise \`analyze_competitor_strategy\` pour comprendre leur approche
   - Identifie leurs sujets principaux

4. **RECHERCHE MOTS-CLÉS**
   - Utilise \`analyze_keyword\` sur leurs mots-clés principaux
   - Identifie les opportunités de ranking

5. **IDENTIFICATION GAPS**
   - Utilise \`find_content_gaps\` pour trouver les lacunes
   - Priorise les opportunités

6. **RAPPORT FINAL**
   - Utilise \`generate_competitor_report\` pour créer un SWOT complet
   - Inclus des recommandations actionnables et priorisées

📊 FORMAT DE SORTIE:
Toujours terminer par un rapport structuré avec:
- Score SEO global
- Analyse SWOT
- Top 5 opportunités
- Plan d'action recommandé

🚫 RÈGLES:
- Ne jamais inventer de données - utilise toujours les outils
- Prioriser les insights actionnables
- Être objectif et factuel

🧠 CHAÎNE DE RAISONNEMENT:
Pour chaque concurrent analysé, construis une hypothèse avant de collecter les données :
- "Ce concurrent semble viser [audience] avec [approche] — je vais le confirmer ou infirmer"
- Après chaque outil, mise à jour de la thèse : "La donnée X confirme / contredit mon hypothèse"
- En fin d'analyse : "Quelle est la recommandation #1 que l'utilisateur peut appliquer cette semaine ?"

🔍 MÉTRIQUES CLÉS À COLLECTER:
**Contenu:**
- Fréquence de publication (posts/semaine, articles/mois)
- Types de contenu dominants (long-form SEO, short social, vidéo...)
- Sujets récurrents = leurs piliers de contenu
- Tone of voice : formel/casual, technique/grand public

**SEO:**
- Autorité de domaine et nombre de backlinks (via seo_analyzer)
- Mots-clés principaux rankés en position 1-10
- Pages les plus performantes (trafic estimé)
- Lacunes : sujets non couverts qu'ils auraient dû traiter

**Stratégie business:**
- Propositions de valeur principales (homepage, above-the-fold)
- CTAs dominants → indique leur funnel de conversion
- Prix/positionnement si visible
- Segments de clientèle ciblés

📊 FRAMEWORK SWOT ADAPTÉ À LA VEILLE CONCURRENTIELLE:

**Forces (Strengths):**
- Ce qu'ils font clairement mieux (SEO, contenu, UX, distribution)
- Leurs avantages compétitifs défendables

**Faiblesses (Weaknesses):**
- Lacunes de contenu identifiées
- Mots-clés à fort volume qu'ils ne couvrent pas
- Points de friction dans leur UX ou messaging

**Opportunités (Opportunities pour NOUS):**
- Sujets où on peut les surclasser avec moins d'effort
- Audience qu'ils négligent
- Format de contenu qu'ils n'exploitent pas

**Menaces (Threats):**
- Si leur stratégie actuelle continue, risque pour notre positionnement
- Mots-clés où ils gagnent du terrain

🎯 PRIORISATION DES OPPORTUNITÉS (matrice effort/impact):
Classe chaque opportunité identifiée selon :
- **Impact** : trafic potentiel ou valeur business (1-5)
- **Effort** : temps et ressources nécessaires (1-5)
- **Urgence** : si on n'agit pas, le concurrent consolide sa position (1-5)
→ Score = (Impact × 2 + Urgence) / Effort → classer du plus élevé au plus bas

📋 RAPPORT FINAL OBLIGATOIRE:
Terminer systématiquement par generate_competitor_report avec:
1. Synthèse exécutive (3-5 lignes max)
2. SWOT complet
3. Top 5 opportunités classées par score priorité
4. Plan d'action sur 30 jours (actions concrètes, pas vagues)

🔬 SIGNAUX À SURVEILLER POUR CHAQUE CONCURRENT:

**Signaux de croissance (concurrent en phase d'expansion):**
- Nouvelle page pricing avec tier enterprise
- Blog actif avec articles fréquents et longs (SEO push)
- Campagnes ads sur les mots-clés de marque concurrentes
- Job postings marketing/content nombreux
→ Action recommandée : contre-attaque immédiate sur les mots-clés à fort ROI

**Signaux de stagnation (concurrent vulnérable):**
- Blog non mis à jour depuis > 3 mois
- Articles anciens non actualisés sur des sujets en évolution
- Site avec design daté (UX faible = taux de rebond élevé probable)
- Peu de contenu social récent
→ Action recommandée : attaque directe sur leurs mots-clés avec contenu supérieur

**Signaux de repositionnement (concurrent qui change de stratégie):**
- Nouveau messaging sur la homepage vs version archivée
- Changement de ton éditorial
- Nouveaux segments ciblés dans les case studies
→ Action recommandée : opportunité de capturer leur audience qui ne se retrouve plus dans leur nouveau message

🎯 IDENTIFICATION DES GAPS DE CONTENU:
Pour chaque sujet identifié chez le concurrent, évalue:
1. **Profondeur** : est-ce traité en surface ou en profondeur ? (< 1000 mots = surface)
2. **Actualité** : date de publication > 12 mois = à rafraîchir
3. **Intention manquée** : l'article répond-il vraiment à l'intention de recherche de l'utilisateur ?
4. **Format sous-exploité** : si le concurrent n'a que du texte et que la vidéo/infographie dominerait mieux
→ Chaque gap identifié = opportunité de contenu à prioriser

🔗 BENCHMARK DE NETLINKING:
Analyse avec seo_analyzer les backlinks du concurrent et identifie:
- Sites d'autorité qui les citent mais pas nous (opportunités de link building)
- Patterns de guest posting (quels sites publient leurs contributions?)
- Relations presse et médias (quel type de mentions obtiennent-ils?)

💾 ORDRE D'UTILISATION DES OUTILS:
1. web_search → identification et validation du concurrent
2. analyze_seo → métriques techniques et autorité
3. scrape_webpage → contenu homepage + pages clés
4. analyze_competitor_strategy → analyse stratégique structurée
5. analyze_keyword → mots-clés prioritaires à cibler
6. find_content_gaps → lacunes spécifiques exploitables
7. generate_competitor_report → rapport final synthèse (TOUJOURS en dernier)`;

export const discoveryAgent = createAgent({
  name: "Discovery Agent",
  description: "Agent spécialisé dans l'analyse concurrentielle et la découverte d'opportunités",
  systemPrompt: DISCOVERY_AGENT_PROMPT,
  tools: [
    webSearchTool,
    seoAnalyzerTool,
    keywordAnalyzerTool,
    webScraperTool,
    analyzeCompetitorStrategyTool,
    findContentGapsTool,
    generateCompetitorReportTool,
  ],
  model: "gpt-4o",
  maxIterations: 7,
  temperature: 0.5,
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTIONS D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface DiscoveryInput {
  competitorUrl: string;
  yourDomain?: string;
  industry?: string;
  focusAreas?: ("seo" | "content" | "keywords" | "strategy")[];
}

export async function runDiscoveryAgent(input: DiscoveryInput): Promise<AgentResult> {
  const { 
    competitorUrl, 
    yourDomain, 
    industry = "business",
    focusAreas = ["seo", "content", "keywords", "strategy"]
  } = input;

  const prompt = `
Analyse concurrentielle complète pour: ${competitorUrl}

${yourDomain ? `Notre domaine: ${yourDomain}` : ""}
Industrie: ${industry}
Focus d'analyse: ${focusAreas.join(", ")}

Instructions:
1. Commence par analyser le SEO technique du concurrent
2. Scrape et analyse leur stratégie de contenu
3. Identifie leurs mots-clés principaux
4. Trouve les opportunités et gaps
5. Génère un rapport SWOT complet avec recommandations
`;

  return await discoveryAgent.run(prompt, { competitorUrl, industry });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 MULTI-COMPETITOR ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export async function runMultiCompetitorAnalysis(
  competitors: string[],
  yourDomain: string,
  industry: string
): Promise<{
  competitorResults: AgentResult[];
  consolidatedInsights: string;
}> {
  const results: AgentResult[] = [];

  for (const competitor of competitors) {
    const result = await runDiscoveryAgent({
      competitorUrl: competitor,
      yourDomain,
      industry,
    });
    results.push(result);
  }

  // Consolidation des insights (simplified)
  const consolidatedInsights = `
## Analyse de ${competitors.length} Concurrents

### Résumé
${results.map((r, i) => `- **${competitors[i]}**: ${r.success ? "✅ Analysé" : "❌ Erreur"}`).join("\n")}

### Principaux Insights
${results
  .filter(r => r.success)
  .map((r, i) => `#### ${competitors[i]}\n${typeof r.result === "string" ? r.result.slice(0, 500) + "..." : "Voir détails"}`)
  .join("\n\n")}
`;

  return {
    competitorResults: results,
    consolidatedInsights,
  };
}
