"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  RefreshCw,
  Mail,
  Linkedin,
  MapPin,
  ExternalLink,
  Flame,
  Zap,
  Snowflake,
  CheckCircle2,
  Trophy,
  Users,
  Phone,
} from "lucide-react";
import type {
  PipelineProspect,
  PipelineColumn,
} from "@/app/api/cso-agent/pipeline/route";

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: {
  id: PipelineColumn;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    id: "NEW",
    label: "Nouveaux",
    icon: <Users className="h-3.5 w-3.5" />,
    color: "var(--fg-mute)",
    bg: "var(--bg)",
    border: "var(--line)",
  },
  {
    id: "RESEARCHED",
    label: "Enrichis",
    icon: <Zap className="h-3.5 w-3.5" />,
    color: "var(--cold-fg)",
    bg: "var(--cold-soft)",
    border: "var(--cold-line)",
  },
  {
    id: "CONTACTED",
    label: "Contactés",
    icon: <Mail className="h-3.5 w-3.5" />,
    color: "var(--violet-fg)",
    bg: "var(--violet-soft)",
    border: "var(--violet-line)",
  },
  {
    id: "RESPONDED",
    label: "Répondu",
    icon: <Phone className="h-3.5 w-3.5" />,
    color: "var(--amber-fg)",
    bg: "var(--amber-soft)",
    border: "var(--amber-line)",
  },
  {
    id: "MEETING_BOOKED",
    label: "Meeting",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "var(--emerald-fg)",
    bg: "var(--emerald-soft)",
    border: "var(--emerald-line)",
  },
  {
    id: "CONVERTED",
    label: "Convertis",
    icon: <Trophy className="h-3.5 w-3.5" />,
    color: "var(--amber-fg)",
    bg: "var(--amber-soft)",
    border: "var(--amber-line)",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tempIcon(temp: string) {
  if (temp === "HOT")  return <Flame    className="h-3 w-3" style={{ color: "var(--danger-fg)" }} />;
  if (temp === "WARM") return <Zap      className="h-3 w-3" style={{ color: "var(--amber-fg)" }} />;
  return                      <Snowflake className="h-3 w-3" style={{ color: "var(--cold-fg)" }} />;
}

function scoreColor(s: number) {
  if (s >= 75) return { bg: "var(--emerald-soft)", fg: "var(--emerald-fg)" };
  if (s >= 50) return { bg: "var(--amber-soft)",   fg: "var(--amber-fg)" };
  return             { bg: "var(--bg)",             fg: "var(--fg-mute)" };
}

function relTime(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return "< 1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 30)  return `${d}j`;
  return `${Math.floor(d / 30)}mo`;
}

function emailBadge(p: PipelineProspect) {
  if (p.email && p.emailVerified)
    return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>✓ vérifié</span>;
  if (p.email && p.emailStatus === "likely to engage")
    return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}>probable</span>;
  if (p.email)
    return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>email</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--fg-mute)" }}>—</span>;
}

// ─── Prospect Card ────────────────────────────────────────────────────────────

function ProspectCard({
  prospect,
  onDragStart,
}: {
  prospect: PipelineProspect;
  onDragStart: (e: React.DragEvent, p: PipelineProspect) => void;
}) {
  const sc = scoreColor(prospect.score);
  const ts = relTime(prospect.lastInteractionAt ?? prospect.createdAt);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, prospect)}
      className="rounded-[12px] p-3.5 cursor-grab active:cursor-grabbing select-none transition-all hover:-translate-y-0.5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Top row: score + temp + time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: sc.bg, color: sc.fg }}
          >
            {prospect.score}
          </span>
          {tempIcon(prospect.temperature)}
        </div>
        <div className="flex items-center gap-1.5">
          {ts && (
            <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>
              {ts}
            </span>
          )}
          {prospect.platform === "LINKEDIN" && (
            <Linkedin className="h-3 w-3" style={{ color: "var(--violet-fg)" }} />
          )}
        </div>
      </div>

      {/* Name + title */}
      <p className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>
        {prospect.name}
      </p>
      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--fg-mute)" }}>
        {prospect.jobTitle
          ? `${prospect.jobTitle} @ ${prospect.company}`
          : prospect.company}
      </p>

      {/* Bottom row: email + location + actions */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {emailBadge(prospect)}
          {prospect.location && (
            <span className="flex items-center gap-0.5 text-[10px] truncate" style={{ color: "var(--fg-mute)" }}>
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {prospect.location.split(",")[0]}
            </span>
          )}
        </div>
        <Link
          href={`/sales-os/prospects/${prospect.id}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1 rounded-[5px] transition-all hover:brightness-95"
          style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
          title="Voir le profil"
        >
          <ExternalLink className="h-2.5 w-2.5" style={{ color: "var(--fg-mute)" }} />
        </Link>
      </div>

      {prospect.personaName && (
        <p className="mt-1.5 text-[9.5px] truncate" style={{ color: "var(--fg-mute)" }}>
          #{prospect.personaName}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ColumnsState = Record<PipelineColumn, PipelineProspect[]>;
type CountsState  = Record<PipelineColumn, number>;

export default function PipelinePage() {
  const [columns, setColumns]     = useState<ColumnsState>({} as ColumnsState);
  const [counts, setCounts]       = useState<CountsState>({} as CountsState);
  const [loading, setLoading]     = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState<PipelineColumn | null>(null);
  const dragProspect              = useRef<PipelineProspect | null>(null);
  const dragSource                = useRef<PipelineColumn | null>(null);

  // Enrichment state
  const [toEnrich,     setToEnrich]     = useState<number | null>(null);
  const [enriching,    setEnriching]    = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; emailsFound: number; hotsDetected: number } | null>(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cso-agent/pipeline");
      const data = (await res.json()) as { columns: ColumnsState; counts: CountsState };
      setColumns(data.columns ?? {});
      setCounts(data.counts ?? {});
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  // Load enrichment count on mount
  useEffect(() => {
    fetch("/api/cso-agent/enrich-batch")
      .then((r) => r.json() as Promise<{ toEnrich: number }>)
      .then((d) => setToEnrich(d.toEnrich ?? 0))
      .catch(() => {});
  }, []);

  async function handleEnrich() {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const res = await fetch("/api/cso-agent/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, onlyNew: true }),
      });
      const data = await res.json() as { enriched: number; emailsFound: number; hotsDetected: number; total: number };
      setEnrichResult({ enriched: data.enriched, emailsFound: data.emailsFound, hotsDetected: data.hotsDetected });
      setToEnrich((prev) => Math.max(0, (prev ?? 0) - data.enriched));
      // Refresh pipeline to show updated cards
      await fetchPipeline();
    } catch {
      // silent
    } finally {
      setEnriching(false);
    }
  }

  // ── DnD handlers ───────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, prospect: PipelineProspect) {
    dragProspect.current = prospect;
    dragSource.current   = prospect.status;
    setDraggedId(prospect.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOver(null);
    dragProspect.current = null;
    dragSource.current   = null;
  }

  function handleDragOver(e: React.DragEvent, col: PipelineColumn) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(col);
  }

  function handleDrop(e: React.DragEvent, targetCol: PipelineColumn) {
    e.preventDefault();
    setDragOver(null);

    const p = dragProspect.current;
    const src = dragSource.current;
    if (!p || !src || src === targetCol) return;

    // Optimistic update
    setColumns((prev) => {
      const next = { ...prev };
      next[src]      = (prev[src] ?? []).filter((x) => x.id !== p.id);
      next[targetCol] = [{ ...p, status: targetCol }, ...(prev[targetCol] ?? [])];
      return next;
    });
    setCounts((prev) => ({
      ...prev,
      [src]: Math.max(0, (prev[src] ?? 0) - 1),
      [targetCol]: (prev[targetCol] ?? 0) + 1,
    }));

    // Persist
    fetch(`/api/cso-agent/pipeline/${p.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetCol }),
    }).catch(() => {
      // Revert on error
      setColumns((prev) => {
        const next = { ...prev };
        next[targetCol] = (prev[targetCol] ?? []).filter((x) => x.id !== p.id);
        next[src]       = [{ ...p, status: src }, ...(prev[src] ?? [])];
        return next;
      });
      setCounts((prev) => ({
        ...prev,
        [src]: (prev[src] ?? 0) + 1,
        [targetCol]: Math.max(0, (prev[targetCol] ?? 0) - 1),
      }));
    });
  }

  // ── Stats bar ───────────────────────────────────────────────────────────────

  const totalProspects = Object.values(counts).reduce((a, b) => a + b, 0);
  const conversionRate =
    totalProspects > 0
      ? Math.round(((counts["CONVERTED"] ?? 0) / totalProspects) * 100)
      : 0;

  return (
    <>
      <AppTopBar
        title="Pipeline"
        breadcrumb="sales-os / pipeline"
        accent="violet"
      />

      <div className="p-6 flex flex-col gap-5" style={{ minHeight: "calc(100vh - 60px)" }}>
        {/* Stats bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>
              {totalProspects.toLocaleString("fr-FR")} prospects
            </span>
            <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              · {conversionRate}% taux de conversion
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Enrich result toast */}
            {enrichResult && (
              <div
                className="flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-[8px]"
                style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
              >
                ✓ {enrichResult.enriched} enrichis · {enrichResult.emailsFound} emails · {enrichResult.hotsDetected} HOT
              </div>
            )}

            {/* Enrich button */}
            {toEnrich !== null && toEnrich > 0 && (
              <button
                onClick={handleEnrich}
                disabled={enriching}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)", color: "var(--amber-fg)" }}
              >
                {enriching ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                {enriching ? "Enrichissement…" : `Enrichir ${toEnrich} prospects`}
              </button>
            )}

            <button
              onClick={fetchPipeline}
              disabled={loading}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[8px] transition-all hover:brightness-95"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
            <Link
              href="/sales-os/prospection"
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-[8px] transition-all hover:brightness-110"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              + Ajouter des prospects
            </Link>
          </div>
        </div>

        {/* Kanban board */}
        <div
          className="flex gap-4 overflow-x-auto pb-4"
          style={{ flex: 1 }}
        >
          {COLUMNS.map((col) => {
            const cards = columns[col.id] ?? [];
            const count = counts[col.id] ?? 0;
            const isOver = dragOver === col.id;

            return (
              <div
                key={col.id}
                className="flex flex-col shrink-0 rounded-[16px] overflow-hidden transition-all"
                style={{
                  width: 240,
                  background: isOver ? col.bg : "var(--bg-card)",
                  border: `1px solid ${isOver ? col.border : "var(--line)"}`,
                  boxShadow: "var(--card-shadow)",
                }}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3 shrink-0"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: col.color }}>{col.icon}</span>
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}
                  >
                    {count}
                  </span>
                </div>

                {/* Cards */}
                <div
                  className="flex-1 overflow-y-auto p-3 space-y-2.5"
                  style={{ minHeight: 200, maxHeight: "calc(100vh - 220px)" }}
                >
                  {loading && cards.length === 0 && (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="rounded-[10px] animate-pulse"
                          style={{ height: 90, background: "var(--line-strong)" }}
                        />
                      ))}
                    </div>
                  )}

                  {!loading && cards.length === 0 && (
                    <div
                      className="rounded-[10px] p-4 text-center"
                      style={{ border: "1px dashed var(--line)" }}
                    >
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                        Déposez ici
                      </p>
                    </div>
                  )}

                  {cards.map((p) => (
                    <div
                      key={p.id}
                      style={{ opacity: draggedId === p.id ? 0.4 : 1 }}
                    >
                      <ProspectCard
                        prospect={p}
                        onDragStart={handleDragStart}
                      />
                    </div>
                  ))}

                  {count > cards.length && (
                    <p className="text-center text-[10px] pt-1" style={{ color: "var(--fg-mute)" }}>
                      +{count - cards.length} autres
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global drag end listener */}
      {draggedId && (
        <div
          className="fixed inset-0 z-0"
          onDragEnd={handleDragEnd}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  );
}
