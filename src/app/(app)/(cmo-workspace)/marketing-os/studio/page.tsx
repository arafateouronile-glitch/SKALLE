"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Sparkles, FileText, Image, RotateCcw, Calendar, Plus,
  X, Check, ChevronRight, Linkedin, Twitter, Facebook, Instagram,
  Zap, Copy, RefreshCw,
} from "lucide-react";

// ─── Studio base types ────────────────────────────────────────────────────────

const TABS = [
  { id: "articles",   label: "Articles" },
  { id: "posts",      label: "Posts sociaux" },
  { id: "calendrier", label: "Calendrier" },
  { id: "images",     label: "Images" },
] as const;

type Tab = typeof TABS[number]["id"];
type StatusFilter = "Tous" | "Publié" | "Programmé" | "Brouillon";

const TEMPLATES = [
  { id: "generate", title: "Générer un post",  desc: "Hook psychologique + 6 déclencheurs émotionnels → post prêt à publier", credits: 3,  icon: Sparkles,  tab: "posts"    as Tab },
  { id: "seo",      title: "Article SEO",       desc: "Long format optimisé, plan + preview avant validation",                  credits: 8,  icon: FileText,  tab: "articles" as Tab },
  { id: "posts",    title: "30 Posts sociaux",  desc: "Batch personnalisé sur le persona de vos clients",                       credits: 15, icon: RotateCcw, tab: "posts"    as Tab },
  { id: "image",    title: "Image de blog",     desc: "Visuel HD 16:9 optimisé pour article",                                   credits: 5,  icon: Image,     tab: "images"   as Tab },
];

type Creation = {
  id: string | number; title: string; type: string;
  status: StatusFilter; date: string; statusColor: string; tab: Tab;
  content?: string; network?: string; hookType?: string;
};

interface DbPost {
  id: string;
  type: string;
  title: string | null;
  content: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  createdAt: string;
  sources: unknown;
}

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  return `il y a ${d}j`;
}

function mapStatus(s: DbPost["status"]): StatusFilter {
  if (s === "SCHEDULED") return "Programmé";
  if (s === "PUBLISHED") return "Publié";
  return "Brouillon";
}

function mapStatusColor(s: DbPost["status"]): string {
  if (s === "SCHEDULED") return "violet";
  if (s === "PUBLISHED") return "emerald";
  return "amber";
}

const BASE_CREATIONS: Creation[] = [
  { id: "base-1", title: "10 stratégies SEO pour 2026",       type: "Article", status: "Publié",    date: "hier",          statusColor: "emerald", tab: "articles" },
  { id: "base-2", title: "Thread LinkedIn : AI Sales",         type: "Post",    status: "Programmé", date: "demain",        statusColor: "violet",  tab: "posts"    },
  { id: "base-3", title: "Guide Signals Radar — B2B",          type: "Article", status: "Brouillon", date: "aujourd'hui",   statusColor: "amber",   tab: "articles" },
  { id: "base-4", title: "30 posts automation marketing",      type: "Posts",   status: "Publié",    date: "il y a 2j",     statusColor: "emerald", tab: "posts"    },
  { id: "base-5", title: "Image couverture guide SEO",         type: "Image",   status: "Brouillon", date: "aujourd'hui",   statusColor: "amber",   tab: "images"   },
  { id: "base-6", title: "Remixage article lead scoring",      type: "Remix",   status: "Programmé", date: "cette semaine", statusColor: "violet",  tab: "posts"    },
];

const STATUS_FILTERS: StatusFilter[] = ["Tous", "Publié", "Programmé", "Brouillon"];

const CALENDAR_EVENTS = [
  { day: "Lun 26", title: "Article SEO — Lead Scoring",  type: "Article", color: "emerald" },
  { day: "Mar 27", title: "30 posts LinkedIn batch",      type: "Posts",   color: "violet"  },
  { day: "Mer 28", title: "Image blog — couverture",      type: "Image",   color: "amber"   },
  { day: "Jeu 29", title: "Thread : AI Sales 2026",       type: "Thread",  color: "violet"  },
  { day: "Ven 30", title: "Remixage — guide complet",     type: "Remix",   color: "emerald" },
];

// ─── Wizard types ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;
type FunnelFocus = "awareness" | "consideration" | "decision";
type NetworkId = "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK";

interface ICP {
  jobTitles: string[];
  painPoints: string[];
  objections: string[];
  industries: string[];
  funnelFocus: FunnelFocus;
}

interface StreamPost {
  index: number; network: string; hookType: string;
  category: string; hook: string; content: string; cta: string;
}

type LucideIcon = React.FC<{ className?: string; style?: React.CSSProperties }>;
const NETWORKS: { id: NetworkId; label: string; Icon: LucideIcon }[] = [
  { id: "LINKEDIN",  label: "LinkedIn",    Icon: Linkedin  as LucideIcon },
  { id: "X",         label: "Twitter / X", Icon: Twitter   as LucideIcon },
  { id: "INSTAGRAM", label: "Instagram",   Icon: Instagram as LucideIcon },
  { id: "FACEBOOK",  label: "Facebook",    Icon: Facebook  as LucideIcon },
];

const HOOK_LABELS: Record<string, string> = {
  STAT: "📊 Stat", QUESTION: "❓ Question", CONTRARIAN: "🔥 Contrarian",
  LIST: "📋 Liste", STORY: "📖 Story", HOW_TO: "🛠 How-to",
  CONFESSION: "💬 Confession", PREDICTION: "🔮 Prédiction",
};

const CAT_COLOR: Record<string, string> = {
  education: "var(--violet-fg)", conversion: "var(--amber-fg)", awareness: "var(--emerald-fg)",
};

// ─── Tag input helper ─────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState("");
  function add() {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setVal("");
  }
  return (
    <div
      className="flex flex-wrap gap-1.5 p-2.5 rounded-[10px] min-h-[44px]"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
    >
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11.5px] font-medium"
          style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
        >
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent text-[12.5px] outline-none placeholder:opacity-40"
        style={{ color: "var(--fg)" }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Studio base state
  const [activeTab, setActiveTab]   = useState<Tab>("articles");
  const [prompt, setPrompt]         = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous");
  const [creations, setCreations]   = useState<Creation[]>(BASE_CREATIONS);
  const [creating, setCreating]     = useState(false);
  const [created, setCreated]       = useState(false);

  // Load drafts saved from Remix/Generate pages (localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("studio_drafts");
      if (!raw) return;
      const drafts = JSON.parse(raw) as Creation[];
      if (drafts.length > 0) {
        setCreations((prev) => {
          const existingIds = new Set(prev.map((c) => String(c.id)));
          const newDrafts = drafts.filter((d) => !existingIds.has(String(d.id)));
          return newDrafts.length > 0 ? [...newDrafts, ...prev] : prev;
        });
        setActiveTab("posts");
      }
    } catch { /* ignore */ }
  }, []);

  // Load previously generated social posts from DB
  useEffect(() => {
    fetch("/api/social/posts")
      .then((r) => r.json() as Promise<{ posts?: DbPost[] }>)
      .then(({ posts }) => {
        if (!posts?.length) return;
        const dbCreations: Creation[] = posts.map((p) => ({
          id: p.id,
          title: p.title ?? p.content.slice(0, 60),
          type: `Post ${p.type}`,
          status: mapStatus(p.status),
          date: relDate(p.createdAt),
          statusColor: mapStatusColor(p.status),
          tab: "posts" as Tab,
          content: p.content,
          network: p.type,
          hookType: (p.sources as Record<string, string> | null)?.hookType,
        }));
        setCreations((prev) => {
          const existingIds = new Set(prev.map((c) => String(c.id)));
          const newFromDb = dbCreations.filter((c) => !existingIds.has(String(c.id)));
          return newFromDb.length > 0 ? [...prev, ...newFromDb] : prev;
        });
      })
      .catch(() => {});
  }, []);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // ICP state
  const [icp, setICP] = useState<ICP>({
    jobTitles: [], painPoints: [], objections: [], industries: [],
    funnelFocus: "consideration",
  });

  // Batch params
  const [batchNiche,    setBatchNiche]    = useState("");
  const [batchNetworks, setBatchNetworks] = useState<NetworkId[]>(["LINKEDIN"]);

  // Generation state
  const [generating,    setGenerating]    = useState(false);
  const [genStatus,     setGenStatus]     = useState("");
  const [genProgress,   setGenProgress]   = useState(0);
  const [streamedPosts, setStreamedPosts] = useState<StreamPost[]>([]);
  const [genDone,       setGenDone]       = useState(false);
  const [genError,      setGenError]      = useState<string | null>(null);
  const [copiedIdx,     setCopiedIdx]     = useState<number | null>(null);
  const [detailPost,    setDetailPost]    = useState<Creation | null>(null);
  const [copiedDetail,  setCopiedDetail]  = useState(false);

  // ── Studio helpers ──────────────────────────────────────────────────────────

  function handleCreate() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    setCreating(true);
    setTimeout(() => {
      const tabMap: Record<string, Tab> = {
        "Article SEO": "articles", "30 Posts sociaux": "posts",
        "Image de blog": "images", "Remixer un contenu": "posts",
      };
      const newItem: Creation = {
        id: `local-${Date.now()}`, title: prompt,
        type: tabMap[prompt] ?? "Article", status: "Brouillon",
        date: "à l'instant", statusColor: "amber",
        tab: tabMap[prompt] ?? activeTab,
      };
      setCreations((prev) => [newItem, ...prev]);
      setPrompt(""); setCreating(false); setCreated(true);
      setActiveTab(newItem.tab); setStatusFilter("Tous");
      setTimeout(() => setCreated(false), 3000);
    }, 900);
  }

  const tabCreations = creations.filter((c) => c.tab === activeTab);
  const filtered = statusFilter === "Tous" ? tabCreations : tabCreations.filter((c) => c.status === statusFilter);

  // ── Wizard helpers ──────────────────────────────────────────────────────────

  function openWizard() {
    setWizardStep(1); setStreamedPosts([]); setGenDone(false);
    setGenError(null); setGenProgress(0); setGenStatus("");
    // Pre-fill ICP from saved brandVoice
    fetch("/api/social/batch-posts")
      .then((r) => r.json() as Promise<{ icp?: ICP }>)
      .then((d) => { if (d.icp) setICP(d.icp); })
      .catch(() => {});
    setWizardOpen(true);
  }

  function closeWizard() {
    if (generating) return;
    setWizardOpen(false);
  }

  function toggleNetwork(n: NetworkId) {
    setBatchNetworks((prev) =>
      prev.includes(n) ? (prev.length > 1 ? prev.filter((x) => x !== n) : prev) : [...prev, n]
    );
  }

  const startGeneration = useCallback(async () => {
    setWizardStep(3);
    setGenerating(true);
    setStreamedPosts([]);
    setGenDone(false);
    setGenError(null);
    setGenProgress(0);
    setGenStatus("Initialisation…");

    // Local accumulator — avoids reading stale state inside setState updaters
    const localPosts: StreamPost[] = [];

    try {
      const res = await fetch("/api/social/batch-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: batchNiche,
          networks: batchNetworks,
          icp,
          saveBrandVoice: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Erreur serveur");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const lines = evt.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine  = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

          if (eventName === "status") {
            setGenStatus(data.message as string);
          } else if (eventName === "post") {
            const post = data as unknown as StreamPost;
            localPosts.push(post);
            setStreamedPosts((prev) => [...prev, post]);
          } else if (eventName === "progress") {
            setGenProgress(Math.round(((data.generated as number) / 30) * 100));
          } else if (eventName === "done") {
            setGenDone(true);
            setGenProgress(100);
            // Map local accumulator → creations (no nested setState)
            const ts = Date.now();
            const newCreations: Creation[] = localPosts.map((p) => ({
              id: `gen-${ts}-${p.index}`,
              title: p.hook.slice(0, 60),
              type: `Post ${p.network}`,
              status: "Brouillon" as StatusFilter,
              date: "à l'instant",
              statusColor: "emerald",
              tab: "posts" as Tab,
              content: p.content,
              network: p.network,
              hookType: p.hookType,
            }));
            setCreations((c) => [...newCreations, ...c]);
            setActiveTab("posts");
          } else if (eventName === "error") {
            setGenError(data.message as string);
          }
        }
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }, [batchNiche, batchNetworks, icp]);

  function handleCopyPost(post: StreamPost, idx: number) {
    navigator.clipboard.writeText(post.content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <AppTopBar
        title="Studio"
        breadcrumb="marketing-os / studio"
        cta="Créer"
        onCta={() => inputRef.current?.focus()}
        accent="emerald"
      />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Tabs */}
        <div className="flex items-center gap-1.5">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const count = (tab.id === "articles" || tab.id === "posts" || tab.id === "images")
              ? creations.filter((c) => c.tab === tab.id).length : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={
                  active
                    ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                    : { color: "var(--fg-dim)", border: "1px solid transparent" }
                }
              >
                {tab.label}
                {count !== undefined && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: active ? "var(--emerald-fg)" : "oklch(0.21 0.03 260 / 0.05)", color: active ? "white" : "var(--fg-mute)" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Hero input */}
        <section
          className="rounded-[18px] p-8"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: "var(--fg-mute)" }}>
              <Sparkles className="h-3 w-3" style={{ color: "var(--emerald-fg)" }} />
              Que voulez-vous créer ?
            </div>
            {created && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] mb-3 text-[13px] font-medium"
                style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                ✓ Contenu ajouté en Brouillon — visible dans l'onglet actif
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <span className="font-mono text-[15px]" style={{ color: "var(--emerald-fg)" }}>✦</span>
                <input
                  ref={inputRef} value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50"
                  style={{ color: "var(--fg)" }}
                  placeholder="Ex : Article SEO sur le lead scoring B2B · 30 posts LinkedIn sur l'IA..."
                />
              </div>
              <button onClick={handleCreate} disabled={creating}
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap disabled:opacity-70"
                style={{ background: "var(--emerald-fg)", color: "white" }}>
                {creating ? "Génération…" : "Créer →"}
              </button>
            </div>
          </div>

          {/* Templates */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              const href = tpl.id === "generate" ? "/marketing-os/studio/generate"
                         : tpl.id === "seo"      ? "/marketing-os/seo-factory"
                         : null;
              const inner = (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <Icon className="h-4 w-4" style={{ color: "var(--emerald-fg)" }} />
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
                      {tpl.credits} cr
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--fg)" }}>{tpl.title}</p>
                  <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{tpl.desc}</p>
                </>
              );
              if (href) {
                return (
                  <Link key={tpl.id} href={href}
                    className="text-left p-4 rounded-[12px] transition-all hover:-translate-y-0.5 hover:brightness-[0.97] block"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    {inner}
                  </Link>
                );
              }
              return (
                <button key={tpl.id}
                  className="text-left p-4 rounded-[12px] transition-all hover:-translate-y-0.5 hover:brightness-[0.97]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                  onClick={() => {
                    if (tpl.id === "posts") { openWizard(); return; }
                    setPrompt(tpl.title); setActiveTab(tpl.tab); inputRef.current?.focus();
                  }}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        </section>

        {/* Calendrier */}
        {activeTab === "calendrier" && (
          <section className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-[18px] font-semibold" style={{ color: "var(--fg)" }}>Mai 2026</h2>
              <button onClick={() => { setActiveTab("articles"); inputRef.current?.focus(); }}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-all hover:brightness-110"
                style={{ background: "var(--emerald-fg)", color: "white" }}>
                <Plus className="h-3.5 w-3.5" /> Planifier
              </button>
            </div>
            <div className="space-y-2">
              {CALENDAR_EVENTS.map((ev, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-[10px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <span className="text-[11px] font-mono w-14 shrink-0" style={{ color: "var(--fg-mute)" }}>{ev.day}</span>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `var(--${ev.color}-fg)` }} />
                  <span className="text-[13px] font-medium flex-1" style={{ color: "var(--fg)" }}>{ev.title}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: `var(--${ev.color}-soft)`, color: `var(--${ev.color}-fg)` }}>
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Articles / Posts / Images */}
        {activeTab !== "calendrier" && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[18px] font-semibold" style={{ color: "var(--fg)" }}>Vos créations récentes</h2>
              <div className="flex items-center gap-1.5">
                {STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f;
                  return (
                    <button key={f} onClick={() => setStatusFilter(f)}
                      className="text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-all"
                      style={active
                        ? { background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }
                        : { background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-[14px] p-8 text-center" style={{ border: "1px dashed var(--line)" }}>
                <p className="text-[13px] mb-3" style={{ color: "var(--fg-mute)" }}>Aucun contenu dans cet onglet pour ce filtre.</p>
                <button onClick={() => { inputRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-all hover:brightness-110"
                  style={{ background: "var(--emerald-fg)", color: "white" }}>
                  + Créer maintenant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {filtered.map((item) => (
                  <div key={String(item.id)}
                    onClick={() => setDetailPost(item)}
                    className="rounded-[14px] p-4 transition-all hover:-translate-y-0.5 cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
                    <div className="h-24 rounded-[10px] mb-3 overflow-hidden flex items-start p-3"
                      style={{ background: "linear-gradient(135deg, var(--emerald-soft), var(--violet-soft))" }}>
                      {item.content ? (
                        <p className="text-[10.5px] leading-relaxed line-clamp-4 opacity-70" style={{ color: "var(--fg)" }}>
                          {item.content}
                        </p>
                      ) : (
                        <FileText className="h-8 w-8 opacity-30 m-auto" style={{ color: "var(--emerald-fg)" }} />
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "var(--fg)" }}>{item.title}</p>
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{ background: `var(--${item.statusColor}-soft)`, color: `var(--${item.statusColor}-fg)` }}>
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--fg-mute)" }}>{item.type} · {item.date}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Post detail panel ───────────────────────────────────────────────── */}
      {detailPost && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDetailPost(null)} />
          <div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: "clamp(340px, 44vw, 620px)",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--line)",
              boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                    {detailPost.network ?? detailPost.type}
                  </span>
                  {detailPost.hookType && (
                    <span className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                      {HOOK_LABELS[detailPost.hookType] ?? detailPost.hookType}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded"
                    style={{ background: `var(--${detailPost.statusColor}-soft)`, color: `var(--${detailPost.statusColor}-fg)` }}>
                    {detailPost.status}
                  </span>
                </div>
                <p className="text-[15px] font-semibold leading-snug pr-4" style={{ color: "var(--fg)" }}>
                  {detailPost.title}
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--fg-mute)" }}>{detailPost.type} · {detailPost.date}</p>
              </div>
              <button
                onClick={() => setDetailPost(null)}
                className="shrink-0 p-1.5 rounded-[8px] transition-all hover:brightness-[0.97]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <X className="h-4 w-4" style={{ color: "var(--fg-mute)" }} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {detailPost.content ? (
                <div
                  className="rounded-[12px] p-5 text-[13.5px] leading-relaxed whitespace-pre-wrap"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  {detailPost.content}
                </div>
              ) : (
                <div className="rounded-[12px] p-8 text-center" style={{ border: "1px dashed var(--line)" }}>
                  <FileText className="h-8 w-8 mx-auto mb-3 opacity-20" style={{ color: "var(--fg-mute)" }} />
                  <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Contenu non disponible pour cette création.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 flex items-center gap-3" style={{ borderTop: "1px solid var(--line)" }}>
              {detailPost.content && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(detailPost.content!);
                    setCopiedDetail(true);
                    setTimeout(() => setCopiedDetail(false), 2000);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12.5px] font-semibold transition-all hover:brightness-110 flex-1"
                  style={{ background: copiedDetail ? "var(--emerald-soft)" : "var(--emerald-fg)", color: copiedDetail ? "var(--emerald-fg)" : "white", border: copiedDetail ? "1px solid var(--emerald-line)" : "none" }}
                >
                  {copiedDetail ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedDetail ? "Copié !" : "Copier le post"}
                </button>
              )}
              <button
                onClick={() => setDetailPost(null)}
                className="px-4 py-2.5 rounded-[8px] text-[12.5px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── 30 Posts Wizard ─────────────────────────────────────────────────── */}
      {wizardOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={closeWizard}
          />

          {/* Panel */}
          <div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: "clamp(360px, 48vw, 680px)",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--line)",
              boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--line)" }}>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "var(--fg-mute)" }}>
                  Studio · 30 Posts sociaux
                </p>
                <p className="text-[16px] font-semibold" style={{ color: "var(--fg)" }}>
                  {wizardStep === 1 ? "Persona client cible"
                    : wizardStep === 2 ? "Paramètres de génération"
                    : genDone ? "30 posts générés ✓"
                    : "Génération en cours…"}
                </p>
              </div>
              <button onClick={closeWizard} disabled={generating}
                className="p-1.5 rounded-[8px] transition-all hover:brightness-[0.97] disabled:opacity-30"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <X className="h-4 w-4" style={{ color: "var(--fg-mute)" }} />
              </button>
            </div>

            {/* Step indicators */}
            {wizardStep < 3 && (
              <div className="flex items-center gap-3 px-6 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
                {([1, 2] as WizardStep[]).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        background: wizardStep >= s ? "var(--emerald-fg)" : "var(--line-strong)",
                        color: wizardStep >= s ? "white" : "var(--fg-mute)",
                      }}
                    >
                      {wizardStep > s ? <Check className="h-3 w-3" /> : s}
                    </div>
                    <span className="text-[11.5px] font-medium" style={{ color: wizardStep >= s ? "var(--fg)" : "var(--fg-mute)" }}>
                      {s === 1 ? "Persona ICP" : "Paramètres"}
                    </span>
                    {s < 2 && <ChevronRight className="h-3 w-3 mx-1" style={{ color: "var(--fg-mute)" }} />}
                  </div>
                ))}
              </div>
            )}

            {/* ── Step 1 : ICP ─────────────────────────────────────────────── */}
            {wizardStep === 1 && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                <div>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
                    Titres de poste ciblés
                    <span className="ml-1.5 font-normal" style={{ color: "var(--fg-mute)" }}>Appuyez sur Entrée pour ajouter</span>
                  </p>
                  <TagInput
                    tags={icp.jobTitles}
                    onChange={(v) => setICP({ ...icp, jobTitles: v })}
                    placeholder="Ex : Directeur Commercial, CMO, Head of Growth…"
                  />
                </div>

                <div>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
                    Pain points principaux
                  </p>
                  <TagInput
                    tags={icp.painPoints}
                    onChange={(v) => setICP({ ...icp, painPoints: v })}
                    placeholder="Ex : Trop de temps en prospection, pipeline imprévisible…"
                  />
                </div>

                <div>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
                    Objections fréquentes
                  </p>
                  <TagInput
                    tags={icp.objections}
                    onChange={(v) => setICP({ ...icp, objections: v })}
                    placeholder="Ex : Trop cher, pas le temps, déjà un outil…"
                  />
                </div>

                <div>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
                    Industries cibles
                  </p>
                  <TagInput
                    tags={icp.industries}
                    onChange={(v) => setICP({ ...icp, industries: v })}
                    placeholder="Ex : SaaS B2B, Fintech, RH, Marketing…"
                  />
                </div>

                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>
                    Priorité funnel
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["awareness", "consideration", "decision"] as FunnelFocus[]).map((f) => {
                      const labels: Record<FunnelFocus, { title: string; desc: string }> = {
                        awareness:     { title: "Notoriété",   desc: "Faire connaître le problème" },
                        consideration: { title: "Évaluation",  desc: "Comparer les solutions" },
                        decision:      { title: "Décision",    desc: "Convaincre de choisir" },
                      };
                      const active = icp.funnelFocus === f;
                      return (
                        <button key={f} onClick={() => setICP({ ...icp, funnelFocus: f })}
                          className="text-left p-3 rounded-[10px] transition-all"
                          style={active
                            ? { background: "var(--emerald-soft)", border: "2px solid var(--emerald-fg)" }
                            : { background: "var(--bg)", border: "1px solid var(--line)" }}>
                          <p className="text-[12px] font-semibold" style={{ color: active ? "var(--emerald-fg)" : "var(--fg)" }}>{labels[f].title}</p>
                          <p className="text-[10.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{labels[f].desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2 : Params ──────────────────────────────────────────── */}
            {wizardStep === 2 && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                <div>
                  <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>
                    Niche / sujet des posts
                  </p>
                  <input
                    value={batchNiche}
                    onChange={(e) => setBatchNiche(e.target.value)}
                    className="w-full px-4 py-3 rounded-[10px] text-[13px] outline-none"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                    placeholder="Ex : prospection IA B2B, automation marketing, RevOps…"
                    autoFocus
                  />
                </div>

                <div>
                  <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>
                    Réseaux sociaux
                    <span className="ml-1.5 font-normal" style={{ color: "var(--fg-mute)" }}>(multi-sélection)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {NETWORKS.map(({ id, label, Icon }) => {
                      const active = batchNetworks.includes(id);
                      return (
                        <button key={id} onClick={() => toggleNetwork(id)}
                          className="flex items-center gap-2.5 p-3 rounded-[10px] transition-all"
                          style={active
                            ? { background: "var(--emerald-soft)", border: "2px solid var(--emerald-fg)" }
                            : { background: "var(--bg)", border: "1px solid var(--line)" }}>
                          <Icon className="h-4 w-4" style={{ color: active ? "var(--emerald-fg)" : "var(--fg-mute)" }} />
                          <span className="text-[13px] font-medium" style={{ color: active ? "var(--emerald-fg)" : "var(--fg)" }}>{label}</span>
                          {active && <Check className="h-3.5 w-3.5 ml-auto" style={{ color: "var(--emerald-fg)" }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-[12px] p-4 space-y-1.5"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Récap persona</p>
                  {icp.jobTitles.length > 0 && (
                    <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                      <span style={{ color: "var(--fg)" }}>Cibles :</span> {icp.jobTitles.join(", ")}
                    </p>
                  )}
                  {icp.painPoints.length > 0 && (
                    <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                      <span style={{ color: "var(--fg)" }}>Pain points :</span> {icp.painPoints.slice(0, 2).join(", ")}{icp.painPoints.length > 2 ? ` +${icp.painPoints.length - 2}` : ""}
                    </p>
                  )}
                  <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                    <span style={{ color: "var(--fg)" }}>Funnel :</span> {icp.funnelFocus}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                    <span style={{ color: "var(--fg)" }}>Réseaux :</span> {batchNetworks.join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 3 : Generation ──────────────────────────────────────── */}
            {wizardStep === 3 && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{genStatus}</span>
                    <span className="text-[12px] font-mono" style={{ color: "var(--emerald-fg)" }}>
                      {streamedPosts.length}/30
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${genProgress}%`, background: "var(--emerald-fg)" }}
                    />
                  </div>
                </div>

                {genError && (
                  <div className="px-4 py-3 rounded-[10px] text-[12.5px]"
                    style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}>
                    {genError}
                  </div>
                )}

                {genDone && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[13px] font-medium"
                    style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                    <Zap className="h-4 w-4" />
                    {streamedPosts.length} posts ajoutés à vos brouillons — onglet "Posts sociaux"
                  </div>
                )}

                {/* Posts stream */}
                <div className="space-y-3">
                  {streamedPosts.map((post, i) => (
                    <div key={i}
                      className="rounded-[12px] p-4"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                          {post.network}
                        </span>
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                          {HOOK_LABELS[post.hookType] ?? post.hookType}
                        </span>
                        <span className="text-[10.5px] font-medium ml-auto"
                          style={{ color: CAT_COLOR[post.category] ?? "var(--fg-mute)" }}>
                          {post.category}
                        </span>
                        <button
                          onClick={() => handleCopyPost(post, i)}
                          className="p-1 rounded transition-all hover:brightness-110"
                          style={{ color: copiedIdx === i ? "var(--emerald-fg)" : "var(--fg-mute)" }}
                        >
                          {copiedIdx === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-[12.5px] leading-relaxed line-clamp-4" style={{ color: "var(--fg-dim)" }}>
                        {post.content}
                      </p>
                    </div>
                  ))}
                  {generating && (
                    <div className="flex items-center gap-2 py-3 text-[12px]" style={{ color: "var(--fg-mute)" }}>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--emerald-fg)" }} />
                      Génération en cours…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer CTA */}
            <div className="shrink-0 px-6 py-4 flex items-center justify-between gap-3"
              style={{ borderTop: "1px solid var(--line)" }}>
              {wizardStep === 1 && (
                <>
                  <button onClick={closeWizard}
                    className="px-4 py-2 rounded-[8px] text-[12px] font-medium"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    Annuler
                  </button>
                  <button
                    onClick={() => setWizardStep(2)}
                    className="flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-semibold transition-all hover:brightness-110"
                    style={{ background: "var(--emerald-fg)", color: "white" }}
                    disabled={icp.jobTitles.length === 0 && icp.painPoints.length === 0}
                  >
                    Suivant <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              {wizardStep === 2 && (
                <>
                  <button onClick={() => setWizardStep(1)}
                    className="px-4 py-2 rounded-[8px] text-[12px] font-medium"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    ← Retour
                  </button>
                  <button
                    onClick={startGeneration}
                    disabled={!batchNiche.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                    style={{ background: "var(--emerald-fg)", color: "white" }}>
                    <Sparkles className="h-4 w-4" />
                    Générer 30 posts →
                  </button>
                </>
              )}
              {wizardStep === 3 && genDone && (
                <button onClick={closeWizard}
                  className="w-full px-5 py-2.5 rounded-[8px] text-[13px] font-semibold transition-all hover:brightness-110"
                  style={{ background: "var(--emerald-fg)", color: "white" }}>
                  ✓ Voir mes posts dans l'onglet "Posts sociaux"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
