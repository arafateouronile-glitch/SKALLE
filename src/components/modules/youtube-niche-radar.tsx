"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Youtube,
  Loader2,
  TrendingUp,
  Users,
  Play,
  Lightbulb,
  Target,
  ChevronRight,
  ExternalLink,
  Sparkles,
  BarChart3,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NicheResearchResult, TopCreator, TopVideo, SubNiche } from "@/lib/services/social/youtube-niche-research";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function gradeColor(grade: string) {
  if (grade === "A") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (grade === "B") return "text-blue-600 bg-blue-50 border-blue-200";
  if (grade === "C") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function competitionColor(c: string) {
  if (c === "FAIBLE") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (c === "MODÉRÉE") return "text-amber-600 bg-amber-50 border-amber-200";
  if (c === "ÉLEVÉE") return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function potentialDot(p: SubNiche["potential"]) {
  if (p === "HIGH") return "bg-emerald-500";
  if (p === "MEDIUM") return "bg-amber-400";
  return "bg-gray-300";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-blue-500" : score >= 35 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="space-y-1.5">
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CreatorCard({ creator }: { creator: TopCreator }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
        {creator.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={creator.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-semibold text-gray-800 hover:text-red-600 truncate flex items-center gap-1"
        >
          {creator.name}
          <ExternalLink className="h-2.5 w-2.5 text-gray-300 flex-shrink-0" />
        </a>
        <p className="text-[11px] text-gray-400 truncate">{creator.description || "—"}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-[12px] font-bold text-gray-700">{fmt(creator.subscribers)}</span>
        <span className="text-[10px] text-gray-400">{creator.engagementRate}% eng.</span>
      </div>
    </div>
  );
}

function VideoRow({ video }: { video: TopVideo }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        {video.isShort ? (
          <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-200 px-1 py-0">
            SHORT
          </Badge>
        ) : (
          <Play className="h-3.5 w-3.5 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={video.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-gray-700 hover:text-red-600 line-clamp-2 leading-tight"
        >
          {video.title}
        </a>
        <p className="text-[10px] text-gray-400 mt-0.5">{video.channelTitle}</p>
      </div>
      <span className="text-[12px] font-semibold text-gray-600 flex-shrink-0">
        {fmt(video.views)}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const REGIONS = [
  { value: "FR", label: "🇫🇷 France" },
  { value: "US", label: "🇺🇸 États-Unis" },
  { value: "GB", label: "🇬🇧 Royaume-Uni" },
  { value: "CA", label: "🇨🇦 Canada" },
  { value: "BE", label: "🇧🇪 Belgique" },
  { value: "CH", label: "🇨🇭 Suisse" },
];

export function YoutubeNicheRadar() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("FR");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NicheResearchResult | null>(null);

  async function analyze() {
    if (!topic.trim()) { toast.error("Entre une niche à analyser"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/social/niche-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), region }),
      });
      const data = await res.json() as NicheResearchResult & { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Erreur"); return; }
      setResult(data);
    } catch { toast.error("Erreur réseau"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <Card className="bg-white/80 border-gray-200/60">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Youtube className="h-5 w-5 text-red-500" />
              <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap">Niche à analyser</span>
            </div>
            <Input
              placeholder="ex: finance personnelle, productivité, marketing digital…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && void analyze()}
              className="flex-1 h-9 text-[13px]"
            />
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-36 h-9 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-[12px]">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={analyze}
              disabled={loading || !topic.trim()}
              className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white whitespace-nowrap"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {loading ? "Analyse…" : "Analyser"}
            </Button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 ml-0">
            Analyse les top créateurs et vidéos YouTube pour valider la viabilité d'une niche.
          </p>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative">
            <Youtube className="h-10 w-10 text-red-500 animate-pulse" />
          </div>
          <p className="text-[13px] text-gray-500">Scan YouTube en cours — analyse des créateurs et vidéos…</p>
          <p className="text-[11px] text-gray-400">Environ 10-15 secondes</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-5">

          {/* Score card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Viability */}
            <Card className="bg-white/80 border-gray-200/60 sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] text-gray-500 font-medium">Score viabilité</p>
                  <span className={cn(
                    "text-xl font-black px-2.5 py-0.5 rounded-lg border",
                    gradeColor(result.viabilityGrade)
                  )}>
                    {result.viabilityGrade}
                  </span>
                </div>
                <p className="text-3xl font-black text-gray-900 mb-2">{result.viabilityScore}<span className="text-lg text-gray-400">/100</span></p>
                <ScoreBar score={result.viabilityScore} />
              </CardContent>
            </Card>

            {/* Summary + competition */}
            <Card className="bg-white/80 border-gray-200/60 sm:col-span-2">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <p className="text-[12px] font-medium text-gray-500">Analyse Claude</p>
                  <Badge className={cn("ml-auto text-[10px] border", competitionColor(result.competition))}>
                    Compétition {result.competition}
                  </Badge>
                </div>
                <p className="text-[13px] text-gray-700 leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-[11px] text-gray-500">{result.topCreators.length} créateurs analysés</span>
                  <span className="text-[11px] text-gray-300">·</span>
                  <span className="text-[11px] text-gray-500">{result.topVideos.length} vidéos analysées</span>
                  <span className="text-[11px] text-gray-300">·</span>
                  <span className="text-[11px] text-gray-500">Région : {result.region}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left column */}
            <div className="lg:col-span-2 space-y-4">

              {/* Sub-niches */}
              {result.subNiches.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Target className="h-4 w-4 text-violet-500" />
                      Sous-niches détectées
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2.5">
                    {result.subNiches.map((sn, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", potentialDot(sn.potential))} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-gray-800">{sn.name}</p>
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border",
                              sn.potential === "HIGH" ? "text-emerald-600 border-emerald-200" :
                              sn.potential === "MEDIUM" ? "text-amber-600 border-amber-200" : "text-gray-400 border-gray-200"
                            )}>
                              {sn.potential}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">{sn.reason}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Key insights */}
              {result.keyInsights.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Insights clés
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {result.keyInsights.map((ins, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight className="h-3.5 w-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[12px] text-gray-700">{ins}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Best formats */}
              {result.bestFormats.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Zap className="h-4 w-4 text-blue-500" />
                      Formats qui performent
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {result.bestFormats.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Badge variant="outline" className="text-[10px] mt-0.5 flex-shrink-0 border-blue-200 text-blue-600">
                          {f.format}
                        </Badge>
                        <p className="text-[12px] text-gray-600">{f.why}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Entry strategy */}
              {result.entryStrategy && (
                <Card className="bg-violet-50/60 border-violet-200/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-violet-700 mb-1">Stratégie d'entrée recommandée</p>
                      <p className="text-[13px] text-violet-800">{result.entryStrategy}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Top creators */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                    <Users className="h-4 w-4 text-red-500" />
                    Top créateurs ({result.topCreators.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  {result.topCreators.slice(0, 8).map((c) => (
                    <CreatorCard key={c.channelId} creator={c} />
                  ))}
                </CardContent>
              </Card>

              {/* Top videos */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                    <Play className="h-4 w-4 text-red-500" />
                    Top vidéos ({result.topVideos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  {result.topVideos.slice(0, 8).map((v) => (
                    <VideoRow key={v.videoId} video={v} />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
