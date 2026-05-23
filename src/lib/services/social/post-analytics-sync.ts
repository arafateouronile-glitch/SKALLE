/**
 * Sync analytics LinkedIn pour les posts publiés.
 *
 * Utilise :
 * - GET /v2/socialActions/{postUrn} → likes + comments
 * - GET /v2/networkSizes/{personUrn}?edgeType=MEMBER_TO_FOLLOWER → follower count
 *
 * Note : les impressions (vues) nécessitent le LinkedIn Marketing Developer Program.
 * On stocke ce qu'on peut via l'API standard.
 */

import { prisma } from "@/lib/prisma";
import { getExternalIntegrationKey } from "../integrations/external";

const LINKEDIN_API = "https://api.linkedin.com/v2";

interface LinkedInTokenData {
  accessToken: string;
  personUrn: string;
}

async function getToken(workspaceId: string): Promise<LinkedInTokenData | null> {
  const raw = await getExternalIntegrationKey(workspaceId, "LINKEDIN_OAUTH");
  if (!raw) return null;
  try { return JSON.parse(raw) as LinkedInTokenData; } catch { return null; }
}

async function fetchSocialActions(
  accessToken: string,
  postUrn: string
): Promise<{ likes: number; comments: number } | null> {
  try {
    const encoded = encodeURIComponent(postUrn);
    const res = await fetch(`${LINKEDIN_API}/socialActions/${encoded}`, {
      headers: { "Authorization": `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { totalFirstLevelComments?: number };
    };
    return {
      likes: data.likesSummary?.totalLikes ?? 0,
      comments: data.commentsSummary?.totalFirstLevelComments ?? 0,
    };
  } catch { return null; }
}

async function fetchFollowerCount(accessToken: string, personUrn: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(personUrn);
    const res = await fetch(
      `${LINKEDIN_API}/networkSizes/${encoded}?edgeType=MEMBER_TO_FOLLOWER`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { firstDegreeSize?: number };
    return data.firstDegreeSize ?? null;
  } catch { return null; }
}

export async function syncWorkspacePostInsights(workspaceId: string): Promise<{
  synced: number;
  errors: number;
  followerCount: number | null;
}> {
  const token = await getToken(workspaceId);
  if (!token) return { synced: 0, errors: 0, followerCount: null };

  // Publié dans les 30 derniers jours avec un cmsPostId LinkedIn
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      type: "LINKEDIN",
      status: "PUBLISHED",
      cmsPostId: { not: null },
      publishedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      deletedAt: null,
    },
    select: { id: true, cmsPostId: true },
  });

  const followerCount = await fetchFollowerCount(token.accessToken, token.personUrn);

  let synced = 0;
  let errors = 0;

  for (const post of posts) {
    if (!post.cmsPostId) continue;
    const stats = await fetchSocialActions(token.accessToken, post.cmsPostId);
    if (!stats) { errors++; continue; }

    const engagementRate =
      (stats.likes + stats.comments * 2) > 0
        ? (stats.likes + stats.comments * 2) / 1
        : null;

    await prisma.postInsight.upsert({
      where: { id: `${post.id}_latest` },
      create: {
        id: `${post.id}_latest`,
        postId: post.id,
        likes: stats.likes,
        comments: stats.comments,
        engagementRate,
        followerCount,
      },
      update: {
        likes: stats.likes,
        comments: stats.comments,
        engagementRate,
        followerCount,
        fetchedAt: new Date(),
      },
    });

    synced++;
  }

  return { synced, errors, followerCount };
}

export async function getPostAnalytics(workspaceId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      type: "LINKEDIN",
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      publishedAt: true,
      isCarousel: true,
      cmsPostId: true,
      postInsights: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
      },
    },
  });

  // Aggregate weekly for the chart
  const weeklyMap: Record<string, { week: string; likes: number; comments: number; posts: number }> = {};
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const d = new Date(post.publishedAt);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weeklyMap[key]) weeklyMap[key] = { week: key, likes: 0, comments: 0, posts: 0 };
    weeklyMap[key].posts++;
    const insight = post.postInsights[0];
    if (insight) {
      weeklyMap[key].likes += insight.likes;
      weeklyMap[key].comments += insight.comments;
    }
  }
  const weekly = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));

  // Top 5 posts by engagement
  const topPosts = [...posts]
    .sort((a, b) => {
      const scoreA = (a.postInsights[0]?.likes ?? 0) + (a.postInsights[0]?.comments ?? 0) * 2;
      const scoreB = (b.postInsights[0]?.likes ?? 0) + (b.postInsights[0]?.comments ?? 0) * 2;
      return scoreB - scoreA;
    })
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title ?? p.content.slice(0, 60) + "…",
      publishedAt: p.publishedAt,
      isCarousel: p.isCarousel,
      likes: p.postInsights[0]?.likes ?? 0,
      comments: p.postInsights[0]?.comments ?? 0,
      engagementRate: p.postInsights[0]?.engagementRate ?? null,
      hasMetrics: p.postInsights.length > 0,
    }));

  const latestInsight = posts.flatMap((p) => p.postInsights)[0];
  const followerCount = latestInsight?.followerCount ?? null;
  const totalLikes = posts.reduce((s, p) => s + (p.postInsights[0]?.likes ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.postInsights[0]?.comments ?? 0), 0);

  return {
    totalPosts: posts.length,
    totalLikes,
    totalComments,
    followerCount,
    weekly,
    topPosts,
    synced: posts.some((p) => p.postInsights.length > 0),
  };
}
