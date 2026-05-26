import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
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

  // Execute the proposal asynchronously
  void executeProposal(proposal.id, proposal.type, proposal.payload as Record<string, unknown>, workspace.id).catch(async (err) => {
    await prisma.cMOProposal.update({
      where: { id: proposal.id },
      data: { status: "FAILED", result: { error: String(err) } },
    });
  });

  return NextResponse.json({ ok: true, status: "IN_PROGRESS" });
}

async function executeProposal(
  proposalId: string,
  type: string,
  payload: Record<string, unknown>,
  workspaceId: string
) {
  let result: Record<string, unknown> = {};

  if (type === "GENERATE_POSTS") {
    const { niche, networks, icp } = payload as {
      niche: string;
      networks: string[];
      icp: Record<string, unknown>;
    };
    const bv = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandVoice: true } });
    const brandVoice = (bv?.brandVoice as Record<string, unknown>) ?? {};

    const { getClaude, getStringParser } = await import("@/lib/ai/langchain");
    const { SystemMessage, HumanMessage } = await import("@langchain/core/messages");
    const claude = getClaude();
    const parser = getStringParser();

    const system = `Tu es un expert copywriting social. Génère des posts engageants pour ${networks.join(", ")}.
Niche: ${niche}. Ton: ${(brandVoice.tone as string) ?? "professionnel"}.
ICP: ${JSON.stringify(icp)}
Retourne un tableau JSON de 6 posts: [{index,network,hookType,category,hook,content,cta}]`;

    const raw = await parser.invoke(await claude.invoke([
      new SystemMessage(system),
      new HumanMessage(`Génère 6 posts variés sur "${niche}" pour ${networks.join(", ")}.`),
    ]));

    const clean = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
    const posts = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as Array<{
      network: string; hook: string; content: string; hookType: string; category: string;
    }>;

    await prisma.post.createMany({
      data: posts
        .filter((p) => ["LINKEDIN","X","INSTAGRAM","FACEBOOK"].includes(p.network))
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

    result = { postsCreated: posts.length, status: "Posts créés en brouillon" };

  } else if (type === "GENERATE_ARTICLE") {
    const { keyword, niche } = payload as { keyword: string; niche: string };

    await prisma.post.create({
      data: {
        workspaceId,
        type: "SEO_ARTICLE",
        title: keyword,
        content: `Article SEO généré par l'agent CMO sur le sujet: ${keyword} (${niche}).\n\nContenu à compléter par l'agent SEO.`,
        status: "DRAFT",
        keywords: [keyword],
        metaTitle: keyword,
      },
    });

    result = { status: "Article créé en brouillon", keyword };

  } else if (type === "ANALYZE") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [postCount, draftCount, publishedCount] = await Promise.all([
      prisma.post.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo }, deletedAt: null } }),
      prisma.post.count({ where: { workspaceId, status: "DRAFT", deletedAt: null } }),
      prisma.post.count({ where: { workspaceId, status: "PUBLISHED", deletedAt: null } }),
    ]);

    result = {
      period: "30 derniers jours",
      postsTotal: postCount,
      postsDraft: draftCount,
      postsPublished: publishedCount,
      insight: `${postCount} contenus créés, ${publishedCount} publiés, ${draftCount} en attente.`,
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
}
