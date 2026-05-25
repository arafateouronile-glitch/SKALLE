"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { KpiCard } from "@/components/ui/kpi-card";

const PERIODS = ["7j", "30j", "90j", "12 mois"] as const;
type Period = typeof PERIODS[number];

const PIPELINE_STAGES = [
  { label: "Nouveau", value: 164, revenue: "—", color: "cold" as const },
  { label: "Contacté", value: 47, revenue: "€92k", color: "violet" as const },
  { label: "A répondu", value: 18, revenue: "€147k", color: "amber" as const },
  { label: "Rendez-vous", value: 7, revenue: "€215k", color: "emerald" as const },
  { label: "Gagné", value: 5, revenue: "€84k", color: "emerald" as const },
];

const TOP_SEQUENCES = [
  { name: "B2B SaaS Directeurs Commerciaux", leads: 47, replied: "18.2%", booked: "6.4%", revenue: "€48k" },
  { name: "Startup post-levée Série A/B", leads: 32, replied: "22.4%", booked: "9.3%", revenue: "€36k" },
  { name: "Recruteurs actifs — RevOps", leads: 28, replied: "14.7%", booked: "3.6%", revenue: "€18k" },
  { name: "Nouveaux bureaux régionaux", leads: 15, replied: "—", booked: "—", revenue: "—" },
];

const AB_TESTS = [
  { name: "Hook A — Question directe", rate: "24.1%", delta: "+6.2pp", winner: true },
  { name: "Hook B — Stat choc", rate: "17.9%", delta: "baseline", winner: false },
  { name: "Hook C — Nom du concurrent", rate: "21.3%", delta: "+3.4pp", winner: false },
];

export default function CSOInsightsPage() {
  const [period, setPeriod] = useState<Period>("30j");

  return (
    <>
      <AppTopBar
        title="Insights"
        breadcrumb="sales-os / insights"
        accent="violet"
      />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Period selector */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={
                  active
                    ? { background: "var(--violet-soft)", color: "var(--violet-fg)", border: "1px solid var(--violet-line)" }
                    : { color: "var(--fg-dim)", border: "1px solid transparent" }
                }
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Leads HOT"
            value="47"
            delta="+12 cette semaine"
            deltaPositive
            sub="Score ≥ 80"
            spark={[8,10,9,12,14,13,16,18,17,20,22,24]}
            accent="danger"
          />
          <KpiCard
            label="Pipeline ouvert"
            value="€538k"
            delta="+€84k"
            deltaPositive
            sub="164 opportunités"
            spark={[180,210,195,240,270,260,300,330,320,360,400,450]}
            accent="violet"
          />
          <KpiCard
            label="Taux de réponse 7j"
            value="18.4%"
            delta="+2.1pp"
            deltaPositive
            sub="objectif 20%"
            spark={[12,13,14,13,15,16,15,17,18,17,19,18]}
            accent="emerald"
          />
          <KpiCard
            label="Deals gagnés MTD"
            value="5"
            delta="€84k signé"
            deltaPositive
            sub="objectif 8 deals"
            spark={[1,1,2,2,2,3,3,3,4,4,4,5]}
            accent="amber"
          />
        </div>

        {/* 2-col: Pipeline funnel + A/B tests */}
        <div className="grid grid-cols-12 gap-5">

          {/* Pipeline funnel */}
          <div
            className="col-span-12 lg:col-span-7 rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Entonnoir pipeline</h2>
            <div className="space-y-2.5 mb-5">
              {PIPELINE_STAGES.map((stage, i) => {
                const maxVal = PIPELINE_STAGES[0].value;
                const pct = Math.round((stage.value / maxVal) * 100);
                return (
                  <div key={stage.label}>
                    <div className="flex items-center justify-between mb-1.5 text-[12px]">
                      <span style={{ color: "var(--fg-dim)" }}>{stage.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono" style={{ color: "var(--fg-mute)" }}>{stage.value} leads</span>
                        <span className="font-semibold tabular-nums w-16 text-right" style={{ color: "var(--fg)" }}>{stage.revenue}</span>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: `var(--${stage.color}-fg)` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[12px] pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <span style={{ color: "var(--fg-mute)" }}>Pipeline total</span>
              <span className="font-bold" style={{ color: "var(--fg)" }}>€538 000</span>
            </div>
          </div>

          {/* A/B tests */}
          <div
            className="col-span-12 lg:col-span-5 rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>A/B Test — Hooks</h2>
            <div className="space-y-3 mb-5">
              {AB_TESTS.map((test) => (
                <div
                  key={test.name}
                  className="flex items-center justify-between p-3.5 rounded-[10px]"
                  style={{
                    background: test.winner ? "var(--emerald-soft)" : "var(--bg)",
                    border: `1px solid ${test.winner ? "var(--emerald-line)" : "var(--line)"}`,
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {test.winner && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--emerald-fg)", color: "white" }}>WINNER</span>}
                      <p className="text-[12px] font-medium" style={{ color: "var(--fg)" }}>{test.name}</p>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-mute)" }}>Taux réponse : <span className="font-semibold" style={{ color: test.winner ? "var(--emerald-fg)" : "var(--fg)" }}>{test.rate}</span></p>
                  </div>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0"
                    style={{
                      background: test.delta.startsWith("+") ? "var(--emerald-soft)" : "oklch(0.21 0.03 260 / 0.05)",
                      color: test.delta.startsWith("+") ? "var(--emerald-fg)" : "var(--fg-mute)",
                    }}
                  >
                    {test.delta}
                  </span>
                </div>
              ))}
            </div>

            {/* Hunter ROI */}
            <div
              className="px-4 py-3 rounded-[10px] text-center"
              style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }}
            >
              <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--violet-fg)" }}>ROI Outreach IA</p>
              <p className="font-display text-[28px] font-bold" style={{ color: "var(--violet-fg)" }}>×14</p>
            </div>
          </div>
        </div>

        {/* Top séquences */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>
            Top séquences — triées par revenu
          </h2>
          <div className="space-y-1">
            <div
              className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
            >
              <span>Séquence</span><span>Leads</span><span>Réponses</span><span>RDV</span><span>Revenu</span>
            </div>
            {TOP_SEQUENCES.map((seq, i) => (
              <div
                key={i}
                className="grid items-center gap-4 px-4 py-3 rounded-[10px]"
                style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", background: i % 2 === 0 ? "var(--bg)" : "transparent" }}
              >
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{seq.name}</span>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{seq.leads}</span>
                <span
                  className="text-[12px] font-semibold tabular-nums"
                  style={{ color: seq.replied !== "—" ? "var(--emerald-fg)" : "var(--fg-mute)" }}
                >
                  {seq.replied}
                </span>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{seq.booked}</span>
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{ color: seq.revenue !== "—" ? "var(--violet-fg)" : "var(--fg-mute)" }}
                >
                  {seq.revenue}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
