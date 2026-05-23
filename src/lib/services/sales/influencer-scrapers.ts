/**
 * Influencer Scrapers — Sources réelles pour le Partnership Hub
 *
 * Instagram  → Apify `apify/instagram-scraper` (hashtag → posts → profils auteurs)
 * YouTube    → YouTube Data API v3 (search channels + statistics)
 * LinkedIn   → Apify `curious_coder~linkedin-profile-search`
 *
 * Fallback vers mock si token/key absent.
 */

import { runApifyActor } from "@/lib/services/social/viral-monitor";
import type { SocialPartner, SocialPlatform } from "./partnership-engine";

// ─── Instagram ────────────────────────────────────────────────────────────────

interface ApifyInstagramPost {
  ownerUsername?: string;
  ownerFullName?: string;
  followersCount?: number;
  biography?: string;
  businessEmail?: string;
  businessCategoryName?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number | null;
  profilePicUrl?: string;
}

export async function scrapeInstagramInfluencers(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  limit = 15
): Promise<SocialPartner[]> {
  if (!process.env.APIFY_API_TOKEN) return [];

  try {
    const hashtag = niche.toLowerCase().replace(/[\s#]+/g, "");

    const posts = await runApifyActor<ApifyInstagramPost>("apify/instagram-scraper", {
      hashtags: [hashtag],
      resultsType: "posts",
      resultsLimit: 150,
      addParentData: false,
    });

    // Deduplicate by username, compute average engagement
    const profileMap = new Map<string, {
      followersCount: number;
      bio: string;
      businessEmail?: string;
      likes: number[];
    }>();

    for (const post of posts) {
      if (!post.ownerUsername) continue;
      const fc = post.followersCount ?? 0;
      if (fc < minFollowers || fc > maxFollowers) continue;

      if (!profileMap.has(post.ownerUsername)) {
        profileMap.set(post.ownerUsername, {
          followersCount: fc,
          bio: post.biography ?? "",
          businessEmail: post.businessEmail ?? undefined,
          likes: [],
        });
      }
      const entry = profileMap.get(post.ownerUsername)!;
      if (!entry.businessEmail && post.businessEmail) entry.businessEmail = post.businessEmail;
      const interactions =
        (post.likesCount ?? 0) + (post.commentsCount ?? 0) * 2;
      entry.likes.push(interactions);
    }

    const partners: SocialPartner[] = [];
    for (const [username, data] of profileMap) {
      if (partners.length >= limit) break;
      const avgInteractions =
        data.likes.length > 0
          ? data.likes.reduce((s, v) => s + v, 0) / data.likes.length
          : 0;
      const engagementRate =
        data.followersCount > 0
          ? parseFloat(((avgInteractions / data.followersCount) * 100).toFixed(2))
          : 0;

      partners.push({
        username,
        platform: "INSTAGRAM",
        followersCount: data.followersCount,
        engagementRate,
        bio: data.bio,
        profileUrl: `https://www.instagram.com/${username}/`,
        niche,
        businessEmail: data.businessEmail,
      });
    }

    return partners;
  } catch (e) {
    console.error("[Instagram scraper]", e);
    return [];
  }
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

interface YouTubeSearchItem {
  id: { channelId: string };
}

interface YouTubeChannelItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
  };
  statistics: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

export async function scrapeYouTubeInfluencers(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  limit = 15
): Promise<SocialPartner[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    // 1. Search channels by niche keyword
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(niche)}&type=channel&maxResults=50&relevanceLanguage=fr&key=${apiKey}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000) });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as { items?: YouTubeSearchItem[] };
    const channelIds = (searchData.items ?? []).map((i) => i.id.channelId).join(",");
    if (!channelIds) return [];

    // 2. Get statistics for those channels
    const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelIds}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl, { signal: AbortSignal.timeout(15_000) });
    if (!statsRes.ok) return [];
    const statsData = await statsRes.json() as { items?: YouTubeChannelItem[] };

    const partners: SocialPartner[] = [];
    for (const ch of statsData.items ?? []) {
      if (partners.length >= limit) break;
      if (ch.statistics.hiddenSubscriberCount) continue;

      const subs = parseInt(ch.statistics.subscriberCount ?? "0");
      if (subs < minFollowers || subs > maxFollowers) continue;

      const views = parseInt(ch.statistics.viewCount ?? "0");
      const videos = parseInt(ch.statistics.videoCount ?? "1");
      const avgViews = videos > 0 ? views / videos : 0;
      const engagementRate =
        subs > 0 ? parseFloat(((avgViews / subs) * 100).toFixed(2)) : 0;

      const username =
        ch.snippet.customUrl?.replace(/^@/, "") ?? ch.id;

      partners.push({
        username,
        platform: "YOUTUBE",
        followersCount: subs,
        engagementRate,
        bio: ch.snippet.description.slice(0, 200),
        profileUrl: `https://www.youtube.com/channel/${ch.id}`,
        niche,
        channelId: ch.id,
      });
    }

    return partners;
  } catch (e) {
    console.error("[YouTube scraper]", e);
    return [];
  }
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

interface ApifyLinkedInProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  profileUrl?: string;
  connectionsCount?: number;
  followersCount?: number;
}

export async function scrapeLinkedInInfluencers(
  niche: string,
  minFollowers: number,
  maxFollowers: number,
  limit = 15
): Promise<SocialPartner[]> {
  if (!process.env.APIFY_API_TOKEN) return [];

  try {
    const profiles = await runApifyActor<ApifyLinkedInProfile>(
      "curious_coder~linkedin-profile-search",
      {
        searchQuery: niche,
        maxItems: Math.min(limit * 3, 50),
      }
    );

    const partners: SocialPartner[] = [];
    for (const p of profiles) {
      if (partners.length >= limit) break;
      if (!p.profileUrl) continue;

      // LinkedIn ne fournit pas toujours le follower count exact.
      // On utilise connectionsCount comme proxy ; si indisponible, on estime à mi-plage.
      const followers =
        p.followersCount ??
        p.connectionsCount ??
        Math.floor((minFollowers + maxFollowers) / 2);

      if (followers < minFollowers || followers > maxFollowers) continue;

      const fullName =
        p.fullName ?? [p.firstName, p.lastName].filter(Boolean).join(" ") ?? "Inconnu";
      const username = fullName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      partners.push({
        username,
        platform: "LINKEDIN",
        followersCount: followers,
        engagementRate: 0, // LinkedIn ne donne pas l'eng. rate via scraping
        bio: p.headline ?? p.summary?.slice(0, 200) ?? "",
        profileUrl: p.profileUrl,
        niche,
      });
    }

    return partners;
  } catch (e) {
    console.error("[LinkedIn influencer scraper]", e);
    return [];
  }
}
