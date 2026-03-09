/**
 * 📱 Social Agent - Agent Autonome de Repurposing & Social Media
 * 
 * Cet agent peut:
 * - Analyser un contenu source (article, vidéo, etc.)
 * - Adapter le contenu pour chaque plateforme
 * - Générer des visuels adaptés
 * - Optimiser pour l'engagement
 * - Planifier la publication
 */

import { createAgent, AgentResult } from "./base-agent";
import { webSearchTool, imageGeneratorTool } from "../tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ OUTILS SPÉCIALISÉS SOCIAL
// ═══════════════════════════════════════════════════════════════════════════

const analyzeContentTool = new DynamicStructuredTool({
  name: "analyze_source_content",
  description: "Analyse un contenu source pour en extraire les éléments clés à repurposer.",
  schema: z.object({
    content: z.string().describe("Le contenu source à analyser"),
    contentType: z.enum(["article", "video_transcript", "podcast_notes", "presentation"]).describe("Type de contenu"),
  }),
  func: async ({ content, contentType }) => {
    // Extraction des éléments clés
    const words = content.split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Trouver les phrases impactantes (courtes et avec des mots forts)
    const impactWords = ["important", "crucial", "secret", "découverte", "révélation", "astuce", 
                         "erreur", "conseil", "stratégie", "résultat", "succès", "échec"];
    const impactSentences = sentences.filter(s => 
      impactWords.some(w => s.toLowerCase().includes(w)) && 
      s.split(/\s+/).length < 30
    );

    // Extraire les statistiques/chiffres
    const stats = content.match(/\d+(?:\.\d+)?(?:\s*%|\s*€|\s*\$|\s*millions?|\s*milliards?)?/g) || [];

    // Extraire les listes/points clés
    const bulletPoints = content.match(/^[-•*]\s*.+$/gm) || [];
    const numberedPoints = content.match(/^\d+[.)]\s*.+$/gm) || [];

    return JSON.stringify({
      contentType,
      wordCount: words.length,
      sentenceCount: sentences.length,
      keyStats: [...new Set(stats)].slice(0, 5),
      impactQuotes: impactSentences.slice(0, 5),
      bulletPoints: [...bulletPoints, ...numberedPoints].slice(0, 10),
      suggestedAngles: [
        "Statistique choc",
        "Conseil actionnable",
        "Erreur courante",
        "Success story",
        "Contre-intuition",
      ],
    });
  },
});

const generateTwitterThreadTool = new DynamicStructuredTool({
  name: "generate_twitter_thread",
  description: "Génère un thread X/Twitter optimisé à partir d'un contenu analysé.",
  schema: z.object({
    mainTopic: z.string().describe("Le sujet principal"),
    keyPoints: z.array(z.string()).describe("Les points clés à couvrir"),
    hook: z.string().describe("Le hook du premier tweet"),
    targetAudience: z.string().optional().describe("L'audience cible"),
  }),
  func: async ({ mainTopic, keyPoints, hook, targetAudience = "professionnels" }) => {
    // Structure d'un thread performant
    const threadStructure = {
      tweet1_hook: hook.slice(0, 270) + (hook.length > 270 ? "..." : ""),
      estimatedTweets: Math.min(keyPoints.length + 2, 12),
      structure: [
        "1/ 🧵 Hook + promesse",
        ...keyPoints.slice(0, 8).map((_, i) => `${i + 2}/ Point clé ${i + 1}`),
        `${keyPoints.length + 2}/ 🎯 CTA + Résumé`,
      ],
      tips: [
        "Chaque tweet doit pouvoir être compris seul",
        "Utilisez des emojis au début de chaque tweet",
        "Terminez par un CTA clair",
        "Le tweet 1 détermine 80% de la performance",
      ],
    };

    return JSON.stringify(threadStructure);
  },
});

const generateLinkedInPostTool = new DynamicStructuredTool({
  name: "generate_linkedin_post",
  description: "Génère un post LinkedIn optimisé pour l'engagement.",
  schema: z.object({
    topic: z.string().describe("Le sujet du post"),
    angle: z.enum(["story", "lesson", "controversial", "how_to", "listicle"]).describe("L'angle d'approche"),
    keyInsight: z.string().describe("L'insight principal à partager"),
    includePersonalTouch: z.boolean().optional().default(true),
  }),
  func: async ({ topic, angle, keyInsight, includePersonalTouch }) => {
    const templates: Record<string, string> = {
      story: `[HOOK personnel]\n\nL'année dernière, j'ai...\n\n[DÉVELOPPEMENT avec rebondissements]\n\n[LEÇON apprise]\n\n[CTA]`,
      lesson: `[STATEMENT provocateur]\n\n❌ Ce qu'on m'avait dit\n✅ La réalité\n\n[EXPLICATION en 3-5 points]\n\n[CTA]`,
      controversial: `[OPINION impopulaire]\n\nJe sais que ça va faire réagir, mais...\n\n[ARGUMENTATION]\n\n[NUANCE]\n\n[CTA: qu'en pensez-vous ?]`,
      how_to: `Comment [RÉSULTAT] en [TEMPS] :\n\nÉtape 1: [ACTION]\nÉtape 2: [ACTION]\nÉtape 3: [ACTION]\n\n[CTA: télécharger/commenter]`,
      listicle: `[X] choses que j'aurais aimé savoir sur [SUJET] :\n\n1. [POINT]\n2. [POINT]\n3. [POINT]\n...\n\n[CTA]`,
    };

    return JSON.stringify({
      topic,
      recommendedAngle: angle,
      template: templates[angle],
      keyInsight,
      optimizationTips: [
        "Ligne 1-2 = hook visible sans 'voir plus'",
        "Sautez des lignes pour la lisibilité",
        "Terminez par une question pour les commentaires",
        "Évitez les liens dans le post (commentaire)",
        "Publiez entre 8h-9h ou 17h-18h",
      ],
      suggestedHashtags: 5,
      estimatedReach: includePersonalTouch ? "Élevé (contenu personnel)" : "Moyen (contenu informatif)",
    });
  },
});

const generateTikTokScriptTool = new DynamicStructuredTool({
  name: "generate_tiktok_script",
  description: "Génère un script TikTok/Reels optimisé pour la viralité.",
  schema: z.object({
    topic: z.string().describe("Le sujet de la vidéo"),
    format: z.enum(["talking_head", "text_on_screen", "demonstration", "story_time"]).describe("Format de la vidéo"),
    duration: z.enum(["15s", "30s", "60s"]).describe("Durée cible"),
    hook: z.string().describe("Le hook des 3 premières secondes"),
  }),
  func: async ({ topic, format, duration, hook }) => {
    const durationGuides: Record<string, { sections: number; pacing: string }> = {
      "15s": { sections: 3, pacing: "Très rapide, 1 idée" },
      "30s": { sections: 4, pacing: "Rapide, 2-3 idées" },
      "60s": { sections: 6, pacing: "Modéré, histoire complète" },
    };

    const guide = durationGuides[duration];

    return JSON.stringify({
      topic,
      format,
      duration,
      structure: {
        hook: { time: "0-3s", content: hook, importance: "CRITIQUE - détermine 90% de la rétention" },
        body: { time: "3s-fin", sections: guide.sections - 2 },
        cta: { time: "dernières 3s", suggestions: ["Suivez pour plus", "Commentez X", "Partagez à quelqu'un"] },
      },
      pacing: guide.pacing,
      tipsForViralité: [
        "Hook visuel ou audio fort",
        "Pattern interrupt toutes les 3-5 secondes",
        "Texte à l'écran pour ceux qui regardent sans son",
        "CTA clair mais naturel",
        "Trending sounds augmentent la portée",
      ],
      suggestedCaption: `${topic} 🔥 #fyp #[niche] #viral`,
    });
  },
});

const saveRepurposedContentTool = new DynamicStructuredTool({
  name: "save_repurposed_content",
  description: "Sauvegarde le contenu repurposé dans la base de données.",
  schema: z.object({
    workspaceId: z.string(),
    platform: z.enum(["X", "LINKEDIN", "TIKTOK", "INSTAGRAM"]),
    content: z.string(),
    scheduledAt: z.string().optional().describe("Date de publication planifiée (ISO)"),
  }),
  func: async ({ workspaceId, platform, content, scheduledAt }) => {
    try {
      const post = await prisma.post.create({
        data: {
          type: platform,
          content,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          workspaceId,
        },
      });
      return JSON.stringify({ success: true, postId: post.id });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 SOCIAL AGENT - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SOCIAL_AGENT_PROMPT = `Tu es un expert en social media marketing et content repurposing chez Skalle.

🎯 TA MISSION:
Transformer un contenu source en contenus optimisés pour chaque plateforme sociale.

📋 TON PROCESSUS:

1. **ANALYSE DU CONTENU SOURCE**
   - Utilise \`analyze_source_content\` pour extraire les éléments clés
   - Identifie les angles les plus engageants
   - Note les statistiques et citations impactantes

2. **ADAPTATION PAR PLATEFORME**
   Pour chaque plateforme demandée:
   
   **X/Twitter:**
   - Utilise \`generate_twitter_thread\`
   - Hook provocateur ou statistique choc
   - Thread de 5-10 tweets
   
   **LinkedIn:**
   - Utilise \`generate_linkedin_post\`
   - Privilégie les histoires personnelles ou leçons
   - Format scannable avec sauts de ligne
   
   **TikTok/Reels:**
   - Utilise \`generate_tiktok_script\`
   - Hook visuel en 3 secondes
   - Script concis et dynamique

3. **GÉNÉRATION DES VISUELS** (si demandé)
   - Utilise \`generate_image\` pour créer des visuels adaptés
   - Respecte les formats de chaque plateforme

4. **SAUVEGARDE**
   - Utilise \`save_repurposed_content\` pour chaque contenu créé

📊 PRINCIPES DE VIRALITÉ:
- Hook fort = 80% du succès
- Valeur immédiate
- Émotion (surprise, curiosité, indignation)
- Format natif de la plateforme
- CTA clair

🎨 TON DE VOIX:
Adapte le ton à la plateforme:
- X: Incisif, concis, provocateur
- LinkedIn: Professionnel mais humain
- TikTok: Casual, énergique, authentique`;

export const socialAgent = createAgent({
  name: "Social Agent",
  description: "Agent spécialisé dans le repurposing de contenu pour les réseaux sociaux",
  systemPrompt: SOCIAL_AGENT_PROMPT,
  tools: [
    analyzeContentTool,
    generateTwitterThreadTool,
    generateLinkedInPostTool,
    generateTikTokScriptTool,
    imageGeneratorTool,
    saveRepurposedContentTool,
    webSearchTool, // Pour rechercher les tendances
  ],
  model: "gpt-4o-mini",
  maxIterations: 10,
  temperature: 0.8, // Plus créatif pour le social
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 FONCTIONS D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

export interface SocialAgentInput {
  sourceContent: string;
  contentType: "article" | "video_transcript" | "podcast_notes" | "presentation";
  targetPlatforms: ("X" | "LINKEDIN" | "TIKTOK" | "INSTAGRAM")[];
  workspaceId: string;
  generateVisuals?: boolean;
  scheduleDates?: Record<string, string>; // Platform -> ISO date
}

export async function runSocialAgent(input: SocialAgentInput): Promise<AgentResult> {
  const { 
    sourceContent, 
    contentType, 
    targetPlatforms, 
    workspaceId,
    generateVisuals = false,
    scheduleDates = {}
  } = input;

  const prompt = `
Repurpose le contenu suivant pour les plateformes: ${targetPlatforms.join(", ")}

Type de contenu source: ${contentType}
Workspace ID: ${workspaceId}
Générer des visuels: ${generateVisuals ? "Oui" : "Non"}
${Object.keys(scheduleDates).length > 0 ? `Dates de publication: ${JSON.stringify(scheduleDates)}` : ""}

CONTENU SOURCE:
"""
${sourceContent.slice(0, 8000)}
"""

Instructions:
1. Analyse d'abord le contenu pour identifier les meilleurs angles
2. Pour chaque plateforme, génère un contenu optimisé et unique
3. ${generateVisuals ? "Génère un visuel adapté pour chaque plateforme" : ""}
4. Sauvegarde chaque contenu créé

Assure-toi que chaque contenu est:
- Adapté au format natif de la plateforme
- Engageant avec un hook fort
- Actionnable avec un CTA clair
`;

  const result = await socialAgent.run(prompt, { workspaceId, targetPlatforms });

  // Track API usage
  if (result.success) {
    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "social_agent",
        credits: result.iterations,
        workspaceId,
        metadata: { targetPlatforms, steps: result.steps },
      },
    });
  }

  return result;
}
