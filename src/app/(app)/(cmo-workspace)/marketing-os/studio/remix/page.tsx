"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { ArrowLeft, Search, Heart, MessageCircle, Repeat2, Sparkles, Copy, Check, RefreshCw, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NetworkFilter = "linkedin" | "twitter" | "instagram" | "facebook";
type EngagementMin = "500" | "1k" | "5k" | "10k" | "50k";
type Period = "7j" | "30j" | "3 mois";
type ContentType = "tous" | "texte" | "image" | "video" | "carrousel";
type RemixFormat = "thread" | "post-court" | "carrousel" | "story" | "email";
type SortBy = "viralScore" | "likes" | "recent";

interface ApiPost {
  id: string;
  platform: "LINKEDIN" | "TWITTER" | "FACEBOOK" | "INSTAGRAM";
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorAvatar: string | null;
  likes: number;
  comments: number;
  shares: number | null;
  views: number | null;
  viralScore: number;
  postUrl: string;
  postedAt: string | null;
  hookType: string;
  niche: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NETWORKS: { id: NetworkFilter; label: string; platform: string; color: string; bg: string; border: string }[] = [
  { id: "linkedin",  label: "LinkedIn",     platform: "LINKEDIN",  color: "var(--violet-fg)", bg: "var(--violet-soft)", border: "var(--violet-fg)" },
  { id: "twitter",   label: "Twitter / X",  platform: "TWITTER",   color: "var(--fg)",        bg: "var(--line-strong)", border: "var(--fg)" },
  { id: "instagram", label: "Instagram",    platform: "INSTAGRAM", color: "var(--amber-fg)",  bg: "var(--amber-soft)", border: "var(--amber-fg)" },
  { id: "facebook",  label: "Facebook",     platform: "FACEBOOK",  color: "var(--cold-fg)",   bg: "var(--cold-soft)",  border: "var(--cold-fg)" },
];

const NICHES = ["B2B SaaS", "Marketing", "IA & Tech", "Finance", "RH & Recrutement", "Vente & Outreach", "Growth", "Entrepreneuriat"];

const ENGAGEMENT_MAP: Record<EngagementMin, number> = { "500": 500, "1k": 1000, "5k": 5000, "10k": 10000, "50k": 50000 };
const ENGAGEMENT_OPTIONS: { id: EngagementMin; label: string }[] = [
  { id: "500", label: "500+ likes" },
  { id: "1k",  label: "1k+ likes" },
  { id: "5k",  label: "5k+ likes" },
  { id: "10k", label: "10k+ likes" },
  { id: "50k", label: "50k+ likes" },
];

const PERIODS: Period[] = ["7j", "30j", "3 mois"];
const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "viralScore", label: "Viral score" },
  { id: "likes",      label: "Likes" },
  { id: "recent",     label: "Récents" },
];

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: "tous",      label: "Tous" },
  { id: "texte",     label: "Texte" },
  { id: "image",     label: "Image" },
  { id: "carrousel", label: "Carrousel" },
  { id: "video",     label: "Vidéo" },
];

const REMIX_FORMATS: { id: RemixFormat; label: string; desc: string; credits: number }[] = [
  { id: "thread",     label: "Thread LinkedIn", desc: "5–8 posts enchaînés", credits: 6 },
  { id: "post-court", label: "Post court",       desc: "Punchy < 300 mots",  credits: 3 },
  { id: "carrousel",  label: "Carrousel",        desc: "5–10 slides",        credits: 8 },
  { id: "story",      label: "Story / Reel",     desc: "Script court",       credits: 5 },
  { id: "email",      label: "Email newsletter", desc: "Séquence email",     credits: 4 },
];

const NETWORK_LABEL: Record<string, string> = { LINKEDIN: "LI", TWITTER: "𝕏", INSTAGRAM: "IG", FACEBOOK: "FB" };
const NETWORK_COLOR: Record<string, string> = {
  LINKEDIN: "var(--violet-fg)", TWITTER: "var(--fg)",
  INSTAGRAM: "var(--amber-fg)", FACEBOOK: "var(--cold-fg)",
};

function formatLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemixPage() {
  // Filters
  const [selectedNetworks, setSelectedNetworks] = useState<NetworkFilter[]>(["linkedin"]);
  const [selectedNiches, setSelectedNiches]     = useState<string[]>([]);
  const [engagement, setEngagement]             = useState<EngagementMin>("500");
  const [period, setPeriod]                     = useState<Period>("30j");
  const [contentType, setContentType]           = useState<ContentType>("tous");
  const [sortBy, setSortBy]                     = useState<SortBy>("viralScore");

  // Search state
  const [searching, setSearching]   = useState(false);
  const [scraping, setScraping]     = useState(false);
  const [pollMsg, setPollMsg]       = useState("");
  const [hasResults, setHasResults] = useState(false);
  const [posts, setPosts]           = useState<ApiPost[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Remix state
  const [selectedPost, setSelectedPost] = useState<ApiPost | null>(null);
  const [remixFormat, setRemixFormat]   = useState<RemixFormat>("post-court");
  const [generating, setGenerating]     = useState(false);
  const [remixResult, setRemixResult]   = useState<string | null>(null);
  const [remixError, setRemixError]     = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  function toggleNetwork(n: NetworkFilter) {
    setSelectedNetworks((prev) =>
      prev.includes(n) ? (prev.length > 1 ? prev.filter((x) => x !== n) : prev) : [...prev, n]
    );
  }
  function toggleNiche(n: string) {
    setSelectedNiches((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
  }

  function buildQueryString(): string {
    const params = new URLSearchParams();
    params.set("minLikes", String(ENGAGEMENT_MAP[engagement]));
    params.set("sortBy", sortBy);
    params.set("limit", "20");
    if (selectedNiches.length === 1) params.set("niche", selectedNiches[0]);
    return params.toString();
  }

  async function fetchPostsFromDB(): Promise<ApiPost[]> {
    const platforms = selectedNetworks.map((n) => NETWORKS.find((x) => x.id === n)!.platform);
    const results = await Promise.all(
      platforms.map((p) =>
        fetch(`/api/social/veille?platform=${p}&${buildQueryString()}`)
          .then((r) => r.json() as Promise<{ posts: ApiPost[] }>)
          .then((d) => d.posts ?? [])
          .catch(() => [] as ApiPost[])
      )
    );
    const merged = results.flat();
    const seen = new Set<string>();
    return merged.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  async function handleSearch() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setSearching(true);
    setHasResults(false);
    setSelectedPost(null);
    setRemixResult(null);
    setSearchError(null);
    setPollMsg("");

    try {
      // 1. Check DB first
      const dbPosts = await fetchPostsFromDB();
      if (dbPosts.length >= 3) {
        setPosts(dbPosts);
        setHasResults(true);
        setSearching(false);
        setTimeout(() => document.getElementById("results-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        return;
      }

      // 2. Not enough in DB — trigger Apify scrape
      setScraping(true);
      setPollMsg("Lancement du scraping… résultats dans ~2 min");

      const scrapeRes = await fetch("/api/social/veille/scrape", { method: "POST" });
      if (!scrapeRes.ok) {
        const err = await scrapeRes.json() as { error?: string };
        throw new Error(err.error ?? "Échec du scraping");
      }
      const { runIds, queries } = await scrapeRes.json() as { runIds: Record<string, string | null>; queries: string[] };

      let elapsed = 0;
      pollingRef.current = setInterval(async () => {
        elapsed += 6;
        setPollMsg(`Scraping en cours… ${elapsed < 60 ? `~${120 - elapsed}s` : "encore quelques secondes"}`);

        try {
          const collectRes = await fetch("/api/social/veille/scrape?collect=1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runIds, queries }),
          });
          const collectData = await collectRes.json() as { status: string; saved?: number };

          if (collectData.status === "done") {
            clearInterval(pollingRef.current!);
            const freshPosts = await fetchPostsFromDB();
            setPosts(freshPosts);
            setHasResults(true);
            setSearching(false);
            setScraping(false);
            setPollMsg("");
            setTimeout(() => document.getElementById("results-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }
        } catch { /* ignore poll errors */ }

        if (elapsed >= 180) {
          clearInterval(pollingRef.current!);
          setSearching(false);
          setScraping(false);
          setPollMsg("");
          setSearchError("Le scraping a pris trop de temps. Réessayez dans quelques minutes.");
        }
      }, 6000);

    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Erreur inconnue");
      setSearching(false);
      setScraping(false);
    }
  }

  function handleSelectPost(post: ApiPost) {
    setSelectedPost(post);
    setRemixResult(null);
    setRemixError(null);
    setTimeout(() => document.getElementById("remix-config")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function handleGenerate() {
    if (!selectedPost) return;
    setGenerating(true);
    setRemixError(null);
    try {
      const res = await fetch(`/api/social/veille/${selectedPost.id}/inspire`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Erreur de génération");
      }
      const data = await res.json() as { generatedPost: string };
      setRemixResult(data.generatedPost);
      setTimeout(() => document.getElementById("remix-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setRemixError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (!remixResult) return;
    navigator.clipboard.writeText(remixResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <AppTopBar
        title="Remixer un contenu"
        breadcrumb="marketing-os / studio / remix"
        accent="emerald"
      />

      <div className="p-6 space-y-6 max-w-[1100px]">

        {/* Back */}
        <Link
          href="/marketing-os/studio"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-all hover:opacity-70"
          style={{ color: "var(--fg-mute)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au Studio
        </Link>

        {/* ── Step 1 : Filtres ─────────────────────────────────────────────── */}
        <section
          className="rounded-[18px] p-7"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-5" style={{ color: "var(--fg-mute)" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>1</span>
            Choisir la source
          </div>

          <div className="space-y-5">

            {/* Networks */}
            <div>
              <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Réseau social</p>
              <div className="flex flex-wrap gap-2">
                {NETWORKS.map((n) => {
                  const active = selectedNetworks.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => toggleNetwork(n.id)}
                      className="px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all"
                      style={
                        active
                          ? { background: n.bg, color: n.color, border: `2px solid ${n.border}` }
                          : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                      }
                    >
                      {n.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Niches */}
            <div>
              <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>
                Niche <span style={{ color: "var(--fg-mute)" }}>(vide = toutes)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {NICHES.map((n) => {
                  const active = selectedNiches.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleNiche(n)}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                      style={
                        active
                          ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                          : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row: engagement + period + content type + sort */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Engagement min</p>
                <div className="flex flex-wrap gap-1.5">
                  {ENGAGEMENT_OPTIONS.map((e) => {
                    const active = engagement === e.id;
                    return (
                      <button key={e.id} onClick={() => setEngagement(e.id)}
                        className="px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-medium transition-all"
                        style={active ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" } : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }}
                      >{e.label}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Période</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERIODS.map((p) => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className="px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-medium transition-all"
                      style={period === p ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" } : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }}
                    >{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TYPES.map((t) => (
                    <button key={t.id} onClick={() => setContentType(t.id)}
                      className="px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-medium transition-all"
                      style={contentType === t.id ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" } : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }}
                    >{t.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Trier par</p>
                <div className="flex flex-wrap gap-1.5">
                  {SORT_OPTIONS.map((s) => (
                    <button key={s.id} onClick={() => setSortBy(s.id)}
                      className="px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-medium transition-all"
                      style={sortBy === s.id ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" } : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSearch}
                disabled={searching}
                className="flex items-center gap-2 px-6 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 disabled:opacity-70"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                {scraping
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />
                }
                {searching
                  ? (scraping ? "Scraping en cours…" : "Recherche…")
                  : "Trouver les posts viraux →"
                }
              </button>
              {pollMsg && (
                <span className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{pollMsg}</span>
              )}
            </div>

            {searchError && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[13px]"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {searchError}
              </div>
            )}
          </div>
        </section>

        {/* ── Step 2 : Résultats ───────────────────────────────────────────── */}
        {hasResults && (
          <section id="results-section">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>2</span>
              {posts.length} posts viraux — choisissez-en un à remixer
            </div>

            {posts.length === 0 ? (
              <div className="rounded-[14px] p-8 text-center" style={{ border: "1px dashed var(--line)" }}>
                <p className="text-[13px] mb-3" style={{ color: "var(--fg-mute)" }}>
                  Aucun post trouvé pour ces filtres. Essayez de baisser l'engagement minimum ou d'élargir les niches.
                </p>
                <button
                  onClick={() => { setEngagement("500"); setSelectedNiches([]); }}
                  className="text-[12px] font-semibold px-4 py-2 rounded-[8px]"
                  style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {posts.map((post) => {
                  const isSelected = selectedPost?.id === post.id;
                  return (
                    <div
                      key={post.id}
                      className="rounded-[14px] p-5 flex flex-col gap-3 transition-all"
                      style={{
                        background: "var(--bg-card)",
                        border: isSelected ? "2px solid var(--emerald-fg)" : "1px solid var(--line)",
                        boxShadow: "var(--card-shadow)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                            style={{ background: "var(--line-strong)", color: "var(--fg)" }}
                          >
                            {post.authorName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{post.authorName}</p>
                            <p className="text-[10.5px]" style={{ color: "var(--fg-mute)" }}>
                              {post.niche ?? post.platform}
                              {post.postedAt ? ` · ${new Date(post.postedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                          >
                            ↑{post.viralScore}
                          </span>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: "var(--bg)", color: NETWORK_COLOR[post.platform] ?? "var(--fg)", border: "1px solid var(--line)" }}
                          >
                            {NETWORK_LABEL[post.platform] ?? post.platform}
                          </span>
                        </div>
                      </div>

                      <p className="text-[12.5px] leading-relaxed line-clamp-4" style={{ color: "var(--fg-dim)" }}>
                        {post.content}
                      </p>

                      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                        <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--fg-mute)" }}>
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatLikes(post.likes)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatLikes(post.comments)}</span>
                          {post.shares != null && (
                            <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" />{formatLikes(post.shares)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleSelectPost(post)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                          style={
                            isSelected
                              ? { background: "var(--emerald-fg)", color: "white" }
                              : { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {isSelected ? "Sélectionné ✓" : "Remixer →"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Step 3 : Format remix ────────────────────────────────────────── */}
        {selectedPost && (
          <section id="remix-config">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>3</span>
              Choisir le format
            </div>

            <div
              className="rounded-[12px] p-4 mb-5 flex items-start gap-3"
              style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
            >
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--emerald-fg)" }} />
              <div>
                <p className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--emerald-fg)" }}>
                  {selectedPost.authorName} — {formatLikes(selectedPost.likes)} likes · viral score {selectedPost.viralScore}
                </p>
                <p className="text-[11.5px] line-clamp-2" style={{ color: "var(--fg-dim)" }}>{selectedPost.content}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              {REMIX_FORMATS.map((f) => {
                const active = remixFormat === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setRemixFormat(f.id); setRemixResult(null); setRemixError(null); }}
                    className="text-left p-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                    style={active ? { background: "var(--emerald-soft)", border: "2px solid var(--emerald-fg)" } : { background: "var(--bg-card)", border: "1px solid var(--line)" }}
                  >
                    <p className="text-[12px] font-semibold mb-1" style={{ color: active ? "var(--emerald-fg)" : "var(--fg)" }}>{f.label}</p>
                    <p className="text-[10.5px] leading-snug mb-2" style={{ color: "var(--fg-mute)" }}>{f.desc}</p>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: active ? "var(--emerald-fg)" : "var(--bg)", color: active ? "white" : "var(--fg-mute)" }}
                    >
                      {f.credits} cr
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 disabled:opacity-70"
              style={{ background: "var(--emerald-fg)", color: "white" }}
            >
              <Sparkles className="h-4 w-4" />
              {generating ? "Génération Claude…" : `Générer le ${REMIX_FORMATS.find(f => f.id === remixFormat)?.label} →`}
            </button>

            {remixError && (
              <div
                className="mt-3 flex items-center gap-2 px-4 py-3 rounded-[10px] text-[13px]"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {remixError}
              </div>
            )}
          </section>
        )}

        {/* ── Step 4 : Résultat remix ──────────────────────────────────────── */}
        {remixResult && (
          <section id="remix-result">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>4</span>
              Résultat — prêt à publier
            </div>
            <div
              className="rounded-[18px] p-6"
              style={{ background: "var(--bg-card)", border: "1px solid var(--emerald-line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px]"
                  style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                >
                  ✓ {REMIX_FORMATS.find(f => f.id === remixFormat)?.label} — adapté à votre marque
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-110"
                    style={
                      copied
                        ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                        : { background: "var(--bg)", color: "var(--fg-mute)", border: "1px solid var(--line)" }
                    }
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copié !" : "Copier"}
                  </button>
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
                    style={{ background: "var(--bg)", color: "var(--fg-mute)", border: "1px solid var(--line)" }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regénérer
                  </button>
                  <Link
                    href="/marketing-os/studio"
                    className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                    style={{ background: "var(--emerald-fg)", color: "white" }}
                  >
                    Enregistrer dans Studio →
                  </Link>
                </div>
              </div>
              <pre
                className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans"
                style={{ color: "var(--fg)" }}
              >
                {remixResult}
              </pre>
            </div>
          </section>
        )}

      </div>
    </>
  );
}
