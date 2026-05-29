"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, Users, MessageSquare, Calendar,
  ArrowRight, RefreshCw, Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Funnel {
  invitations: number;
  accepted: number;
  responded: number;
  meetings: number;
}

interface Rates {
  acceptanceRate: number;
  responseRate: number;
  meetingRate: number;
}

interface PersonaStat {
  personaId: string;
  personaName: string;
  invitations: number;
  accepted: number;
  responded: number;
  meetings: number;
}

interface WeeklyPoint {
  week: string;
  invitations: number;
  accepted: number;
  responded: number;
}

interface MetricsData {
  period: number;
  funnel: Funnel;
  rates: Rates;
  byPersona: PersonaStat[];
  weeklyTrend: WeeklyPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Rate({ value, label }: { value: number; label: string }) {
  const color = value >= 40 ? "#059669" : value >= 20 ? "#d97706" : "#6b7280";
  return (
    <div className="text-center">
      <p className="text-[22px] font-bold" style={{ color }}>{value}%</p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{label}</p>
    </div>
  );
}

function FunnelStep({
  icon: Icon, label, value, color, isLast = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center justify-center w-10 h-10 rounded-[10px]"
          style={{ background: `${color}18` }}>
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        <p className="text-[20px] font-bold" style={{ color: "var(--fg)" }}>{value}</p>
        <p className="text-[11px] text-center leading-tight" style={{ color: "var(--fg-mute)" }}>{label}</p>
      </div>
      {!isLast && (
        <ArrowRight className="h-4 w-4 shrink-0 mb-6" style={{ color: "var(--fg-mute)", opacity: 0.4 }} />
      )}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--bg-2)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] w-6 text-right" style={{ color: "var(--fg-mute)" }}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CsoMetricsDashboard({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cso-agent/metrics?workspaceId=${workspaceId}&period=${period}`);
      if (res.ok) setData(await res.json() as MetricsData);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => { load(); }, [load]);

  const maxWeekly = data
    ? Math.max(...data.weeklyTrend.map((w) => w.invitations), 1)
    : 1;

  return (
    <div className="rounded-[16px] p-6 space-y-6"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: "var(--violet-fg)" }} />
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>
            Entonnoir CSO
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-[8px] overflow-hidden border" style={{ borderColor: "var(--line)" }}>
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background: period === p ? "var(--violet-soft)" : "var(--bg)",
                  color: period === p ? "var(--violet-fg)" : "var(--fg-mute)",
                }}
              >
                {p === "7d" ? "7j" : p === "30d" ? "30j" : "90j"}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-1.5 rounded-[6px]" style={{ background: "var(--bg-2)" }}>
            <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--fg-mute)" }} />
        </div>
      ) : !data ? (
        <p className="text-center py-8 text-[13px]" style={{ color: "var(--fg-mute)" }}>
          Impossible de charger les métriques
        </p>
      ) : (
        <>
          {/* Funnel */}
          <div className="flex items-start justify-center gap-1 flex-wrap">
            <FunnelStep icon={Users}          label="Invitations"  value={data.funnel.invitations} color="#7c3aed" />
            <FunnelStep icon={Users}          label="Connexions"   value={data.funnel.accepted}    color="#2563eb" />
            <FunnelStep icon={MessageSquare}  label="Réponses"     value={data.funnel.responded}   color="#059669" />
            <FunnelStep icon={Calendar}       label="RDV"          value={data.funnel.meetings}    color="#d97706" isLast />
          </div>

          {/* Taux */}
          <div className="grid grid-cols-3 gap-3 py-3 rounded-[10px]"
            style={{ background: "var(--bg-2)" }}>
            <Rate value={data.rates.acceptanceRate} label="Taux d'acceptation" />
            <Rate value={data.rates.responseRate}   label="Taux de réponse" />
            <Rate value={data.rates.meetingRate}    label="Taux de RDV" />
          </div>

          {/* Tendance hebdomadaire */}
          {data.weeklyTrend.some((w) => w.invitations > 0) && (
            <div>
              <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--fg)" }}>
                Tendance 4 semaines
              </p>
              <div className="space-y-2">
                {data.weeklyTrend.map((w) => {
                  const date = new Date(w.week);
                  const label = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                  return (
                    <div key={w.week} className="grid grid-cols-[60px_1fr_1fr_1fr] items-center gap-3">
                      <span className="text-[10.5px]" style={{ color: "var(--fg-mute)" }}>{label}</span>
                      <MiniBar value={w.invitations} max={maxWeekly} color="#7c3aed" />
                      <MiniBar value={w.accepted}    max={maxWeekly} color="#2563eb" />
                      <MiniBar value={w.responded}   max={maxWeekly} color="#059669" />
                    </div>
                  );
                })}
                <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-3 mt-1">
                  <span />
                  {[
                    { label: "Invitations", color: "#7c3aed" },
                    { label: "Connexions",  color: "#2563eb" },
                    { label: "Réponses",    color: "#059669" },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Par persona */}
          {data.byPersona.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--fg)" }}>
                Par persona
              </p>
              <div className="space-y-2">
                {data.byPersona.map((p) => {
                  const rate = p.invitations > 0
                    ? Math.round((p.accepted / p.invitations) * 100)
                    : 0;
                  return (
                    <div key={p.personaId}
                      className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2.5"
                      style={{ background: "var(--bg-2)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--fg)" }}>
                          {p.personaName}
                        </p>
                        <p className="text-[10.5px]" style={{ color: "var(--fg-mute)" }}>
                          {p.invitations} invitations · {p.responded} réponses
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-bold"
                          style={{ color: rate >= 40 ? "#059669" : rate >= 20 ? "#d97706" : "#6b7280" }}>
                          {rate}%
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--fg-mute)" }}>acceptance</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.funnel.invitations === 0 && (
            <p className="text-center text-[12px] py-4" style={{ color: "var(--fg-mute)" }}>
              Aucune donnée sur cette période. Lancez l'automation pour voir les métriques.
            </p>
          )}
        </>
      )}
    </div>
  );
}
