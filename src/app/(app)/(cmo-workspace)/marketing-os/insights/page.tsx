"use client";

import { useState } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { KpiCard } from "@/components/ui/kpi-card";

const PERIODS = ["7j", "30j", "90j", "12 mois"] as const;
type Period = typeof PERIODS[number];

type ColorToken = "emerald" | "violet" | "amber";

interface PeriodData {
  kpis: { label: string; value: string; delta: string; sub?: string; spark: number[]; accent: ColorToken }[];
  channels: { name: string; value: number; revenue: string; color: ColorToken }[];
  agentStats: { label: string; value: string; sub: string; accent: ColorToken }[];
  roi: string;
  totalRevenue: string;
}

const DATA: Record<Period, PeriodData> = {
  "7j": {
    kpis: [
      { label: "Revenu attribué", value: "€42k", delta: "+8.2%", spark: [30,32,35,33,38,40,42], accent: "emerald" },
      { label: "Pipeline généré", value: "€128k", delta: "+9 leads", sub: "78 opportunités", spark: [90,95,100,105,110,120,128], accent: "violet" },
      { label: "CPL blended", value: "€91", delta: "−4%", sub: "objectif €95", spark: [98,96,95,94,93,92,91], accent: "emerald" },
      { label: "Économies IA", value: "€2.1k", delta: "+€0.3k", sub: "vs. agence externe", spark: [1.4,1.6,1.7,1.8,1.9,2.0,2.1], accent: "amber" },
    ],
    channels: [
      { name: "Organic Search", value: 38, revenue: "€15.9k", color: "emerald" },
      { name: "Paid Ads", value: 31, revenue: "€13.0k", color: "violet" },
      { name: "Email", value: 16, revenue: "€6.7k", color: "amber" },
      { name: "Social", value: 9, revenue: "€3.8k", color: "emerald" },
      { name: "Direct / Ref.", value: 6, revenue: "€2.5k", color: "violet" },
    ],
    agentStats: [
      { label: "Décisions exécutées", value: "31", sub: "sur 7j", accent: "emerald" },
      { label: "Contenus générés", value: "11", sub: "articles + posts", accent: "violet" },
      { label: "Budget économisé", value: "€2 100", sub: "vs. prestataires", accent: "amber" },
      { label: "Temps gagné", value: "22h", sub: "cette semaine", accent: "emerald" },
    ],
    roi: "×18",
    totalRevenue: "€41 900",
  },
  "30j": {
    kpis: [
      { label: "Revenu attribué", value: "€184k", delta: "+23.4%", spark: [90,110,100,125,140,130,160,175,165,185,200,210], accent: "emerald" },
      { label: "Pipeline généré", value: "€612k", delta: "+41 leads", sub: "342 opportunités", spark: [200,240,220,270,300,290,330,360,350,380,420,460], accent: "violet" },
      { label: "CPL blended", value: "€87", delta: "−12%", sub: "objectif €95", spark: [110,105,108,100,98,95,92,90,88,86,84,87], accent: "emerald" },
      { label: "Économies IA", value: "€8.4k", delta: "+€1.2k", sub: "vs. agence externe", spark: [2,3,4,5,5,6,7,7,8,8,9,9], accent: "amber" },
    ],
    channels: [
      { name: "Organic Search", value: 42, revenue: "€77.4k", color: "emerald" },
      { name: "Paid Ads", value: 28, revenue: "€51.6k", color: "violet" },
      { name: "Email", value: 14, revenue: "€25.8k", color: "amber" },
      { name: "Social", value: 9, revenue: "€16.6k", color: "emerald" },
      { name: "Direct / Ref.", value: 7, revenue: "€12.9k", color: "violet" },
    ],
    agentStats: [
      { label: "Décisions exécutées", value: "128", sub: "sur 30j", accent: "emerald" },
      { label: "Contenus générés", value: "47", sub: "articles + posts", accent: "violet" },
      { label: "Budget économisé", value: "€8 400", sub: "vs. prestataires", accent: "amber" },
      { label: "Temps gagné", value: "94h", sub: "ce mois", accent: "emerald" },
    ],
    roi: "×22",
    totalRevenue: "€184 320",
  },
  "90j": {
    kpis: [
      { label: "Revenu attribué", value: "€521k", delta: "+31.2%", spark: [200,230,260,280,310,340,360,380,420,460,500,521], accent: "emerald" },
      { label: "Pipeline généré", value: "€1.8M", delta: "+124 leads", sub: "890 opportunités", spark: [600,700,750,820,900,970,1050,1200,1350,1500,1700,1800], accent: "violet" },
      { label: "CPL blended", value: "€82", delta: "−18%", sub: "objectif €95", spark: [105,102,100,98,96,93,91,89,87,85,83,82], accent: "emerald" },
      { label: "Économies IA", value: "€24k", delta: "+€3.8k", sub: "vs. agence externe", spark: [8,10,12,14,16,17,19,20,21,22,23,24], accent: "amber" },
    ],
    channels: [
      { name: "Organic Search", value: 45, revenue: "€234k", color: "emerald" },
      { name: "Paid Ads", value: 26, revenue: "€135k", color: "violet" },
      { name: "Email", value: 15, revenue: "€78k", color: "amber" },
      { name: "Social", value: 8, revenue: "€41k", color: "emerald" },
      { name: "Direct / Ref.", value: 6, revenue: "€31k", color: "violet" },
    ],
    agentStats: [
      { label: "Décisions exécutées", value: "384", sub: "sur 90j", accent: "emerald" },
      { label: "Contenus générés", value: "142", sub: "articles + posts", accent: "violet" },
      { label: "Budget économisé", value: "€24 000", sub: "vs. prestataires", accent: "amber" },
      { label: "Temps gagné", value: "280h", sub: "ce trimestre", accent: "emerald" },
    ],
    roi: "×28",
    totalRevenue: "€519 000",
  },
  "12 mois": {
    kpis: [
      { label: "Revenu attribué", value: "€2.1M", delta: "+44%", spark: [80,120,150,200,250,310,380,450,530,620,720,820], accent: "emerald" },
      { label: "Pipeline généré", value: "€7.2M", delta: "+482 leads", sub: "3 200 opportunités", spark: [400,600,800,1000,1200,1500,1800,2100,2500,2900,3400,3800], accent: "violet" },
      { label: "CPL blended", value: "€79", delta: "−28%", sub: "objectif €95", spark: [115,110,106,102,99,96,93,90,87,84,82,79], accent: "emerald" },
      { label: "Économies IA", value: "€94k", delta: "+€14k", sub: "vs. agence externe", spark: [4,8,14,20,28,36,46,56,66,76,86,94], accent: "amber" },
    ],
    channels: [
      { name: "Organic Search", value: 47, revenue: "€987k", color: "emerald" },
      { name: "Paid Ads", value: 24, revenue: "€504k", color: "violet" },
      { name: "Email", value: 16, revenue: "€336k", color: "amber" },
      { name: "Social", value: 8, revenue: "€168k", color: "emerald" },
      { name: "Direct / Ref.", value: 5, revenue: "€105k", color: "violet" },
    ],
    agentStats: [
      { label: "Décisions exécutées", value: "1 524", sub: "sur 12 mois", accent: "emerald" },
      { label: "Contenus générés", value: "568", sub: "articles + posts", accent: "violet" },
      { label: "Budget économisé", value: "€94 000", sub: "vs. prestataires", accent: "amber" },
      { label: "Temps gagné", value: "1 120h", sub: "cette année", accent: "emerald" },
    ],
    roi: "×38",
    totalRevenue: "€2 100 000",
  },
};

const TOP_CONTENTS = [
  { title: "Lead Scoring B2B — Guide Complet", type: "Article SEO", revenue: "€32k", visits: "12 400", conv: "2.4%" },
  { title: "30 posts LinkedIn automation", type: "Posts sociaux", revenue: "€18k", visits: "—", conv: "3.1%" },
  { title: "Thread : AI Sales en 2026", type: "Thread LinkedIn", revenue: "€14k", visits: "—", conv: "2.8%" },
  { title: "Signals Radar — Playbook", type: "Article SEO", revenue: "€11k", visits: "8 200", conv: "1.9%" },
  { title: "Campagne Meta — Avant/Après", type: "Ads", revenue: "€9.4k", visits: "—", conv: "4.2%" },
];

export default function InsightsCMOPage() {
  const [period, setPeriod] = useState<Period>("30j");
  const d = DATA[period];

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
          {d.kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              deltaPositive
              sub={kpi.sub}
              spark={kpi.spark}
              accent={kpi.accent}
            />
          ))}
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
              {d.channels.map((ch) => (
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
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${ch.value}%`, background: `var(--${ch.color}-fg)` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[12px] pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <span style={{ color: "var(--fg-mute)" }}>Total revenu attribué</span>
              <span className="font-bold" style={{ color: "var(--fg)" }}>{d.totalRevenue}</span>
            </div>
          </div>

          {/* Agent IA performance */}
          <div
            className="col-span-12 lg:col-span-5 rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <h2 className="font-display text-[18px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Performance Agent IA</h2>
            <div className="space-y-4">
              {d.agentStats.map((stat) => (
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
              <p className="font-display text-[28px] font-bold" style={{ color: "var(--emerald-fg)" }}>{d.roi}</p>
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
