"use client";

import { useState, useRef, useEffect } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import Link from "next/link";
import { Search, Download, Loader2, CheckCircle, Copy, Check, UserPlus, Sparkles } from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  scanJobSignalsAction,
  scanLocalRadarAction,
  scanNewbornRadarAction,
  addSignalToCrmAction,
  bulkImportLocalLeadsAction,
  bulkImportNewbornLeadsAction,
  bulkAddSignalsToCrmAction,
  apolloProspectSearchAction,
  bulkSaveApolloLeadsAction,
  type ApolloProspectLead,
} from "@/actions/cso-sales";
import type { AnalyzedSignal } from "@/lib/services/sales/intent-signals";
import type { LocalLeadEvaluated } from "@/lib/services/sales/local-scraper";
import type { NewbornLeadEnriched } from "@/lib/services/sales/newborn-leads";

// ─── Modes ────────────────────────────────────────────────────────────────────

const HUNT_MODES = [
  { id: "jobs",     icon: "📡", title: "Offres d'emploi",       desc: "Entreprises qui recrutent dans votre cible",      credits: 15, live: true  },
  { id: "maps",     icon: "📍", title: "Locaux Maps",            desc: "Commerces locaux dans une zone Google Maps",      credits: 10, live: true  },
  { id: "new",      icon: "✦",  title: "Nouvelles entreprises",  desc: "Créations récentes dans votre secteur",           credits: 5,  live: true  },
  { id: "linkedin", icon: "🎯", title: "LinkedIn · Apollo",      desc: "275M contacts · email vérifié inclus",            credits: 20, live: true  },
  { id: "partners", icon: "🤝", title: "Partenaires",            desc: "Entreprises complémentaires à cibler",            credits: 8,  live: false },
] as const;

type HuntMode = (typeof HUNT_MODES)[number]["id"];

// ─── Normalised result ────────────────────────────────────────────────────────

interface HuntResult {
  key: string;
  name: string;
  company: string;
  location: string;
  signal: string;
  hook: string;
  score: number;
  // raw payload for import
  _raw: AnalyzedSignal | LocalLeadEvaluated | NewbornLeadEnriched | ApolloProspectLead;
  _type: "signal" | "local" | "newborn" | "apollo";
}

function fromSignal(s: AnalyzedSignal): HuntResult {
  return {
    key: `signal-${s.companyName}-${s.jobTitle}`,
    name: s.companyName,
    company: s.companyName,
    location: s.location ?? "—",
    signal: s.jobTitle,
    hook: s.hook,
    score: s.intentScore ?? 72,
    _raw: s,
    _type: "signal",
  };
}

function fromLocal(l: LocalLeadEvaluated): HuntResult {
  return {
    key: `local-${l.name}-${l.address}`,
    name: l.name,
    company: l.name,
    location: l.address ?? "—",
    signal: l.tag?.replace(/_/g, " ") ?? "Lead local",
    hook: l.suggestedHook,
    score: l.rating ? Math.min(100, Math.round(l.rating * 18)) : 55,
    _raw: l,
    _type: "local",
  };
}

function fromNewborn(n: NewbornLeadEnriched): HuntResult {
  return {
    key: `newborn-${n.siret}`,
    name: n.directorFullName || n.companyName,
    company: n.companyName,
    location: [n.city, n.zipCode].filter(Boolean).join(" ") || "—",
    signal: `Créée le ${n.creationDate}`,
    hook: n.suggestedHook,
    score: 80,
    _raw: n,
    _type: "newborn",
  };
}

function fromApolloLead(l: ApolloProspectLead): HuntResult {
  const emailTag = l.emailVerified
    ? "✓ Email vérifié"
    : l.email
    ? "Email non vérifié"
    : "Sans email (enrichissement auto)";
  return {
    key: `apollo-${l.linkedInUrl ?? l.name}-${l.company}`,
    name: l.name,
    company: `${l.company}${l.industry ? ` · ${l.industry}` : ""}`,
    location: l.location ?? "—",
    signal: l.jobTitle ?? "Profil LinkedIn",
    hook: emailTag,
    score: l.emailVerified ? 85 : l.email ? 70 : 55,
    _raw: l,
    _type: "apollo",
  };
}

function tempStyle(score: number) {
  if (score >= 85) return { background: "var(--danger-soft)", color: "var(--danger-fg)", label: "HOT" };
  if (score >= 65) return { background: "var(--amber-soft)", color: "var(--amber-fg)", label: "WARM" };
  return { background: "var(--bg-2)", color: "var(--fg-mute)", label: "COLD" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HuntPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedMode, setSelectedMode] = useState<HuntMode>("jobs");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Paris");
  const [results, setResults] = useState<HuntResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [leadStates, setLeadStates] = useState<Record<string, "idle" | "loading" | "done">>({});
  const [leadProspectIds, setLeadProspectIds] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    getUserWorkspace().then((r) => { if (r.workspaceId) setWorkspaceId(r.workspaceId); });
  }, []);

  const mode = HUNT_MODES.find((m) => m.id === selectedMode)!;

  async function handleScan() {
    if (!query.trim() || !workspaceId) { inputRef.current?.focus(); return; }
    if (!mode.live) return;

    setScanning(true);
    setError(null);
    setResults([]);
    setImported(false);
    setLeadStates({});
    setLeadProspectIds({});
    setCopiedKey(null);

    try {
      if (selectedMode === "jobs") {
        const r = await scanJobSignalsAction(workspaceId, query.trim(), location.trim() || "France");
        if (!r.success) { setError(r.error ?? "Erreur scan"); return; }
        setResults((r.signals ?? []).map(fromSignal));

      } else if (selectedMode === "maps") {
        const r = await scanLocalRadarAction(workspaceId, `${query.trim()} ${location.trim()}`.trim(), 15);
        if (!r.success) { setError(r.error ?? "Erreur scan"); return; }
        setResults((r.leads ?? []).map(fromLocal));

      } else if (selectedMode === "new") {
        // Try to match query to a sector code from FRENCH_SECTORS, fallback "62" (tech)
        const sectorCode = query.match(/^\d{2}/) ? query.slice(0, 2) : "62";
        const zipCode = location.trim().slice(0, 5) || "75";
        const r = await scanNewbornRadarAction(workspaceId, { daysAgo: 30, sectorCode, zipCode, limit: 15 });
        if (!r.success) { setError(r.error ?? "Erreur scan"); return; }
        setResults((r.leads ?? []).map(fromNewborn));

      } else if (selectedMode === "linkedin") {
        const jobTitles = query.split(",").map((t) => t.trim()).filter(Boolean);
        const r = await apolloProspectSearchAction(workspaceId, {
          jobTitles,
          locations: [location.trim() || "France"],
          perPage: 25,
        });
        if (!r.success) { setError(r.error ?? "Erreur Apollo"); return; }
        setResults((r.leads ?? []).map(fromApolloLead));
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleImportAll() {
    if (!workspaceId || results.length === 0) return;
    setImporting(true);

    const signals     = results.filter((r) => r._type === "signal").map((r) => r._raw as AnalyzedSignal);
    const locals      = results.filter((r) => r._type === "local").map((r) => r._raw as LocalLeadEvaluated);
    const newborns    = results.filter((r) => r._type === "newborn").map((r) => r._raw as NewbornLeadEnriched);
    const apolloLeads = results.filter((r) => r._type === "apollo").map((r) => r._raw as ApolloProspectLead);

    await Promise.allSettled([
      signals.length     > 0 ? bulkAddSignalsToCrmAction(workspaceId, signals) : null,
      locals.length      > 0 ? bulkImportLocalLeadsAction(workspaceId, locals) : null,
      newborns.length    > 0 ? bulkImportNewbornLeadsAction(workspaceId, newborns) : null,
      apolloLeads.length > 0 ? bulkSaveApolloLeadsAction(workspaceId, apolloLeads) : null,
    ].filter(Boolean));

    setImporting(false);
    setImported(true);
    // Mark all as done
    setLeadStates(Object.fromEntries(results.map((r) => [r.key, "done"])));
  }

  async function handleImportOne(lead: HuntResult) {
    if (!workspaceId || leadStates[lead.key] === "loading" || leadStates[lead.key] === "done") return;
    setLeadStates((prev) => ({ ...prev, [lead.key]: "loading" }));
    try {
      let prospectId: string | undefined;
      if (lead._type === "signal") {
        const r = await addSignalToCrmAction(workspaceId, lead._raw as AnalyzedSignal);
        prospectId = r.prospectId;
      } else if (lead._type === "local") {
        const r = await bulkImportLocalLeadsAction(workspaceId, [lead._raw as LocalLeadEvaluated]);
        prospectId = r.prospects?.[0]?.id;
      } else if (lead._type === "newborn") {
        const r = await bulkImportNewbornLeadsAction(workspaceId, [lead._raw as NewbornLeadEnriched]);
        prospectId = r.prospects?.[0]?.id;
      } else {
        const r = await bulkSaveApolloLeadsAction(workspaceId, [lead._raw as ApolloProspectLead]);
        prospectId = r.prospects?.[0]?.id;
      }
      if (prospectId) setLeadProspectIds((prev) => ({ ...prev, [lead.key]: prospectId! }));
      setLeadStates((prev) => ({ ...prev, [lead.key]: "done" }));
    } catch {
      setLeadStates((prev) => ({ ...prev, [lead.key]: "idle" }));
    }
  }

  function handleCopyHook(lead: HuntResult) {
    navigator.clipboard.writeText(lead.hook).catch(() => null);
    setCopiedKey(lead.key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <>
      <AppTopBar title="Hunt" breadcrumb="sales-os / hunt" accent="amber" />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Mode picker + input */}
        <section className="rounded-[18px] p-8"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4"
            style={{ color: "var(--fg-mute)" }}>
            <Search className="h-3 w-3" style={{ color: "var(--amber-fg)" }} />
            Où chercher ?
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {HUNT_MODES.map((m) => {
              const active = selectedMode === m.id;
              return (
                <button key={m.id}
                  onClick={() => { setSelectedMode(m.id); setResults([]); setError(null); setImported(false); }}
                  className="text-left p-4 rounded-[12px] transition-all relative"
                  style={active
                    ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }
                    : { background: "var(--bg)", border: "1px solid var(--line)", opacity: m.live ? 1 : 0.5 }}>
                  <div className="text-[20px] mb-2">{m.icon}</div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-[12px] font-semibold leading-tight"
                      style={{ color: active ? "var(--amber-fg)" : "var(--fg)" }}>
                      {m.title}
                    </p>
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
                      style={{ background: active ? "var(--amber-fg)" : "oklch(0.21 0.03 260 / 0.04)", color: active ? "white" : "var(--fg-mute)" }}>
                      {m.live ? `${m.credits}cr` : "soon"}
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{m.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Input area */}
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
              style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
              <span className="text-[16px]">{mode.icon}</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setResults([]); }}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                disabled={!mode.live}
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50 disabled:opacity-40"
                style={{ color: "var(--fg)" }}
                placeholder={
                  selectedMode === "jobs"     ? "Mots-clés (ex : SaaS B2B, startup tech…)" :
                  selectedMode === "maps"     ? "Type d'établissement (ex : agence digitale…)" :
                  selectedMode === "new"      ? "Secteur ou code NAF (ex : 62, informatique…)" :
                  selectedMode === "linkedin" ? "Poste(s) ciblés (ex : Head of Growth, VP Sales, CMO)" :
                  "Bientôt disponible"
                }
              />
            </div>
            {/* Location input for jobs + maps + new */}
            {mode.live && (
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                placeholder="Ville / dept"
                className="w-32 px-3 py-3 rounded-[10px] text-[13px] outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
              />
            )}
            <button
              onClick={handleScan}
              disabled={scanning || !mode.live || !query.trim()}
              className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2 disabled:opacity-40"
              style={{ background: "var(--amber-fg)", color: "white" }}>
              {scanning
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">{mode.credits} cr</span> Lancer →</>
              }
            </button>
          </div>

          {error && (
            <p className="mt-3 text-[12px] px-3 py-2 rounded-[8px]"
              style={{ background: "var(--danger-soft)", color: "var(--danger-fg)" }}>{error}</p>
          )}
        </section>

        {/* Results */}
        {results.length > 0 && (
          <section className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-1"
                  style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber-fg)" }} />
                  Résultats — {query}
                </div>
                <h2 className="font-display text-[20px] font-semibold" style={{ color: "var(--fg)" }}>
                  {results.length} leads détectés
                </h2>
              </div>
              <button
                onClick={handleImportAll}
                disabled={importing || imported}
                className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110 disabled:opacity-60"
                style={{ background: imported ? "var(--emerald-soft)" : "var(--amber-fg)", color: imported ? "var(--emerald-fg)" : "white" }}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : imported ? <CheckCircle className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                {imported ? "Importés dans le CRM" : `Importer tout (${results.length})`}
              </button>
            </div>

            <div className="space-y-2">
              {results.map((lead) => {
                const ts = tempStyle(lead.score);
                const initials = lead.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                const ls = leadStates[lead.key] ?? "idle";
                return (
                  <div key={lead.key}
                    className="flex items-center gap-4 px-4 py-4 rounded-[12px] transition-all"
                    style={{
                      background: ls === "done" ? "var(--emerald-soft)" : "var(--bg)",
                      border: ls === "done" ? "1px solid var(--emerald-line)" : "1px solid var(--line)",
                    }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}>
                      {initials}
                    </div>
                    <div className="w-40 shrink-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{lead.name}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{lead.company} · {lead.location}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--amber-fg)" }}>⚡ {lead.signal}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{lead.hook}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ background: ts.background, color: ts.color }}>{ts.label}</span>
                      <span className="text-[13px] font-mono font-bold w-8 text-right"
                        style={{ color: lead.score >= 85 ? "var(--danger-fg)" : "var(--amber-fg)" }}>
                        {lead.score}
                      </span>
                      {/* Copier le hook */}
                      <button
                        onClick={() => handleCopyHook(lead)}
                        title="Copier le message d'accroche"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium transition-all hover:brightness-95"
                        style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                        {copiedKey === lead.key
                          ? <Check className="h-3 w-3" style={{ color: "var(--emerald-fg)" }} />
                          : <Copy className="h-3 w-3" />}
                        <span className="hidden sm:inline">{copiedKey === lead.key ? "Copié" : "Hook"}</span>
                      </button>
                      {/* Ajouter au CRM */}
                      <button
                        onClick={() => handleImportOne(lead)}
                        disabled={ls !== "idle"}
                        title={ls === "done" ? "Déjà dans le CRM" : "Ajouter ce lead au CRM"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[11px] font-semibold transition-all hover:brightness-110 disabled:opacity-70 disabled:cursor-default"
                        style={ls === "done"
                          ? { background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }
                          : { background: "var(--amber-fg)", color: "white" }}>
                        {ls === "loading"
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : ls === "done"
                          ? <CheckCircle className="h-3 w-3" />
                          : <UserPlus className="h-3 w-3" />}
                        <span>{ls === "done" ? "Ajouté" : ls === "loading" ? "…" : "Ajouter"}</span>
                      </button>
                      {/* Message IA — visible only after import */}
                      {ls === "done" && leadProspectIds[lead.key] && (
                        <Link
                          href={`/sales-os/reply-assistant?prospectId=${leadProspectIds[lead.key]}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[11px] font-semibold transition-all hover:brightness-110"
                          style={{ background: "var(--violet-fg)", color: "white" }}>
                          <Sparkles className="h-3 w-3" />
                          Message IA →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty scan state */}
        {!scanning && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-[18px]"
            style={{ border: "1px dashed var(--line)" }}>
            <p className="text-[32px]">{mode.live ? mode.icon : "🔒"}</p>
            <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
              {mode.live ? `Prêt à scanner ${mode.title.toLowerCase()}` : "Bientôt disponible"}
            </p>
            <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
              {mode.live ? `Entrez votre recherche et cliquez sur Lancer` : "Cette source sera disponible dans une prochaine version"}
            </p>
          </div>
        )}

      </div>
    </>
  );
}
