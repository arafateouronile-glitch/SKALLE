"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Search, ExternalLink, Flame, Zap, Snowflake,
  Linkedin, Instagram, Facebook, ArrowUpDown,
  Kanban, Loader2,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  getScoredProspectsForDashboard,
  type ScoredProspectForDashboard,
} from "@/actions/cso-sales";

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  NEW:                { label: "Nouveau",    bg: "var(--bg-2)",          fg: "var(--fg-mute)"  },
  RESEARCHED:         { label: "Enrichi",    bg: "var(--cold-soft)",     fg: "var(--cold-fg)"  },
  MESSAGES_GENERATED: { label: "Prêt",       bg: "var(--violet-soft)",   fg: "var(--violet-fg)"},
  CONTACTED:          { label: "Contacté",   bg: "var(--violet-soft)",   fg: "var(--violet-fg)"},
  RESPONDED:          { label: "Répondu",    bg: "var(--amber-soft)",    fg: "var(--amber-fg)" },
  REPLIED:            { label: "Répondu",    bg: "var(--amber-soft)",    fg: "var(--amber-fg)" },
  MEETING_BOOKED:     { label: "Meeting",    bg: "var(--emerald-soft)",  fg: "var(--emerald-fg)"},
  CONVERTED:          { label: "Converti",   bg: "var(--emerald-soft)",  fg: "var(--emerald-fg)"},
  REJECTED:           { label: "Perdu",      bg: "var(--danger-soft)",   fg: "var(--danger-fg)" },
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  LINKEDIN:  Linkedin,
  INSTAGRAM: Instagram,
  FACEBOOK:  Facebook,
};

type SortKey = "score" | "name" | "company" | "lastInteractionAt" | "status";
type SortDir = "asc" | "desc";

function TempIcon({ temp }: { temp: string }) {
  if (temp === "HOT")  return <Flame     className="h-3.5 w-3.5" style={{ color: "var(--danger-fg)"  }} />;
  if (temp === "WARM") return <Zap       className="h-3.5 w-3.5" style={{ color: "var(--amber-fg)"  }} />;
  return                      <Snowflake className="h-3.5 w-3.5" style={{ color: "var(--cold-fg)"   }} />;
}

function scoreStyle(s: number) {
  if (s >= 75) return { bg: "var(--emerald-soft)", fg: "var(--emerald-fg)" };
  if (s >= 50) return { bg: "var(--amber-soft)",   fg: "var(--amber-fg)"  };
  return             { bg: "var(--bg-2)",           fg: "var(--fg-mute)"   };
}

function relDate(d: Date | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}j`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<ScoredProspectForDashboard[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterTemp,   setFilterTemp]   = useState("ALL");
  const [sortKey, setSortKey]     = useState<SortKey>("score");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    getUserWorkspace().then(async (r) => {
      if (!r.workspaceId) return;
      setWorkspaceId(r.workspaceId);
      const res = await getScoredProspectsForDashboard(r.workspaceId);
      if (res.success && res.data) setProspects(res.data);
      setLoading(false);
    });
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return prospects
      .filter((p) => {
        if (filterStatus !== "ALL" && p.status !== filterStatus) return false;
        if (filterTemp   !== "ALL" && p.temperature !== filterTemp) return false;
        if (q && !p.name.toLowerCase().includes(q) &&
                 !p.company.toLowerCase().includes(q) &&
                 !(p.jobTitle ?? "").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        let va: string | number | null = a[sortKey] as string | number | null;
        let vb: string | number | null = b[sortKey] as string | number | null;
        if (sortKey === "lastInteractionAt") {
          va = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
          vb = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
        }
        if (va == null) va = sortDir === "asc" ? Infinity : -Infinity;
        if (vb == null) vb = sortDir === "asc" ? Infinity : -Infinity;
        if (typeof va === "string" && typeof vb === "string")
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === "asc"
          ? (va as number) - (vb as number)
          : (vb as number) - (va as number);
      });
  }, [prospects, search, filterStatus, filterTemp, sortKey, sortDir]);

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
        style={{ color: active ? "var(--violet-fg)" : "var(--fg-mute)" }}>
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <>
      <AppTopBar title="Prospects" breadcrumb="sales-os / prospects" accent="violet" />

      <div className="p-6 max-w-[1200px] space-y-5">

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[220px] px-3 py-2.5 rounded-[10px]"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, entreprise, poste…"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-40"
              style={{ color: "var(--fg)" }}
            />
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-[10px] text-[12px] outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg)" }}>
            <option value="ALL">Tous les statuts</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]?.label ?? s}</option>
            ))}
          </select>

          {/* Temp filter */}
          <select
            value={filterTemp}
            onChange={(e) => setFilterTemp(e.target.value)}
            className="px-3 py-2.5 rounded-[10px] text-[12px] outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg)" }}>
            <option value="ALL">Toutes températures</option>
            <option value="HOT">🔥 Hot</option>
            <option value="WARM">⚡ Warm</option>
            <option value="COLD">❄️ Cold</option>
          </select>

          {/* Count + CRM link */}
          <div className="ml-auto flex items-center gap-2">
            {!loading && (
              <span className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
                {filtered.length} prospect{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
            <Link
              href="/sales-os/crm"
              className="flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-[12px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}>
              <Kanban className="h-3.5 w-3.5" />
              Vue Kanban
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-[16px] overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>

          {/* Header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_80px_90px_90px_44px] gap-4 px-5 py-3 text-[11px]"
            style={{ borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
            <SortBtn k="name"               label="Prospect" />
            <SortBtn k="company"            label="Entreprise" />
            <SortBtn k="status"             label="Statut" />
            <SortBtn k="score"              label="Score" />
            <span className="text-[11px] font-semibold" style={{ color: "var(--fg-mute)" }}>Temp.</span>
            <SortBtn k="lastInteractionAt"  label="Dernière act." />
            <span />
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2" style={{ color: "var(--fg-mute)" }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[13px]">Chargement…</span>
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--fg)" }}>
                {prospects.length === 0 ? "Aucun prospect encore" : "Aucun résultat"}
              </p>
              <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
                {prospects.length === 0
                  ? "Commencez par Hunt pour trouver vos premiers leads."
                  : "Ajustez les filtres ou la recherche."}
              </p>
              {prospects.length === 0 && (
                <Link href="/sales-os/hunt"
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-[9px] text-[12px] font-semibold transition-all hover:brightness-110"
                  style={{ background: "var(--violet-fg)", color: "white" }}>
                  Aller sur Hunt →
                </Link>
              )}
            </div>
          )}

          {/* Rows */}
          {!loading && filtered.map((p, i) => {
            const st   = STATUS_LABELS[p.status] ?? { label: p.status, bg: "var(--bg-2)", fg: "var(--fg-mute)" };
            const sc   = scoreStyle(p.score);
            const PlatIcon = p.platform ? PLATFORM_ICONS[p.platform] : null;

            return (
              <div key={p.id}
                className="grid grid-cols-[2fr_1.5fr_1fr_80px_90px_90px_44px] gap-4 px-5 py-3.5 items-center transition-colors hover:brightness-[0.98]"
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none",
                }}>

                {/* Name */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>
                      {p.name}
                    </p>
                    {PlatIcon && <PlatIcon className="h-3 w-3 shrink-0" style={{ color: "var(--fg-mute)" }} />}
                  </div>
                  {p.jobTitle && (
                    <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--fg-mute)" }}>
                      {p.jobTitle}
                    </p>
                  )}
                </div>

                {/* Company */}
                <p className="text-[12px] truncate" style={{ color: "var(--fg-dim)" }}>{p.company}</p>

                {/* Status */}
                <span className="text-[10px] font-bold px-2 py-1 rounded-[6px] w-fit"
                  style={{ background: st.bg, color: st.fg }}>
                  {st.label}
                </span>

                {/* Score */}
                <span className="text-[11px] font-bold px-2 py-0.5 rounded w-fit"
                  style={{ background: sc.bg, color: sc.fg }}>
                  {p.score}
                </span>

                {/* Temperature */}
                <div className="flex items-center gap-1">
                  <TempIcon temp={p.temperature} />
                  <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{p.temperature}</span>
                </div>

                {/* Last interaction */}
                <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                  {relDate(p.lastInteractionAt)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 justify-end">
                  <Link href={`/sales-os/prospects/${p.id}`}
                    className="p-1.5 rounded-[6px] transition-all hover:brightness-95"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}
                    title="Voir le profil">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </>
  );
}
