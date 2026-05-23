"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ViralPostCard } from "@/components/modules/social-veille/viral-post-card";
import { VeilleFilters, DEFAULT_FILTERS, type FilterState } from "@/components/modules/social-veille/veille-filters";
import { RefreshCw, TrendingUp, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { ViralPost } from "@prisma/client";

interface PostsResponse {
  posts: ViralPost[];
  total: number;
  page: number;
  limit: number;
}

export default function VeillePage() {
  const [posts, setPosts] = useState<ViralPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchPosts = useCallback(async (f: FilterState, p: number) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (f.platform) sp.set("platform", f.platform);
      if (f.hookType) sp.set("hookType", f.hookType);
      if (f.niche) sp.set("niche", f.niche);
      if (f.country) sp.set("country", f.country);
      if (f.minLikes) sp.set("minLikes", f.minLikes);
      if (f.minComments) sp.set("minComments", f.minComments);
      if (f.minViews) sp.set("minViews", f.minViews);
      if (f.sortBy) sp.set("sortBy", f.sortBy);
      if (f.bookmarkedOnly) sp.set("bookmarkedOnly", "true");
      sp.set("page", String(p));
      sp.set("limit", String(limit));

      const res = await fetch(`/api/social/veille?${sp}`);
      if (!res.ok) throw new Error();
      const data: PostsResponse = await res.json();
      setPosts(data.posts);
      setTotal(data.total);
    } catch {
      toast.error("Impossible de charger les posts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(filters, page);
  }, [filters, page, fetchPosts]);

  function handleFiltersChange(f: FilterState) {
    setFilters(f);
    setPage(1);
  }

  async function handleScrape() {
    setScraping(true);
    try {
      const res = await fetch("/api/social/veille/scrape", { method: "POST" });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Erreur lors du lancement du scrape"); return; }
      toast.success(data.message ?? "Scrape lancé — posts disponibles dans 1-2 min");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setScraping(false);
    }
  }


  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <h1 className="text-[20px] font-bold text-white">Veille Virale</h1>
          </div>
          <p className="text-[13px] text-slate-400">
            Les meilleurs posts LinkedIn & Twitter — inspire-toi pour créer du contenu viral.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[12px] gap-1.5 border border-white/[0.08] text-slate-400 hover:text-white"
            onClick={() => fetchPosts(filters, page)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button
            size="sm"
            className="h-8 text-[12px] gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
            onClick={handleScrape}
            disabled={scraping}
          >
            {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
            Scraper maintenant
          </Button>
        </div>
      </div>

      {/* Filters */}
      <VeilleFilters filters={filters} onChange={handleFiltersChange} />

      {/* Stats bar */}
      {!loading && total > 0 && (
        <p className="text-[12px] text-slate-500">
          {total.toLocaleString("fr-FR")} post{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}
          {filters.platform && ` · ${filters.platform === "LINKEDIN" ? "LinkedIn" : "Twitter / X"}`}
          {filters.niche && ` · niche "${filters.niche}"`}
          {filters.country && ` · ${filters.country}`}
          {filters.minLikes && ` · ≥ ${Number(filters.minLikes).toLocaleString()} likes`}
          {filters.minComments && ` · ≥ ${Number(filters.minComments).toLocaleString()} commentaires`}
          {filters.minViews && ` · ≥ ${Number(filters.minViews).toLocaleString()} vues`}
        </p>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <TrendingUp className="h-10 w-10 text-slate-600" />
          <div className="text-center space-y-1">
            <p className="text-[14px] font-semibold text-slate-400">Aucun post viral pour l&apos;instant</p>
            <p className="text-[12px] text-slate-600">
              Clique sur &quot;Scraper maintenant&quot; pour lancer une collecte,
              ou ajuste les filtres.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-[12px] gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 mt-2"
            onClick={handleScrape}
            disabled={scraping}
          >
            {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
            Scraper maintenant
          </Button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-full bg-white/[0.06]" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-32 bg-white/[0.06]" />
                  <Skeleton className="h-2.5 w-20 bg-white/[0.06]" />
                </div>
              </div>
              <Skeleton className="h-16 w-full bg-white/[0.06]" />
              <Skeleton className="h-3 w-48 bg-white/[0.06]" />
            </div>
          ))}
        </div>
      )}

      {/* Posts grid */}
      {!loading && posts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post) => (
            <ViralPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 border border-white/[0.08] text-slate-400 hover:text-white"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[12px] text-slate-400">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 border border-white/[0.08] text-slate-400 hover:text-white"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
