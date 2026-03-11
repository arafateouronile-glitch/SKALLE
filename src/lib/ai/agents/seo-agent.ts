/**
 * 🔍 SEO Agent - Agent Autonome pour le SEO
 * 
 * Cet agent peut:
 * - Rechercher des sources et informations sur un sujet
 * - Analyser la concurrence SEO
 * - Générer des articles optimisés
 * - Créer des images pertinentes
 * - Optimiser le contenu de manière itérative
 */

import { createAgent, AgentResult, chainAgents } from "./base-agent";
import { 
  webSearchTool, 
  seoAnalyzerTool, 
  keywordAnalyzerTool,
  webScraperTool,
  imageGeneratorTool 
} from "../tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ OUTILS SPÉCIALISÉS SEO
// ═══════════════════════════════════════════════════════════════════════════

const saveArticleTool = new DynamicStructuredTool({
  name: "save_article",
  description: "Sauvegarde un article généré dans la base de données. Utilise cet outil une fois l'article finalisé.",
  schema: z.object({
    title: z.string().describe("Titre de l'article"),
    content: z.string().describe("Contenu complet de l'article en Markdown"),
    keywords: z.array(z.string()).describe("Mots-clés principaux"),
    excerpt: z.string().describe("Extrait/résumé de l'article (max 200 caractères)"),
    workspaceId: z.string().describe("ID du workspace"),
  }),
  func: async ({ title, content, keywords, excerpt, workspaceId }) => {
    try {
      const post = await prisma.post.create({
        data: {
          type: "SEO_ARTICLE",
          title,
          content,
          keywords,
          excerpt,
          status: "DRAFT",
          workspaceId,
        },
      });
      return JSON.stringify({ 
        success: true, 
        postId: post.id, 
        message: `Article "${title}" sauvegardé avec succès` 
      });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

const optimizeContentTool = new DynamicStructuredTool({
  name: "optimize_content",
  description: "Analyse et suggère des améliorations pour un contenu SEO.",
  schema: z.object({
    content: z.string().describe("Le contenu à optimiser"),
    targetKeyword: z.string().describe("Le mot-clé cible"),
  }),
  func: async ({ content, targetKeyword }) => {
    const wordCount = content.split(/\s+/).length;
    const keywordCount = (content.toLowerCase().match(new RegExp(targetKeyword.toLowerCase(), "g")) || []).length;
    const keywordDensity = (keywordCount / wordCount) * 100;
    
    const h2Count = (content.match(/^##\s/gm) || []).length;
    const h3Count = (content.match(/^###\s/gm) || []).length;
    
    const suggestions: string[] = [];
    
    if (wordCount < 1500) {
      suggestions.push(`📝 Contenu trop court (${wordCount} mots). Visez au moins 1500-2000 mots.`);
    }
    if (keywordDensity < 0.5) {
      suggestions.push(`🔑 Densité de mot-clé faible (${keywordDensity.toFixed(1)}%). Intégrez "${targetKeyword}" plus naturellement.`);
    } else if (keywordDensity > 3) {
      suggestions.push(`⚠️ Suroptimisation détectée (${keywordDensity.toFixed(1)}%). Réduisez l'utilisation de "${targetKeyword}".`);
    }
    if (h2Count < 3) {
      suggestions.push("📋 Ajoutez plus de sous-titres H2 pour structurer le contenu.");
    }
    if (h3Count < 2) {
      suggestions.push("📋 Ajoutez des H3 pour approfondir les sections.");
    }
    if (!content.includes("FAQ") && !content.includes("Questions")) {
      suggestions.push("❓ Ajoutez une section FAQ pour cibler les featured snippets.");
    }

    return JSON.stringify({
      wordCount,
      keywordDensity: keywordDensity.toFixed(2) + "%",
      h2Count,
      h3Count,
      keywordOccurrences: keywordCount,
      isOptimized: suggestions.length === 0,
      suggestions: suggestions.length > 0 ? suggestions : ["✅ Le contenu est bien optimisé !"],
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 SEO AGENT - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SEO_AGENT_PROMPT = `Tu es un expert SEO senior chez Skalle, une agence de marketing digital de premier plan.

🎯 TA MISSION:
Tu dois créer du contenu SEO de haute qualité en suivant une méthodologie rigoureuse.

📋 TON PROCESSUS DE TRAVAIL (dans cet ordre):

1. **RECHERCHE** (obligatoire)
   - Utilise \`web_search\` pour trouver des sources actuelles sur le sujet
   - Utilise \`analyze_keyword\` pour comprendre la difficulté et la concurrence
   - Note les angles uniques que tu pourrais exploiter

2. **ANALYSE CONCURRENCE** (si pertinent)
   - Utilise \`scrape_webpage\` sur les top résultats pour comprendre leur approche
   - Identifie les lacunes que tu peux combler

3. **RÉDACTION**
   - Crée un article structuré avec H1, H2, H3
   - Intègre les mots-clés naturellement
   - Ajoute des données, statistiques, exemples concrets
   - Inclus une section FAQ
   - Termine par un CTA

4. **OPTIMISATION**
   - Utilise \`optimize_content\` pour vérifier la qualité SEO
   - Ajuste selon les suggestions

5. **FINALISATION**
   - Utilise \`save_article\` pour sauvegarder (si workspaceId fourni)
   - Génère une image avec \`generate_image\` si demandé

📏 RÈGLES D'OR:
- Minimum 1500 mots pour les articles
- Densité de mot-clé: 1-2%
- Structure claire avec sous-titres
- Contenu actionnable et unique
- Ton: professionnel mais accessible

🚫 NE JAMAIS:
- Copier le contenu d'autres sites
- Sur-optimiser avec du keyword stuffing
- Créer du contenu générique sans valeur

🧠 CHAÎNE DE RAISONNEMENT (Chain of Thought):
Avant chaque décision d'outil, énonce explicitement:
- CE QUE tu cherches à accomplir
- POURQUOI tu choisis cet outil plutôt qu'un autre
- CE QUE tu feras avec le résultat

📐 STRUCTURE D'ARTICLE OPTIMALE:
1. **H1** : contient le mot-clé principal, accrocheur (< 60 caractères)
2. **Introduction** (150-200 mots) : accroche + problème + promesse + mot-clé dans les 100 premiers mots
3. **Table des matières** (pour articles > 1500 mots)
4. **H2 (3-5 sections)** : chacune avec sous-titre incluant une variation du mot-clé
5. **H3 (2-4 par H2)** : questions fréquentes ou sous-points concrets
6. **Section FAQ** (5-7 questions): réponses courtes et directes, format Question/Réponse schema
7. **Conclusion** (150-200 mots) : résumé + CTA + lien interne

🔍 CRITÈRES DE QUALITÉ SEO (auto-évaluation avant save_article):
- [ ] Mot-clé principal dans H1, premier paragraphe, meta description, au moins 3 H2
- [ ] Longueur ≥ 1500 mots (idéalement 2000-2500)
- [ ] Au moins 3 sources externes autorité citées
- [ ] Au moins 1 donnée statistique par section principale
- [ ] Chaque H2 traite un aspect distinct (pas de redondance)
- [ ] Introduction pose clairement le problème et la valeur de l'article
- [ ] CTA en fin d'article adapté à l'intention de recherche

⚡ SIGNAUX DE QUALITÉ EDITORIALE:
- Exemples concrets plutôt qu'abstractions
- Données chiffrées avec source (pas juste "beaucoup" ou "souvent")
- Paragraphes courts (3-4 phrases max) pour lisibilité web
- Mots de transition entre sections pour la fluidité
- Ton expert mais accessible : évite le jargon inutile

🔗 MAILLAGE INTERNE:
Si le contexte workspace inclut d'autres articles, suggère des ancres de liens internes pertinentes dans le contenu.

Commence toujours par utiliser les outils de recherche avant de rédiger !

🔬 SIGNAUX D'INTENTION DE RECHERCHE À IDENTIFIER:
Avant de structurer l'article, détermine l'intention dominante du mot-clé:
- **Informationnelle** ("comment faire X") → article tutoriel avec étapes numérotées
- **Commerciale** ("meilleur outil X") → comparatif + tableau de scores + recommandation finale
- **Transactionnelle** ("acheter X", "prix X") → page orientée conversion, CTA fort, preuves sociales
- **Navigationnelle** ("site de marque X") → contenu de marque, institutional
Adapter entièrement la structure en fonction. Un article tutoriel n'a pas la même structure qu'un comparatif.

📈 OPTIMISATION POST-RÉDACTION:
Après la rédaction, avant d'appeler save_article, effectue une passe d'optimisation:
1. Vérifie la lisibilité Flesch-Kincaid (phrases courtes, mots simples quand possible)
2. Assure-toi que chaque H2 peut répondre à une recherche vocale ("comment...", "qu'est-ce que...", "pourquoi...")
3. Ajoute des données structurées implicites (liste numérotée pour les étapes = chances de featured snippet)
4. Si l'article traite un "comment faire", la réponse directe doit apparaître dans les 200 premiers mots (position zéro)

🤝 UTILISATION OPTIMALE DES OUTILS EN SÉQUENCE:
- web_search → pour trouver les sources et comprendre le SERP actuel
- analyze_keyword → pour valider le volume et la concurrence du mot-clé
- scrape_webpage → pour analyser les 2-3 premiers résultats concurrents
- optimize_content → uniquement APRÈS avoir rédigé le contenu complet
- generate_image → seulement si le contexte le demande explicitement
- save_article → EN DERNIER, une fois tout optimisé`;

export const seoAgent = createAgent({
  name: "SEO Agent",
  description: "Agent spécialisé dans la création de contenu SEO optimisé",
  systemPrompt: SEO_AGENT_PROMPT,
  tools: [
    webSearchTool,
    keywordAnalyzerTool,
    webScraperTool,
    seoAnalyzerTool,
    optimizeContentTool,
    imageGeneratorTool,
    saveArticleTool,
  ],
  model: "gpt-4o",
  maxIterations: 8,
  temperature: 0.4, // Faible température pour contenu factuel/SEO fiable
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTIONS D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface SEOAgentInput {
  keyword: string;
  workspaceId: string;
  brandVoice?: Record<string, unknown>;
  generateImage?: boolean;
  targetLength?: "short" | "medium" | "long";
}

export async function runSEOAgent(input: SEOAgentInput): Promise<AgentResult> {
  const { keyword, workspaceId, brandVoice, generateImage = true, targetLength = "long" } = input;

  const lengthGuide = {
    short: "800-1200 mots",
    medium: "1500-2000 mots",
    long: "2000-3000 mots",
  };

  const prompt = `
Crée un article SEO complet sur le sujet: "${keyword}"

Paramètres:
- Workspace ID: ${workspaceId}
- Longueur cible: ${lengthGuide[targetLength]}
- Générer image: ${generateImage ? "Oui, crée une image de header" : "Non"}
${brandVoice ? `- Ton de voix de la marque: ${JSON.stringify(brandVoice)}` : ""}

Processus:
1. Recherche d'abord des sources et analyse la concurrence
2. Rédige un article complet et optimisé
3. Vérifie l'optimisation SEO
4. Sauvegarde l'article final
${generateImage ? "5. Génère une image de header professionnelle" : ""}
`;

  const result = await seoAgent.run(prompt, { workspaceId, keyword, brandVoice });

  // Track API usage
  if (result.success) {
    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "seo_agent",
        credits: result.iterations,
        workspaceId,
        metadata: { keyword, steps: result.steps },
      },
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 BULK SEO GENERATION - Génération en masse avec l'agent
// ═══════════════════════════════════════════════════════════════════════════

export interface BulkSEOResult {
  total: number;
  completed: number;
  failed: number;
  results: AgentResult[];
}

export async function runBulkSEOAgent(
  keywords: string[],
  workspaceId: string,
  brandVoice?: Record<string, unknown>,
  onProgress?: (current: number, total: number, keyword: string) => void
): Promise<BulkSEOResult> {
  const results: AgentResult[] = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    
    if (onProgress) {
      onProgress(i + 1, keywords.length, keyword);
    }

    try {
      const result = await runSEOAgent({
        keyword,
        workspaceId,
        brandVoice,
        generateImage: true,
        targetLength: "long",
      });

      results.push(result);
      
      if (result.success) {
        completed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      results.push({
        success: false,
        agentName: "SEO Agent",
        error: String(error),
        steps: [`❌ Erreur pour "${keyword}": ${error}`],
        duration: 0,
        iterations: 0,
      });
    }

    // Small delay between articles to avoid rate limiting
    if (i < keywords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return {
    total: keywords.length,
    completed,
    failed,
    results,
  };
}
