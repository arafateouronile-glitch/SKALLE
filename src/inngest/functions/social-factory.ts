/**
 * 🏭 Inngest Function: Social Content Factory
 *
 * Job asynchrone pour générer un plan de contenu mensuel complet :
 * 1. Initialise la stratégie de marque
 * 2. Génère 30 concepts de posts
 * 3. Produit les posts multi-format (LinkedIn, X, Instagram, TikTok)
 * 4. Planifie automatiquement dans le calendrier
 */

import { inngest } from "../client";
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

export const generateSocialFactory = inngest.createFunction(
  {
    id: "generate-social-factory",
    name: "Social Content Factory - Generate Monthly Plan",
    retries: 2,
  },
  { event: "social-factory/generate" },
  async ({ event, step }) => {
    const {
      contentPlanId,
      workspaceId,
      userId,
      vision,
      niche,
      objectives,
      networks,
      month,
      year,
    } = event.data;

    // Step 1: Marquer le plan comme GENERATING
    await step.run("start-plan", async () => {
      await prisma.contentPlan.update({
        where: { id: contentPlanId },
        data: { status: "GENERATING" },
      });
    });

    // Step 2: Initialiser la stratégie de marque
    const persona = await step.run("init-strategy", async () => {
      const result = await initializeBrandStrategy(workspaceId);
      if (!result.success || !result.persona) {
        throw new Error(result.error ?? "Échec de l'initialisation de la stratégie");
      }
      await useCredits(userId, "social_factory_strategy");
      return result.persona;
    });

    // Step 3: Générer les 30 concepts
    const concepts = await step.run("generate-concepts", async () => {
      const result = await generateContentConcepts(workspaceId, {
        vision,
        niche,
        objectives,
        networks: networks ?? [],
        workspaceId,
      });

      if (!result.success || !result.concepts) {
        throw new Error(result.error ?? "Échec de la génération des concepts");
      }

      await useCredits(userId, "social_factory_concepts");

      // Sauvegarder les concepts dans le ContentPlan
      await prisma.contentPlan.update({
        where: { id: contentPlanId },
        data: {
          totalConcepts: result.concepts.length,
          conceptsData: JSON.parse(JSON.stringify(result.concepts)),
          keywordsUsed: JSON.parse(
            JSON.stringify(
              result.concepts
                .filter((c: ContentConcept) => c.sourceKeyword)
                .map((c: ContentConcept) => c.sourceKeyword)
            )
          ),
          adsUsed: JSON.parse(
            JSON.stringify(
              result.concepts
                .filter((c: ContentConcept) => c.sourceAdId)
                .map((c: ContentConcept) => c.sourceAdId)
            )
          ),
        },
      });

      return result.concepts;
    });

    // Step 4: Générer les posts multi-format pour chaque concept
    let completed = 0;
    let failed = 0;
    const createdPostIds: Array<{ id: string; type: string; category: string }> = [];

    for (const concept of concepts as ContentConcept[]) {
      try {
        const posts = await step.run(`gen-post-${concept.index}`, async () => {
          const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { brandVoice: true, brandType: true },
          });
          const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};

          const postSet = await generatePostFormats(
            concept,
            persona as MarketingPersona,
            brandVoice,
            workspace?.brandType ?? "B2C"
          );

          const ids: Array<{ id: string; type: string; category: string }> = [];

          // LinkedIn
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

          // X (Twitter)
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

          // Instagram
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

          // TikTok
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

          // Facebook
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
          return ids;
        });

        createdPostIds.push(...posts);
        completed++;

        // Mettre à jour la progression
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

    // Step 5: Auto-scheduler les posts
    await step.run("auto-schedule", async () => {
      const schedule = await autoSchedule(
        createdPostIds.map((p) => ({
          postId: p.id,
          type: p.type,
          category: p.category,
        })),
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
    });

    // Step 6: Marquer comme terminé
    await step.run("complete-plan", async () => {
      await prisma.contentPlan.update({
        where: { id: contentPlanId },
        data: { status: completed > 0 ? "COMPLETED" : "FAILED" },
      });
    });

    return { completed, failed, totalPosts: createdPostIds.length };
  }
);
