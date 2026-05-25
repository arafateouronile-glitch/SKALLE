"use client";

import { useState } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { KpiCard } from "@/components/ui/kpi-card";

const PERIODS = ["7j", "30j", "90j", "12 mois"] as const;
type Period = typeof PERIODS[number];

const CHANNELS = [
  { name: "Organic Search", value: 42, revenue: "€77.4k", color: "emerald" as const },
  { name: "Paid Ads", value: 28, revenue: "€51.6k", color: "violet" as const },
  { name: "Email", value: 14, revenue: "€25.8k", color: "amber" as const },
  { name: "Social", value: 9, revenue: "€16.6k", color: "emerald" as const },
  { name: "Direct / Ref.", value: 7, revenue: "€12.9k", color: "violet" as const },
];

const TOP_CONTENTS = [
  { title: "Lead Scoring B2B — Guide Complet", type: "Article SEO", revenue: "€32k", visits: "12 400", conv: "2.4%" },
  { title: "30 posts LinkedIn automation", type: "Posts sociaux", revenue: "€18k", visits: "—", conv: "3.1%" },
  { title: "Thread : AI Sales en 2026", type: "Thread LinkedIn", revenue: "€14k", visits: "—", conv: "2.8%" },
  { title: "Signals Radar — Playbook", type: "Article SEO", revenue: "€11k", visits: "8 200", conv: "1.9%" },
  { title: "Campagne Meta — Avant/Après", type: "Ads", revenue: "€9.4k", visits: "—", conv: "4.2%" },
];

export default function InsightsCMOPage() {
  const [period, setPeriod] = useState<Period>("30j");

  return (
    <>
      <AppTopBar
        title="Insights"
        breadcrumb="marketing-os / insights"
        accent="emerald"
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
                    ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
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
          <KpiCard label="Revenu attribué" value="€184k" delta="+23.4%" deltaPositive spark={[90,110,100,125,140,130,160,175,165,185,200,210]} accent="emerald" />
          <KpiCard label="Pipeline généré" value="€612k" delta="+41 leads" deltaPositive sub="342 opportunités" spark={[200,240,220,270,300,290,330,360,350,380,420,460]} accent="violet" />
          <KpiCard label="CPL blended" value="€87" delta="−12%" deltaPositive sub="objectif €95" spark={[110,105,108,100,98,95,92,90,88,86,84,87]} accent="emerald" />
          <KpiCard label="Économies IA" value="€8.4k" delta="+€1.2k" deltaPositive sub="vs. agence externe" spark={[2,3,4,5,5,6,7,7,8,8,9,9]} accent="amber" />
        </div>

        {/* 2-col grid */}
        <div className="grid grid-cols-12 gap-5">

          {/* Attribution canaux */}
          <div
            className="col-span-12 lg:col-span-7 rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Attribution canaux</h2>
            <div className="space-y-3 mb-5">
              {CHANNELS.map((ch) => (
                <div key={ch.name}>
                  <div className="flex items-center justify-between mb-1.5 text-[12px]">
                    <span style={{ color: "var(--fg-dim)" }}>{ch.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono" style={{ color: "var(--fg-mute)" }}>{ch.value}%</span>
                      <span className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{ch.revenue}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${ch.value}%`, background: `var(--${ch.color}-fg)` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[12px] pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <span style={{ color: "var(--fg-mute)" }}>Total revenu attribué</span>
              <span className="font-bold" style={{ color: "var(--fg)" }}>€184 320</span>
            </div>
          </div>

          {/* Agent IA performance */}
          <div
            className="col-span-12 lg:col-span-5 rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Performance Agent IA</h2>
            <div className="space-y-4">
              {[
                { label: "Décisions exécutées", value: "128", sub: "sur 30j", accent: "emerald" as const },
                { label: "Contenus générés", value: "47", sub: "articles + posts", accent: "violet" as const },
                { label: "Budget économisé", value: "€8 400", sub: "vs. prestataires", accent: "amber" as const },
                { label: "Temps gagné", value: "94h", sub: "ce mois", accent: "emerald" as const },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{stat.label}</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{stat.sub}</p>
                  </div>
                  <p className="font-display text-[22px] font-bold tabular-nums" style={{ color: `var(--${stat.accent}-fg)` }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="mt-4 px-4 py-3 rounded-[10px] text-center"
              style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
            >
              <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--emerald-fg)" }}>ROI Agent IA</p>
              <p className="font-display text-[28px] font-bold" style={{ color: "var(--emerald-fg)" }}>×22</p>
            </div>
          </div>
        </div>

        {/* Top contenus */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>
            Top contenus — triés par revenu attribué
          </h2>
          <div className="space-y-1">
            <div
              className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
            >
              <span>Contenu</span><span>Type</span><span>Revenu</span><span>Visites</span><span>Conv.</span>
            </div>
            {TOP_CONTENTS.map((item, i) => (
              <Link
                key={i}
                href="/marketing-os/studio"
                className="grid items-center gap-4 px-4 py-3 rounded-[10px] transition-all hover:brightness-[0.97]"
                style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr", background: i % 2 === 0 ? "var(--bg)" : "transparent" }}
              >
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{item.title}</span>
                <span className="text-[11.5px]" style={{ color: "var(--fg-mute)" }}>{item.type}</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--emerald-fg)" }}>{item.revenue}</span>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{item.visits}</span>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{item.conv}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
