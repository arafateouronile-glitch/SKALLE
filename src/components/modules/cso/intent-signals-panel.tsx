"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Zap,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Users,
  Globe,
  Handshake,
  Newspaper,
  DollarSign,
  Rocket,
  UserSearch,
} from "lucide-react";
import { FindContactsDialog } from "./find-contacts-dialog";
import { toast } from "sonner";
import type { SignalType } from "@prisma/client";

interface SignalProspect {
  id: string;
  name: string;
  company: string;
  linkedInUrl: string;
}

interface IntentSignalItem {
  id: string;
  type: SignalType;
  companyName: string;
  title: string;
  description?: string | null;
  sourceUrl?: string | null;
  score: number;
  detectedAt: string;
  prospect?: SignalProspect | null;
}

interface Props {
  workspaceId: string;
}

const SIGNAL_META: Record<
  SignalType,
  { label: string; color: string; icon: React.ReactNode; description: string }
> = {
  FUNDING: {
    label: "Levée de fonds",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <DollarSign className="h-3.5 w-3.5" />,
    description: "A des fonds à dépenser — moment idéal pour approcher",
  },
  HIRING: {
    label: "Recrutement",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <Users className="h-3.5 w-3.5" />,
    description: "En croissance — budget disponible pour de nouveaux outils",
  },
  EXPANSION: {
    label: "Expansion",
    color: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    icon: <Globe className="h-3.5 w-3.5" />,
    description: "Nouveaux marchés = nouveaux besoins",
  },
  ACQUISITION: {
    label: "Acquisition",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    description: "Restructuration — opportunité d'intégration",
  },
  PARTNERSHIP: {
    label: "Partenariat",
    color: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <Handshake className="h-3.5 w-3.5" />,
    description: "En mode deal — réceptif aux propositions",
  },
  NEWS: {
    label: "Actualité",
    color: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    icon: <Newspaper className="h-3.5 w-3.5" />,
    description: "Mention récente — bon prétexte pour contacter",
  },
  NEW_COMPANY: {
    label: "Nouvelle entreprise",
    color: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: <Rocket className="h-3.5 w-3.5" />,
    description: "Vient d'être créée dans ton secteur cible — premier à approcher",
  },
};

const SCORE_COLOR: Record<string, string> = {
  high: "text-emerald-400",
  mid: "text-amber-400",
  low: "text-slate-500",
};

function scoreColor(score: number) {
  if (score >= 80) return SCORE_COLOR.high;
  if (score >= 60) return SCORE_COLOR.mid;
  return SCORE_COLOR.low;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

const FILTERS: Array<{ value: SignalType | "ALL"; label: string }> = [
  { value: "ALL", label: "Tous" },
  { value: "NEW_COMPANY", label: "Nouvelles entreprises" },
  { value: "FUNDING", label: "Levées" },
  { value: "HIRING", label: "Recrutement" },
  { value: "EXPANSION", label: "Expansion" },
  { value: "ACQUISITION", label: "Acquisitions" },
  { value: "PARTNERSHIP", label: "Partenariats" },
];

export function IntentSignalsPanel({ workspaceId }: Props) {
  const [signals, setSignals] = useState<IntentSignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<SignalType | "ALL">("ALL");
  const [contactDialog, setContactDialog] = useState<{ open: boolean; company: string }>({
    open: false,
    company: "",
  });

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/prospects/intent-signals?workspaceId=${workspaceId}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json() as { signals: IntentSignalItem[] };
      setSignals(data.signals);
    } catch {
      toast.error("Impossible de charger les signaux");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/prospects/intent-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json() as {
        saved?: number;
        signals?: IntentSignalItem[];
        error?: string;
        message?: string;
      };
      if (!res.ok) { toast.error(data.error ?? "Erreur scan"); return; }
      if (data.message && !data.saved) { toast.info(data.message); return; }
      toast.success(`${data.saved} nouveau${(data.saved ?? 0) > 1 ? "x" : ""} signal${(data.saved ?? 0) > 1 ? "s" : ""} détecté${(data.saved ?? 0) > 1 ? "s" : ""}`);
      if (data.signals) setSignals(data.signals);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setScanning(false);
    }
  }

  const displayed = filter === "ALL" ? signals : signals.filter((s) => s.type === filter);

  const counts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-amber-400" />
            <h2 className="text-[18px] font-bold text-white">Intent Signals</h2>
            {signals.length > 0 && (
              <span className="text-[11px] bg-amber-400/15 text-amber-400 border border-amber-400/30 px-1.5 py-0.5 rounded font-bold">
                {signals.length}
              </span>
            )}
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
              ● Auto 8h/jour
            </span>
          </div>
          <p className="text-[12px] text-slate-400">
            Surveillance continue — levées de fonds, recrutements, nouvelles entreprises dans ton secteur.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[12px] gap-1.5 border border-white/[0.08] text-slate-400 hover:text-white"
            onClick={fetchSignals}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button
            size="sm"
            className="h-8 text-[12px] gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {scanning ? "Scanning…" : "Scanner maintenant"}
          </Button>
        </div>
      </div>

      {/* Score summary */}
      {signals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(SIGNAL_META)
            .filter(([type]) => (counts[type] ?? 0) > 0)
            .map(([type, meta]) => (
              <div
                key={type}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
                onClick={() => setFilter(filter === type as SignalType ? "ALL" : type as SignalType)}
              >
                <span className={`p-1.5 rounded-md border ${meta.color}`}>{meta.icon}</span>
                <div>
                  <p className="text-[12px] font-semibold text-white">{counts[type] ?? 0}</p>
                  <p className="text-[10px] text-slate-500">{meta.label}</p>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Filters */}
      {signals.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                filter === value
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "border-white/[0.08] text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
              {value !== "ALL" && counts[value] ? (
                <span className="ml-1 opacity-60">{counts[value]}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        </div>
      )}

      {/* Empty */}
      {!loading && signals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <Zap className="h-10 w-10 text-slate-600" />
          <div className="text-center space-y-1">
            <p className="text-[14px] font-semibold text-slate-400">Aucun signal détecté</p>
            <p className="text-[12px] text-slate-600">
              Lance un scan pour détecter les levées de fonds, recrutements et expansions de tes prospects.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-[12px] gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 mt-2"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {scanning ? "Scanning…" : "Scanner maintenant"}
          </Button>
        </div>
      )}

      {/* Signal cards */}
      {!loading && displayed.length > 0 && (
        <div className="space-y-2">
          {displayed.map((signal) => {
            const meta = SIGNAL_META[signal.type];
            return (
              <div
                key={signal.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] transition-all p-3.5 flex gap-3"
              >
                {/* Icon */}
                <div className={`shrink-0 mt-0.5 p-1.5 rounded-lg border ${meta.color} h-fit`}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold px-1.5 py-0 border ${meta.color}`}
                        >
                          {meta.label}
                        </Badge>
                        <span className="text-[12px] font-semibold text-white truncate">
                          {signal.companyName}
                        </span>
                        {signal.prospect && (
                          <a
                            href={signal.prospect.linkedInUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-sky-400 hover:text-sky-300 truncate max-w-[120px]"
                          >
                            → {signal.prospect.name}
                          </a>
                        )}
                      </div>
                      <p className="text-[12px] text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                        {signal.title}
                      </p>
                      {signal.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {signal.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`text-[13px] font-bold ${scoreColor(signal.score)}`}>
                        ⚡{signal.score}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {formatDate(signal.detectedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Intent hint */}
                  <p className="text-[10px] text-slate-600 italic">{meta.description}</p>

                  {/* Actions row */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setContactDialog({ open: true, company: signal.companyName })}
                      className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors font-medium"
                    >
                      <UserSearch className="h-3 w-3" />
                      Trouver les contacts
                    </button>
                    {signal.sourceUrl && (
                      <a
                        href={signal.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-sky-400 transition-colors"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Source
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <FindContactsDialog
      companyName={contactDialog.company}
      workspaceId={workspaceId}
      open={contactDialog.open}
      onClose={() => setContactDialog({ open: false, company: "" })}
    />
    </>
  );
}
