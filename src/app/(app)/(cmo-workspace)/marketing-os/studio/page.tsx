"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Sparkles, FileText, Image, RotateCcw, Calendar, Plus } from "lucide-react";

const TABS = [
  { id: "articles", label: "Articles", count: 47 },
  { id: "posts", label: "Posts sociaux", count: 128 },
  { id: "calendrier", label: "Calendrier" },
  { id: "images", label: "Images", count: 92 },
] as const;

type Tab = typeof TABS[number]["id"];
type StatusFilter = "Tous" | "Publié" | "Programmé" | "Brouillon";

const TEMPLATES = [
  { id: "seo", title: "Article SEO", desc: "Long format optimisé, plan + preview avant validation", credits: 8, icon: FileText, tab: "articles" as Tab },
  { id: "posts", title: "30 Posts sociaux", desc: "Batch LinkedIn/Instagram sur un sujet ou URL", credits: 15, icon: Sparkles, tab: "posts" as Tab },
  { id: "image", title: "Image de blog", desc: "Visuel HD 16:9 optimisé pour article", credits: 5, icon: Image, tab: "images" as Tab },
  { id: "remix", title: "Remixer un contenu", desc: "Article → threads, posts, scripts vidéo", credits: 3, icon: RotateCcw, tab: "posts" as Tab },
];

type Creation = {
  id: number;
  title: string;
  type: string;
  status: StatusFilter;
  date: string;
  statusColor: string;
  tab: Tab;
};

const BASE_CREATIONS: Creation[] = [
  { id: 1, title: "10 stratégies SEO pour 2026", type: "Article", status: "Publié", date: "hier", statusColor: "emerald", tab: "articles" },
  { id: 2, title: "Thread LinkedIn : AI Sales", type: "Post", status: "Programmé", date: "demain", statusColor: "violet", tab: "posts" },
  { id: 3, title: "Guide Signals Radar — B2B", type: "Article", status: "Brouillon", date: "aujourd'hui", statusColor: "amber", tab: "articles" },
  { id: 4, title: "30 posts automation marketing", type: "Posts", status: "Publié", date: "il y a 2j", statusColor: "emerald", tab: "posts" },
  { id: 5, title: "Image couverture guide SEO", type: "Image", status: "Brouillon", date: "aujourd'hui", statusColor: "amber", tab: "images" },
  { id: 6, title: "Remixage article lead scoring", type: "Remix", status: "Programmé", date: "cette semaine", statusColor: "violet", tab: "posts" },
];

const STATUS_FILTERS: StatusFilter[] = ["Tous", "Publié", "Programmé", "Brouillon"];

const CALENDAR_EVENTS = [
  { day: "Lun 26", title: "Article SEO — Lead Scoring", type: "Article", color: "emerald" },
  { day: "Mar 27", title: "30 posts LinkedIn batch", type: "Posts", color: "violet" },
  { day: "Mer 28", title: "Image blog — couverture", type: "Image", color: "amber" },
  { day: "Jeu 29", title: "Thread : AI Sales 2026", type: "Thread", color: "violet" },
  { day: "Ven 30", title: "Remixage — guide complet", type: "Remix", color: "emerald" },
];

export default function StudioPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("articles");
  const [prompt, setPrompt] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous");
  const [creations, setCreations] = useState<Creation[]>(BASE_CREATIONS);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  function handleCreate() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    setCreating(true);
    setTimeout(() => {
      const tabMap: Record<string, Tab> = {
        "Article SEO": "articles", "30 Posts sociaux": "posts",
        "Image de blog": "images", "Remixer un contenu": "posts",
      };
      const newItem: Creation = {
        id: Date.now(),
        title: prompt,
        type: tabMap[prompt] ?? "Article",
        status: "Brouillon",
        date: "à l'instant",
        statusColor: "amber",
        tab: tabMap[prompt] ?? activeTab,
      };
      setCreations((prev) => [newItem, ...prev]);
      setPrompt("");
      setCreating(false);
      setCreated(true);
      setActiveTab(newItem.tab);
      setStatusFilter("Tous");
      setTimeout(() => setCreated(false), 3000);
    }, 900);
  }

  const tabCreations = creations.filter((c) => c.tab === activeTab);
  const filtered = statusFilter === "Tous" ? tabCreations : tabCreations.filter((c) => c.status === statusFilter);

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
            const count = tab.id === "articles" || tab.id === "posts" || tab.id === "images"
              ? creations.filter((c) => c.tab === tab.id).length
              : undefined;
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
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: active ? "var(--emerald-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                      color: active ? "white" : "var(--fg-mute)",
                    }}
                  >
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
              <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] mb-3 text-[13px] font-medium"
                style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
              >
                ✓ Contenu ajouté en Brouillon — visible dans l'onglet actif
              </div>
            )}

            <div className="flex items-center gap-3">
              <div
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <span className="font-mono text-[15px]" style={{ color: "var(--emerald-fg)" }}>✦</span>
                <input
                  ref={inputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50"
                  style={{ color: "var(--fg)" }}
                  placeholder="Ex : Article SEO sur le lead scoring B2B · 30 posts LinkedIn sur l'IA..."
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap disabled:opacity-70"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                {creating ? "Génération…" : "Créer →"}
              </button>
            </div>
          </div>

          {/* Quick templates */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  className="text-left p-4 rounded-[12px] transition-all hover:-translate-y-0.5 hover:brightness-[0.97]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                  onClick={() => {
                    if (tpl.id === "remix") { router.push("/marketing-os/studio/remix"); return; }
                    setPrompt(tpl.title); setActiveTab(tpl.tab); inputRef.current?.focus();
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <Icon className="h-4 w-4" style={{ color: "var(--emerald-fg)" }} />
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                    >
                      {tpl.credits} cr
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--fg)" }}>{tpl.title}</p>
                  <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{tpl.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Calendrier tab */}
        {activeTab === "calendrier" && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-[18px] font-semibold" style={{ color: "var(--fg)" }}>Mai 2026</h2>
              <button
                onClick={() => { setActiveTab("articles"); inputRef.current?.focus(); }}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-all hover:brightness-110"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                <Plus className="h-3.5 w-3.5" />
                Planifier
              </button>
            </div>
            <div className="space-y-2">
              {CALENDAR_EVENTS.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-4 py-3 rounded-[10px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                >
                  <span className="text-[11px] font-mono w-14 shrink-0" style={{ color: "var(--fg-mute)" }}>{ev.day}</span>
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: `var(--${ev.color}-fg)` }}
                  />
                  <span className="text-[13px] font-medium flex-1" style={{ color: "var(--fg)" }}>{ev.title}</span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: `var(--${ev.color}-soft)`, color: `var(--${ev.color}-fg)` }}
                  >
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Articles / Posts / Images tabs */}
        {activeTab !== "calendrier" && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[18px] font-semibold" style={{ color: "var(--fg)" }}>
                Vos créations récentes
              </h2>
              <div className="flex items-center gap-1.5">
                {STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className="text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-all"
                      style={
                        active
                          ? { background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }
                          : { background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }
                      }
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div
                className="rounded-[14px] p-8 text-center"
                style={{ border: "1px dashed var(--line)" }}
              >
                <p className="text-[13px] mb-3" style={{ color: "var(--fg-mute)" }}>
                  Aucun contenu dans cet onglet pour ce filtre.
                </p>
                <button
                  onClick={() => { inputRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-all hover:brightness-110"
                  style={{ background: "var(--emerald-fg)", color: "white" }}
                >
                  + Créer maintenant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[14px] p-4 transition-all hover:-translate-y-0.5 cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                  >
                    <div
                      className="h-24 rounded-[10px] mb-3 flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, var(--emerald-soft), var(--violet-soft))" }}
                    >
                      <FileText className="h-8 w-8 opacity-30" style={{ color: "var(--emerald-fg)" }} />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "var(--fg)" }}>
                        {item.title}
                      </p>
                      <span
                        className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: `var(--${item.statusColor}-soft)`,
                          color: `var(--${item.statusColor}-fg)`,
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--fg-mute)" }}>
                      {item.type} · {item.date}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
