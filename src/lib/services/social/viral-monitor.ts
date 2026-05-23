/**
 * Viral Monitor — scrape LinkedIn & Twitter via Apify, score et stocke les posts viraux
 */

import { prisma } from "@/lib/prisma";
import { HookType, ViralPlatform } from "@prisma/client";

const APIFY_API_BASE = "https://api.apify.com/v2";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  queries: string[];
  maxPostsPerPlatform?: number;
  workspaceId?: string;
}

export interface ScrapeResult {
  saved: number;
  skipped: number;
  errors: string[];
}

export type SortBy = "viralScore" | "likes" | "comments" | "views" | "recent";

export interface ViralPostFilters {
  platform?: ViralPlatform;
  hookType?: HookType;
  niche?: string;
  country?: string;
  minScore?: number;
  minLikes?: number;
  minComments?: number;
  minViews?: number;
  sortBy?: SortBy;
  workspaceId?: string;
  bookmarkedOnly?: boolean;
  page?: number;
  limit?: number;
}

interface ApifyLinkedInPost {
  text?: string;
  description?: string;
  authorFullName?: string;
  authorName?: string;
  authorUsername?: string;
  authorLocation?: string;
  location?: string;
  profilePicture?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  numViews?: number;
  postUrl?: string;
  url?: string;
  postedAt?: string;
  postedDate?: string;
  // tag surfaced by some actors
  query?: string;
}

interface ApifyTwitterPost {
  full_text?: string;
  text?: string;
  user?: {
    name?: string;
    screen_name?: string;
    profile_image_url_https?: string;
    location?: string;
  };
  author?: {
    name?: string;
    userName?: string;
    profilePicture?: string;
    location?: string;
  };
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  views?: { count?: number };
  url?: string;
  created_at?: string;
  createdAt?: string;
  searchTerm?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_PATTERNS: { type: HookType; patterns: RegExp[] }[] = [
  { type: "QUESTION", patterns: [/^\s*\w[^.!?]*\?/m] },
  { type: "STAT", patterns: [/\b\d+\s*%|\d+\s*(millions?|milliards?|K|M)\b/i] },
  { type: "CONTRARIAN", patterns: [/\b(arrêtez|stop|tout le monde a tort|mythe|idée reçue|contraire|faux|wrong|unpopular)\b/i] },
  { type: "LIST", patterns: [/\b(\d+\s+raisons?|\d+\s+astuces?|\d+\s+ways?|\d+\s+tips?)\b/i, /^[\d•\-]\./m] },
  { type: "HOW_TO", patterns: [/\b(comment|how to|voici comment|étapes?|steps?)\b/i] },
  { type: "STORY", patterns: [/\b(il y a \d+ ans?|j'avais?|je suis|my story|thread|histoire)\b/i] },
  { type: "CONFESSION", patterns: [/\b(j'avoue|je confesse|honte|erreur|failed|échec|mistake)\b/i] },
  { type: "PREDICTION", patterns: [/\b(dans \d+ ans?|en 202\d|dans le futur|prediction|prédi[ct])\b/i] },
];

function detectHookType(content: string): HookType {
  const first300 = content.slice(0, 300);
  for (const { type, patterns } of HOOK_PATTERNS) {
    if (patterns.some((p) => p.test(first300))) return type;
  }
  return "OTHER";
}

// ─────────────────────────────────────────────────────────────────────────────
// VIRAL SCORE
// ─────────────────────────────────────────────────────────────────────────────

function calcViralScore(
  platform: ViralPlatform,
  likes: number,
  comments: number,
  shares: number,
  views?: number
): number {
  if (platform === "LINKEDIN") {
    const base = likes + comments * 3 + shares * 5;
    const viewBonus = views ? Math.log10(views + 1) * 5 : 0;
    return Math.round(base + viewBonus);
  }
  const base = likes + shares * 4 + comments * 2;
  const viewBonus = views ? Math.log10(views + 1) * 3 : 0;
  return Math.round(base + viewBonus);
}

// ─────────────────────────────────────────────────────────────────────────────
// APIFY
// ─────────────────────────────────────────────────────────────────────────────

/** Lance un actor Apify en mode asynchrone — retourne le runId immédiatement (<1s) */
export async function startApifyRun(actorId: string, input: unknown): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(`${APIFY_API_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Apify start failed (${res.status}): ${await res.text()}`);
  const json = await res.json() as { data: { id: string } };
  return json.data.id;
}

/** Récupère le statut d'un run Apify */
export async function getApifyRunStatus(runId: string): Promise<"RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED"> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Apify status failed (${res.status})`);
  const json = await res.json() as { data: { status: string } };
  return json.data.status as ReturnType<typeof getApifyRunStatus> extends Promise<infer U> ? U : never;
}

/** Récupère les items du dataset d'un run terminé */
export async function fetchApifyRunItems<T>(runId: string): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}/dataset/items?token=${token}&clean=true`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Apify fetch items failed (${res.status})`);
  return res.json() as Promise<T[]>;
}

export async function runApifyActor<T>(actorId: string, input: unknown): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const runRes = await fetch(
    `${APIFY_API_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    }
  );

  if (!runRes.ok) {
    const err = await runRes.text();
    throw new Error(`Apify actor ${actorId} failed (${runRes.status}): ${err}`);
  }

  return runRes.json() as Promise<T[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPERS
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeLinkedIn(queries: string[], maxPosts: number): Promise<number> {
  const items = await runApifyActor<ApifyLinkedInPost>(
    "curious_coder~linkedin-post-search",
    { keywords: queries, maxResults: maxPosts, sortBy: "relevance" }
  );

  let saved = 0;
  for (const item of items) {
    const content = item.text ?? item.description ?? "";
    const url = item.postUrl ?? item.url ?? "";
    if (!content || !url) continue;

    const likes = item.likesCount ?? 0;
    const comments = item.commentsCount ?? 0;
    const shares = item.sharesCount ?? 0;
    const views = item.numViews;
    const country = normalizeCountry(item.authorLocation ?? item.location);
    // Tag the niche as the first matching query keyword found in the content
    const niche = queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];

    try {
      await prisma.viralPost.upsert({
        where: { postUrl: url },
        update: {
          likes, comments, shares, views,
          viralScore: calcViralScore("LINKEDIN", likes, comments, shares, views),
          ...(country && { country }),
        },
        create: {
          platform: "LINKEDIN",
          content,
          authorName: item.authorFullName ?? item.authorName ?? "Anonyme",
          authorHandle: item.authorUsername,
          authorAvatar: item.profilePicture,
          likes, comments, shares, views,
          viralScore: calcViralScore("LINKEDIN", likes, comments, shares, views),
          postUrl: url,
          postedAt: item.postedAt ?? item.postedDate ? new Date((item.postedAt ?? item.postedDate)!) : null,
          hookType: detectHookType(content),
          niche,
          country: country ?? null,
        },
      });
      saved++;
    } catch {
      // duplicate — skip
    }
  }
  return saved;
}

async function scrapeTwitter(queries: string[], maxPosts: number): Promise<number> {
  const items = await runApifyActor<ApifyTwitterPost>(
    "apidojo~tweet-scraper",
    { searchTerms: queries, maxTweets: maxPosts, queryType: "Latest" }
  );

  let saved = 0;
  for (const item of items) {
    const content = item.full_text ?? item.text ?? "";
    const url = item.url ?? "";
    if (!content || !url) continue;

    const likes = item.favorite_count ?? 0;
    const shares = item.retweet_count ?? 0;
    const comments = item.reply_count ?? 0;
    const views = item.views?.count;
    const user = item.user ?? (item.author as typeof item.user);
    const rawLocation = user?.location ?? (item.author as { location?: string })?.location;
    const country = normalizeCountry(rawLocation);
    const niche = item.searchTerm ?? queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];

    try {
      await prisma.viralPost.upsert({
        where: { postUrl: url },
        update: {
          likes, comments, shares, views,
          viralScore: calcViralScore("TWITTER", likes, comments, shares, views),
          ...(country && { country }),
        },
        create: {
          platform: "TWITTER",
          content,
          authorName: user?.name ?? "Anonyme",
          authorHandle: (user as { screen_name?: string })?.screen_name ?? (user as { userName?: string })?.userName,
          authorAvatar: (user as { profile_image_url_https?: string; profilePicture?: string })?.profile_image_url_https ?? (user as { profilePicture?: string })?.profilePicture,
          likes, comments, shares, views,
          viralScore: calcViralScore("TWITTER", likes, comments, shares, views),
          postUrl: url,
          postedAt: item.created_at ?? item.createdAt ? new Date((item.created_at ?? item.createdAt)!) : null,
          hookType: detectHookType(content),
          niche,
          country: country ?? null,
        },
      });
      saved++;
    } catch {
      // duplicate — skip
    }
  }
  return saved;
}

// Simple normalization: keep only the country part of "City, Country" strings
function normalizeCountry(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const parts = raw.split(",").map((s) => s.trim());
  // If last part looks like a country (>=2 chars, no digits), use it
  const last = parts[parts.length - 1];
  return last && last.length >= 2 && !/\d/.test(last) ? last : raw.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Sauvegarde les items LinkedIn d'un run Apify terminé */
export async function collectLinkedInRun(runId: string, queries: string[]): Promise<number> {
  const items = await fetchApifyRunItems<ApifyLinkedInPost>(runId);
  let saved = 0;
  for (const item of items) {
    const content = item.text ?? item.description ?? "";
    const url = item.postUrl ?? item.url ?? "";
    if (!content || !url) continue;
    const likes = item.likesCount ?? 0;
    const comments = item.commentsCount ?? 0;
    const shares = item.sharesCount ?? 0;
    const views = item.numViews;
    const country = normalizeCountry(item.authorLocation ?? item.location);
    const niche = queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];
    try {
      await prisma.viralPost.upsert({
        where: { postUrl: url },
        update: { likes, comments, shares, views, viralScore: calcViralScore("LINKEDIN", likes, comments, shares, views), ...(country && { country }) },
        create: {
          platform: "LINKEDIN", content,
          authorName: item.authorFullName ?? item.authorName ?? "Anonyme",
          authorHandle: item.authorUsername, authorAvatar: item.profilePicture,
          likes, comments, shares, views,
          viralScore: calcViralScore("LINKEDIN", likes, comments, shares, views),
          postUrl: url,
          postedAt: item.postedAt ?? item.postedDate ? new Date((item.postedAt ?? item.postedDate)!) : null,
          hookType: detectHookType(content), niche, country: country ?? null,
        },
      });
      saved++;
    } catch { /* duplicate */ }
  }
  return saved;
}

/** Sauvegarde les items Twitter d'un run Apify terminé */
export async function collectTwitterRun(runId: string, queries: string[]): Promise<number> {
  const items = await fetchApifyRunItems<ApifyTwitterPost>(runId);
  let saved = 0;
  for (const item of items) {
    const content = item.full_text ?? item.text ?? "";
    const url = item.url ?? "";
    if (!content || !url) continue;
    const likes = item.favorite_count ?? 0;
    const shares = item.retweet_count ?? 0;
    const comments = item.reply_count ?? 0;
    const views = item.views?.count;
    const user = item.user ?? (item.author as typeof item.user);
    const rawLocation = user?.location ?? (item.author as { location?: string })?.location;
    const country = normalizeCountry(rawLocation);
    const niche = item.searchTerm ?? queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];
    try {
      await prisma.viralPost.upsert({
        where: { postUrl: url },
        update: { likes, comments, shares, views, viralScore: calcViralScore("TWITTER", likes, comments, shares, views), ...(country && { country }) },
        create: {
          platform: "TWITTER", content,
          authorName: user?.name ?? "Anonyme",
          authorHandle: (user as { screen_name?: string })?.screen_name ?? (user as { userName?: string })?.userName,
          authorAvatar: (user as { profile_image_url_https?: string })?.profile_image_url_https ?? (user as { profilePicture?: string })?.profilePicture,
          likes, comments, shares, views,
          viralScore: calcViralScore("TWITTER", likes, comments, shares, views),
          postUrl: url,
          postedAt: item.created_at ?? item.createdAt ? new Date((item.created_at ?? item.createdAt)!) : null,
          hookType: detectHookType(content), niche, country: country ?? null,
        },
      });
      saved++;
    } catch { /* duplicate */ }
  }
  return saved;
}

export async function scrapeViralPosts(options: ScrapeOptions): Promise<ScrapeResult> {
  const { queries, maxPostsPerPlatform = 50 } = options;
  const errors: string[] = [];
  let saved = 0;

  const results = await Promise.allSettled([
    scrapeLinkedIn(queries, maxPostsPerPlatform),
    scrapeTwitter(queries, maxPostsPerPlatform),
  ]);

  if (results[0].status === "fulfilled") saved += results[0].value;
  else errors.push(`LinkedIn: ${results[0].reason}`);

  if (results[1].status === "fulfilled") saved += results[1].value;
  else errors.push(`Twitter: ${results[1].reason}`);

  return { saved, skipped: 0, errors };
}

const SORT_MAP: Record<SortBy, object> = {
  viralScore: { viralScore: "desc" },
  likes: { likes: "desc" },
  comments: { comments: "desc" },
  views: { views: "desc" },
  recent: { scrapedAt: "desc" },
};

export async function getViralPosts(filters: ViralPostFilters = {}) {
  const {
    platform,
    hookType,
    niche,
    country,
    minScore = 0,
    minLikes = 0,
    minComments = 0,
    minViews,
    sortBy = "viralScore",
    workspaceId,
    bookmarkedOnly = false,
    page = 1,
    limit = 20,
  } = filters;

  const where = {
    ...(platform && { platform }),
    ...(hookType && { hookType }),
    ...(niche && { niche: { contains: niche, mode: "insensitive" as const } }),
    ...(country && { country: { contains: country, mode: "insensitive" as const } }),
    viralScore: { gte: minScore },
    ...(minLikes > 0 && { likes: { gte: minLikes } }),
    ...(minComments > 0 && { comments: { gte: minComments } }),
    ...(minViews != null && minViews > 0 && { views: { gte: minViews } }),
    ...(bookmarkedOnly && workspaceId && { workspaceId, isBookmarked: true }),
  };

  const [posts, total] = await Promise.all([
    prisma.viralPost.findMany({
      where,
      orderBy: SORT_MAP[sortBy],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.viralPost.count({ where }),
  ]);

  return { posts, total, page, limit };
}

/** Retourne les valeurs distinctes de niche et country pour les selects */
export async function getViralPostFacets() {
  const [niches, countries] = await Promise.all([
    prisma.viralPost.findMany({
      where: { niche: { not: null } },
      select: { niche: true },
      distinct: ["niche"],
      orderBy: { niche: "asc" },
      take: 50,
    }),
    prisma.viralPost.findMany({
      where: { country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
      take: 80,
    }),
  ]);

  return {
    niches: niches.map((r) => r.niche!).filter(Boolean),
    countries: countries.map((r) => r.country!).filter(Boolean),
  };
}

export async function toggleBookmark(postId: string, workspaceId: string) {
  const post = await prisma.viralPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Post introuvable");
  return prisma.viralPost.update({
    where: { id: postId },
    data: {
      isBookmarked: !post.isBookmarked,
      workspaceId: !post.isBookmarked ? workspaceId : null,
    },
  });
}

/** Analyse un post viral et retourne un brief pour la Social Factory */
export async function buildInspireBrief(postId: string): Promise<{
  platform: string;
  originalContent: string;
  hookType: string;
  authorName: string;
  viralScore: number;
  hook: string;
  structure: string;
  angle: string;
}> {
  const post = await prisma.viralPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Post introuvable");

  const lines = post.content.split("\n").filter((l) => l.trim());
  const hook = lines[0] ?? "";
  const body = lines.slice(1, -2).join("\n");
  const cta = lines[lines.length - 1] ?? "";

  const structureDesc = [
    `Hook (${post.hookType}): "${hook.slice(0, 120)}"`,
    body.length > 0 ? `Corps: ${body.slice(0, 200)}...` : null,
    cta ? `CTA: "${cta.slice(0, 80)}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    platform: post.platform,
    originalContent: post.content,
    hookType: post.hookType,
    authorName: post.authorName,
    viralScore: post.viralScore,
    hook,
    structure: structureDesc,
    angle: `Post viral (score ${Math.round(post.viralScore)}) avec ${post.likes} likes, ${post.comments} commentaires`,
  };
}
