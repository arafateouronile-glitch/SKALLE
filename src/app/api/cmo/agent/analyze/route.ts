/**
 * POST /api/cmo/agent/analyze
 *
 * L'agent CMO lit les objectifs actifs + l'état courant du workspace
 * et génère une liste de propositions concrètes (CMOProposal) à valider.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

interface ProposalDraft {
  type: "GENERATE_POSTS" | "GENERATE_ARTICLE" | "SCHEDULE_POSTS" | "ANALYZE" | "ADJUST_STRATEGY";
  title: string;
  description: string;
  agentReason: string;
  payload: Record<string, unknown>;
  creditsEst: number;
  objectiveId?: string;
}

export async function POST() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Gather context
  const [objectives, recentPosts, pendingProposals, rejectedFeedback, doneByType, gscConfig] = await Promise.all([
    prisma.cMOObjective.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.post.findMany({
      where: { workspaceId: workspace.id, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
      select: { type: true, status: true, createdAt: true },
    }),
    prisma.cMOProposal.count({
      where: { workspaceId: workspace.id, status: "PENDING" },
    }),
    prisma.cMOProposal.findMany({
      where: {
        workspaceId: workspace.id,
        status: "REJECTED",
        userFeedback: { not: null },
        updatedAt: { gte: fourteenDaysAgo },
      },
      select: { type: true, title: true, userFeedback: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.cMOProposal.groupBy({
      by: ["type"],
      where: { workspaceId: workspace.id, status: "DONE", updatedAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    prisma.googleSearchConsoleConfig.findUnique({
      where: { workspaceId: workspace.id },
      select: { topPages: true, topKeywords: true, isConnected: true },
    }),
  ]);

  if (objectives.length === 0) {
    return NextResponse.json({ error: "Aucun objectif actif. Créez d'abord des objectifs." }, { status: 400 });
  }

  const bv = (workspace.brandVoice as Record<string, unknown>) ?? {};
  const icp = bv.icp as Record<string, unknown> | undefined;
  const tone = (bv.tone as string) ?? "professionnel";
  const niche = (bv.niche as string) ?? workspace.name;

  const postsByType = recentPosts.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] ?? 0) + 1;
    return acc;
  }, {});
  const published = recentPosts.filter((p) => p.status === "PUBLISHED").length;
  const draftsCount = recentPosts.filter((p) => p.status === "DRAFT").length;

  // Feedback loop: rejections récentes
  const rejectionSummary = rejectedFeedback.length > 0
    ? rejectedFeedback.map((r) => `  - [${r.type}] "${r.title}" → rejeté: "${r.userFeedback}"`).join("\n")
    : "  Aucun rejet récent.";

  // Actions réussies: types exécutés avec succès ce mois
  const doneSummary = doneByType.length > 0
    ? doneByType.map((d) => `  - ${d.type}: ${d._count.id} exécutée(s)`).join("\n")
    : "  Aucune action complétée ce mois.";

  // GSC: pages/mots-clés disponibles
  let gscSection = "";
  if (gscConfig?.isConnected && (gscConfig.topPages ?? gscConfig.topKeywords)) {
    const pages = gscConfig.topPages as { page?: string; url?: string; clicks?: number; position?: number }[] | null;
    const keywords = gscConfig.topKeywords as { keyword?: string; query?: string; clicks?: number; position?: number }[] | null;
    if (pages?.length) {
      const declining = pages.filter((p) => (p.position ?? 0) > 15).slice(0, 5);
      if (declining.length > 0) {
        gscSection = `\nGOOGLE SEARCH CONSOLE — Pages en position >15 (opportunités de régénération):
${declining.map((p) => `  - ${p.url ?? p.page} (pos. ${p.position?.toFixed(1)}, ${p.clicks ?? 0} clics)`).join("\n")}`;
      }
    }
    if (!gscSection && keywords?.length) {
      gscSection = `\nGOOGLE SEARCH CONSOLE — Top keywords:
${keywords.slice(0, 5).map((k) => `  - "${k.query ?? k.keyword}" (pos. ${k.position?.toFixed(1)}, ${k.clicks ?? 0} clics)`).join("\n")}`;
    }
  }

  const systemPrompt = `Tu es un CMO IA expert en stratégie de contenu B2B/B2C.
Tu analyses les objectifs marketing d'une marque et génères des propositions d'actions concrètes et priorisées.

Marque: ${workspace.name}
Niche: ${niche}
Ton: ${tone}
ICP: ${icp ? JSON.stringify(icp) : "non défini"}

ÉTAT ACTUEL (30 derniers jours):
- Posts créés par réseau: ${JSON.stringify(postsByType)}
- Posts publiés: ${published}
- Brouillons en attente: ${draftsCount}
- Propositions déjà en attente: ${pendingProposals}
${gscSection}

HISTORIQUE DES PROPOSITIONS (14 derniers jours):
Actions complétées avec succès:
${doneSummary}

Propositions rejetées par l'utilisateur (à éviter ou adapter):
${rejectionSummary}

TYPES D'ACTIONS DISPONIBLES:
- GENERATE_POSTS: génère un batch de posts sociaux (payload: {niche, networks, icp, count})
- GENERATE_ARTICLE: crée un article SEO en brouillon (payload: {keyword, niche})
- SCHEDULE_POSTS: programme des brouillons existants (payload: {networks, scheduledFor, count})
- ANALYZE: rapport de performance (payload: {period, metrics})
- ADJUST_STRATEGY: ajuste la brand voice / stratégie (payload: {adjustments})

RÈGLES:
1. Ne propose pas d'actions déjà PENDING (${pendingProposals} en attente)
2. Tiens compte des rejets récents — ne répète pas une proposition rejetée sans la modifier substantiellement
3. Priorise selon l'écart entre objectif et réalité
4. Si des brouillons existent (${draftsCount}) et aucun programmé, propose SCHEDULE_POSTS
5. Si des pages GSC déclinent, propose GENERATE_ARTICLE sur le sujet correspondant
6. creditsEst: GENERATE_POSTS=15, GENERATE_ARTICLE=8, SCHEDULE_POSTS=0, ANALYZE=2, ADJUST_STRATEGY=0
7. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown.`;

  const humanPrompt = `Objectifs actifs:
${objectives.map((o) => {
  const t = o.target as { metric: string; value: number; unit: string };
  return `- [${o.type}/${o.period}] "${o.title}" — cible: ${t.value} ${t.unit} (${t.metric}) | ID: ${o.id}`;
}).join("\n")}

Génère entre 2 et 5 propositions concrètes pour atteindre ces objectifs.

Format JSON attendu:
[
  {
    "type": "GENERATE_POSTS",
    "title": "30 posts LinkedIn sur l'IA Sales",
    "description": "Batch de 30 posts optimisés pour l'engagement LinkedIn",
    "agentReason": "Votre objectif content demande 30 posts/mois — 0 généré ce mois",
    "payload": { "niche": "IA Sales B2B", "networks": ["LINKEDIN"], "icp": {}, "count": 30 },
    "creditsEst": 15,
    "objectiveId": "${objectives[0]?.id ?? ""}"
  }
]`;

  const claude = getClaude();
  const parser = getStringParser();

  let raw: string;
  try {
    raw = await parser.invoke(await claude.invoke([
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage(humanPrompt),
    ]));
  } catch (e) {
    return NextResponse.json({ error: `Erreur IA: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  let drafts2: ProposalDraft[];
  try {
    const clean = raw.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
    drafts2 = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as ProposalDraft[];
  } catch {
    return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });
  }

  if (!drafts2.length) return NextResponse.json({ error: "L'agent n'a généré aucune proposition" }, { status: 500 });

  const created = await prisma.cMOProposal.createMany({
    data: drafts2.map((d) => ({
      workspaceId: workspace.id,
      objectiveId: d.objectiveId && objectives.some((o) => o.id === d.objectiveId) ? d.objectiveId : null,
      type: d.type,
      title: d.title,
      description: d.description,
      agentReason: d.agentReason,
      payload: d.payload as object,
      creditsEst: d.creditsEst ?? 0,
    })),
  });

  return NextResponse.json({ created: created.count });
}
