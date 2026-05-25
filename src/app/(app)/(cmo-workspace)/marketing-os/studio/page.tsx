"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Sparkles, FileText, Image, RotateCcw } from "lucide-react";

const TABS = [
  { id: "articles", label: "Articles", count: 47 },
  { id: "posts", label: "Posts sociaux", count: 128 },
  { id: "calendrier", label: "Calendrier" },
  { id: "images", label: "Images", count: 92 },
] as const;

type Tab = typeof TABS[number]["id"];
type StatusFilter = "Tous" | "Publié" | "Programmé" | "Brouillon";

const TEMPLATES = [
  { id: "seo", title: "Article SEO", desc: "Long format optimisé, plan + preview avant validation", credits: 8, icon: FileText },
  { id: "posts", title: "30 Posts sociaux", desc: "Batch LinkedIn/Instagram sur un sujet ou URL", credits: 15, icon: Sparkles },
  { id: "image", title: "Image de blog", desc: "Visuel HD 16:9 optimisé pour article", credits: 5, icon: Image },
  { id: "remix", title: "Remixer un contenu", desc: "Article → threads, posts, scripts vidéo", credits: 3, icon: RotateCcw },
];

const MOCK_CREATIONS = [
  { id: 1, title: "10 stratégies SEO pour 2026", type: "Article", status: "Publié" as StatusFilter, date: "hier", statusColor: "emerald" },
  { id: 2, title: "Thread LinkedIn : AI Sales", type: "Post", status: "Programmé" as StatusFilter, date: "demain", statusColor: "violet" },
  { id: 3, title: "Guide Signals Radar — B2B", type: "Article", status: "Brouillon" as StatusFilter, date: "aujourd'hui", statusColor: "amber" },
  { id: 4, title: "30 posts automation marketing", type: "Posts", status: "Publié" as StatusFilter, date: "il y a 2j", statusColor: "emerald" },
  { id: 5, title: "Image couverture guide SEO", type: "Image", status: "Brouillon" as StatusFilter, date: "aujourd'hui", statusColor: "amber" },
  { id: 6, title: "Remixage article lead scoring", type: "Remix", status: "Programmé" as StatusFilter, date: "cette semaine", statusColor: "violet" },
];

const STATUS_FILTERS: StatusFilter[] = ["Tous", "Publié", "Programmé", "Brouillon"];

export default function StudioPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>("articles");
  const [prompt, setPrompt] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous");

  const filtered = statusFilter === "Tous"
    ? MOCK_CREATIONS
    : MOCK_CREATIONS.filter((c) => c.status === statusFilter);

  function handleCreate() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    router.push("/marketing-os/studio");
  }

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
                {"count" in tab && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: active ? "var(--emerald-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                      color: active ? "white" : "var(--fg-mute)",
                    }}
                  >
                    {tab.count}
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
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                Créer →
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
                  onClick={() => { setPrompt(tpl.title); inputRef.current?.focus(); }}
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

        {/* Recent creations */}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href="/marketing-os/studio"
                className="block rounded-[14px] p-4 transition-all hover:-translate-y-0.5"
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
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
