"use client";

/**
 * 🤝 Partnership Hub — Dark Command Center
 *
 * Mode A : Radar Social  → Influenceurs (Instagram / TikTok / YouTube)
 * Mode B : Radar SEO     → Blogs & Médias affiliés (top SERP Google)
 *
 * Design : Bento Grid · Glassmorphism · Spotlight hover · AI Glow · Framer Motion
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Globe,
  Search,
  Loader2,
  Sparkles,
  Copy,
  Check,
  TrendingUp,
  Instagram,
  Youtube,
  ExternalLink,
  Handshake,
  Zap,
  X,
  Radar,
  BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

type SocialPlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
type RadarMode = "social" | "seo";

interface SocialPartner {
  username: string;
  platform: SocialPlatform;
  followersCount: number;
  engagementRate: number;
  bio: string;
  profileUrl: string;
  niche: string;
  pitch?: string;
}

interface BlogPartner {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  position: number;
  keyword: string;
  pitch?: string;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function engagementVariant(rate: number) {
  if (rate >= 3) return { label: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/40", glow: "shadow-emerald-500/30" };
  if (rate >= 1.5) return { label: "text-amber-400", bg: "bg-amber-500/20 border-amber-500/40", glow: "shadow-amber-500/30" };
  return { label: "text-red-400", bg: "bg-red-500/20 border-red-500/40", glow: "shadow-red-500/30" };
}

// ─── Spotlight Card Wrapper ──────────────────────────────────────────────────

function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [spotPos, setSpotPos] = useState({ x: 0, y: 0, visible: false });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
  }, []);

  const onMouseLeave = useCallback(() => setSpotPos((s) => ({ ...s, visible: false })), []);

  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={cn("relative overflow-hidden", className)}
    >
      {spotPos.visible && (
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(200px circle at ${spotPos.x}px ${spotPos.y}px, rgba(99,102,241,0.12), transparent 70%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ─── Shimmer Skeleton ────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 h-64">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="h-2.5 w-16 rounded-full bg-white/8" />
          </div>
        </div>
        <div className="space-y-2 mt-4">
          <div className="h-2 w-full rounded-full bg-white/8" />
          <div className="h-2 w-5/6 rounded-full bg-white/8" />
          <div className="h-2 w-4/6 rounded-full bg-white/8" />
        </div>
        <div className="flex gap-2 mt-4">
          <div className="h-6 w-16 rounded-full bg-white/10" />
          <div className="h-6 w-20 rounded-full bg-white/10" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full rounded-full bg-white/6" />
          <div className="h-2 w-3/4 rounded-full bg-white/6" />
        </div>
        <div className="flex gap-2 mt-5">
          <div className="h-8 flex-1 rounded-xl bg-white/10" />
          <div className="h-8 w-9 rounded-xl bg-white/8" />
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ mode }: { mode: RadarMode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-2xl scale-150" />
        <div className="relative p-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-xl">
          <Radar className="h-10 w-10 text-indigo-400 animate-pulse" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white/80 mb-2">Radar en attente</h3>
      <p className="text-sm text-white/40 max-w-xs">
        {mode === "social"
          ? "Entrez une niche et lancez le radar pour détecter vos futurs ambassadeurs sociaux."
          : "Tapez un mot-clé cible pour scanner les blogs qui dominent Google et en faire vos affiliés."}
      </p>
    </motion.div>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
    >
      {ok
        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
        : <Copy className="h-3.5 w-3.5 text-white/40 hover:text-white/70" />
      }
    </button>
  );
}

// ─── Platform Icon ───────────────────────────────────────────────────────────

function PlatformIcon({ platform, size = 16 }: { platform: SocialPlatform; size?: number }) {
  const s = `h-${size === 14 ? 3.5 : 4} w-${size === 14 ? 3.5 : 4}`;
  if (platform === "YOUTUBE") return <Youtube className={cn(s, "text-red-400")} />;
  if (platform === "INSTAGRAM") return <Instagram className={cn(s, "text-pink-400")} />;
  return <Zap className={cn(s, "text-white")} />; // TikTok
}

// ─── Influencer Card ─────────────────────────────────────────────────────────

function InfluencerCard({
  partner,
  onRemove,
}: {
  partner: SocialPartner;
  onRemove: () => void;
}) {
  const [dealDone, setDealDone] = useState(false);
  const eng = engagementVariant(partner.engagementRate);
  const initials = partner.username.slice(0, 2).toUpperCase();

  return (
    <SpotlightCard className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-300 hover:border-indigo-500/30 hover:ring-1 hover:ring-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/10">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 border border-white/20 flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-[#0d0f1a] border border-white/10">
              <PlatformIcon platform={partner.platform} size={14} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <a
              href={partner.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white/90 hover:text-indigo-300 transition-colors truncate block"
            >
              @{partner.username}
            </a>
            <Badge variant="outline" className="mt-0.5 text-[10px] border-white/15 text-white/40 capitalize">
              {partner.platform.toLowerCase()}
            </Badge>
          </div>
          <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-xs font-mono font-semibold text-white/80">
            <Users className="h-3 w-3 text-white/40" />
            {formatNumber(partner.followersCount)}
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold shadow-sm",
            eng.bg, eng.label
          )}>
            <TrendingUp className="h-3 w-3" />
            {partner.engagementRate}%
          </div>
          <Badge variant="secondary" className="text-[10px] bg-white/8 text-white/50 border-0">
            {partner.niche}
          </Badge>
        </div>

        {/* AI Pitch */}
        {partner.pitch && (
          <div className="rounded-xl bg-white/5 border border-indigo-500/20 backdrop-blur p-3 relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyBtn text={partner.pitch} />
            </div>
            <p className="text-xs text-white/55 leading-relaxed line-clamp-3 pr-6">{partner.pitch}</p>
            <div className="mt-1.5 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-indigo-400" />
              <span className="text-[10px] text-indigo-400/70">Pitch IA · Claude Sonnet</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <motion.button
            onClick={() => { setDealDone(true); setTimeout(() => setDealDone(false), 2500); toast.success(`Deal proposé à @${partner.username} !`); }}
            animate={dealDone ? { backgroundColor: "rgba(16,185,129,0.2)", borderColor: "rgba(16,185,129,0.4)" } : {}}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/25 transition-all"
          >
            {dealDone
              ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Deal envoyé !</span></>
              : <><Handshake className="h-3.5 w-3.5" />Proposer un deal</>
            }
          </motion.button>
          <a
            href={partner.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ─── Blog Card ────────────────────────────────────────────────────────────────

function BlogCard({
  partner,
  onRemove,
}: {
  partner: BlogPartner;
  onRemove: () => void;
}) {
  const [dealDone, setDealDone] = useState(false);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${partner.domain}&sz=32`;

  return (
    <SpotlightCard className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/30 hover:ring-1 hover:ring-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/10">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl border border-white/15 bg-white/8 flex items-center justify-center overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={faviconUrl} alt={partner.domain} className="h-5 w-5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-400 truncate">{partner.domain}</p>
            <a
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/75 hover:text-white line-clamp-2 leading-snug block transition-colors mt-0.5"
            >
              {partner.title}
            </a>
          </div>
          <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-400">
            <BarChart2 className="h-3 w-3" />
            Google #{partner.position}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-xs text-white/50">
            <Search className="h-3 w-3 text-white/30" />
            {partner.keyword}
          </div>
        </div>

        {/* AI Pitch */}
        {partner.pitch && (
          <div className="rounded-xl bg-white/5 border border-emerald-500/20 backdrop-blur p-3 relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyBtn text={partner.pitch} />
            </div>
            <p className="text-xs text-white/55 leading-relaxed line-clamp-3 pr-6">{partner.pitch}</p>
            <div className="mt-1.5 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-[10px] text-emerald-400/70">Email IA · Affiliate Manager</span>
            </div>
          </div>
        )}
        {!partner.pitch && (
          <div className="rounded-xl bg-white/3 border border-white/8 p-3">
            <p className="text-xs text-white/30 italic">Pitch non généré (top 5 seulement)</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <motion.button
            onClick={() => { setDealDone(true); setTimeout(() => setDealDone(false), 2500); toast.success(`Deal proposé à ${partner.domain} !`); }}
            disabled={!partner.pitch}
            animate={dealDone ? { backgroundColor: "rgba(16,185,129,0.2)", borderColor: "rgba(16,185,129,0.4)" } : {}}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {dealDone
              ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span>Deal envoyé !</span></>
              : <><Handshake className="h-3.5 w-3.5" />Proposer un deal</>
            }
          </motion.button>
          <a
            href={partner.url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ─── AI Glow Button ───────────────────────────────────────────────────────────

function GlowButton({
  loading,
  onClick,
  mode,
}: {
  loading: boolean;
  onClick: () => void;
  mode: RadarMode;
}) {
  const isSocial = mode === "social";
  return (
    <div className="relative group w-full sm:w-auto">
      {!loading && (
        <div className={cn(
          "absolute -inset-0.5 rounded-xl blur-sm opacity-0 group-hover:opacity-60 transition-opacity duration-500",
          isSocial
            ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500"
            : "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
        )} />
      )}
      <button
        onClick={onClick}
        disabled={loading}
        className={cn(
          "relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-60 w-full",
          isSocial
            ? "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30"
            : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30"
        )}
      >
        {loading
          ? <><Loader2 className="h-4 w-4 animate-spin" />Scan en cours…</>
          : <><Radar className="h-4 w-4" />Lancer le Radar</>
        }
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PartnershipsPage() {
  const [mode, setMode] = useState<RadarMode>("social");

  // Social filters
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("INSTAGRAM");
  const [audienceRange, setAudienceRange] = useState("micro");

  // SEO filters
  const [keyword, setKeyword] = useState("");

  // Results
  const [socialPartners, setSocialPartners] = useState<SocialPartner[]>([]);
  const [blogPartners, setBlogPartners] = useState<BlogPartner[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [loadingSeo, setLoadingSeo] = useState(false);

  const audienceToRange = (a: string) => {
    if (a === "nano") return { min: 1_000, max: 10_000 };
    if (a === "micro") return { min: 10_000, max: 100_000 };
    if (a === "mid") return { min: 100_000, max: 500_000 };
    return { min: 500_000, max: 5_000_000 };
  };

  async function searchSocial() {
    if (!niche.trim()) { toast.error("Entrez une niche"); return; }
    setLoadingSocial(true);
    setSocialPartners([]);
    const { min, max } = audienceToRange(audienceRange);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "social", niche, platform, minFollowers: min, maxFollowers: max }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erreur"); return; }
      setSocialPartners(data.partners ?? []);
      toast.success(`${data.partners?.length ?? 0} influenceurs détectés · ${data.creditsUsed} crédits`);
    } catch { toast.error("Erreur réseau"); }
    finally { setLoadingSocial(false); }
  }

  async function searchSeo() {
    if (!keyword.trim()) { toast.error("Entrez un mot-clé"); return; }
    setLoadingSeo(true);
    setBlogPartners([]);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "seo", keyword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erreur"); return; }
      setBlogPartners(data.partners ?? []);
      toast.success(`${data.partners?.length ?? 0} blogs détectés · ${data.creditsUsed} crédits`);
    } catch { toast.error("Erreur réseau"); }
    finally { setLoadingSeo(false); }
  }

  const loading = mode === "social" ? loadingSocial : loadingSeo;
  const hasResults = mode === "social" ? socialPartners.length > 0 : blogPartners.length > 0;

  return (
    <div
      className="min-h-screen rounded-2xl relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0d0f1a 0%, #0f1120 50%, #0d0f1a 100%)" }}
    >
      {/* Ambient glow background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -top-20 right-20 w-72 h-72 rounded-full bg-violet-600/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-40 bg-indigo-600/5 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 p-6 lg:p-8 space-y-8 max-w-7xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between"
        >
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-400/20">
                <Handshake className="h-5 w-5 text-indigo-300" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Radar de Partenariats
              </h1>
            </div>
            <p className="text-sm text-white/40 ml-0.5">
              Détectez influenceurs & blogs affiliés · Pitches IA personnalisés · Channel Sales
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/40 font-mono">RADAR ACTIF</span>
          </div>
        </motion.div>

        {/* ── Mode Toggle ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur w-fit"
        >
          {([
            { id: "social", label: "Réseaux Sociaux", icon: Users },
            { id: "seo", label: "SEO & Blogs", icon: Globe },
          ] as { id: RadarMode; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                "relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                mode === id
                  ? "text-white bg-white/10 shadow-lg shadow-black/20"
                  : "text-white/40 hover:text-white/70"
              )}
            >
              {mode === id && (
                <motion.div
                  layoutId="modeIndicator"
                  className={cn(
                    "absolute inset-0 rounded-xl border",
                    id === "social"
                      ? "border-indigo-500/40 bg-gradient-to-r from-indigo-500/15 to-violet-500/15"
                      : "border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-teal-500/15"
                  )}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </motion.div>

        {/* ── Filters Card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6"
        >
          <AnimatePresence mode="wait">
            {mode === "social" ? (
              <motion.div
                key="social-filters"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1 space-y-1.5">
                    <Label className="text-xs text-white/50 font-medium uppercase tracking-wider">Niche / Secteur</Label>
                    <Input
                      placeholder="ex: Marketing, SaaS, Fintech…"
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchSocial()}
                      className="bg-white/8 border-white/15 text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50 font-medium uppercase tracking-wider">Plateforme</Label>
                    <Select value={platform} onValueChange={(v) => setPlatform(v as SocialPlatform)}>
                      <SelectTrigger className="bg-white/8 border-white/15 text-white/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-white/15 text-white">
                        <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                        <SelectItem value="TIKTOK">TikTok</SelectItem>
                        <SelectItem value="YOUTUBE">YouTube</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50 font-medium uppercase tracking-wider">Taille d&apos;audience</Label>
                    <Select value={audienceRange} onValueChange={setAudienceRange}>
                      <SelectTrigger className="bg-white/8 border-white/15 text-white/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1d2e] border-white/15 text-white">
                        <SelectItem value="nano">Nano (1k – 10k)</SelectItem>
                        <SelectItem value="micro">Micro (10k – 100k)</SelectItem>
                        <SelectItem value="mid">Mid (100k – 500k)</SelectItem>
                        <SelectItem value="macro">Macro (500k+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <GlowButton loading={loadingSocial} onClick={searchSocial} mode="social" />
                  <p className="text-xs text-white/30">8 crédits · Pitches IA inclus pour chaque profil</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="seo-filters"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs text-white/50 font-medium uppercase tracking-wider">Mot-clé cible</Label>
                    <Input
                      placeholder="ex: meilleur logiciel CRM, outils SEO 2026…"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchSeo()}
                      className="bg-white/8 border-white/15 text-white placeholder:text-white/30 focus:border-emerald-500/60 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <GlowButton loading={loadingSeo} onClick={searchSeo} mode="seo" />
                  <p className="text-xs text-white/30">6 crédits · Top 5 avec pitch email IA</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Results Grid ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-xs text-white/30 mb-4 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scan IA en cours — génération des pitches…
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </motion.div>
          ) : hasResults ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-white/40">
                  {mode === "social"
                    ? `${socialPartners.length} influenceur${socialPartners.length > 1 ? "s" : ""} détecté${socialPartners.length > 1 ? "s" : ""}`
                    : `${blogPartners.length} blog${blogPartners.length > 1 ? "s" : ""} détecté${blogPartners.length > 1 ? "s" : ""} — classés par position Google`
                  }
                </p>
                <button
                  onClick={() => mode === "social" ? setSocialPartners([]) : setBlogPartners([])}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Effacer
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <AnimatePresence>
                  {mode === "social"
                    ? socialPartners.map((p) => (
                        <motion.div
                          key={p.username}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        >
                          <InfluencerCard
                            partner={p}
                            onRemove={() => setSocialPartners((prev) => prev.filter((x) => x.username !== p.username))}
                          />
                        </motion.div>
                      ))
                    : blogPartners.map((p, i) => (
                        <motion.div
                          key={`${p.domain}-${i}`}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        >
                          <BlogCard
                            partner={p}
                            onRemove={() => setBlogPartners((prev) => prev.filter((_, idx) => idx !== i))}
                          />
                        </motion.div>
                      ))
                  }
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <EmptyState mode={mode} />
          )}
        </AnimatePresence>
      </div>

      {/* Global shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
