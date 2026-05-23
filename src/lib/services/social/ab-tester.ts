/**
 * A/B Tester — Génère 3 variants d'un post avec hooks différents,
 * score chacun et identifie le gagnant quand les métriques arrivent
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";
import { predictViralScore } from "./viral-predictor";

const VARIANT_LABELS = ["A", "B", "C"] as const;

const HOOK_COMBOS = [
  { hookType: "QUESTION", instruction: "Démarre par une question qui crée de la curiosité ou de l'inconfort." },
  { hookType: "STAT", instruction: "Démarre par une statistique choc ou un chiffre surprenant." },
  { hookType: "STORY", instruction: "Démarre par une micro-histoire personnelle (3 lignes max)." },
  { hookType: "CONTRARIAN", instruction: "Démarre par une affirmation contraire aux idées reçues." },
  { hookType: "HOW_TO", instruction: "Démarre par 'Voici comment...' ou 'X étapes pour...'." },
  { hookType: "CONFESSION", instruction: "Démarre par une confession ou un aveu." },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function generateVariant(
  baseContent: string,
  platform: string,
  hookInstruction: string,
  brandVoice: Record<string, unknown> | null
): Promise<string> {
  const model = getClaude();
  const parser = getStringParser();

  const platformGuide =
    platform === "TWITTER" || platform === "X"
      ? "X/Twitter : 240 caractères max, percutant, pas de hashtags en excès."
      : "LinkedIn : 3-5 paragraphes courts, espaces entre chaque, CTA en dernière ligne.";

  return model.pipe(parser).invoke([
    new SystemMessage({
      content: `Tu es un expert en copywriting viral.
Réécris le post en gardant le même MESSAGE CORE mais avec un hook différent.
Réponds UNIQUEMENT avec le texte du post, sans introduction ni explication.
${platformGuide}
Ton : ${brandVoice?.tone ?? "professionnel et direct"}`,
    }),
    new HumanMessage(
      `Post original :\n"${baseContent}"\n\nConsigne hook : ${hookInstruction}`
    ),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function createAbTest(
  workspaceId: string,
  name: string,
  baseContent: string,
  platform: string
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { brandVoice: true },
  });
  const bv = workspace?.brandVoice as Record<string, unknown> | null;

  // Choisir 3 hooks diversifiés
  const hooks = shuffleArray([...HOOK_COMBOS]).slice(0, 3);

  // Générer les 3 variants en parallèle
  const variantContents = await Promise.all(
    hooks.map((h) => generateVariant(baseContent, platform, h.instruction, bv))
  );

  // Scorer chacun (en parallèle aussi)
  const scores = await Promise.allSettled(
    variantContents.map((c) =>
      predictViralScore(c, platform.toUpperCase() as "LINKEDIN" | "TWITTER" | "X" | "INSTAGRAM" | "TIKTOK")
    )
  );

  // Persister le test + variants
  const test = await prisma.postAbTest.create({
    data: {
      workspaceId,
      name,
      platform,
      baseContent,
      status: "DRAFT",
      variants: {
        create: variantContents.map((content, i) => ({
          label: VARIANT_LABELS[i],
          content,
          hookType: hooks[i].hookType,
          predictedScore:
            scores[i].status === "fulfilled" ? scores[i].value.score : null,
        })),
      },
    },
    include: { variants: { orderBy: { label: "asc" } } },
  });

  return test;
}

export async function recordVariantEngagement(
  variantId: string,
  metrics: { likes?: number; comments?: number; views?: number }
) {
  const variant = await prisma.postAbVariant.update({
    where: { id: variantId },
    data: {
      likes: metrics.likes ?? 0,
      comments: metrics.comments ?? 0,
      views: metrics.views ?? 0,
      engagementRate:
        metrics.views && metrics.views > 0
          ? ((metrics.likes ?? 0) + (metrics.comments ?? 0) * 2) / metrics.views
          : null,
    },
    include: { test: { include: { variants: true } } },
  });

  // Vérifier si tous les variants ont des vues → désigner le gagnant
  const allVariants = variant.test.variants;
  const allHaveData = allVariants.every((v) => v.views > 0);

  if (allHaveData) {
    const winner = allVariants.reduce((best, v) =>
      (v.engagementRate ?? 0) > (best.engagementRate ?? 0) ? v : best
    );

    await prisma.$transaction([
      prisma.postAbTest.update({
        where: { id: variant.testId },
        data: { status: "COMPLETED", winnerId: winner.id },
      }),
      prisma.postAbVariant.update({ where: { id: winner.id }, data: { isWinner: true } }),
    ]);
  }

  return variant;
}

export async function getAbTests(workspaceId: string) {
  return prisma.postAbTest.findMany({
    where: { workspaceId },
    include: { variants: { orderBy: { label: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
