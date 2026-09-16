"use client";

/**
 * 🎓 Qualiopi Radar — ICP Organismes de Formation certifiés
 * Light theme — CSO Module
 *
 * Pas de date de délivrance de certification disponible dans la donnée ouverte
 * (cf. `qualiopi-radar.ts`) — ce radar cible le pool ICP large des organismes
 * certifiés, pas un déclencheur temporel précis. Le décideur (nom de personne)
 * n'est pas connu au scan : il est résolu automatiquement en tâche de fond
 * (`resolve-radar-decision-makers`), qui déclenche ensuite l'enrichissement
 * Dropcontact une fois un nom trouvé.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  GraduationCap,
  Loader2,
  Sparkles,
  Database,
  Check,
  Zap,
  Search,
  ChevronDown,
  ChevronUp,
  Rocket,
  Users,
  Clock,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  scanQualiopiRadarAction,
  bulkImportQualiopiLeadsAction,
} from "@/actions/cso-sales";
import type { QualiopiLead, QualiopiCertifCategory } from "@/lib/services/sales/qualiopi-radar";
import { FRENCH_REGION_LABELS, QUALIOPI_CATEGORY_LABELS } from "@/lib/services/sales/qualiopi-radar";
import { CREDIT_COSTS } from "@/lib/credits";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

const ALL_CATEGORIES = Object.keys(QUALIOPI_CATEGORY_LABELS) as QualiopiCertifCategory[];

const LOADING_STEPS = [
  "Interrogation du cache Qualiopi Radar…",
  "Filtrage par région / catégorie de certification…",
  "Génération des accroches IA…",
  "Finalisation du rapport…",
];

// ═══════════════════════════════════════════════════════════════════════════
// Lead row
// ═══════════════════════════════════════════════════════════════════════════

function LeadRow({
  lead,
  selected,
  onToggle,
  onAddToCrm,
  added,
}: {
  lead: QualiopiLead;
  selected: boolean;
  onToggle: () => void;
  onAddToCrm: () => void;
  added: boolean;
}) {
  const [hookOpen, setHookOpen] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-xl border px-4 py-3 transition-all duration-200",
        selected
          ? "border-violet-300 bg-violet-50"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-violet-600 focus:ring-violet-500/30 shrink-0"
        />

        <div className="flex-1 min-w-0 space-y-2">
          {/* Row 1: Denomination + NDA */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-900 truncate max-w-[260px]">
              {lead.denomination}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500 shrink-0 font-mono">
              NDA {lead.nda}
            </span>
          </div>

          {/* Row 2: Location + region */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            {lead.city && (
              <span className="tabular-nums">
                {lead.zipCode} {lead.city}
              </span>
            )}
            {lead.region && (
              <>
                <span className="text-gray-300">·</span>
                <span>{FRENCH_REGION_LABELS[lead.region] ?? lead.region}</span>
              </>
            )}
            {lead.nbStagiaires != null && (
              <>
                <span className="text-gray-300">·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {lead.nbStagiaires} stagiaires déclarés
                </span>
              </>
            )}
          </div>

          {/* Row 3: Certification category badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {lead.certifCategories.map((c) => (
              <span
                key={c}
                className="rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
              >
                {QUALIOPI_CATEGORY_LABELS[c]}
              </span>
            ))}
          </div>

          {/* Row 4: Decision maker pending notice */}
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <Clock className="h-3 w-3" />
            Décideur résolu automatiquement après import (sous 24-48h)
          </div>

          {/* Row 5: Hook (collapsible) */}
          {lead.suggestedHook && (
            <div>
              <button
                onClick={() => setHookOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Accroche IA
                {hookOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {hookOpen && (
                <p className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 leading-relaxed">
                  {lead.suggestedHook}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {added ? (
            <span className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              Ajouté
            </span>
          ) : (
            <Button
              size="sm"
              onClick={onAddToCrm}
              className="h-8 rounded-lg border-0 bg-gradient-to-r from-violet-600 to-purple-600 px-3 text-xs font-semibold text-white shadow-md shadow-violet-200 hover:from-violet-500 hover:to-purple-500 transition-all"
            >
              <Database className="mr-1.5 h-3.5 w-3.5" />
              Pipeline
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════

export { QualiopiRadarPage as QualiopiRadarTab };
export default function QualiopiRadarPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Filter state
  const [region, setRegion] = useState<string>("");
  const [categories, setCategories] = useState<QualiopiCertifCategory[]>([]);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [leads, setLeads] = useState<QualiopiLead[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  // Selection & CRM state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [campaignProspects, setCampaignProspects] = useState<{ id: string; name: string; email: string | null; company: string; jobTitle: string | null }[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const leadId = (l: QualiopiLead) => l.siren;

  const toggleCategory = useCallback((c: QualiopiCertifCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }, []);

  const startLoadingAnimation = useCallback(() => {
    setLoadingStep(0);
    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      if (i < LOADING_STEPS.length) {
        setLoadingStep(i);
      } else if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1400);
  }, []);

  const handleScan = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspaceId) return;

      setScanning(true);
      setLeads([]);
      setSelectedIds(new Set());
      setAddedIds(new Set());
      startLoadingAnimation();

      try {
        const res = await scanQualiopiRadarAction(workspaceId, {
          region: region || undefined,
          certifCategories: categories.length ? categories : undefined,
          limit: 25,
        });

        if (intervalRef.current) clearInterval(intervalRef.current);
        setHasScanned(true);

        if (res.success && res.leads?.length) {
          setLeads(res.leads);
          toast.success(
            `${res.leads.length} organisme(s) détecté(s) — ${res.creditsUsed ?? CREDIT_COSTS.qualiopi_radar_scan} crédit(s) utilisé(s).`
          );
        } else if (res.success && (!res.leads || res.leads.length === 0)) {
          toast.info("Aucun organisme pour ces critères — le cache est peut-être encore vide (sync hebdomadaire).");
        } else {
          toast.error(res.error ?? "Erreur lors du scan.");
        }
      } catch {
        if (intervalRef.current) clearInterval(intervalRef.current);
        toast.error("Erreur lors du scan.");
      } finally {
        setScanning(false);
      }
    },
    [workspaceId, region, categories, startLoadingAnimation]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const available = leads.filter((l) => !addedIds.has(leadId(l)));
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available.map(leadId)));
    }
  }, [leads, selectedIds.size, addedIds]);

  const handleAddSingle = useCallback(
    async (lead: QualiopiLead) => {
      if (!workspaceId) return;
      const id = leadId(lead);
      setAddedIds((prev) => new Set([...prev, id]));
      try {
        const res = await bulkImportQualiopiLeadsAction(workspaceId, [lead]);
        if (!res.success) {
          setAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          toast.error(res.error ?? "Erreur lors de l'ajout.");
        } else {
          toast.success(`${lead.denomination} ajouté au pipeline.`);
        }
      } catch {
        toast.error("Erreur lors de l'ajout.");
      }
    },
    [workspaceId]
  );

  const handleBulkImport = useCallback(async () => {
    if (!workspaceId || selectedIds.size === 0) {
      toast.error("Sélectionnez au moins un lead.");
      return;
    }
    const toImport = leads.filter((l) => selectedIds.has(leadId(l)));
    setImporting(true);
    try {
      const res = await bulkImportQualiopiLeadsAction(workspaceId, toImport);
      if (res.success && res.imported != null) {
        const importedIds = new Set(toImport.map(leadId));
        setAddedIds((prev) => new Set([...prev, ...importedIds]));
        setSelectedIds(new Set());
        toast.success(`${res.imported} organisme(s) ajouté(s) au pipeline CRM.`);
      } else {
        toast.error(res.error ?? "Erreur lors de l'import.");
      }
    } catch {
      toast.error("Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }, [workspaceId, leads, selectedIds]);

  const handleLaunchCampaign = useCallback(async () => {
    if (!workspaceId || selectedIds.size === 0) {
      toast.error("Sélectionnez au moins un lead.");
      return;
    }
    const toImport = leads.filter((l) => selectedIds.has(leadId(l)));
    setImporting(true);
    try {
      const res = await bulkImportQualiopiLeadsAction(workspaceId, toImport);
      if (res.success && res.prospects && res.prospects.length > 0) {
        const importedIds = new Set(toImport.map(leadId));
        setAddedIds((prev) => new Set([...prev, ...importedIds]));
        setSelectedIds(new Set());
        setCampaignProspects(res.prospects);
        setWizardOpen(true);
        toast.success(`${res.imported} organisme(s) importé(s). Configurez votre campagne.`);
      } else {
        toast.error(res.error ?? "Erreur lors de l'import.");
      }
    } catch {
      toast.error("Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }, [workspaceId, leads, selectedIds]);

  const availableForSelect = leads.filter((l) => !addedIds.has(leadId(l)));

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ── Header sticky ── */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-4 border-b border-gray-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-200">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Qualiopi Radar</h1>
              <p className="text-[11px] text-gray-400">
                Organismes de formation certifiés — Registre public data.gouv.fr
              </p>
            </div>
            {leads.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {leads.length} organisme{leads.length > 1 ? "s" : ""} détecté{leads.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <form onSubmit={handleScan} className="py-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Region */}
              <div className="space-y-1.5 min-w-[220px] flex-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Région (optionnel)
                </Label>
                <Select value={region || "all"} onValueChange={(v) => setRegion(v === "all" ? "" : v)} disabled={scanning}>
                  <SelectTrigger className="h-9 rounded-xl border-gray-300 bg-white text-gray-900 focus:ring-violet-500/30 focus:border-violet-400">
                    <SelectValue placeholder="Toutes régions" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 bg-white text-gray-900">
                    <SelectItem value="all" className="focus:bg-violet-50">Toutes régions</SelectItem>
                    {Object.entries(FRENCH_REGION_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code} className="focus:bg-violet-50 focus:text-violet-700">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Categories */}
              <div className="space-y-1.5 flex-1 min-w-[280px]">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Catégories de certification (défaut : toutes)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCategory(c)}
                      disabled={scanning}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        categories.includes(c)
                          ? "border-violet-400 bg-violet-100 text-violet-700"
                          : "border-gray-200 bg-white text-gray-500 hover:border-violet-300"
                      )}
                    >
                      {QUALIOPI_CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Zap className="h-3 w-3 text-violet-500" />
                  {CREDIT_COSTS.qualiopi_radar_scan} crédits
                </span>

                <Button
                  type="submit"
                  disabled={scanning}
                  className="h-9 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-purple-600 px-5 font-semibold text-white shadow-md shadow-violet-200 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scan…
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Scanner le Registre
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>

          {scanning && (
            <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-gray-200">
              <div className="scan-line h-full w-1/3 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        {scanning && (
          <div className="flex flex-col items-center justify-center py-20 gap-8">
            <div className="relative flex items-center justify-center">
              {[64, 48, 32].map((size, i) => (
                <div
                  key={size}
                  className="absolute rounded-full border border-violet-400/30 animate-ping"
                  style={{ width: size * 4, height: size * 4, animationDelay: `${i * 0.4}s`, animationDuration: "2s" }}
                />
              ))}
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-xl shadow-violet-200">
                <GraduationCap className="h-8 w-8 text-white animate-pulse" />
              </div>
            </div>
            <div className="space-y-2 text-center">
              {LOADING_STEPS.map((step, i) => (
                <div
                  key={step}
                  className={cn(
                    "flex items-center justify-center gap-2 text-sm transition-all duration-500",
                    i < loadingStep ? "text-emerald-600" : i === loadingStep ? "text-gray-900 font-semibold" : "text-gray-300"
                  )}
                >
                  {i < loadingStep ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : i === loadingStep ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-gray-200" />
                  )}
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {!scanning && leads.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={toggleSelectAll} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                  {selectedIds.size === availableForSelect.length && availableForSelect.length > 0
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-violet-600">{selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0 || importing}
                  onClick={handleBulkImport}
                  className="h-8 rounded-xl border-violet-200 px-4 text-xs font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-40"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                    <>
                      <Database className="mr-1.5 h-3.5 w-3.5" />
                      Pipeline ({selectedIds.size})
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  disabled={selectedIds.size === 0 || importing}
                  onClick={handleLaunchCampaign}
                  className="h-8 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-purple-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-200 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                    <>
                      <Rocket className="mr-1.5 h-3.5 w-3.5" />
                      Lancer une campagne ({selectedIds.size})
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {leads.map((lead) => {
                const id = leadId(lead);
                return (
                  <LeadRow
                    key={id}
                    lead={lead}
                    selected={selectedIds.has(id)}
                    onToggle={() => toggleSelect(id)}
                    onAddToCrm={() => handleAddSingle(lead)}
                    added={addedIds.has(id)}
                  />
                );
              })}
            </div>
          </div>
        )}

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

        {!scanning && leads.length === 0 && hasScanned && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
              <GraduationCap className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Aucun organisme trouvé</p>
            <p className="mt-1 text-xs text-gray-400">Élargissez la région ou les catégories de certification.</p>
          </div>
        )}

        {!scanning && !hasScanned && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-8">
            <div className="relative flex items-center justify-center">
              {[56, 40, 24].map((size) => (
                <div key={size} className="absolute rounded-full border border-gray-200" style={{ width: size * 4, height: size * 4 }} />
              ))}
              <div className="absolute top-6 right-10 h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
              <div className="absolute bottom-8 left-12 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: "0.7s" }} />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-xl shadow-violet-200">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-gray-800">Qualiopi Radar</h3>
              <p className="mt-2 max-w-sm text-xs text-gray-500 leading-relaxed">
                Filtrez par région et/ou catégorie de certification, puis lancez le scan. Skalle
                interroge le registre public des organismes de formation certifiés Qualiopi
                (synchronisé chaque semaine).
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Open Data — 100% légal
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  Hooks IA personnalisés
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Décideur + email résolus automatiquement
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
