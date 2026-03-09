import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getOpenAI, seoArticlePrompt, getStringParser } from "@/lib/ai/langchain";
import { searchCompetitorContent } from "@/lib/ai/serper";
import { generateImage } from "@/lib/ai/banana";
import { generateEnhancedArticle } from "@/lib/seo/article-generator";
import { dispatchWebhook } from "@/lib/services/webhooks/dispatcher";

interface BulkArticleEvent {
  data: {
    batchJobId: string;
    workspaceId: string;
    keywords: string[];
    brandVoice?: Record<string, unknown>;
    useEnhancedPipeline?: boolean;
  };
}

export const generateBulkArticles = inngest.createFunction(
  {
    id: "generate-bulk-articles",
    name: "Generate Bulk SEO Articles",
    retries: 3,
  },
  { event: "articles/bulk.generate" },
  async ({ event, step }) => {
    const { batchJobId, workspaceId, keywords, brandVoice, useEnhancedPipeline = true } = event.data;

    // Initialiser les statuts par mot-clé
    const itemStatuses: Record<string, string> = {};
    for (const kw of keywords) {
      itemStatuses[kw] = "pending";
    }

    // Update batch job status
    await step.run("start-batch", async () => {
      await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          itemStatuses: JSON.parse(JSON.stringify(itemStatuses)),
        },
      });
    });

    let completed = 0;
    let failed = 0;

    // Récupérer les titres existants pour les liens internes
    const existingTitles = await step.run("fetch-existing-titles", async () => {
      const posts = await prisma.post.findMany({
        where: { workspaceId, type: "SEO_ARTICLE", deletedAt: null },
        select: { title: true },
        take: 50,
      });
      return posts.map((p) => p.title).filter((t): t is string => !!t);
    });

    // Process each keyword
    for (const keyword of keywords) {
      // Vérifier si le job a été annulé ou mis en pause
      const shouldContinue = await step.run(`check-status-${keyword}`, async () => {
        const job = await prisma.batchJob.findUnique({
          where: { id: batchJobId },
          select: { status: true },
        });
        return job?.status === "RUNNING";
      });

      if (!shouldContinue) {
        // Job annulé ou en pause, marquer les restants comme skipped
        itemStatuses[keyword] = "skipped";
        await step.run(`skip-${keyword}`, async () => {
          await prisma.batchJob.update({
            where: { id: batchJobId },
            data: { itemStatuses: JSON.parse(JSON.stringify(itemStatuses)) },
          });
        });
        continue;
      }

      try {
        await step.run(`process-${keyword}`, async () => {
          // Marquer comme "processing"
          itemStatuses[keyword] = "processing";
          await prisma.batchJob.update({
            where: { id: batchJobId },
            data: { itemStatuses: JSON.parse(JSON.stringify(itemStatuses)) },
          });

          if (useEnhancedPipeline) {
            // ═══ PIPELINE ENRICHI ═══
            const article = await generateEnhancedArticle({
              keyword,
              brandVoice,
              workspaceId,
              existingArticleTitles: existingTitles,
            });

            // Générer image
            let imageUrl: string | null = null;
            try {
              const imagePrompt = `Professional blog header image for article about: ${keyword}. Modern, clean design.`;
              imageUrl = await generateImage(imagePrompt);
            } catch (imgError) {
              console.error("Image generation error:", imgError);
            }

            // Sauvegarder avec tous les nouveaux champs
            await prisma.post.create({
              data: {
                type: "SEO_ARTICLE",
                title: article.title,
                content: article.content,
                excerpt: article.excerpt,
                imageUrl,
                metaTitle: article.metaTitle,
                metaDescription: article.metaDescription,
                outline: JSON.parse(JSON.stringify(article.outline)),
                keywords: [keyword, ...article.relatedKeywords.slice(0, 5)],
                seoScore: article.seoScore,
                readabilityScore: article.readabilityScore,
                seoFeedback: JSON.parse(JSON.stringify(article.seoFeedback)),
                faqContent: JSON.parse(JSON.stringify(article.faqContent)),
                tableOfContents: JSON.parse(JSON.stringify(article.tableOfContents)),
                wordCount: article.wordCount,
                status: "DRAFT",
                workspaceId,
                batchJobId,
              },
            });
          } else {
            // ═══ PIPELINE BASIQUE (backward compatible) ═══
            const sources = await searchCompetitorContent(keyword);
            const sourcesText = sources
              .slice(0, 5)
              .map((s) => `- ${s.title}: ${s.snippet}`)
              .join("\n");

            const chain = seoArticlePrompt.pipe(getOpenAI()).pipe(getStringParser());
            const articleContent = await chain.invoke({
              keyword,
              sources: sourcesText,
              brandVoice: brandVoice
                ? JSON.stringify(brandVoice)
                : "Professionnel et accessible",
            });

            let imageUrl: string | null = null;
            try {
              const imagePrompt = `Professional blog header image for article about: ${keyword}. Modern, clean design with subtle tech elements.`;
              imageUrl = await generateImage(imagePrompt);
            } catch (imgError) {
              console.error("Image generation error:", imgError);
            }

            const titleMatch = articleContent.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : keyword;
            const contentWithoutTitle = articleContent.replace(/^#\s+.+$/m, "").trim();
            const excerpt = contentWithoutTitle.slice(0, 200) + "...";

            await prisma.post.create({
              data: {
                type: "SEO_ARTICLE",
                title,
                content: articleContent,
                excerpt,
                imageUrl,
                keywords: [keyword],
                sources: JSON.parse(JSON.stringify(sources.slice(0, 5))),
                status: "DRAFT",
                workspaceId,
                batchJobId,
              },
            });
          }

          // Track API usage
          await prisma.aPIUsage.createMany({
            data: [
              {
                service: "openai",
                operation: "article",
                credits: 1,
                workspaceId,
              },
              {
                service: "serper",
                operation: "search",
                credits: 1,
                workspaceId,
              },
            ],
          });

          // Marquer comme terminé
          itemStatuses[keyword] = "done";
          completed++;

          await prisma.batchJob.update({
            where: { id: batchJobId },
            data: {
              completed,
              itemStatuses: JSON.parse(JSON.stringify(itemStatuses)),
            },
          });
        });
      } catch (error) {
        console.error(`Error processing keyword ${keyword}:`, error);
        itemStatuses[keyword] = "failed";
        failed++;

        await prisma.batchJob.update({
          where: { id: batchJobId },
          data: {
            failed,
            itemStatuses: JSON.parse(JSON.stringify(itemStatuses)),
          },
        });
      }
    }

    // Complete batch job
    await step.run("complete-batch", async () => {
      const finalJob = await prisma.batchJob.findUnique({
        where: { id: batchJobId },
        select: { status: true },
      });

      // Ne pas écraser un statut CANCELLED
      if (finalJob?.status === "CANCELLED") return;

      await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
          status: failed === keywords.length ? "FAILED" : "COMPLETED",
          completedAt: new Date(),
        },
      });
    });

    return { completed, failed, total: keywords.length };
  }
);

// Single article generation (via Inngest pour les cas asynchrones)
export const generateSingleArticle = inngest.createFunction(
  {
    id: "generate-single-article",
    name: "Generate Single SEO Article",
    retries: 2,
  },
  { event: "articles/single.generate" },
  async ({ event, step }) => {
    const { workspaceId, keyword, brandVoice } = event.data;

    const article = await step.run("generate-article", async () => {
      return generateEnhancedArticle({
        keyword,
        brandVoice,
        workspaceId,
      });
    });

    const imageUrl = await step.run("generate-image", async () => {
      try {
        const imagePrompt = `Professional blog header image for article about: ${keyword}`;
        return await generateImage(imagePrompt);
      } catch {
        return null;
      }
    });

    const post = await step.run("save-article", async () => {
      return prisma.post.create({
        data: {
          type: "SEO_ARTICLE",
          title: article.title,
          content: article.content,
          excerpt: article.excerpt,
          imageUrl,
          metaTitle: article.metaTitle,
          metaDescription: article.metaDescription,
          outline: JSON.parse(JSON.stringify(article.outline)),
          keywords: [keyword, ...article.relatedKeywords.slice(0, 5)],
          seoScore: article.seoScore,
          readabilityScore: article.readabilityScore,
          seoFeedback: JSON.parse(JSON.stringify(article.seoFeedback)),
          faqContent: JSON.parse(JSON.stringify(article.faqContent)),
          tableOfContents: JSON.parse(JSON.stringify(article.tableOfContents)),
          wordCount: article.wordCount,
          status: "DRAFT",
          workspaceId,
        },
      });
    });

    await step.run("notify-webhooks", async () => {
      await dispatchWebhook(workspaceId, "seo.article.completed", {
        articleId: post.id,
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        seoScore: article.seoScore,
        keyword,
        createdAt: new Date().toISOString(),
      });
    });

    return { postId: post.id };
  }
);
