"use server";

/**
 * Core logic for the Social Content Factory job.
 * Runs standalone (no Inngest dependency) — called by the internal API route.
 */

import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import {
  initializeBrandStrategy,
  generateContentConcepts,
  generatePostFormats,
  autoSchedule,
  type MarketingPersona,
  type ContentConcept,
} from "@/lib/services/social/content-factory";
import { generateImage } from "@/lib/ai/banana";

interface FactoryJobInput {
  contentPlanId: string;
  workspaceId: string;
  userId: string;
  vision: string;
  niche: string;
  objectives: string[];
  networks: string[];
  month: number;
  year: number;
}

export async function runSocialFactoryJob(input: FactoryJobInput): Promise<void> {
  const { contentPlanId, workspaceId, userId, vision, niche, objectives, networks, month, year } = input;

  // Step 1: Mark as GENERATING
  await prisma.contentPlan.update({
    where: { id: contentPlanId },
    data: { status: "GENERATING" },
  });

  try {
    // Step 2: Init brand strategy
    const strategyResult = await initializeBrandStrategy(workspaceId);
    if (!strategyResult.success || !strategyResult.persona) {
      throw new Error(strategyResult.error ?? "Échec de l'initialisation de la stratégie");
    }
    await useCredits(userId, "social_factory_strategy");
    const persona = strategyResult.persona;

    // Step 3: Generate 30 concepts
    const conceptsResult = await generateContentConcepts(workspaceId, {
      vision,
      niche,
      objectives,
      networks,
      workspaceId,
    });
    if (!conceptsResult.success || !conceptsResult.concepts) {
      throw new Error(conceptsResult.error ?? "Échec de la génération des concepts");
    }
    await useCredits(userId, "social_factory_concepts");

    const concepts = conceptsResult.concepts;

    await prisma.contentPlan.update({
      where: { id: contentPlanId },
      data: {
        totalConcepts: concepts.length,
        conceptsData: JSON.parse(JSON.stringify(concepts)),
        keywordsUsed: JSON.parse(
          JSON.stringify(concepts.filter((c: ContentConcept) => c.sourceKeyword).map((c: ContentConcept) => c.sourceKeyword))
        ),
        adsUsed: JSON.parse(
          JSON.stringify(concepts.filter((c: ContentConcept) => c.sourceAdId).map((c: ContentConcept) => c.sourceAdId))
        ),
      },
    });

    // Step 4: Generate posts for each concept
    let completed = 0;
    let failed = 0;
    const createdPostIds: Array<{ id: string; type: string; category: string }> = [];

    for (const concept of concepts as ContentConcept[]) {
      try {
        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { brandVoice: true, brandType: true },
        });
        const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};

        const postSet = await generatePostFormats(concept, persona as MarketingPersona, brandVoice, workspace?.brandType ?? "B2C");
        const ids: Array<{ id: string; type: string; category: string }> = [];

        if (postSet.linkedin) {
          const post = await prisma.post.create({
            data: {
              type: "LINKEDIN",
              title: concept.title,
              content: postSet.linkedin,
              keywords: concept.sourceKeyword ? [concept.sourceKeyword] : [],
              status: "DRAFT",
              workspaceId,
              contentPlanId,
            },
          });
          ids.push({ id: post.id, type: "LINKEDIN", category: concept.category });
        }

        if (postSet.xThread) {
          const post = await prisma.post.create({
            data: {
              type: "X",
              title: concept.title,
              content: postSet.xThread,
              keywords: concept.sourceKeyword ? [concept.sourceKeyword] : [],
              status: "DRAFT",
              workspaceId,
              contentPlanId,
            },
          });
          ids.push({ id: post.id, type: "X", category: concept.category });
        }

        if (postSet.instagramCaption) {
          let imageUrl: string | null = null;
          if (postSet.instagramImagePrompt) {
            try {
              imageUrl = await generateImage(postSet.instagramImagePrompt);
              await useCredits(userId, "social_factory_image");
            } catch (e) {
              console.warn("[Content Factory] Échec génération image:", e);
            }
          }
          const post = await prisma.post.create({
            data: {
              type: "INSTAGRAM",
              title: concept.title,
              content: postSet.instagramCaption,
              imageUrl,
              excerpt: postSet.instagramImagePrompt,
              keywords: concept.sourceKeyword ? [concept.sourceKeyword] : [],
              status: "DRAFT",
              workspaceId,
              contentPlanId,
            },
          });
          ids.push({ id: post.id, type: "INSTAGRAM", category: concept.category });
        }

        if (postSet.tiktokScript) {
          const post = await prisma.post.create({
            data: {
              type: "TIKTOK",
              title: concept.title,
              content: postSet.tiktokScript,
              keywords: concept.sourceKeyword ? [concept.sourceKeyword] : [],
              status: "DRAFT",
              workspaceId,
              contentPlanId,
            },
          });
          ids.push({ id: post.id, type: "TIKTOK", category: concept.category });
        }

        if (postSet.facebookPost) {
          const post = await prisma.post.create({
            data: {
              type: "FACEBOOK",
              title: concept.title,
              content: postSet.facebookPost,
              keywords: concept.sourceKeyword ? [concept.sourceKeyword] : [],
              status: "DRAFT",
              workspaceId,
              contentPlanId,
            },
          });
          ids.push({ id: post.id, type: "FACEBOOK", category: concept.category });
        }

        await useCredits(userId, "social_factory_post");
        createdPostIds.push(...ids);
        completed++;

        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { completed },
        });
      } catch (error) {
        console.error(`[Content Factory] Erreur concept ${concept.index}:`, error);
        failed++;
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { failed },
        });
      }
    }

    // Step 5: Auto-schedule
    const schedule = await autoSchedule(
      createdPostIds.map((p) => ({ postId: p.id, type: p.type, category: p.category })),
      month,
      year,
      objectives
    );
    for (const item of schedule) {
      await prisma.post.update({
        where: { id: item.postId },
        data: { scheduledAt: item.scheduledAt },
      });
    }

    // Step 6: Mark as completed
    await prisma.contentPlan.update({
      where: { id: contentPlanId },
      data: { status: completed > 0 ? "COMPLETED" : "FAILED" },
    });
  } catch (error) {
    console.error("[Content Factory] Job failed:", error);
    await prisma.contentPlan.update({
      where: { id: contentPlanId },
      data: { status: "FAILED" },
    });
  }
}
