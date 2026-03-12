/**
 * ⏰ Scheduled Post Publisher
 *
 * Scanne toutes les 5 minutes les posts SCHEDULED dont scheduledAt ≤ now
 * et les publie sur le réseau social correspondant.
 *
 * Réseaux supportés : LINKEDIN, FACEBOOK, INSTAGRAM
 * Autres types (X, TIKTOK) → marqués FAILED avec message explicatif
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { publishLinkedInPost } from "@/lib/services/integrations/linkedin-api";
import { publishToFacebookPage, publishToInstagram } from "@/lib/services/meta/publishing";
import { refreshTokenIfNeeded } from "@/lib/services/meta/token-manager";

export const scheduledPostPublisher = inngest.createFunction(
  {
    id: "scheduled-post-publisher",
    name: "Publish Scheduled Social Posts",
    retries: 1,
    concurrency: { limit: 1 }, // Éviter les publications en double
  },
  { cron: "*/5 * * * *" }, // Toutes les 5 minutes
  async ({ step, logger }) => {
    // ─── 1. Trouver les posts à publier ──────────────────────────────────
    const duePosts = await step.run("find-due-posts", async () => {
      return prisma.post.findMany({
        where: {
          status: "SCHEDULED",
          scheduledAt: { lte: new Date() },
          deletedAt: null,
          type: { not: "SEO_ARTICLE" },
        },
        select: {
          id: true,
          type: true,
          content: true,
          imageUrl: true,
          workspaceId: true,
          scheduledAt: true,
        },
        orderBy: { scheduledAt: "asc" },
        take: 50, // Max 50 posts par run
      });
    });

    if (duePosts.length === 0) {
      return { published: 0, failed: 0 };
    }

    logger.info(`Found ${duePosts.length} posts due for publishing`);

    let published = 0;
    let failed = 0;

    // ─── 2. Publier chaque post ───────────────────────────────────────────
    for (const post of duePosts) {
      await step.run(`publish-post-${post.id}`, async () => {
        try {
          let platformPostId: string | undefined;
          let permalink: string | undefined;

          // ── LinkedIn ──
          if (post.type === "LINKEDIN") {
            const result = await publishLinkedInPost(
              post.workspaceId,
              post.content,
              post.imageUrl ?? undefined
            );
            if (!result.success) throw new Error(result.error ?? "Erreur LinkedIn");
            platformPostId = result.postId;
            permalink = result.postUrl ?? undefined;
          }

          // ── Facebook Page ──
          else if (post.type === "FACEBOOK") {
            const metaAccount = await prisma.metaSocialAccount.findFirst({
              where: { workspaceId: post.workspaceId, isActive: true },
            });
            if (!metaAccount) throw new Error("Aucune Page Facebook connectée");

            const pageToken = await refreshTokenIfNeeded(metaAccount.id);
            const result = await publishToFacebookPage(
              pageToken,
              metaAccount.facebookPageId,
              post.content,
              post.imageUrl
            );
            platformPostId = result.platformPostId;
            permalink = result.permalink;
          }

          // ── Instagram ──
          else if (post.type === "INSTAGRAM") {
            const metaAccount = await prisma.metaSocialAccount.findFirst({
              where: {
                workspaceId: post.workspaceId,
                isActive: true,
                instagramAccountId: { not: null },
              },
            });
            if (!metaAccount?.instagramAccountId) {
              throw new Error("Aucun compte Instagram Business connecté");
            }

            const pageToken = await refreshTokenIfNeeded(metaAccount.id);
            const result = await publishToInstagram(
              pageToken,
              metaAccount.instagramAccountId,
              post.content,
              post.imageUrl
            );
            platformPostId = result.platformPostId;
            permalink = result.permalink;
          }

          // ── Type non supporté ──
          else {
            throw new Error(
              `Publication directe non disponible pour ${post.type}. Connectez Buffer ou Ayrshare.`
            );
          }

          // Marquer PUBLISHED
          await prisma.post.update({
            where: { id: post.id },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              ...(permalink && { cmsPostId: permalink }),
            },
          });

          logger.info(`Post ${post.id} (${post.type}) published`, { platformPostId, permalink });
          published++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Erreur inconnue";
          logger.error(`Post ${post.id} (${post.type}) failed: ${msg}`);

          await prisma.post.update({
            where: { id: post.id },
            data: { status: "FAILED" },
          });

          failed++;
        }
      });
    }

    return { published, failed, total: duePosts.length };
  }
);
