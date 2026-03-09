"use client";

/**
 * 🎯 Elite Lead Scoring Dashboard (CSO) — thème clair
 */

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { ThinkingGlow } from "@/components/ui/thinking-glow";
import {
  Flame,
  ThermometerSun,
  Snowflake,
  Linkedin,
  Instagram,
  Facebook,
  MessageSquare,
  ExternalLink,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Loader2,
  Filter,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  getScoredProspectsForDashboard,
  getLeadScoringStats,
  prepareProspectOutreachAction,
  type ScoredProspectForDashboard,
} from "@/actions/cso-sales";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";

// ─── Composants UI ───────────────────────────────────────────────────────────

function TemperatureBadge({ temperature }: { temperature: string }) {
  const t = temperature?.toUpperCase() || "COLD";
  if (t === "HOT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
        <Flame className="h-3 w-3" />
        HOT
      </span>
    );
  }
  if (t === "WARM") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-600">
        <ThermometerSun className="h-3 w-3" />
        WARM
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
      <Snowflake className="h-3 w-3" />
      COLD
    </span>
  );
}

function PlatformIcon({ platform }: { platform: string | null }) {
  const p = (platform || "LINKEDIN").toUpperCase();
  if (p === "INSTAGRAM") return <Instagram className="h-4 w-4 text-pink-500" />;
  if (p === "FACEBOOK") return <Facebook className="h-4 w-4 text-blue-500" />;
  return <Linkedin className="h-4 w-4 text-sky-600" />;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LeadScoringDashboardPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ScoredProspectForDashboard[]>([]);
  const [stats, setStats] = useState<{
    hotCount: number;
    warmCount: number;
    coldCount: number;
    total: number;
    estimatedConversionRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterHighScore, setFilterHighScore] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [magicDmProspect, setMagicDmProspect] =
    useState<ScoredProspectForDashboard | null>(null);
  const [magicDmResult, setMagicDmResult] = useState<{
    recommendedMessage?: string;
    messagingLink?: string;
    strategy?: { hooks: string[] };
  } | null>(null);
  const [magicDmLoading, setMagicDmLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) setWorkspaceId(res.workspaceId);
    })();
  }, []);

  const loadData = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [prospectsRes, statsRes] = await Promise.all([
        getScoredProspectsForDashboard(workspaceId, {
          highScoreOnly: filterHighScore,
          platform: filterPlatform === "all" ? undefined : filterPlatform,
        }),
        getLeadScoringStats(workspaceId),
      ]);
      if (prospectsRes.success && prospectsRes.data) setProspects(prospectsRes.data);
      if (statsRes.success && statsRes.hotCount != null) {
        setStats({
          hotCount: statsRes.hotCount,
          warmCount: statsRes.warmCount ?? 0,
          coldCount: statsRes.coldCount ?? 0,
          total: statsRes.total ?? 0,
          estimatedConversionRate: statsRes.estimatedConversionRate ?? 0,
        });
      }
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId, filterHighScore, filterPlatform]);

  const openMagicDm = async (prospect: ScoredProspectForDashboard) => {
    setMagicDmProspect(prospect);
    setMagicDmResult(null);
    setMagicDmLoading(true);
    try {
      const result = await prepareProspectOutreachAction(prospect.id, {
        workspaceId: workspaceId!,
        runEnrichment: true,
        platform:
          (prospect.platform as "LINKEDIN" | "INSTAGRAM" | "FACEBOOK") || "LINKEDIN",
      });
      if (result.success && result.recommendedMessage) {
        setMagicDmResult({
          recommendedMessage: result.recommendedMessage,
          messagingLink: result.messagingLink,
          strategy: result.strategy ? { hooks: result.strategy.hooks } : undefined,
        });
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setMagicDmLoading(false);
    }
  };

  const profileUrl = (p: ScoredProspectForDashboard) =>
    p.linkedInUrl?.startsWith("http")
      ? p.linkedInUrl
      : `https://linkedin.com/in/${p.linkedInUrl}`;

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
                  <Target className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900">
                  Lead Scoring Dashboard
                </h1>
              </div>
              <p className="text-sm text-gray-500">
                Contacte en priorité les leads chauds — l&apos;IA a déjà trié pour toi.
              </p>
            </div>
            <Link href="/sales-os">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Retour Sales OS
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-stagger">
          {/* HOT */}
          <div className="group relative cursor-default overflow-hidden rounded-2xl border border-amber-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                <Flame className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Hot</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{stats?.hotCount ?? 0}</p>
            <p className="mt-0.5 text-xs text-gray-500">Prêts à signer</p>
          </div>

          {/* WARM */}
          <div className="group relative cursor-default overflow-hidden rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-red-500 shadow-sm">
                <ThermometerSun className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500">Warm</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{stats?.warmCount ?? 0}</p>
            <p className="mt-0.5 text-xs text-gray-500">À nourrir</p>
          </div>

          {/* TOTAL */}
          <div className="group relative cursor-default overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-400 to-gray-600 shadow-sm">
                <Users className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{stats?.total ?? 0}</p>
            <p className="mt-0.5 text-xs text-gray-500">Prospects</p>
          </div>

          {/* CONVERSION */}
          <div className="group relative cursor-default overflow-hidden rounded-2xl border border-violet-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Conv.</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-gray-900">
              {stats?.estimatedConversionRate ?? 0}%
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Qualité des leads</p>
          </div>
        </div>

        {/* ── Filtres ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-gray-400">
            <Filter className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Filtres</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={
              filterHighScore
                ? "h-8 rounded-full border border-amber-200 bg-amber-50 px-4 text-xs font-semibold text-amber-600 hover:bg-amber-100"
                : "h-8 rounded-full border border-gray-200 bg-white px-4 text-xs font-medium text-gray-500 hover:bg-gray-50"
            }
            onClick={() => setFilterHighScore(!filterHighScore)}
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            High Score ≥40
          </Button>
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="h-8 w-[170px] rounded-full border-gray-200 bg-white text-xs text-gray-600">
              <SelectValue placeholder="Plateforme" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 bg-white">
              <SelectItem value="all" className="text-xs">Toutes les plateformes</SelectItem>
              <SelectItem value="LINKEDIN" className="text-xs">LinkedIn</SelectItem>
              <SelectItem value="INSTAGRAM" className="text-xs">Instagram</SelectItem>
              <SelectItem value="FACEBOOK" className="text-xs">Facebook</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Tableau ── */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Tableau de chasse</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Tri par score. Clique sur Magic DM pour générer l&apos;accroche.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : prospects.length === 0 ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">Aucun prospect dans le pipeline.</p>
              <Link href="/sales-os/prospection">
                <Button className="mt-4 rounded-xl bg-violet-600 hover:bg-violet-700 shadow-sm">
                  Importer des leads
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Prospect
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Plateforme
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Interaction
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Score
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    AI Insight
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-gray-100 transition-colors hover:bg-gray-50/60"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-sm font-bold text-violet-600">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.company}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={p.platform} />
                        <span className="text-xs text-gray-500">{p.platform || "LINKEDIN"}</span>
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[200px]">
                      <p className="truncate text-xs text-gray-500" title={p.notes || undefined}>
                        {p.notes || (p.lastInteractionAt ? "Interaction récente" : "—")}
                      </p>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${
                              p.score > 80
                                ? "bg-gradient-to-r from-amber-400 to-orange-400"
                                : p.score >= 40
                                  ? "bg-gradient-to-r from-orange-400 to-yellow-400"
                                  : "bg-gray-300"
                            }`}
                            style={{ width: `${p.score}%` }}
                          />
                        </div>
                        <TemperatureBadge temperature={p.temperature} />
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[240px]">
                      <p className="truncate text-xs italic text-gray-400">
                        {p.aiSummary || p.suggestedHook || "—"}
                      </p>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl border-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:from-violet-500 hover:to-indigo-500"
                          onClick={() => openMagicDm(p)}
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          Magic DM
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          asChild
                        >
                          <a href={profileUrl(p)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Modal Magic DM ── */}
      <Dialog
        open={!!magicDmProspect}
        onOpenChange={(open) =>
          !open && (setMagicDmProspect(null), setMagicDmResult(null))
        }
      >
        <DialogContent className="max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-gray-900">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              Magic DM — {magicDmProspect?.name}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Accroche personnalisée prête à envoyer. Ouvre le lien pour écrire en un clic.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px]">
            <ThinkingGlow active={magicDmLoading} color="indigo" className="h-full">
              <div className="h-full p-1">
                {magicDmLoading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-10">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50">
                      <Sparkles className="h-7 w-7 animate-pulse text-violet-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">
                      L&apos;IA analyse le profil...
                    </p>
                  </div>
                ) : magicDmResult?.recommendedMessage ? (
                  <div className="animate-in fade-in space-y-4 duration-300">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Message recommandé
                      </p>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                          {magicDmResult.recommendedMessage}
                        </p>
                      </div>
                    </div>

                    {magicDmResult.messagingLink && (
                      <Button
                        asChild
                        className="w-full rounded-xl border-0 bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-sm hover:from-violet-500 hover:to-indigo-500"
                      >
                        <a
                          href={magicDmResult.messagingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Ouvrir la messagerie
                        </a>
                      </Button>
                    )}

                    {magicDmResult.strategy?.hooks &&
                      magicDmResult.strategy.hooks.length > 1 && (
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                            Autres accroches
                          </p>
                          <ul className="space-y-2">
                            {magicDmResult.strategy.hooks.slice(1).map((h, i) => (
                              <li key={i} className="flex gap-2.5 text-xs text-gray-500">
                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[10px] font-bold text-violet-500">
                                  {i + 2}
                                </span>
                                {h}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                ) : null}
              </div>
            </ThinkingGlow>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
