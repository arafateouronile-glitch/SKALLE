"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Zap, Bot } from "lucide-react";

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "liste", label: "Liste", count: 164 },
  { id: "agent", label: "Agent IA", count: 3 },
] as const;

type Tab = typeof TABS[number]["id"];

const TEMP_FILTERS = [
  { id: "hot", label: "HOT", count: 8, color: "danger" as const },
  { id: "warm", label: "WARM", count: 32, color: "amber" as const },
  { id: "cold", label: "COLD", count: 124, color: "cold" as const },
  { id: "all", label: "Tous canaux" },
] as const;

type TempFilter = (typeof TEMP_FILTERS)[number]["id"];

const KANBAN_COLS = [
  { id: "nouveau", label: "Nouveau", count: 8 },
  { id: "etudie", label: "Étudié", count: 14 },
  { id: "contacte", label: "Contacté", count: 32 },
  { id: "repondu", label: "A répondu", count: 18 },
  { id: "rdv", label: "Rendez-vous", count: 7 },
  { id: "gagne", label: "Gagné", count: 5 },
] as const;

type KanbanCol = (typeof KANBAN_COLS)[number]["id"];

interface Lead {
  id: number;
  name: string;
  co: string;
  score: number;
  source: string;
  temp: "HOT" | "WARM" | "COLD";
  col: KanbanCol;
  initials: string;
}

const MOCK_LEADS: Lead[] = [
  { id: 1, name: "Léa Martin", co: "Scale.ai", score: 94, source: "LinkedIn", temp: "HOT", col: "nouveau", initials: "LM" },
  { id: 2, name: "Thomas Duval", co: "Mistral AI", score: 88, source: "Email", temp: "HOT", col: "nouveau", initials: "TD" },
  { id: 3, name: "Sarah Koch", co: "Dataiku", score: 76, source: "Hunt", temp: "WARM", col: "etudie", initials: "SK" },
  { id: 4, name: "Marc Lefèvre", co: "Spendesk", score: 72, source: "LinkedIn", temp: "WARM", col: "etudie", initials: "ML" },
  { id: 5, name: "Julie Chen", co: "Pennylane", score: 68, source: "Email", temp: "WARM", col: "contacte", initials: "JC" },
  { id: 6, name: "Antoine Roy", co: "Payfit", score: 65, source: "Hunt", temp: "WARM", col: "contacte", initials: "AR" },
  { id: 7, name: "Emma Blanc", co: "Swile", score: 81, source: "LinkedIn", temp: "HOT", col: "repondu", initials: "EB" },
  { id: 8, name: "Lucas Petit", co: "Alan", score: 77, source: "Email", temp: "WARM", col: "repondu", initials: "LP" },
  { id: 9, name: "Nina Torres", co: "Qonto", score: 89, source: "LinkedIn", temp: "HOT", col: "rdv", initials: "NT" },
  { id: 10, name: "Pierre Morin", co: "Luko", score: 83, source: "Hunt", temp: "HOT", col: "gagne", initials: "PM" },
];

const AGENT_SUGGESTIONS = [
  { id: 1, label: "Relancer 14 leads Étudié sans réponse depuis 7j", type: "FOLLOWUP", credits: 14 },
  { id: 2, label: "Envoyer DM aux 8 leads Nouveau (score > 80)", type: "OUTREACH", credits: 8 },
  { id: 3, label: "Classer 12 leads Contacté stagnants en COLD", type: "CLEANUP", credits: 0 },
];

function scoreColor(score: number) {
  if (score >= 85) return "var(--danger-fg)";
  if (score >= 70) return "var(--amber-fg)";
  return "var(--cold-fg)";
}

function tempStyle(temp: "HOT" | "WARM" | "COLD") {
  if (temp === "HOT") return { background: "var(--danger-soft)", color: "var(--danger-fg)" };
  if (temp === "WARM") return { background: "var(--amber-soft)", color: "var(--amber-fg)" };
  return { background: "var(--cold-soft)", color: "var(--cold-fg)" };
}

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [activeFilter, setActiveFilter] = useState<TempFilter>("all");

  const filteredLeads =
    activeFilter === "all"
      ? MOCK_LEADS
      : MOCK_LEADS.filter((l) => l.temp === activeFilter.toUpperCase());

  return (
    <>
      <AppTopBar
        title="Leads"
        breadcrumb="sales-os / leads"
        cta="Importer"
        accent="violet"
      />

      <div className="p-6 space-y-5 max-w-[1400px]">

        {/* Tabs + Temp filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                  style={
                    active
                      ? { background: "var(--violet-soft)", color: "var(--violet-fg)", border: "1px solid var(--violet-line)" }
                      : { color: "var(--fg-dim)", border: "1px solid transparent" }
                  }
                >
                  {tab.label}
                  {"count" in tab && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: active ? "var(--violet-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                        color: active ? "white" : "var(--fg-mute)",
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {TEMP_FILTERS.map((f) => {
              const active = activeFilter === f.id;
              const hasColor = "color" in f;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={
                    active && hasColor
                      ? { background: `var(--${f.color}-soft)`, color: `var(--${f.color}-fg)`, border: `1px solid var(--${f.color}-line)` }
                      : active
                      ? { background: "var(--line-strong)", color: "var(--fg)", border: "1px solid var(--line)" }
                      : { color: "var(--fg-dim)", border: "1px solid transparent" }
                  }
                >
                  {f.label}
                  {"count" in f && (
                    <span className="font-mono">{f.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pipeline Kanban */}
        {activeTab === "pipeline" && (
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="flex gap-3 min-w-max">
              {KANBAN_COLS.map((col) => {
                const leads = filteredLeads.filter((l) => l.col === col.id);
                return (
                  <div key={col.id} className="w-[220px] shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                        {col.label}
                      </span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "oklch(0.21 0.03 260 / 0.05)", color: "var(--fg-mute)" }}
                      >
                        {leads.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {leads.map((lead) => (
                        <div
                          key={lead.id}
                          className="rounded-[12px] p-3 transition-all hover:-translate-y-0.5 cursor-pointer"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                            >
                              {lead.initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{lead.name}</p>
                              <p className="text-[10.5px] truncate" style={{ color: "var(--fg-mute)" }}>{lead.co}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={tempStyle(lead.temp)}
                            >
                              {lead.temp}
                            </span>
                            <span className="text-[11px] font-mono font-bold" style={{ color: scoreColor(lead.score) }}>
                              {lead.score}
                            </span>
                          </div>
                          <div className="mt-2 pt-2 text-[10px]" style={{ borderTop: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                            via {lead.source}
                          </div>
                        </div>
                      ))}

                      {leads.length === 0 && (
                        <div
                          className="rounded-[12px] p-4 text-center text-[11px]"
                          style={{ border: "1px dashed var(--line)", color: "var(--fg-mute)" }}
                        >
                          Aucun lead
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Liste view */}
        {activeTab === "liste" && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="space-y-1">
              <div
                className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
              >
                <span>Lead</span><span>Entreprise</span><span>Étape</span><span>Temp.</span><span>Score</span><span>Source</span>
              </div>
              {MOCK_LEADS.map((lead, i) => {
                const colLabel = KANBAN_COLS.find((c) => c.id === lead.col)?.label ?? lead.col;
                return (
                  <div
                    key={lead.id}
                    className="grid items-center gap-4 px-4 py-3 rounded-[10px] cursor-pointer hover:brightness-[0.97] transition-all"
                    style={{
                      gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr",
                      background: i % 2 === 0 ? "var(--bg)" : "transparent",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                      >
                        {lead.initials}
                      </div>
                      <span className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{lead.name}</span>
                    </div>
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{lead.co}</span>
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{colLabel}</span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
                      style={tempStyle(lead.temp)}
                    >
                      {lead.temp}
                    </span>
                    <span className="text-[12px] font-mono font-bold" style={{ color: scoreColor(lead.score) }}>{lead.score}</span>
                    <span className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{lead.source}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Agent IA tab */}
        {activeTab === "agent" && (
          <section className="space-y-3">
            {AGENT_SUGGESTIONS.map((s) => (
              <div
                key={s.id}
                className="rounded-[14px] p-5 flex items-center justify-between gap-4"
                style={{ background: "var(--bg-card)", border: "1px solid var(--violet-line)", boxShadow: "var(--card-shadow)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                    style={{ background: "var(--violet-soft)" }}
                  >
                    <Bot className="h-4 w-4" style={{ color: "var(--violet-fg)" }} />
                  </div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{s.label}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.credits > 0 && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                    >
                      {s.credits} cr
                    </span>
                  )}
                  <button
                    className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                    style={{ background: "var(--violet-fg)", color: "white" }}
                  >
                    Lancer →
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Bottom strip — Agent IA propose */}
      <div
        className="fixed bottom-0 left-[220px] right-0 px-6 py-3 flex items-center justify-between z-40"
        style={{ background: "var(--bg-card)", borderTop: "1px solid var(--line)", backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--violet-fg)" }} />
          <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            Agent IA propose <span className="font-semibold" style={{ color: "var(--fg)" }}>3 actions</span> sur votre pipeline
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
            style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}
            onClick={() => setActiveTab("agent")}
          >
            Voir les 3
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
            style={{ background: "var(--violet-fg)", color: "white" }}
          >
            <Zap className="h-3 w-3" />
            Lancer relance auto
          </button>
        </div>
      </div>

      {/* Bottom padding to not hide content behind fixed bar */}
      <div className="h-16" />
    </>
  );
}
