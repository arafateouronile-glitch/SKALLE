"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { SortBy } from "@/lib/services/social/viral-monitor";

const PLATFORMS = [
  { value: "", label: "Toutes" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TWITTER", label: "Twitter / X" },
] as const;

const HOOK_TYPES = [
  { value: "", label: "Tous" },
  { value: "QUESTION", label: "Question" },
  { value: "STAT", label: "Stat" },
  { value: "STORY", label: "Histoire" },
  { value: "CONTRARIAN", label: "Contrariant" },
  { value: "LIST", label: "Liste" },
  { value: "HOW_TO", label: "How-to" },
  { value: "CONFESSION", label: "Confession" },
  { value: "PREDICTION", label: "Prédiction" },
] as const;

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "viralScore", label: "Score viral" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Commentaires" },
  { value: "views", label: "Vues" },
  { value: "recent", label: "Récents" },
];

export interface FilterState {
  platform: string;
  hookType: string;
  niche: string;
  country: string;
  minLikes: string;
  minComments: string;
  minViews: string;
  sortBy: SortBy;
  bookmarkedOnly: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  platform: "",
  hookType: "",
  niche: "",
  country: "",
  minLikes: "",
  minComments: "",
  minViews: "",
  sortBy: "viralScore",
  bookmarkedOnly: false,
};

interface VeilleFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

interface Facets {
  niches: string[];
  countries: string[];
}

export function VeilleFilters({ filters, onChange }: VeilleFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [facets, setFacets] = useState<Facets>({ niches: [], countries: [] });

  useEffect(() => {
    fetch("/api/social/veille?facets=true")
      .then((r) => r.ok ? r.json() : null)
      .then((data: Facets | null) => data && setFacets(data))
      .catch(() => null);
  }, []);

  function set(patch: Partial<FilterState>) {
    onChange({ ...filters, ...patch });
  }

  const activeAdvancedCount = [
    filters.niche, filters.country, filters.minLikes, filters.minComments, filters.minViews,
  ].filter(Boolean).length;

  function clearAll() {
    onChange(DEFAULT_FILTERS);
  }

  const hasAnyFilter =
    filters.platform || filters.hookType || filters.bookmarkedOnly || activeAdvancedCount > 0;

  return (
    <div className="space-y-3">
      {/* Row 1: platform + hook + sort + bookmarks + advanced toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Platform pills */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              onClick={() => set({ platform: p.value })}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12px] font-medium transition-all whitespace-nowrap",
                filters.platform === p.value
                  ? "bg-white/10 text-white"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Hook type pills */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {HOOK_TYPES.map((h) => (
            <button
              key={h.value}
              onClick={() => set({ hookType: h.value })}
              className={cn(
                "px-2 py-1 rounded-lg text-[11px] font-medium border transition-all",
                filters.hookType === h.value
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/20"
              )}
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Sort */}
          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(e) => set({ sortBy: e.target.value as SortBy })}
              className="h-7 pl-2.5 pr-6 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] text-slate-300 appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/40"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#0f1117]">
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
          </div>

          {/* Bookmarked */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => set({ bookmarkedOnly: !filters.bookmarkedOnly })}
            className={cn(
              "h-7 text-[12px] border px-2.5",
              filters.bookmarkedOnly
                ? "bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "border-white/[0.08] text-slate-500 hover:text-slate-300"
            )}
          >
            ★ Sauvegardés
          </Button>

          {/* Advanced toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className={cn(
              "h-7 text-[12px] border gap-1.5 px-2.5",
              advancedOpen || activeAdvancedCount > 0
                ? "bg-violet-500/15 border-violet-500/30 text-violet-400 hover:bg-violet-500/20"
                : "border-white/[0.08] text-slate-500 hover:text-slate-300"
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filtres avancés
            {activeAdvancedCount > 0 && (
              <span className="bg-violet-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                {activeAdvancedCount}
              </span>
            )}
          </Button>

          {/* Clear all */}
          {hasAnyFilter && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAll}
              className="h-7 w-7 p-0 text-slate-600 hover:text-slate-300 hover:bg-white/[0.06]"
              title="Réinitialiser les filtres"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Advanced filters panel */}
      {advancedOpen && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Min likes */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500 font-medium">Min. likes</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-rose-400">♥</span>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.minLikes}
                onChange={(e) => set({ minLikes: e.target.value })}
                className="h-7 pl-6 text-[12px] bg-white/[0.04] border-white/[0.08] text-slate-200 focus:border-rose-500/40"
              />
            </div>
          </div>

          {/* Min comments */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500 font-medium">Min. commentaires</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-sky-400">💬</span>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.minComments}
                onChange={(e) => set({ minComments: e.target.value })}
                className="h-7 pl-6 text-[12px] bg-white/[0.04] border-white/[0.08] text-slate-200 focus:border-sky-500/40"
              />
            </div>
          </div>

          {/* Min views */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500 font-medium">Min. impressions</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-violet-400">👁</span>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.minViews}
                onChange={(e) => set({ minViews: e.target.value })}
                className="h-7 pl-6 text-[12px] bg-white/[0.04] border-white/[0.08] text-slate-200 focus:border-violet-500/40"
              />
            </div>
          </div>

          {/* Niche */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500 font-medium">Niche</label>
            {facets.niches.length > 0 ? (
              <div className="relative">
                <select
                  value={filters.niche}
                  onChange={(e) => set({ niche: e.target.value })}
                  className="w-full h-7 px-2.5 pr-6 rounded-md border border-white/[0.08] bg-white/[0.04] text-[12px] text-slate-300 appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/40"
                >
                  <option value="" className="bg-[#0f1117]">Toutes</option>
                  {facets.niches.map((n) => (
                    <option key={n} value={n} className="bg-[#0f1117]">{n}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              </div>
            ) : (
              <Input
                placeholder="ex: SaaS, startup…"
                value={filters.niche}
                onChange={(e) => set({ niche: e.target.value })}
                className="h-7 text-[12px] bg-white/[0.04] border-white/[0.08] text-slate-200 focus:border-emerald-500/40"
              />
            )}
          </div>

          {/* Country */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500 font-medium">Pays</label>
            {facets.countries.length > 0 ? (
              <div className="relative">
                <select
                  value={filters.country}
                  onChange={(e) => set({ country: e.target.value })}
                  className="w-full h-7 px-2.5 pr-6 rounded-md border border-white/[0.08] bg-white/[0.04] text-[12px] text-slate-300 appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/40"
                >
                  <option value="" className="bg-[#0f1117]">Tous</option>
                  {facets.countries.map((c) => (
                    <option key={c} value={c} className="bg-[#0f1117]">{c}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              </div>
            ) : (
              <Input
                placeholder="ex: France, USA…"
                value={filters.country}
                onChange={(e) => set({ country: e.target.value })}
                className="h-7 text-[12px] bg-white/[0.04] border-white/[0.08] text-slate-200 focus:border-emerald-500/40"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
