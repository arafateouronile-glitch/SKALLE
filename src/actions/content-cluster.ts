"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { startBulkGeneration } from "@/actions/seo";

export interface ContentCluster {
  pillarKeyword: string;
  pillarTitle: string;
  supportingKeywords: Array<{
    keyword: string;
    angle: string;
    intent: "informational" | "commercial" | "navigational";
  }>;
  strategy: string;
}

const clusterPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en SEO et stratégie de contenu par topics clusters.

Pour un mot-clé pilier donné, génère un topic cluster complet au format JSON:
{{
  "pillarTitle": "Titre H1 de l'article pilier (accroché, SEO-optimisé)",
  "strategy": "Résumé stratégique du cluster en 2 phrases",
  "supportingKeywords": [
    {{
      "keyword": "mot-clé longue traîne",
      "angle": "angle éditorial spécifique (ex: guide débutant, comparatif, cas pratique)",
      "intent": "informational|commercial|navigational"
    }}
  ]
}}

Règles:
- Génère exactement 5 articles satellites
- Chaque satellite couvre un sous-sujet distinct du pilier
- Varier les intents (3 informational, 1 commercial, 1 navigational)
- Les mots-clés satellites doivent être des longues traînes réalistes
- Réponds UNIQUEMENT avec le JSON valide, sans markdown.`,
  ],
  ["human", "Mot-clé pilier: {pillarKeyword}\nSecteur / contexte: {context}"],
]);

export async function generateContentCluster(
  pillarKeyword: string,
  context: string = "marketing digital B2B"
): Promise<{
  success: boolean;
  data?: ContentCluster;
  batchJobId?: string;
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    if (!pillarKeyword.trim()) {
      return { success: false, error: "Mot-clé pilier requis" };
    }

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Generate cluster structure with Claude
    const raw = await clusterPrompt
      .pipe(getClaude())
      .pipe(getStringParser())
      .invoke({ pillarKeyword, context });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: "Format de réponse invalide" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      pillarTitle: string;
      strategy: string;
      supportingKeywords: ContentCluster["supportingKeywords"];
    };

    const cluster: ContentCluster = {
      pillarKeyword,
      pillarTitle: parsed.pillarTitle ?? pillarKeyword,
      supportingKeywords: parsed.supportingKeywords ?? [],
      strategy: parsed.strategy ?? "",
    };

    // Launch bulk generation for all 6 articles (pillar + 5 satellites)
    const allKeywords = [
      pillarKeyword,
      ...cluster.supportingKeywords.map((s) => s.keyword),
    ];

    const bulkResult = await startBulkGeneration(workspace.id, allKeywords);

    return {
      success: true,
      data: cluster,
      batchJobId: bulkResult.batchJobId,
    };
  } catch (error) {
    console.error("generateContentCluster error:", error);
    return { success: false, error: "Erreur lors de la génération du cluster" };
  }
}
