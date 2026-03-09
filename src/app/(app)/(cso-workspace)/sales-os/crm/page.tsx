"use client";

/**
 * CRM Pipeline — Light theme
 * Kanban + Drag & Drop + Source filters + Relance intelligente
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Linkedin,
  Instagram,
  Facebook,
  Loader2,
  MessageCircle,
  RefreshCw,
  GripVertical,
  TrendingUp,
  AlertCircle,
  Radio,
  MapPin,
  Building2,
  Flame,
  Thermometer,
  Snowflake,
  Globe,
  Users,
  LayoutGrid,
} from "lucide-react";
import {
  getProspectsForCrm,
  getRelanceLeads,
  updateProspectStatusAction,
  type CRMSourceFilter,
  type ProspectForCrm,
  type ProspectStatusPipeline,
} from "@/actions/crm";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Config ──────────────────────────────────────────────────────────────────

const SOURCE_TABS: {
  value: CRMSourceFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { value: "all", label: "Tous", icon: <LayoutGrid className="h-3.5 w-3.5" />, color: "text-gray-400" },
  { value: "JOB_BOARD_SIGNAL", label: "Signaux", icon: <Radio className="h-3.5 w-3.5" />, color: "text-violet-500" },
  { value: "LOCAL_MAPS", label: "Local", icon: <MapPin className="h-3.5 w-3.5" />, color: "text-amber-500" },
  { value: "NEW_COMPANY_REGISTRY", label: "Registre", icon: <Building2 className="h-3.5 w-3.5" />, color: "text-emerald-500" },
  { value: "LINKEDIN", label: "LinkedIn", icon: <Linkedin className="h-3.5 w-3.5" />, color: "text-sky-500" },
  { value: "FACEBOOK_GROUP", label: "Facebook", icon: <Facebook className="h-3.5 w-3.5" />, color: "text-blue-500" },
  { value: "INSTAGRAM_HASHTAG", label: "Instagram", icon: <Instagram className="h-3.5 w-3.5" />, color: "text-pink-500" },
];

const PIPELINE_COLUMNS: {
  status: ProspectStatusPipeline;
  label: string;
  accent: string;
  headerBg: string;
  dot: string;
  dropBg: string;
}[] = [
  {
    status: "NEW",
    label: "Nouveaux",
    accent: "border-gray-200",
    headerBg: "bg-gray-100",
    dot: "bg-gray-400",
    dropBg: "border-gray-400 bg-gray-100",
  },
  {
    status: "CONTACTED",
    label: "Contactés",
    accent: "border-amber-200",
    headerBg: "bg-amber-50",
    dot: "bg-amber-400",
    dropBg: "border-amber-400 bg-amber-50",
  },
  {
    status: "REPLIED",
    label: "En Discussion",
    accent: "border-violet-200",
    headerBg: "bg-violet-50",
    dot: "bg-violet-400",
    dropBg: "border-violet-400 bg-violet-50",
  },
  {
    status: "CONVERTED",
    label: "Gagnés",
    accent: "border-emerald-200",
    headerBg: "bg-emerald-50",
    dot: "bg-emerald-400",
    dropBg: "border-emerald-400 bg-emerald-50",
  },
  {
    status: "REJECTED",
    label: "Perdus",
    accent: "border-red-200",
    headerBg: "bg-red-50",
    dot: "bg-red-400",
    dropBg: "border-red-300 bg-red-50",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date | null) {
  if (!d) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `J-${diff}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function SourceIcon({ source, platform }: { source: string | null; platform: string | null }) {
  const s = (source || platform || "").toUpperCase();
  if (s === "JOB_BOARD_SIGNAL") return <Radio className="h-3 w-3 text-violet-500" />;
  if (s === "LOCAL_MAPS") return <MapPin className="h-3 w-3 text-amber-500" />;
  if (s === "NEW_COMPANY_REGISTRY") return <Building2 className="h-3 w-3 text-emerald-500" />;
  if (s === "SEO_INBOUND") return <Globe className="h-3 w-3 text-teal-500" />;
  if (s.includes("INSTAGRAM")) return <Instagram className="h-3 w-3 text-pink-500" />;
  if (s.includes("FACEBOOK")) return <Facebook className="h-3 w-3 text-blue-500" />;
  return <Linkedin className="h-3 w-3 text-sky-500" />;
}

function TemperatureIcon({ temp }: { temp: string }) {
  if (temp === "HOT") return <Flame className="h-3 w-3 text-red-400" />;
  if (temp === "WARM") return <Thermometer className="h-3 w-3 text-amber-400" />;
  return <Snowflake className="h-3 w-3 text-blue-300" />;
}

// ─── Prospect Card ────────────────────────────────────────────────────────────

function ProspectCard({
  p,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  p: ProspectForCrm;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const date = formatDate(p.lastInteractionAt);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("prospectId", p.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-xl border bg-white p-3 cursor-grab active:cursor-grabbing transition-all duration-150",
        "hover:bg-gray-50 hover:border-gray-300 hover:shadow-md hover:shadow-gray-200/80",
        isDragging
          ? "opacity-40 scale-95 border-gray-300"
          : "border-gray-200"
      )}
    >
      {/* Top row: drag handle + name + temp */}
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-gray-400 shrink-0 mt-0.5 transition-colors" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
            <TemperatureIcon temp={p.temperature} />
          </div>

          {/* Company + job title */}
          <p className="text-[11px] text-gray-500 truncate mt-0.5">
            {p.company}
            {p.jobTitle && (
              <span className="text-gray-400"> · {p.jobTitle}</span>
            )}
          </p>

          {/* Score bar */}
          {p.score > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    p.score >= 80
                      ? "bg-red-500"
                      : p.score >= 40
                      ? "bg-amber-500"
                      : "bg-gray-300"
                  )}
                  style={{ width: `${Math.min(p.score, 100)}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-gray-400 w-6 text-right">
                {p.score}
              </span>
            </div>
          )}

          {/* Meta row */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <SourceIcon source={p.source} platform={p.platform} />
            </span>
            {p.value != null && p.value > 0 && (
              <span className="text-[10px] font-semibold text-emerald-600 tabular-nums">
                {p.value.toLocaleString("fr-FR")} €
              </span>
            )}
            {date && (
              <span className="text-[10px] text-gray-400 ml-auto tabular-nums">{date}</span>
            )}
          </div>

          {/* Reply link */}
          <Link
            href={`/sales-os/reply-assistant?prospectId=${p.id}`}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="h-3 w-3" />
            Répondre
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ProspectForCrm[]>([]);
  const [relanceLeads, setRelanceLeads] = useState<ProspectForCrm[]>([]);
  const [sourceTab, setSourceTab] = useState<CRMSourceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ProspectStatusPipeline | null>(null);

  const loadAll = useCallback(async (wsId: string, tab: CRMSourceFilter) => {
    setLoading(true);
    try {
      const [crmRes, relanceRes] = await Promise.all([
        getProspectsForCrm(wsId, tab),
        getRelanceLeads(wsId),
      ]);
      if (crmRes.success && crmRes.data) setProspects(crmRes.data);
      else toast.error(crmRes.error || "Erreur chargement");
      if (relanceRes.success && relanceRes.data) setRelanceLeads(relanceRes.data);
    } catch {
      toast.error("Erreur chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) {
        setWorkspaceId(res.workspaceId);
        loadAll(res.workspaceId, "all");
      }
    })();
  }, [loadAll]);

  useEffect(() => {
    if (workspaceId) loadAll(workspaceId, sourceTab);
  }, [workspaceId, sourceTab, loadAll]);

  const onDrop = useCallback(
    async (prospectId: string, newStatus: ProspectStatusPipeline) => {
      if (!workspaceId) return;
      setDraggedId(null);
      setDropTarget(null);
      // Optimistic update
      setProspects((prev) =>
        prev.map((p) => (p.id === prospectId ? { ...p, status: newStatus } : p))
      );
      const ok = await updateProspectStatusAction(prospectId, newStatus, workspaceId);
      if (!ok.success) {
        toast.error(ok.error || "Erreur");
        // Revert on error
        loadAll(workspaceId, sourceTab);
      }
    },
    [workspaceId, sourceTab, loadAll]
  );

  const byStatus = (status: ProspectStatusPipeline) =>
    prospects.filter((p) => p.status === status);

  // Stats
  const total = prospects.length;
  const hot = prospects.filter((p) => p.temperature === "HOT").length;
  const converted = byStatus("CONVERTED");
  const pipelineValue = prospects.reduce((s, p) => s + (p.value ?? 0), 0);

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">

          {/* Title row */}
          <div className="flex items-center justify-between py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">CRM Pipeline</h1>
                <p className="text-[11px] text-gray-400">
                  Drag & drop pour changer de statut
                </p>
              </div>
            </div>

            {/* Stats pills */}
            <div className="hidden md:flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">
                <Users className="h-3 w-3" />
                <span className="tabular-nums font-semibold text-gray-900">{total}</span>
                leads
              </span>
              {hot > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-500">
                  <Flame className="h-3 w-3" />
                  <span className="tabular-nums font-semibold">{hot}</span> HOT
                </span>
              )}
              {pipelineValue > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-600 tabular-nums">
                  {pipelineValue.toLocaleString("fr-FR")} € pipeline
                </span>
              )}
              <button
                onClick={() => workspaceId && loadAll(workspaceId, sourceTab)}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Actualiser
              </button>
            </div>
          </div>

          {/* Source tabs */}
          <div className="flex items-center gap-1 py-3 overflow-x-auto no-scrollbar">
            {SOURCE_TABS.map((tab) => {
              const count =
                tab.value === "all"
                  ? total
                  : prospects.filter((p) =>
                      tab.value === "LINKEDIN"
                        ? p.source === "LINKEDIN" || p.platform === "LINKEDIN"
                        : tab.value === "FACEBOOK_GROUP"
                        ? p.source === "FACEBOOK_GROUP" || p.platform === "FACEBOOK"
                        : tab.value === "INSTAGRAM_HASHTAG"
                        ? p.source === "INSTAGRAM_HASHTAG" || p.platform === "INSTAGRAM"
                        : p.source === tab.value
                    ).length;

              return (
                <button
                  key={tab.value}
                  onClick={() => setSourceTab(tab.value)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                    sourceTab === tab.value
                      ? "bg-violet-100 border border-violet-200 text-violet-700"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <span className={sourceTab === tab.value ? "text-violet-600" : tab.color}>
                    {tab.icon}
                  </span>
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums font-bold",
                        sourceTab === tab.value
                          ? "bg-violet-200 text-violet-700"
                          : "bg-gray-200 text-gray-500"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">

        {/* ── Relance intelligente ── */}
        {relanceLeads.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-sm font-semibold text-amber-700">
                Relance intelligente
              </p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                {relanceLeads.length} sans réponse depuis 4+ jours
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {relanceLeads.slice(0, 10).map((p) => (
                <Link
                  key={p.id}
                  href={`/sales-os/reply-assistant?prospectId=${p.id}`}
                  className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition-all"
                >
                  <SourceIcon source={p.source} platform={p.platform} />
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <span className="text-gray-400">{p.company}</span>
                  <MessageCircle className="h-3 w-3 text-amber-500 ml-1" />
                </Link>
              ))}
              {relanceLeads.length > 10 && (
                <span className="flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-400">
                  +{relanceLeads.length - 10} autres
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Kanban ── */}
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {PIPELINE_COLUMNS.map((col) => {
            const cards = byStatus(col.status);
            const isDropTarget = dropTarget === col.status;

            return (
              <div
                key={col.status}
                className={cn(
                  "shrink-0 w-[260px] rounded-xl border-2 transition-all duration-150",
                  isDropTarget ? col.dropBg : `${col.accent} bg-white/80`
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(col.status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("prospectId");
                  if (id) onDrop(id, col.status);
                  else setDropTarget(null);
                }}
              >
                {/* Column header */}
                <div
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-t-[10px] border-b border-gray-200",
                    col.headerBg
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                    <span className="text-xs font-semibold text-gray-700">{col.label}</span>
                  </div>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 border border-gray-200 px-1.5 text-[10px] font-bold tabular-nums text-gray-500">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 min-h-[120px]">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                    </div>
                  ) : cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-8 w-8 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center mb-2">
                        <span className={cn("h-2 w-2 rounded-full opacity-30", col.dot)} />
                      </div>
                      <p className="text-[11px] text-gray-400">Glissez un lead ici</p>
                    </div>
                  ) : (
                    cards.map((p) => (
                      <ProspectCard
                        key={p.id}
                        p={p}
                        isDragging={draggedId === p.id}
                        onDragStart={() => setDraggedId(p.id)}
                        onDragEnd={() => setDraggedId(null)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
