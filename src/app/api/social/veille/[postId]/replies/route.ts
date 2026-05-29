/**
 * POST /api/social/veille/[postId]/replies
 * Lance scraper_one~x-post-replies-scraper en async.
 * Retourne { runId } immédiatement.
 *
 * POST /api/social/veille/[postId]/replies?collect=1  { runId }
 * Vérifie le statut et retourne les réponses quand terminé.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startApifyRun,
  getApifyRunStatus,
  fetchApifyRunItems,
} from "@/lib/services/social/viral-monitor";

export interface XReply {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  authorFollowers?: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  createdAt?: string;
  url?: string;
}

interface RawXReply {
  // Common fields across different X scraper actors
  id?: string;
  tweetId?: string;
  text?: string;
  full_text?: string;
  url?: string;
  createdAt?: string;
  created_at?: string;
  // Author — nested object style
  author?: {
    name?: string;
    userName?: string;
    screen_name?: string;
    profilePicture?: string;
    profileImageUrl?: string;
    profile_image_url_https?: string;
    followers?: number;
    followersCount?: number;
    followers_count?: number;
    isVerified?: boolean;
  };
  // Author — flat style
  authorName?: string;
  authorUsername?: string;
  authorHandle?: string;
  authorProfilePicture?: string;
  // Engagement
  likeCount?: number;
  likes?: number;
  favorite_count?: number;
  retweetCount?: number;
  retweets?: number;
  retweet_count?: number;
  replyCount?: number;
  replies?: number;
  reply_count?: number;
}

function mapReply(item: RawXReply): XReply | null {
  const text = item.text ?? item.full_text ?? "";
  if (!text.trim()) return null;

  const a = item.author ?? {};
  const authorName = item.authorName ?? a.name ?? "Anonyme";
  const authorHandle =
    item.authorHandle ?? item.authorUsername ?? a.userName ?? a.screen_name ?? "";
  const authorAvatar =
    item.authorProfilePicture ??
    a.profilePicture ??
    a.profileImageUrl ??
    a.profile_image_url_https;
  const authorFollowers =
    a.followers ?? a.followersCount ?? a.followers_count;

  return {
    id: item.id ?? item.tweetId ?? crypto.randomUUID(),
    text: text.trim(),
    authorName,
    authorHandle,
    authorAvatar,
    authorFollowers,
    likeCount: item.likeCount ?? item.likes ?? item.favorite_count ?? 0,
    retweetCount: item.retweetCount ?? item.retweets ?? item.retweet_count ?? 0,
    replyCount: item.replyCount ?? item.replies ?? item.reply_count ?? 0,
    createdAt: item.createdAt ?? item.created_at,
    url: item.url,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: "APIFY_API_TOKEN manquant" }, { status: 503 });
  }

  const { postId } = await params;

  if (req.nextUrl.searchParams.get("collect") === "1") {
    return handleCollect(req);
  }

  // Fetch post URL from DB
  const post = await prisma.viralPost.findUnique({
    where: { id: postId },
    select: { postUrl: true, platform: true },
  });
  if (!post) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
  if (post.platform !== "TWITTER") {
    return NextResponse.json({ error: "Seulement disponible pour les posts Twitter" }, { status: 400 });
  }

  const { maxReplies = 30 } = (await req.json().catch(() => ({}))) as { maxReplies?: number };

  try {
    const runId = await startApifyRun("scraper_one~x-post-replies-scraper", {
      postUrls: [post.postUrl],
      maxReplies: Math.min(maxReplies, 50),
    });
    return NextResponse.json({ ok: true, runId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Apify start failed: ${msg}` }, { status: 502 });
  }
}

async function handleCollect(req: NextRequest) {
  const { runId } = (await req.json()) as { runId: string };

  const status = await getApifyRunStatus(runId).catch(() => "FAILED" as const);
  const done = status !== "RUNNING" && status !== "READY";

  if (!done) return NextResponse.json({ status: "running", runStatus: status });

  if (status !== "SUCCEEDED") {
    return NextResponse.json({ status: "done", replies: [], error: `Run ${status}` });
  }

  const items = await fetchApifyRunItems<RawXReply>(runId);
  const replies = items.map(mapReply).filter((r): r is XReply => r !== null);

  return NextResponse.json({ status: "done", replies });
}
