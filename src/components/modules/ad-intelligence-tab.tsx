"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  Flame,
  Sparkles,
  Palette,
  Copy,
  Filter,
  X,
  Eye,
  Heart,
  MessageCircle,
  Calendar,
  Globe,
  Briefcase,
  Download,
  LayoutGrid,
  Package,
  TrendingUp,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  getWorkspaceScrapedAds,
  searchCompetitorAds,
  runAdAnalysis,
  runAdRemix,
} from "@/actions/ads";
import { toast } from "sonner";
import { useCreditsContext } from "@/components/providers/credits-provider";
import Link from "next/link";
import type { AdPlatform } from "@/lib/services/ads/intelligence";

type ScrapedAd = {
  id: string;
  platform: string;
  advertiserName: string;
  advertiserDomain?: string | null;
  industry?: string | null;
  adContent: string;
  mediaUrl: string | null;
  isActive: boolean;
  daysActive: number;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  hook: string | null;
  framework: string | null;
  visualAnalysis: string | null;
  colors: string[];
  efficiencyScore: number | null;
};

type AdFilters = {
  domain: string;
  industry: string;
  minViews: string;
  maxViews: string;
  minLikes: string;
  maxLikes: string;
  minComments: string;
  maxComments: string;
  minDaysActive: string;
  maxDaysActive: string;
};

const INDUSTRIES_OPTIONS = [
  "Tech / SaaS",
  "E-commerce",
  "Finance",
  "Santé",
  "Formation",
  "Luxe",
  "Tous",
];

const PLATFORMS: { value: AdPlatform; label: string }[] = [
  { value: "META", label: "Meta (Facebook / Instagram)" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "PINTEREST", label: "Pinterest" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

const TARGET_NETWORKS = [
  { value: "META_AD", label: "Meta Ads" },
  { value: "TIKTOK_AD", label: "TikTok Ad" },
  { value: "PINTEREST_AD", label: "Pinterest Ad" },
  { value: "LINKEDIN_POST", label: "LinkedIn Post" },
];

interface AdIntelligenceTabProps {
  workspaceId: string;
}

export function AdIntelligenceTab({ workspaceId }: AdIntelligenceTabProps) {
  const { isDepleted } = useCreditsContext();
  const [ads, setAds] = useState<ScrapedAd[]>([]);
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState<AdPlatform>("META");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAd, setSelectedAd] = useState<ScrapedAd | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixTarget, setRemixTarget] = useState("META_AD");
  const [remixResult, setRemixResult] = useState<{
    generatedScript: string;
    visualBrief: string;
    targetNetwork: string;
  } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"annonces" | "produits">("annonces");
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [filters, setFilters] = useState<AdFilters>({
    domain: "",
    industry: "Tous",
    minViews: "",
    maxViews: "",
    minLikes: "",
    maxLikes: "",
    minComments: "",
    maxComments: "",
    minDaysActive: "",
    maxDaysActive: "",
  });

  const filteredAds = (() => {
    let list = ads;
    const d = filters.domain.trim().toLowerCase();
    if (d) list = list.filter((a) => (a.advertiserDomain ?? "").toLowerCase().includes(d));
    if (filters.industry && filters.industry !== "Tous")
      list = list.filter((a) => (a.industry ?? "") === filters.industry);
    const minV = filters.minViews.trim() ? parseInt(filters.minViews, 10) : null;
    const maxV = filters.maxViews.trim() ? parseInt(filters.maxViews, 10) : null;
    if (minV != null && !Number.isNaN(minV)) list = list.filter((a) => (a.viewCount ?? 0) >= minV);
    if (maxV != null && !Number.isNaN(maxV)) list = list.filter((a) => (a.viewCount ?? 0) <= maxV);
    const minL = filters.minLikes.trim() ? parseInt(filters.minLikes, 10) : null;
    const maxL = filters.maxLikes.trim() ? parseInt(filters.maxLikes, 10) : null;
    if (minL != null && !Number.isNaN(minL)) list = list.filter((a) => (a.likeCount ?? 0) >= minL);
    if (maxL != null && !Number.isNaN(maxL)) list = list.filter((a) => (a.likeCount ?? 0) <= maxL);
    const minC = filters.minComments.trim() ? parseInt(filters.minComments, 10) : null;
    const maxC = filters.maxComments.trim() ? parseInt(filters.maxComments, 10) : null;
    if (minC != null && !Number.isNaN(minC)) list = list.filter((a) => (a.commentCount ?? 0) >= minC);
    if (maxC != null && !Number.isNaN(maxC)) list = list.filter((a) => (a.commentCount ?? 0) <= maxC);
    const minD = filters.minDaysActive.trim() ? parseInt(filters.minDaysActive, 10) : null;
    const maxD = filters.maxDaysActive.trim() ? parseInt(filters.maxDaysActive, 10) : null;
    if (minD != null && !Number.isNaN(minD)) list = list.filter((a) => a.daysActive >= minD);
    if (maxD != null && !Number.isNaN(maxD)) list = list.filter((a) => a.daysActive <= maxD);
    return list;
  })();

  useEffect(() => {
    getWorkspaceScrapedAds(workspaceId).then((res) => {
      if (res.success && res.data) setAds(res.data as ScrapedAd[]);
    });
  }, [workspaceId]);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      toast.error("Saisissez un mot-clé");
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchCompetitorAds(workspaceId, keyword.trim(), platform);
      if (!result.success) {
        toast.error(result.error || "Erreur lors de la recherche");
        return;
      }
      const list = Array.isArray(result.data) ? result.data : [];
      if (list.length === 0) {
        toast.info("Aucune publicité trouvée. Essayez un autre mot-clé ou une autre plateforme.");
        return;
      }
      setAds((prev) => {
        const existingIds = new Set(list.map((a) => a.id));
        const kept = prev.filter((a) => !existingIds.has(a.id));
        return [...(list as ScrapedAd[]), ...kept];
      });
      if ("warning" in result && result.warning) {
        toast.warning(result.warning as string, { duration: 6000 });
      }
      toast.success(`${list.length} publicité(s) récupérée(s)`);
    } catch {
      toast.error("Erreur lors de la recherche");
    } finally {
      setIsSearching(false);
    }
  };

  const openModal = (ad: ScrapedAd) => {
    setSelectedAd(ad);
    setRemixResult(null);
    setModalOpen(true);
    if (!ad.hook) {
      if (isDepleted) {
        toast.error("Crédits épuisés. Passez à un plan supérieur pour lancer l'analyse IA.");
        return;
      }
      setIsAnalyzing(true);
      runAdAnalysis(workspaceId, ad.id)
        .then((res) => {
          if (res.success && res.data?.ad) {
            setSelectedAd((prev) => (prev ? { ...prev, ...res.data!.ad } : null));
          } else if (!res.success) {
            toast.error(res.error || "Analyse impossible");
          }
        })
        .finally(() => setIsAnalyzing(false));
    }
  };

  const handleRemix = async () => {
    if (!selectedAd) return;
    setIsRemixing(true);
    setRemixResult(null);
    try {
      const result = await runAdRemix(workspaceId, selectedAd.id, remixTarget);
      if (result.success && result.data) {
        setRemixResult(result.data);
        toast.success("Brief créatif généré");
      } else {
        toast.error(result.error || "Erreur lors du remix");
      }
    } catch {
      toast.error("Erreur lors du remix");
    } finally {
      setIsRemixing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié dans le presse-papiers");
  };

  const isWinner = (ad: ScrapedAd) => ad.daysActive >= 30;

  const adPlaceholderStyle = (ad: ScrapedAd) => {
    const n = ad.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const hue = n % 360;
    return {
      background: `linear-gradient(135deg, hsl(${hue}, 55%, 45%), hsl(${(hue + 40) % 360}, 45%, 30%)`,
      color: "white",
    };
  };
  const adInitial = (ad: ScrapedAd) => (ad.advertiserName || "A").charAt(0).toUpperCase();

  const topByEngagement = [...filteredAds]
    .sort((a, b) => (b.viewCount ?? 0) + (b.likeCount ?? 0) * 10 - ((a.viewCount ?? 0) + (a.likeCount ?? 0) * 10))
    .slice(0, 10);

  const productViewList = (() => {
    const byDomain = new Map<string, ScrapedAd>();
    for (const ad of filteredAds) {
      const key = ad.advertiserDomain || ad.advertiserName || ad.id;
      const existing = byDomain.get(key);
      if (!existing || (ad.viewCount ?? 0) > (existing.viewCount ?? 0)) byDomain.set(key, ad);
    }
    return Array.from(byDomain.values()).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  })();

  const displayList = viewMode === "produits" ? productViewList : filteredAds;

  const resetFilters = () =>
    setFilters({
      domain: "",
      industry: "Tous",
      minViews: "",
      maxViews: "",
      minLikes: "",
      maxLikes: "",
      minComments: "",
      maxComments: "",
      minDaysActive: "",
      maxDaysActive: "",
    });

  const downloadCreative = async (ad: ScrapedAd, options?: { filename?: string; silent?: boolean }) => {
    if (!ad.mediaUrl) {
      if (!options?.silent) toast.error("Aucune créative à télécharger");
      return;
    }
    try {
      const res = await fetch(ad.mediaUrl, { mode: "cors" });
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const ext = blob.type.includes("video") ? "mp4" : "jpg";
      const name = options?.filename || `crea-${ad.platform}-${ad.advertiserName.replace(/\s+/g, "-")}-${ad.id.slice(-6)}.${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      if (!options?.silent) toast.success("Créative téléchargée");
    } catch {
      if (!options?.silent) {
        window.open(ad.mediaUrl!, "_blank");
        toast.info("Ouverture dans un nouvel onglet (téléchargement direct non possible)");
      }
    }
  };

  const downloadAllCreatives = async () => {
    const withMedia = filteredAds.filter((a) => a.mediaUrl);
    if (withMedia.length === 0) {
      toast.error("Aucune créative à télécharger");
      return;
    }
    setIsDownloadingAll(true);
    let done = 0;
    for (let i = 0; i < withMedia.length; i++) {
      const ad = withMedia[i];
      try {
        await downloadCreative(ad, {
          filename: `crea-${i + 1}-${ad.advertiserName.replace(/\s+/g, "-")}.jpg`,
          silent: true,
        });
        done++;
      } catch {
        // skip
      }
    }
    setIsDownloadingAll(false);
    if (done > 0) toast.success(`${done} créative(s) téléchargée(s)`);
  };

  return (
    <div className="space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. L&apos;analyse IA et le remix créatif sont désactivés.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* Pépites du jour */}
      {ads.length > 0 && topByEngagement.length > 0 && (
        <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
              <TrendingUp className="h-5 w-5 text-amber-600" />
              Découvrez les pépites du jour
            </CardTitle>
            <CardDescription className="text-gray-600">
              Top {topByEngagement.length} annonces par engagement. Soyez premier sur les tendances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {topByEngagement.map((ad) => (
                <Card
                  key={ad.id}
                  className="min-w-[140px] shrink-0 cursor-pointer overflow-hidden border-gray-200/60 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
                  onClick={() => openModal(ad)}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100">
                    {ad.mediaUrl ? (
                      <>
                        <img
                          src={ad.mediaUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fb = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fb) fb.classList.remove("hidden");
                          }}
                        />
                        <div
                          className="hidden absolute inset-0 flex items-center justify-center text-2xl font-bold"
                          style={adPlaceholderStyle(ad)}
                        >
                          {adInitial(ad)}
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-bold" style={adPlaceholderStyle(ad)}>
                        {adInitial(ad)}
                      </div>
                    )}
                    {isWinner(ad) && (
                      <Badge className="absolute right-1 top-1 border-0 bg-amber-500 px-1.5 py-0 text-[10px] text-white">
                        Winner
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="truncate text-xs font-medium text-gray-700">{ad.advertiserName}</p>
                    <p className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Eye className="h-3 w-3" />
                      {(ad.viewCount ?? 0) >= 1000 ? `${((ad.viewCount ?? 0) / 1000).toFixed(1)}k` : ad.viewCount}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card className="overflow-hidden border-gray-200/60 bg-white/70 shadow-sm backdrop-blur-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2.5 text-lg text-gray-900">
            <Search className="h-5 w-5 text-violet-600" />
            Parcourir les annonces
            <Badge variant="secondary" className="font-normal text-violet-600">AI Magic Search</Badge>
          </CardTitle>
          <CardDescription className="text-gray-500">
            Bibliothèques Meta, TikTok, Pinterest, LinkedIn. Mot-clé + plateforme : annonces actives privilégiées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Ex: logiciel CRM, formation marketing..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 rounded-xl border-gray-200 bg-white/80 text-gray-900 placeholder:text-gray-400 focus:border-violet-500"
            />
            <Select value={platform} onValueChange={(v) => setPlatform(v as AdPlatform)}>
              <SelectTrigger className="w-full sm:w-[220px] rounded-xl border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold shadow-md hover:from-violet-700 hover:to-fuchsia-700"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Rechercher</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtres */}
      {ads.length > 0 && !isSearching && (
        <Card className="overflow-hidden border-gray-200/60 bg-white/70 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50/80 transition-colors"
          >
            <span className="flex items-center gap-2 font-medium text-gray-900">
              <Filter className="h-5 w-5 text-violet-600" />
              Filtres
              {filteredAds.length !== ads.length && (
                <Badge variant="secondary" className="ml-1">
                  {filteredAds.length} / {ads.length}
                </Badge>
              )}
            </span>
            <span className="text-sm text-gray-500">{filtersOpen ? "Réduire" : "Afficher"}</span>
          </button>
          {filtersOpen && (
            <CardContent className="border-t border-gray-100 pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Globe className="h-3.5 w-3.5" /> Domaine
                  </Label>
                  <Input
                    placeholder="ex: brand.com"
                    value={filters.domain}
                    onChange={(e) => setFilters((f) => ({ ...f, domain: e.target.value }))}
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Briefcase className="h-3.5 w-3.5" /> Industrie
                  </Label>
                  <Select value={filters.industry} onValueChange={(v) => setFilters((f) => ({ ...f, industry: v }))}>
                    <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Eye className="h-3.5 w-3.5" /> Vues (min – max)
                  </Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" min={0} value={filters.minViews} onChange={(e) => setFilters((f) => ({ ...f, minViews: e.target.value }))} className="h-9 rounded-lg text-sm" />
                    <Input type="number" placeholder="Max" min={0} value={filters.maxViews} onChange={(e) => setFilters((f) => ({ ...f, maxViews: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Heart className="h-3.5 w-3.5" /> Likes (min – max)
                  </Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" min={0} value={filters.minLikes} onChange={(e) => setFilters((f) => ({ ...f, minLikes: e.target.value }))} className="h-9 rounded-lg text-sm" />
                    <Input type="number" placeholder="Max" min={0} value={filters.maxLikes} onChange={(e) => setFilters((f) => ({ ...f, maxLikes: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <MessageCircle className="h-3.5 w-3.5" /> Commentaires (min – max)
                  </Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" min={0} value={filters.minComments} onChange={(e) => setFilters((f) => ({ ...f, minComments: e.target.value }))} className="h-9 rounded-lg text-sm" />
                    <Input type="number" placeholder="Max" min={0} value={filters.maxComments} onChange={(e) => setFilters((f) => ({ ...f, maxComments: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Calendar className="h-3.5 w-3.5" /> Ancienneté – Jours (min – max)
                  </Label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Min" min={0} value={filters.minDaysActive} onChange={(e) => setFilters((f) => ({ ...f, minDaysActive: e.target.value }))} className="h-9 rounded-lg text-sm" />
                    <Input type="number" placeholder="Max" min={0} value={filters.maxDaysActive} onChange={(e) => setFilters((f) => ({ ...f, maxDaysActive: e.target.value }))} className="h-9 rounded-lg text-sm" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={resetFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Réinitialiser les filtres
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Spy Wall */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">The Spy Wall</h2>
            {ads.length > 0 && (
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("annonces")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "annonces" ? "bg-white text-violet-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Annonces
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("produits")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "produits" ? "bg-white text-violet-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                >
                  <Package className="h-4 w-4" />
                  Produits
                </button>
              </div>
            )}
          </div>
          {ads.length > 0 && !isSearching && (
            <div className="flex items-center gap-2">
              {filteredAds.length !== ads.length && (
                <span className="text-sm text-gray-500">
                  {displayList.length} résultat{displayList.length !== 1 ? "s" : ""} (sur {ads.length})
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={downloadAllCreatives}
                disabled={isDownloadingAll || filteredAds.filter((a) => a.mediaUrl).length === 0}
              >
                {isDownloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1">Télécharger les créatives</span>
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setAds([])}>
                Vider la liste
              </Button>
            </div>
          )}
        </div>

        {isSearching ? (
          <Card className="border-gray-200/60 bg-white/70 py-16 text-center backdrop-blur-sm">
            <CardContent>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-500" />
              <p className="mt-3 text-gray-600 font-medium">Recherche en cours...</p>
            </CardContent>
          </Card>
        ) : ads.length === 0 ? (
          <Card className="border-gray-200/60 bg-white/70 py-16 text-center backdrop-blur-sm">
            <CardContent>
              <Flame className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-gray-500">Lancez une recherche pour afficher les publicités.</p>
              <p className="mt-1 text-sm text-gray-400">Saisissez un mot-clé ci-dessus et cliquez sur Rechercher.</p>
            </CardContent>
          </Card>
        ) : filteredAds.length === 0 ? (
          <Card className="border-gray-200/60 bg-white/70 py-12 text-center backdrop-blur-sm">
            <CardContent>
              <Filter className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-gray-600 font-medium">Aucun résultat avec ces filtres</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 rounded-lg" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4" style={{ columnFill: "balance" }}>
            {displayList.map((ad) => (
              <Card
                key={ad.id}
                className="mb-4 break-inside-avoid cursor-pointer overflow-hidden border-gray-200/60 bg-white/70 shadow-sm backdrop-blur-sm transition-all hover:border-violet-300/60 hover:shadow-md"
                onClick={() => openModal(ad)}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100">
                  {ad.mediaUrl ? (
                    <img
                      src={ad.mediaUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.classList.remove("hidden");
                      }}
                    />
                  ) : null}
                  <div
                    className={`flex h-full w-full items-center justify-center text-4xl font-bold ${ad.mediaUrl ? "hidden absolute inset-0" : ""}`}
                    style={adPlaceholderStyle(ad)}
                  >
                    {adInitial(ad)}
                  </div>
                  {isWinner(ad) && (
                    <Badge className="absolute right-2 top-2 border-0 bg-amber-500 text-white shadow-md" title="Annonce active depuis 30+ jours">
                      <Flame className="mr-1 h-3 w-3" />
                      Winner
                    </Badge>
                  )}
                  {ad.efficiencyScore != null && (
                    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                      Score {ad.efficiencyScore}
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-xs font-medium text-gray-700">{ad.advertiserName}</p>
                  {(ad.advertiserDomain || ad.industry) && (
                    <p className="truncate text-xs text-gray-500">
                      {[ad.advertiserDomain, ad.industry].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs text-gray-500">{ad.adContent}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400">
                    <span>{ad.daysActive} j</span>
                    {ad.viewCount != null && (
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-3 w-3" />
                        {ad.viewCount >= 1000 ? `${(ad.viewCount / 1000).toFixed(1)}k` : ad.viewCount}
                      </span>
                    )}
                    {ad.likeCount != null && (
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-3 w-3" />
                        {ad.likeCount >= 1000 ? `${(ad.likeCount / 1000).toFixed(1)}k` : ad.likeCount}
                      </span>
                    )}
                    {ad.commentCount != null && (
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="h-3 w-3" />
                        {ad.commentCount >= 1000 ? `${(ad.commentCount / 1000).toFixed(1)}k` : ad.commentCount}
                      </span>
                    )}
                    <span>{ad.platform}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Analyse + Remix */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          showCloseButton={true}
          className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-xl border-gray-200 bg-white p-0 shadow-xl"
        >
          <DialogHeader className="border-b border-gray-100 p-4">
            <DialogTitle className="text-gray-900">
              Analyse & Remix — {selectedAd?.advertiserName}
            </DialogTitle>
          </DialogHeader>
          {selectedAd && (
            <div className="grid min-h-[400px] grid-cols-1 md:grid-cols-2">
              <div className="border-r border-gray-100 bg-gray-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">Créa originale</h4>
                  {selectedAd.mediaUrl && (
                    <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => downloadCreative(selectedAd)}>
                      <Download className="h-4 w-4 mr-1" />
                      Télécharger
                    </Button>
                  )}
                </div>
                {selectedAd.mediaUrl && (
                  <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-lg bg-gray-200">
                    <img src={selectedAd.mediaUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm text-gray-700">{selectedAd.adContent}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {selectedAd.advertiserName} · {selectedAd.daysActive} jours actif · {selectedAd.platform}
                </p>
              </div>

              <div className="flex flex-col p-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">Analyse IA</h4>
                {isAnalyzing ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  </div>
                ) : selectedAd.hook || selectedAd.visualAnalysis ? (
                  <div className="space-y-3 text-sm">
                    {selectedAd.hook && (
                      <div>
                        <span className="font-medium text-gray-600">Hook :</span>
                        <p className="text-gray-800">{selectedAd.hook}</p>
                      </div>
                    )}
                    {selectedAd.framework && (
                      <div>
                        <span className="font-medium text-gray-600">Framework :</span>
                        <Badge variant="outline" className="ml-1">{selectedAd.framework}</Badge>
                      </div>
                    )}
                    {selectedAd.visualAnalysis && (
                      <div>
                        <span className="font-medium text-gray-600">Visuel :</span>
                        <p className="text-gray-800">{selectedAd.visualAnalysis}</p>
                      </div>
                    )}
                    {selectedAd.colors?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <Palette className="h-4 w-4 text-gray-500" />
                        {selectedAd.colors.map((c, i) => (
                          <span
                            key={i}
                            className="rounded px-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: c.startsWith("#") ? c : undefined,
                              color: c.startsWith("#") ? "#fff" : undefined,
                              border: c.startsWith("#") ? "none" : "1px solid #e5e7eb",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Lancez l&apos;analyse pour remplir cette section (20 crédits).</p>
                )}

                {!remixResult ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Select value={remixTarget} onValueChange={setRemixTarget}>
                        <SelectTrigger className="w-[180px] rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TARGET_NETWORKS.map((n) => (
                            <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleRemix}
                        disabled={isRemixing || isDepleted}
                        title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                        className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold"
                      >
                        {isRemixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        <span className="ml-2">Remixer pour ma marque</span>
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Génère un script et un brief visuel inspirés de la structure, adaptés à votre Brand Voice (15 crédits).
                    </p>
                  </>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-semibold text-gray-700">Script généré</h4>
                    <div className="relative rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                      <Button size="sm" variant="ghost" className="absolute right-2 top-2 h-8 w-8 p-0" onClick={() => copyToClipboard(remixResult.generatedScript)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <p className="whitespace-pre-wrap pr-8">{remixResult.generatedScript}</p>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-700">Brief visuel</h4>
                    <div className="relative rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                      <Button size="sm" variant="ghost" className="absolute right-2 top-2 h-8 w-8 p-0" onClick={() => copyToClipboard(remixResult.visualBrief)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <p className="whitespace-pre-wrap pr-8">{remixResult.visualBrief}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
