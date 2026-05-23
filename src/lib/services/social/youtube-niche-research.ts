/**
 * YouTube Niche Research — Analyse de niche via YouTube Data API v3 + Claude
 *
 * Flow :
 *  1. Search top channels sur le topic
 *  2. Récupère les statistiques de chaque channel
 *  3. Search top vidéos (par viewCount)
 *  4. Récupère les stats vidéo
 *  5. Claude analyse tout et retourne un rapport structuré
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const YT = "https://www.googleapis.com/youtube/v3";
const TIMEOUT = AbortSignal.timeout(15_000);

// ─── YouTube API types ───────────────────────────────────────────────────────

interface YTSearchItem {
  id: { channelId?: string; videoId?: string };
  snippet: { title: string; description: string; channelTitle?: string };
}

interface YTChannel {
  id: string;
  snippet: { title: string; description: string; customUrl?: string; publishedAt?: string };
  statistics: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

interface YTVideo {
  id: string;
  snippet: { title: string; channelTitle: string; tags?: string[]; duration?: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

// ─── Public output types ──────────────────────────────────────────────────────

export interface TopCreator {
  channelId: string;
  name: string;
  subscribers: number;
  avgViewsPerVideo: number;
  engagementRate: number; // avgViews/subscribers ×100
  videoCount: number;
  channelUrl: string;
  description: string;
  monthsOld: number | null;
}

export interface TopVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  views: number;
  likes: number;
  videoUrl: string;
  isShort: boolean;
}

export interface SubNiche {
  name: string;
  potential: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

export interface NicheResearchResult {
  topic: string;
  region: string;
  viabilityScore: number;        // 0-100
  viabilityGrade: "A" | "B" | "C" | "D";
  summary: string;
  competition: "FAIBLE" | "MODÉRÉE" | "ÉLEVÉE" | "SATURÉE";
  topCreators: TopCreator[];
  topVideos: TopVideo[];
  subNiches: SubNiche[];
  bestFormats: Array<{ format: string; why: string }>;
  entryStrategy: string;
  keyInsights: string[];
}

// ─── YouTube API helpers ─────────────────────────────────────────────────────

async function ytFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: TIMEOUT });
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function searchChannels(topic: string, region: string, apiKey: string): Promise<YTChannel[]> {
  const searchData = await ytFetch<{ items?: YTSearchItem[] }>(
    `${YT}/search?part=snippet&q=${encodeURIComponent(topic)}&type=channel&maxResults=20&regionCode=${region}&relevanceLanguage=${region === "US" ? "en" : "fr"}&key=${apiKey}`
  );
  const ids = (searchData.items ?? [])
    .map((i) => i.id.channelId)
    .filter(Boolean)
    .join(",");
  if (!ids) return [];

  const statsData = await ytFetch<{ items?: YTChannel[] }>(
    `${YT}/channels?part=statistics,snippet&id=${ids}&key=${apiKey}`
  );
  return statsData.items ?? [];
}

async function searchTopVideos(topic: string, region: string, apiKey: string): Promise<YTVideo[]> {
  const searchData = await ytFetch<{ items?: YTSearchItem[] }>(
    `${YT}/search?part=snippet&q=${encodeURIComponent(topic)}&type=video&order=viewCount&maxResults=20&regionCode=${region}&key=${apiKey}`
  );
  const ids = (searchData.items ?? [])
    .map((i) => i.id.videoId)
    .filter(Boolean)
    .join(",");
  if (!ids) return [];

  const statsData = await ytFetch<{ items?: YTVideo[] }>(
    `${YT}/videos?part=statistics,snippet,contentDetails&id=${ids}&key=${apiKey}`
  );
  return statsData.items ?? [];
}

// ─── Normalisations ───────────────────────────────────────────────────────────

function monthsAgo(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30));
}

function isShortVideo(video: YTVideo): boolean {
  const dur = video.contentDetails?.duration ?? "";
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return false;
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  const totalSeconds = h * 3600 + m * 60 + s;
  return totalSeconds <= 60;
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en stratégie de contenu YouTube et recherche de niche.
Tu analyses des données réelles de chaînes et vidéos YouTube pour évaluer la viabilité d'une niche.

Retourne UNIQUEMENT un JSON valide (sans markdown) avec cette structure exacte :
{
  "viabilityScore": <0-100>,
  "viabilityGrade": <"A"|"B"|"C"|"D">,
  "summary": "<2-3 phrases bilan de la niche>",
  "competition": <"FAIBLE"|"MODÉRÉE"|"ÉLEVÉE"|"SATURÉE">,
  "subNiches": [
    { "name": "<sous-niche>", "potential": <"HIGH"|"MEDIUM"|"LOW">, "reason": "<pourquoi>" }
  ],
  "bestFormats": [
    { "format": "<format ex: Tutorial, Short, Case Study, Vlog>", "why": "<pourquoi ça marche>" }
  ],
  "entryStrategy": "<conseil actionnable pour un nouveau créateur>",
  "keyInsights": ["<insight 1>", "<insight 2>", "<insight 3>"]
}

Critères de notation :
- viabilityScore élevé (70-100) : niche avec demande forte, créateurs pas trop gros (pas de géants à 10M+), engagement bon
- viabilityScore moyen (40-69) : niche intéressante mais compétition modérée ou faible engagement
- viabilityScore faible (0-39) : niche saturée par des géants, ou très faible demande

Identifie 3-5 sous-niches à partir des données (titres de vidéos, descriptions, tags).
Déduis les meilleurs formats depuis les vidéos les plus vues (shorts vs longs, tutos vs vlogs, etc.).`;

// ─── Main export ──────────────────────────────────────────────────────────────

export async function researchYouTubeNiche(
  topic: string,
  region = "FR"
): Promise<NicheResearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY manquant");

  const [channels, videos] = await Promise.all([
    searchChannels(topic, region, apiKey),
    searchTopVideos(topic, region, apiKey),
  ]);

  // Build topCreators
  const topCreators: TopCreator[] = channels
    .filter((ch) => !ch.statistics.hiddenSubscriberCount)
    .map((ch) => {
      const subs = parseInt(ch.statistics.subscriberCount ?? "0");
      const views = parseInt(ch.statistics.viewCount ?? "0");
      const count = parseInt(ch.statistics.videoCount ?? "1");
      const avgViews = count > 0 ? Math.round(views / count) : 0;
      const engagementRate = subs > 0 ? parseFloat(((avgViews / subs) * 100).toFixed(2)) : 0;
      return {
        channelId: ch.id,
        name: ch.snippet.title,
        subscribers: subs,
        avgViewsPerVideo: avgViews,
        engagementRate,
        videoCount: count,
        channelUrl: ch.snippet.customUrl
          ? `https://www.youtube.com/${ch.snippet.customUrl}`
          : `https://www.youtube.com/channel/${ch.id}`,
        description: ch.snippet.description.slice(0, 150),
        monthsOld: monthsAgo(ch.snippet.publishedAt),
      };
    })
    .sort((a, b) => b.subscribers - a.subscribers)
    .slice(0, 10);

  // Build topVideos
  const topVideos: TopVideo[] = videos.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    channelTitle: v.snippet.channelTitle,
    views: parseInt(v.statistics.viewCount ?? "0"),
    likes: parseInt(v.statistics.likeCount ?? "0"),
    videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
    isShort: isShortVideo(v),
  }));

  // Claude analysis
  const channelSummary = topCreators.slice(0, 8).map((c) =>
    `- ${c.name} : ${c.subscribers.toLocaleString()} abonnés, ${c.avgViewsPerVideo.toLocaleString()} vues/vidéo, eng ${c.engagementRate}%, ${c.videoCount} vidéos`
  ).join("\n");

  const videoSummary = topVideos.slice(0, 10).map((v) =>
    `- "${v.title}" (${v.channelTitle}) : ${v.views.toLocaleString()} vues${v.isShort ? " [SHORT]" : ""}`
  ).join("\n");

  const model = getClaude();
  const parser = getStringParser();
  const raw = await model.pipe(parser).invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(
      `Niche analysée : "${topic}" (région : ${region})

TOP CRÉATEURS (${topCreators.length} chaînes) :
${channelSummary}

TOP VIDÉOS LES PLUS VUES :
${videoSummary}

Analyse cette niche et retourne le JSON demandé.`
    ),
  ]);

  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  let analysis: {
    viabilityScore: number;
    viabilityGrade: "A" | "B" | "C" | "D";
    summary: string;
    competition: "FAIBLE" | "MODÉRÉE" | "ÉLEVÉE" | "SATURÉE";
    subNiches: SubNiche[];
    bestFormats: Array<{ format: string; why: string }>;
    entryStrategy: string;
    keyInsights: string[];
  };

  try {
    analysis = JSON.parse(cleaned);
  } catch {
    analysis = {
      viabilityScore: 50,
      viabilityGrade: "C",
      summary: "Analyse partielle disponible.",
      competition: "MODÉRÉE",
      subNiches: [],
      bestFormats: [],
      entryStrategy: "Commence par publier 10 vidéos en testant différents formats.",
      keyInsights: ["Données insuffisantes pour une analyse complète."],
    };
  }

  return {
    topic,
    region,
    ...analysis,
    topCreators,
    topVideos,
  };
}
