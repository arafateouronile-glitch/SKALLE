"use client";

/**
 * 🎯 Radar à Signaux — Intent Search
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Radio,
  Loader2,
  UserPlus,
  X,
  ExternalLink,
  Building2,
  MapPin,
  Sparkles,
  ArrowRight,
  Zap,
  AlertCircle,
  Rocket,
  CheckSquare,
  Square,
} from "lucide-react";
import Link from "next/link";
import { getUserWorkspace } from "@/actions/leads";
import { scanJobSignalsAction, addSignalToCrmAction, bulkAddSignalsToCrmAction } from "@/actions/cso-sales";
import type { AnalyzedSignal } from "@/lib/services/sales/intent-signals";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

const COST = CREDIT_COSTS.job_board_signals;

export default function SignalsRadarPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("Paris");
  const [scanning, setScanning] = useState(false);
  const [signals, setSignals] = useState<AnalyzedSignal[]>([]);
  const [isMockData, setIsMockData] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [detailSignal, setDetailSignal] = useState<AnalyzedSignal | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [campaignProspects, setCampaignProspects] = useState<{ id: string; name: string; email: string | null; company: string; jobTitle: string | null }[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const signalId = (s: AnalyzedSignal) => s.companyName + s.jobTitle;

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  const handleScan = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspaceId || !keyword.trim()) {
        toast.error("Saisissez un intitulé de poste.");
        return;
      }
      setScanning(true);
      setSignals([]);
      setIsMockData(false);
      setSelectedIds(new Set());
      try {
        const res = await scanJobSignalsAction(workspaceId, keyword.trim(), location.trim());
        if (res.success && res.signals?.length) {
          setSignals(res.signals);
          setIsMockData(!!res.isMockData);
          if (res.isMockData) {
            toast.warning("Données de démonstration — configurez SERPAPI_API_KEY ou SERPER_API_KEY pour les vraies offres d'emploi.");
          } else {
            toast.success(`${res.signals.length} signal(ux) détecté(s).`);
          }
        } else if (res.success && (!res.signals || res.signals.length === 0)) {
          toast.info("Aucun signal détecté dans ce secteur.");
        } else {
          toast.error(res.error ?? "Erreur lors du scan.");
        }
      } catch {
        toast.error("Erreur lors du scan.");
      } finally {
        setScanning(false);
      }
    },
    [workspaceId, keyword, location]
  );

  const handleAddToCrm = useCallback(
    async (signal: AnalyzedSignal) => {
      if (!workspaceId) return;
      const id = signal.companyName + signal.jobTitle;
      setAddingId(id);
      try {
        const res = await addSignalToCrmAction(workspaceId, signal);
        if (res.success) {
          setSignals((prev) => prev.filter((s) => s.companyName + s.jobTitle !== id));
          setDetailSignal((prev) =>
            prev && prev.companyName + prev.jobTitle === id ? null : prev
          );
          toast.success("Ajouté au CRM.");
        } else {
          toast.error(res.error ?? "Erreur.");
        }
      } catch {
        toast.error("Erreur lors de l'ajout.");
      } finally {
        setAddingId(null);
      }
    },
    [workspaceId]
  );

  const handleIgnore = useCallback((signal: AnalyzedSignal) => {
    const id = signal.companyName + signal.jobTitle;
    setSignals((prev) => prev.filter((s) => s.companyName + s.jobTitle !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDetailSignal((prev) =>
      prev && prev.companyName + prev.jobTitle === id ? null : prev
    );
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === signals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(signals.map(signalId)));
    }
  }, [signals, selectedIds.size]);

  const handleLaunchCampaign = useCallback(async () => {
    if (!workspaceId || selectedIds.size === 0) {
      toast.error("Sélectionnez au moins un signal.");
      return;
    }
    const toImport = signals.filter((s) => selectedIds.has(signalId(s)));
    setBulkImporting(true);
    try {
      const res = await bulkAddSignalsToCrmAction(workspaceId, toImport);
      if (res.success && res.prospects && res.prospects.length > 0) {
        setSignals((prev) => prev.filter((s) => !selectedIds.has(signalId(s))));
        setSelectedIds(new Set());
        setCampaignProspects(res.prospects);
        setWizardOpen(true);
        toast.success(`${res.imported} signal(aux) importé(s). Configurez votre campagne.`);
      } else {
        toast.error(res.error ?? "Erreur lors de l'import.");
      }
    } catch {
      toast.error("Erreur lors de l'import.");
    } finally {
      setBulkImporting(false);
    }
  }, [workspaceId, signals, selectedIds]);

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Barre sticky ── */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">

          {/* Titre */}
          <div className="flex items-center gap-3 py-4 border-b border-gray-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
              <Radio className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Radar à Signaux</h1>
              <p className="text-[11px] text-gray-500">
                Détectez les entreprises qui recrutent et transformez-les en leads
              </p>
            </div>
            {signals.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {signals.length} signal{signals.length > 1 ? "aux" : ""} détecté{signals.length > 1 ? "s" : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-xl px-2 text-xs text-gray-500 hover:bg-gray-100"
                  onClick={toggleSelectAll}
                >
                  {selectedIds.size === signals.length ? (
                    <><CheckSquare className="mr-1 h-3.5 w-3.5" />Tout désélectionner</>
                  ) : (
                    <><Square className="mr-1 h-3.5 w-3.5" />Tout sélectionner</>
                  )}
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    disabled={bulkImporting}
                    onClick={handleLaunchCampaign}
                    className="h-7 rounded-xl border-0 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 text-xs font-semibold text-white hover:from-indigo-500 hover:to-violet-500"
                  >
                    {bulkImporting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <><Rocket className="mr-1 h-3 w-3" />Campagne ({selectedIds.size})</>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Formulaire */}
          <form
            onSubmit={handleScan}
            className="flex flex-col gap-4 py-4 sm:flex-row sm:items-end sm:gap-3"
          >
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="keyword"
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  Intitulé du poste
                </Label>
                <Input
                  id="keyword"
                  placeholder="ex: Marketing Manager"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="h-9 rounded-xl border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-400"
                  disabled={scanning}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="location"
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  Localisation
                </Label>
                <Input
                  id="location"
                  placeholder="ex: Paris"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-9 rounded-xl border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-400"
                  disabled={scanning}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Zap className="h-3 w-3" />
                {COST} crédits
              </span>
              <Button
                type="submit"
                disabled={scanning}
                className="h-9 rounded-xl border-0 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scan en cours…
                  </>
                ) : (
                  <>
                    <Radio className="mr-2 h-4 w-4" />
                    Scanner le Marché
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Barre de progression */}
          {scanning && (
            <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-gray-100">
              <div className="scan-line h-full w-1/3 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

        {/* Scan en cours */}
        {scanning && (
          <div className="flex flex-col items-center justify-center py-24 gap-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-56 w-56 rounded-full border border-indigo-200/60 radar-pulse" style={{ animationDelay: "0s" }} />
              <div className="absolute h-40 w-40 rounded-full border border-indigo-200/60 radar-pulse" style={{ animationDelay: "0.4s" }} />
              <div className="absolute h-24 w-24 rounded-full border border-indigo-300/60 radar-pulse" style={{ animationDelay: "0.8s" }} />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/20">
                <Radio className="h-8 w-8 animate-pulse text-white" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Scan du marché en cours…</p>
              <p className="mt-1 text-xs text-gray-500">
                Analyse des offres pour{" "}
                <span className="font-medium text-indigo-600">{keyword}</span> à{" "}
                <span className="font-medium text-indigo-600">{location}</span>
              </p>
            </div>
          </div>
        )}

        {/* Bannière données de démonstration */}
        {!scanning && signals.length > 0 && isMockData && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Données de démonstration</strong> — Aucune API de job board n&apos;est configurée.
              Ajoutez <code className="rounded bg-amber-100 px-1 text-xs">SERPAPI_API_KEY</code> ou{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">SERPER_API_KEY</code> dans votre <code className="rounded bg-amber-100 px-1 text-xs">.env</code> pour accéder aux vraies offres d&apos;emploi.
            </span>
          </div>
        )}

        {/* Résultats */}
        {!scanning && signals.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 animate-stagger">
            {signals.map((signal, i) => {
              const id = signalId(signal);
              return (
                <SignalCard
                  key={id + i}
                  signal={signal}
                  onView={() => setDetailSignal(signal)}
                  onAdd={() => handleAddToCrm(signal)}
                  onIgnore={() => handleIgnore(signal)}
                  adding={addingId === id}
                  selected={selectedIds.has(id)}
                  onToggleSelect={() => toggleSelect(id)}
                />
              );
            })}
          </div>
        )}

        {/* Aucun résultat */}
        {!scanning && signals.length === 0 && keyword && <EmptyState />}

        {/* État initial */}
        {!keyword && !scanning && <InitialState />}

        {/* Campaign Wizard */}
        {workspaceId && (
          <CampaignWizard
            workspaceId={workspaceId}
            prospects={campaignProspects}
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onCreated={() => {
              setWizardOpen(false);
              toast.success("Campagne créée avec succès !");
            }}
          />
        )}
      </div>

      {/* ── Side panel ── */}
      <Sheet open={!!detailSignal} onOpenChange={(open) => !open && setDetailSignal(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md border-gray-200 bg-white overflow-y-auto"
        >
          {detailSignal && (
            <div className="flex flex-col gap-6 pt-2">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3 text-gray-900">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-sm font-bold text-indigo-600">
                    {detailSignal.companyName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{detailSignal.companyName}</span>
                </SheetTitle>
              </SheetHeader>

              {/* Poste */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Poste
                </p>
                <p className="font-semibold text-gray-900">{detailSignal.jobTitle}</p>
                {detailSignal.location && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {detailSignal.location}
                  </div>
                )}
              </div>

              {/* Hook IA */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                    Hook IA
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {detailSignal.hook}
                </p>
              </div>

              {/* Description */}
              {detailSignal.description && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Description
                  </p>
                  <p className="text-xs leading-relaxed text-gray-500 line-clamp-5">
                    {detailSignal.description}
                  </p>
                </div>
              )}

              {/* Lien */}
              {detailSignal.jobUrl && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <a href={detailSignal.jobUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Voir l&apos;annonce
                  </a>
                </Button>
              )}

              {/* CTA */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button
                  className="flex-1 rounded-xl border-0 bg-gradient-to-r from-indigo-600 to-violet-600 font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500"
                  onClick={() => {
                    handleAddToCrm(detailSignal);
                    setDetailSignal(null);
                  }}
                  disabled={addingId === detailSignal.companyName + detailSignal.jobTitle}
                >
                  {addingId === detailSignal.companyName + detailSignal.jobTitle ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Ajouter au CRM
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  onClick={() => setDetailSignal(null)}
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Carte Signal ────────────────────────────────────────────────────────────

function SignalCard({
  signal,
  onView,
  onAdd,
  onIgnore,
  adding,
  selected,
  onToggleSelect,
}: {
  signal: AnalyzedSignal;
  onView: () => void;
  onAdd: () => void;
  onIgnore: () => void;
  adding: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const initial = signal.companyName.slice(0, 2).toUpperCase();
  const logoUrl = `https://logo.clearbit.com/${signal.companyName
    .replace(/\s+/g, "")
    .toLowerCase()}.com`;

  const handleIgnore = () => {
    setRemoving(true);
    setTimeout(() => onIgnore(), 300);
  };

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        selected ? "border-indigo-400 ring-1 ring-indigo-300" : "border-gray-100 hover:border-gray-200",
        removing && "pointer-events-none scale-95 opacity-0"
      )}
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        {/* Checkbox */}
        <div
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/30"
          />
        </div>
        {/* Avatar */}
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50">
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
            {initial}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{signal.companyName}</p>
          <p className="truncate text-xs text-gray-500">{signal.jobTitle}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
            Récent
          </span>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
            onClick={(e) => {
              e.stopPropagation();
              handleIgnore();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Localisation */}
      {signal.location && (
        <div className="flex items-center gap-1.5 px-4 pb-2 text-xs text-gray-400">
          <MapPin className="h-3 w-3" />
          {signal.location}
        </div>
      )}

      {/* Hook IA */}
      <div className="mx-4 mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
            Hook IA
          </span>
        </div>
        <p className="text-xs leading-relaxed text-gray-600 line-clamp-3">{signal.hook}</p>
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-2 border-t border-gray-100 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="sm"
          className="h-8 flex-1 rounded-xl border-0 bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-semibold text-white hover:from-indigo-500 hover:to-violet-500"
          onClick={(e) => {
            e.preventDefault();
            onAdd();
          }}
          disabled={adding}
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Ajouter au CRM
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-xl px-3 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          onClick={(e) => {
            e.preventDefault();
            onView();
          }}
        >
          Détail
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── État initial ────────────────────────────────────────────────────────────

function InitialState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-8">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-56 w-56 rounded-full border border-gray-200" />
        <div className="absolute h-40 w-40 rounded-full border border-gray-200" />
        <div className="absolute h-24 w-24 rounded-full border border-gray-200" />
        <div className="absolute h-28 w-px bg-gradient-to-b from-indigo-400/50 to-transparent origin-bottom rotate-45" />
        <div className="absolute h-28 w-px bg-gradient-to-b from-indigo-300/30 to-transparent origin-bottom rotate-[110deg]" />
        <div
          className="absolute top-6 right-14 h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-sm"
          style={{ boxShadow: "0 0 6px rgba(52,211,153,0.6)" }}
        />
        <div
          className="absolute bottom-8 left-10 h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"
          style={{ animationDelay: "0.6s" }}
        />
        <div
          className="absolute top-16 left-8 h-1 w-1 rounded-full bg-violet-400 animate-pulse"
          style={{ animationDelay: "1.1s" }}
        />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
          <Radio className="h-7 w-7 text-white" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold text-gray-900">
          Détectez les signaux d&apos;intention
        </h3>
        <p className="mt-1.5 max-w-xs text-xs text-gray-500">
          Saisissez un intitulé de poste pour scanner les entreprises qui recrutent dans ce domaine.
        </p>
      </div>
    </div>
  );
}

// ─── État vide ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Building2 className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700">Aucun signal dans ce secteur</h3>
      <p className="mt-1.5 max-w-xs text-xs text-gray-500">
        Essayez un autre intitulé ou une autre localisation.
      </p>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-6 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50"
      >
        <Link href="/sales-os/crm">
          Voir le CRM
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
