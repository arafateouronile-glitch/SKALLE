import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits, CREDIT_COSTS } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { feedback?: string };

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, brandVoice: true, name: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const proposal = await prisma.cMOProposal.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!proposal) return NextResponse.json({ error: "Proposition introuvable" }, { status: 404 });
  if (proposal.status !== "PENDING") {
    return NextResponse.json({ error: "Proposition déjà traitée" }, { status: 400 });
  }

  await prisma.cMOProposal.update({
    where: { id },
    data: { status: "IN_PROGRESS", userFeedback: body.feedback ?? null },
  });

  void executeProposal(
    proposal.id,
    proposal.type,
    proposal.payload as Record<string, unknown>,
    workspace.id,
    session.user.id,
  ).catch(async (err) => {
    await prisma.cMOProposal.update({
      where: { id: proposal.id },
      data: { status: "FAILED", result: { error: String(err) } },
    });
  });

  return NextResponse.json({ ok: true, status: "IN_PROGRESS" });
}

const PROPOSAL_CREDIT_OPS: Partial<Record<string, OperationType>> = {
  GENERATE_POSTS: "cmo_generate_posts",
  GENERATE_ARTICLE: "cmo_generate_article",
  ANALYZE: "cmo_analyze",
};

async function deductCredits(
  proposalId: string,
  type: string,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const op = PROPOSAL_CREDIT_OPS[type];
  if (!op) return true; // SCHEDULE_POSTS / ADJUST_STRATEGY sont gratuits

  const creditResult = await useCredits(userId, op);
  if (!creditResult.success) {
    await prisma.cMOProposal.update({
      where: { id: proposalId },
      data: { status: "FAILED", result: { error: creditResult.error ?? "Crédits insuffisants" } },
    });
    return false;
  }

  await prisma.aPIUsage.create({
    data: { service: "cmo", operation: op, credits: CREDIT_COSTS[op], workspaceId },
  }).catch(() => undefined); // log best-effort

  return true;
}

async function executeProposal(
  proposalId: string,
  type: string,
  payload: Record<string, unknown>,
  workspaceId: string,
  userId: string,
) {
  const creditsOk = await deductCredits(proposalId, type, userId, workspaceId);
  if (!creditsOk) return;

  let result: Record<string, unknown> = {};

  if (type === "GENERATE_POSTS") {
    const { niche, networks, icp, count = 6 } = payload as {
      niche: string;
      networks: string[];
      icp: Record<string, unknown>;
      count?: number;
    };
    const batchSize = Math.min(Math.max(Number(count), 1), 30);

    const bv = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandVoice: true } });
    const brandVoice = (bv?.brandVoice as Record<string, unknown>) ?? {};

    const { getClaude, getStringParser } = await import("@/lib/ai/langchain");
    const { SystemMessage, HumanMessage } = await import("@langchain/core/messages");
    const claude = getClaude();
    const parser = getStringParser();

    const networksStr = networks.join(", ");
    const system = `Tu es un expert copywriting social. Génère des posts engageants pour ${networksStr}.
Niche: ${niche}. Ton: ${(brandVoice.tone as string) ?? "professionnel"}.
ICP: ${JSON.stringify(icp)}
Retourne un tableau JSON de ${batchSize} posts: [{index,network,hookType,category,hook,content,cta}]`;

    const raw = await parser.invoke(await claude.invoke([
      new SystemMessage(system),
      new HumanMessage(`Génère ${batchSize} posts variés sur "${niche}" pour ${networksStr}. Varie les formats, hooks et réseaux.`),
    ]));

    const clean = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
    const posts = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as Array<{
      network: string; hook: string; content: string; hookType: string; category: string;
    }>;

    const validNetworks = new Set(["LINKEDIN", "X", "INSTAGRAM", "FACEBOOK"]);
    await prisma.post.createMany({
      data: posts
        .filter((p) => validNetworks.has(p.network))
        .map((p) => ({
          workspaceId,
          type: p.network as "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK",
          title: p.hook.slice(0, 80),
          content: p.content,
          status: "DRAFT" as const,
          keywords: [],
          sources: { hookType: p.hookType, category: p.category },
        })),
      skipDuplicates: true,
    });

    result = { postsCreated: posts.length, status: `${posts.length} posts créés en brouillon` };

  } else if (type === "GENERATE_ARTICLE") {
    const { keyword, niche } = payload as { keyword: string; niche: string };

    try {
      const { generateEliteArticle } = await import("@/lib/services/seo/writer");

      const [wsData, existingPosts] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandVoice: true } }),
        prisma.post.findMany({
          where: { workspaceId, type: "SEO_ARTICLE", deletedAt: null },
          select: { title: true },
          take: 50,
        }),
      ]);

      const brandVoice = (wsData?.brandVoice as Record<string, unknown>) ?? {};
      const contentMode = (
        (brandVoice.seoPublicationStrategy as Record<string, unknown> | undefined)?.contentMode as string | undefined
      ) ?? "article";
      const existingTitles = existingPosts.map((p) => p.title).filter((t): t is string => !!t);

      const article = await generateEliteArticle({
        keyword,
        brandVoice,
        existingArticleTitles: existingTitles,
        generateImages: false,
        userId,
        workspaceId,
        contentMode,
        targetPersona: niche,
      });

      await prisma.post.create({
        data: {
          type: "SEO_ARTICLE",
          title: article.title,
          content: article.content,
          excerpt: article.excerpt,
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
          imageUrl: article.featuredImageUrl ?? undefined,
          sources: article.sources.length > 0 ? JSON.parse(JSON.stringify(article.sources)) : undefined,
          status: "DRAFT",
          workspaceId,
        },
      });

      result = {
        keyword,
        seoScore: article.seoScore,
        wordCount: article.wordCount,
        status: `Article "${article.title}" créé (${article.wordCount} mots, SEO ${article.seoScore}/100)`,
      };
    } catch (err) {
      // Fallback: créer un brouillon vide plutôt que de faire échouer la proposal
      await prisma.post.create({
        data: {
          workspaceId,
          type: "SEO_ARTICLE",
          title: keyword,
          content: `# ${keyword}\n\n*À compléter*`,
          status: "DRAFT",
          keywords: [keyword],
          metaTitle: keyword,
        },
      });
      result = { keyword, status: "Brouillon créé (génération IA échouée)", error: String(err) };
    }

  } else if (type === "ANALYZE") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [postCount, draftCount, publishedCount, seoCount] = await Promise.all([
      prisma.post.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo }, deletedAt: null } }),
      prisma.post.count({ where: { workspaceId, status: "DRAFT", deletedAt: null } }),
      prisma.post.count({ where: { workspaceId, status: "PUBLISHED", deletedAt: null } }),
      prisma.post.count({ where: { workspaceId, type: "SEO_ARTICLE", createdAt: { gte: thirtyDaysAgo }, deletedAt: null } }),
    ]);

    result = {
      period: "30 derniers jours",
      postsTotal: postCount,
      postsDraft: draftCount,
      postsPublished: publishedCount,
      seoArticles: seoCount,
      insight: `${postCount} contenus créés (${seoCount} SEO), ${publishedCount} publiés, ${draftCount} en attente.`,
      status: `Analyse complète — ${postCount} contenus sur 30j`,
    };

  } else if (type === "SCHEDULE_POSTS") {
    const { networks, scheduledFor, count = 5 } = payload as {
      networks?: string[];
      scheduledFor?: string;
      count?: number;
    };
    const scheduledAt = scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const drafts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: "DRAFT",
        deletedAt: null,
        ...(networks?.length ? { type: { in: networks as ("LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK")[] } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: count,
      select: { id: true },
    });

    if (drafts.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: "SCHEDULED", scheduledAt },
      });
    }

    result = {
      postsScheduled: drafts.length,
      scheduledAt: scheduledAt.toISOString(),
      status: drafts.length > 0 ? `${drafts.length} posts programmés pour ${scheduledAt.toLocaleDateString("fr-FR")}` : "Aucun brouillon disponible",
    };

  } else if (type === "ADJUST_STRATEGY") {
    const { adjustments } = payload as { adjustments: string };
    const bv = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandVoice: true } });
    const current = (bv?.brandVoice as Record<string, unknown>) ?? {};
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { brandVoice: { ...current, lastStrategyAdjustment: adjustments, adjustedAt: new Date().toISOString() } as object },
    });
    result = { status: "Stratégie mise à jour", adjustments };
  }

  await prisma.cMOProposal.update({
    where: { id: proposalId },
    data: { status: "DONE", result: result as object },
  });

  try {
    const { notifyAgentBrainDecision } = await import("@/lib/services/notifications/admin");
    await notifyAgentBrainDecision({
      actionType: `CMO_PROPOSAL_${type}`,
      summary: String(result.status ?? result.postsCreated ?? result.postsScheduled ?? "OK"),
      workspaceId,
      priority: "MEDIUM",
    });
  } catch {
    // ne pas bloquer si la notification échoue
  }
}
