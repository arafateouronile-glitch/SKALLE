"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Search, ExternalLink, Flame, Zap, Snowflake,
  Linkedin, Instagram, Facebook, ArrowUpDown,
  Kanban, Loader2, GitMerge, Play, X, CheckSquare,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  getScoredProspectsForDashboard,
  type ScoredProspectForDashboard,
} from "@/actions/cso-sales";
import { getSequences, cloneSequence } from "@/actions/sequences";
import { toast } from "sonner";

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

interface SeqTemplate {
  id: string;
  name: string;
  abTestId: string | null;
  abVariant: string | null;
  prospect: { name: string; company: string };
  steps: { channel: string; status: string }[];
}

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

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, indeterminate }: {
  checked: boolean;
  onChange: () => void;
  indeterminate?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      className="h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all"
      style={{
        background: checked ? "var(--violet-fg)" : "transparent",
        borderColor: checked ? "var(--violet-fg)" : "var(--line)",
      }}
    >
      {indeterminate ? (
        <span style={{ width: 8, height: 2, background: "white", display: "block", borderRadius: 1 }} />
      ) : checked ? (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
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

  // Bulk state
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [seqModalOpen, setSeqModalOpen] = useState(false);
  const [templates, setTemplates]     = useState<SeqTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [pickedSeqId, setPickedSeqId] = useState<string | null>(null);
  const [launching, setLaunching]     = useState(false);

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

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allFilteredIds = filtered.map((p) => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id)) && !allSelected;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allFilteredIds.forEach((id) => next.delete(id));
      else allFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // ── Bulk launch ────────────────────────────────────────────────────────────

  async function openSeqModal() {
    if (!workspaceId) return;
    setSeqModalOpen(true);
    setPickedSeqId(null);
    setTemplatesLoading(true);
    const res = await getSequences(workspaceId);
    if (res.success && res.data) setTemplates(res.data as SeqTemplate[]);
    setTemplatesLoading(false);
  }

  async function handleBulkLaunch() {
    if (!pickedSeqId || selected.size === 0) return;
    setLaunching(true);
    try {
      const picked = templates.find((t) => t.id === pickedSeqId);
      const ids = Array.from(selected);

      // A/B split: if the picked sequence is part of an A/B test, find variant B and split 50/50
      if (picked?.abTestId) {
        const variantB = templates.find(
          (t) => t.abTestId === picked.abTestId && t.id !== pickedSeqId
        );
        if (variantB) {
          const half = Math.ceil(ids.length / 2);
          const aIds = ids.slice(0, half);
          const bIds = ids.slice(half);
          const [resA, resB] = await Promise.all([
            cloneSequence(pickedSeqId, aIds),
            cloneSequence(variantB.id, bIds),
          ]);
          const totalCreated = resA.created + resB.created;
          if (totalCreated > 0) {
            toast.success(`A/B test lancé — ${resA.created} × variante A, ${resB.created} × variante B`);
            setSeqModalOpen(false);
            setSelected(new Set());
          } else {
            toast.error([...resA.errors, ...resB.errors][0] ?? "Erreur");
          }
          return;
        }
      }

      // Normal launch (no A/B)
      const res = await cloneSequence(pickedSeqId, ids);
      if (res.created > 0) {
        toast.success(`${res.created} séquence${res.created > 1 ? "s" : ""} créée${res.created > 1 ? "s" : ""} — cliquez Lancer dans la page Séquences`);
        setSeqModalOpen(false);
        setSelected(new Set());
      }
      if (res.errors.length > 0 && res.created === 0) {
        toast.error(res.errors[0]);
      } else if (res.errors.length > 0) {
        toast.warning(`${res.errors.length} erreur(s) — certains prospects déjà ciblés`);
      }
    } catch {
      toast.error("Erreur lors du lancement");
    } finally {
      setLaunching(false);
    }
  }

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
          <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_80px_90px_90px_44px] gap-4 px-5 py-3 text-[11px]"
            style={{ borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
            <div className="flex items-center">
              <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
            </div>
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
            const isSelected = selected.has(p.id);

            return (
              <div key={p.id}
                className="grid grid-cols-[28px_2fr_1.5fr_1fr_80px_90px_90px_44px] gap-4 px-5 py-3.5 items-center transition-colors hover:brightness-[0.98]"
                style={{
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none",
                  background: isSelected ? "var(--violet-soft)" : undefined,
                }}>

                {/* Checkbox */}
                <div className="flex items-center">
                  <Checkbox checked={isSelected} onChange={() => toggleOne(p.id)} />
                </div>

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

      {/* ── Floating bulk action bar ──────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
          style={{ background: "#1a1d2e", border: "1px solid rgba(139,92,246,0.3)" }}>
          <CheckSquare className="h-4 w-4" style={{ color: "var(--violet-fg)" }} />
          <span className="text-[13px] font-semibold text-white">
            {selected.size} prospect{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <div className="w-px h-5 bg-white/10" />
          <button
            onClick={openSeqModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
            style={{ background: "var(--violet-fg)", color: "white" }}
          >
            <GitMerge className="h-3.5 w-3.5" />
            Lancer une séquence
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="p-1.5 rounded text-slate-500 hover:text-white transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Sequence template picker modal ───────────────────────────────────── */}
      {seqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSeqModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-[#0f1117] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-[14px] font-bold text-white flex items-center gap-2">
                  <GitMerge className="h-4 w-4 text-violet-400" />
                  Choisir une séquence template
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sera copiée pour les {selected.size} prospect{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={() => setSeqModalOpen(false)} className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sequence list */}
            <div className="max-h-80 overflow-y-auto">
              {templatesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                </div>
              ) : templates.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-slate-400">Aucune séquence disponible</p>
                  <p className="text-[11px] text-slate-600 mt-1">Créez d&apos;abord une séquence dans l&apos;onglet Séquences.</p>
                  <Link href="/sales-os/sequences" className="inline-block mt-3 text-[11px] text-violet-400 hover:underline" onClick={() => setSeqModalOpen(false)}>
                    Aller aux séquences →
                  </Link>
                </div>
              ) : (
                templates.map((seq) => {
                  const picked = pickedSeqId === seq.id;
                  const emailCount = seq.steps.filter((s) => s.channel === "EMAIL").length;
                  const liCount = seq.steps.filter((s) => s.channel === "LINKEDIN").length;
                  return (
                    <button
                      key={seq.id}
                      onClick={() => setPickedSeqId(picked ? null : seq.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all border-b border-white/[0.04] last:border-0"
                      style={{ background: picked ? "rgba(139,92,246,0.1)" : undefined }}
                    >
                      <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                        style={{ borderColor: picked ? "rgb(139,92,246)" : "rgba(255,255,255,0.15)" }}>
                        {picked && <div className="h-2 w-2 rounded-full bg-violet-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white truncate">{seq.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Template de {seq.prospect.name} · {seq.prospect.company}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                        {seq.steps.length} étape{seq.steps.length > 1 ? "s" : ""}
                        {emailCount > 0 && <span className="text-violet-400">{emailCount}×✉</span>}
                        {liCount > 0 && <span className="text-blue-400">{liCount}×in</span>}
                        {seq.abTestId && seq.abVariant === "A" && (
                          <span className="text-amber-400 font-bold">A/B</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.08] bg-white/[0.02]">
              <p className="text-[11px] text-slate-500">
                {pickedSeqId
                  ? (() => {
                      const t = templates.find((x) => x.id === pickedSeqId);
                      const hasAB = t?.abTestId && templates.some((x) => x.abTestId === t.abTestId && x.id !== pickedSeqId);
                      if (hasAB) {
                        const half = Math.ceil(selected.size / 2);
                        return `Split A/B auto : ~${half} × Var.A + ~${selected.size - half} × Var.B`;
                      }
                      return `Créera ${selected.size} séquence${selected.size > 1 ? "s" : ""} (état "Prête" → à lancer)`;
                    })()
                  : "Sélectionnez une séquence ci-dessus"}
              </p>
              <button
                onClick={handleBulkLaunch}
                disabled={!pickedSeqId || launching}
                className="flex items-center gap-2 px-4 py-2 rounded-[9px] text-[12px] font-semibold transition-all disabled:opacity-40 hover:brightness-110"
                style={{ background: "var(--violet-fg)", color: "white" }}
              >
                {launching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Play className="h-3.5 w-3.5" />}
                Créer les séquences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
