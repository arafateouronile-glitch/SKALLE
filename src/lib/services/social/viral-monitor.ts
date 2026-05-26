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

/** Strip null bytes that PostgreSQL UTF-8 rejects (common in Apify Twitter/LinkedIn responses) */
function sanitize(s: string | null | undefined): string {
  return (s ?? "").replace(/\x00/g, "");
}
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

type ApifyRunStatus = "RUNNING" | "READY" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMING-OUT" | "TIMED-OUT";

/** Récupère le statut d'un run Apify */
export async function getApifyRunStatus(runId: string): Promise<ApifyRunStatus> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Apify status failed (${res.status})`);
  const json = await res.json() as { data: { status: string } };
  return json.data.status as ApifyRunStatus;
}

/** Récupère les items du dataset d'un run terminé (max 50 pour limiter les upserts) */
export async function fetchApifyRunItems<T>(runId: string, limit = 50): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(
      `${APIFY_API_BASE}/actor-runs/${runId}/dataset/items?token=${token}&clean=true&limit=${limit}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`Apify fetch items failed (${res.status})`);
    // Race the body read too — AbortSignal alone doesn't always stop res.json()
    const body = await Promise.race([
      res.json() as Promise<T[]>,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dataset read timeout")), 18_000)),
    ]);
    return body;
  } finally {
    clearTimeout(timer);
  }
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

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
  sitelinks?: unknown;
}

async function serperSearch(q: string, num = 10): Promise<SerperOrganicResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num, gl: "fr", hl: "fr" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { organic?: SerperOrganicResult[] };
  return data.organic ?? [];
}


/** Collecte et sauvegarde les posts d'un run harvestapi~linkedin-profile-posts */
export async function collectHarvestLinkedInRun(runId: string, queries: string[]): Promise<number> {
  interface HarvestLinkedInPost {
    url?: string;
    postUrl?: string;
    text?: string;
    content?: string;
    numLikes?: number;
    likesCount?: number;
    numComments?: number;
    commentsCount?: number;
    numShares?: number;
    sharesCount?: number;
    numViews?: number;
    viewsCount?: number;
    postedDate?: string;
    postedAt?: string;
    authorName?: string;
    authorFullName?: string;
    authorUrl?: string;
    authorProfilePicture?: string;
    authorAvatar?: string;
  }

  const items = await fetchApifyRunItems<HarvestLinkedInPost>(runId);

  const rows = items.flatMap((item) => {
    const content = sanitize(item.text ?? item.content);
    const url     = sanitize(item.url ?? item.postUrl);
    if (!content || !url) return [];
    const likes    = item.numLikes    ?? item.likesCount    ?? 0;
    const comments = item.numComments ?? item.commentsCount ?? 0;
    const shares   = item.numShares   ?? item.sharesCount   ?? 0;
    const views    = item.numViews    ?? item.viewsCount;
    const niche    = queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];
    const rawDate  = item.postedDate  ?? item.postedAt;
    return [{
      platform: "LINKEDIN" as const,
      content,
      authorName:   sanitize(item.authorName ?? item.authorFullName ?? "Anonyme"),
      authorAvatar: item.authorProfilePicture ?? item.authorAvatar ?? null,
      likes, comments, shares, views: views ?? null,
      viralScore: calcViralScore("LINKEDIN", likes, comments, shares, views),
      postUrl: url,
      postedAt: rawDate ? new Date(rawDate) : null,
      hookType: detectHookType(content),
      niche,
    }];
  });

  const result = await prisma.viralPost.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

async function scrapeTwitter(queries: string[], maxPosts: number): Promise<number> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return 0;

  let saved = 0;
  const perQuery = Math.ceil(maxPosts / Math.min(queries.length, 4));

  for (const query of queries.slice(0, 4)) {
    const results = await serperSearch(
      `(site:twitter.com OR site:x.com) "${query}" -login`,
      Math.min(perQuery, 10)
    );

    for (const item of results) {
      const url = item.link ?? "";
      if ((!url.includes("twitter.com") && !url.includes("x.com")) || url.includes("/search")) continue;
      const content = item.snippet ?? "";
      if (!content || content.length < 30) continue;

      // "@handle: content" or "Name (@handle)"
      const handleMatch = item.title?.match(/@([\w]+)/);
      const authorHandle = handleMatch?.[1];
      const nameMatch = item.title?.match(/^(.+?)(?:\s+on Twitter|\s+on X|\s*\(@)/i);
      const authorName = nameMatch?.[1]?.trim() ?? authorHandle ?? "Twitter";

      const pos = item.position ?? 5;
      const likes = Math.max(50, 1200 - pos * 100);
      const shares = Math.round(likes * 0.2);
      const viralScore = calcViralScore("TWITTER", likes, 0, shares);

      try {
        await prisma.viralPost.upsert({
          where: { postUrl: url },
          update: {},
          create: {
            platform: "TWITTER",
            content,
            authorName,
            authorHandle,
            likes,
            comments: 0,
            shares,
            viralScore,
            postUrl: url,
            hookType: detectHookType(content),
            niche: query,
            postedAt: item.date ? new Date(item.date) : null,
          },
        });
        saved++;
      } catch { /* duplicate */ }
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

  const rows = items.flatMap((item) => {
    const content = sanitize(item.full_text ?? item.text);
    const url     = sanitize(item.url);
    if (!content || !url) return [];
    const likes    = item.favorite_count ?? 0;
    const shares   = item.retweet_count  ?? 0;
    const comments = item.reply_count    ?? 0;
    const views    = item.views?.count;
    const user     = item.user ?? (item.author as typeof item.user);
    const rawLocation = user?.location ?? (item.author as { location?: string })?.location;
    const country  = normalizeCountry(rawLocation);
    const niche    = item.searchTerm ?? queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];
    const rawDate  = item.created_at ?? item.createdAt;
    return [{
      platform: "TWITTER" as const,
      content,
      authorName:   sanitize(user?.name ?? "Anonyme"),
      authorHandle: sanitize((user as { screen_name?: string })?.screen_name ?? (user as { userName?: string })?.userName),
      authorAvatar: (user as { profile_image_url_https?: string })?.profile_image_url_https ?? (user as { profilePicture?: string })?.profilePicture ?? null,
      likes, comments, shares, views: views ?? null,
      viralScore: calcViralScore("TWITTER", likes, comments, shares, views),
      postUrl: url,
      postedAt: rawDate ? new Date(rawDate) : null,
      hookType: detectHookType(content),
      niche,
      country: country ?? null,
    }];
  });

  const result = await prisma.viralPost.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

/** Collecte et sauvegarde les posts d'un run apify~facebook-posts-scraper */
export async function collectFacebookRun(runId: string, queries: string[]): Promise<number> {
  interface ApifyFacebookPost {
    postId?: string;
    url?: string;
    topLevelUrl?: string;
    text?: string;
    pageName?: string;
    time?: string;
    timestamp?: number;
    user?: { name?: string; profileUrl?: string; profilePic?: string };
    likes?: number;
    reactionLikeCount?: number;
    comments?: number;
    shares?: number;
    inputUrl?: string;
    error?: string;
  }

  const items = await fetchApifyRunItems<ApifyFacebookPost>(runId);

  const rows = items.flatMap((item) => {
    if (item.error) return [];
    const content = sanitize(item.text?.trim());
    const url     = sanitize(item.url ?? item.topLevelUrl);
    if (!content || !url) return [];
    const likes    = item.likes ?? item.reactionLikeCount ?? 0;
    const comments = item.comments ?? 0;
    const shares   = item.shares ?? 0;
    const niche    = queries.find((q) => content.toLowerCase().includes(q.toLowerCase())) ?? queries[0];
    const rawDate  = item.time ?? (item.timestamp ? new Date(item.timestamp * 1000).toISOString() : undefined);
    return [{
      platform: "FACEBOOK" as const,
      content,
      authorName:   sanitize(item.user?.name ?? item.pageName ?? "Anonyme"),
      authorAvatar: item.user?.profilePic ?? null,
      likes, comments, shares,
      viralScore: calcViralScore("FACEBOOK", likes, comments, shares),
      postUrl: url,
      postedAt: rawDate ? new Date(rawDate) : null,
      hookType: detectHookType(content),
      niche,
    }];
  });

  const result = await prisma.viralPost.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export async function scrapeViralPosts(options: ScrapeOptions): Promise<ScrapeResult> {
  const { queries, maxPostsPerPlatform = 50 } = options;
  const errors: string[] = [];
  let saved = 0;

  // LinkedIn uses harvestapi~linkedin-profile-posts via the /scrape route (async Apify)
  // scrapeViralPosts only covers Twitter (Serper-based, used by cron fallback)
  const results = await Promise.allSettled([
    scrapeTwitter(queries, maxPostsPerPlatform),
  ]);

  if (results[0].status === "fulfilled") saved += results[0].value;
  else errors.push(`Twitter: ${results[0].reason}`);

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
