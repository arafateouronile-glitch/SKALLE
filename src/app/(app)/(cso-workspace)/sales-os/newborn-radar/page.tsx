"use client";

/**
 * 🏢 Newborn Radar — Moteur d'acquisition "Entreprises Naissantes"
 * Light theme — CSO Module
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Loader2,
  Sparkles,
  Database,
  Check,
  Zap,
  Search,
  Copy,
  CheckCheck,
  MailCheck,
  MailQuestion,
  MailX,
  ChevronDown,
  ChevronUp,
  Rocket,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  scanNewbornRadarAction,
  bulkImportNewbornLeadsAction,
} from "@/actions/cso-sales";
import type { NewbornLeadEnriched, EmailStatus } from "@/lib/services/sales/newborn-leads";
import { FRENCH_SECTORS } from "@/lib/services/sales/newborn-leads";
import { CREDIT_COSTS } from "@/lib/credits";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

// ═══════════════════════════════════════════════════════════════════════════
// Waterfall loading steps
// ═══════════════════════════════════════════════════════════════════════════

const LOADING_STEPS = [
  "Interrogation du registre INSEE…",
  "Filtrage par secteur d'activité…",
  "Exclusion des SCI et sociétés civiles…",
  "Analyse des dirigeants…",
  "Génération des accroches IA…",
  "Finalisation du rapport…",
];

const LOADING_STEPS_ENRICH = [
  "Interrogation du registre INSEE…",
  "Filtrage par secteur d'activité…",
  "Exclusion des SCI et sociétés civiles…",
  "Analyse des dirigeants…",
  "Enrichissement Dropcontact en cours…",
  "Vérification des emails professionnels…",
  "Génération des accroches IA…",
  "Finalisation du rapport…",
];

// ═══════════════════════════════════════════════════════════════════════════
// Email badge
// ═══════════════════════════════════════════════════════════════════════════

function EmailBadge({ status, email }: { status: EmailStatus; email: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "VERIFIED" && email) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shrink-0">
          <MailCheck className="h-3 w-3" />
          VÉRIFIÉ
        </span>
        <span className="truncate text-xs font-mono text-emerald-700 max-w-[160px]">{email}</span>
        <button
          onClick={handleCopy}
          className="shrink-0 text-gray-400 hover:text-emerald-600 transition-colors"
        >
          {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  if (status === "CATCH_ALL") {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700 shrink-0">
          <MailQuestion className="h-3 w-3" />
          CATCH-ALL
        </span>
        {email && (
          <>
            <span className="truncate text-xs font-mono text-amber-600 max-w-[160px]">
              {email}
            </span>
            <button onClick={handleCopy} className="shrink-0 text-gray-400 hover:text-amber-600 transition-colors">
              {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </>
        )}
      </div>
    );
  }

  if (status === "UNKNOWN") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
        <MailQuestion className="h-3 w-3" />
        INCONNU
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
      <MailX className="h-3 w-3" />
      INTROUVABLE
    </span>
  );
}

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
  lead: NewbornLeadEnriched;
  selected: boolean;
  onToggle: () => void;
  onAddToCrm: () => void;
  added: boolean;
}) {
  const [hookOpen, setHookOpen] = useState(false);

  const daysAgo = Math.round(
    (Date.now() - new Date(lead.creationDate).getTime()) / 86400000
  );

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
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-violet-600 focus:ring-violet-500/30 shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Row 1: Company + date badge + director */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-900 truncate max-w-[200px]">
              {lead.companyName}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0",
                daysAgo <= 2
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : daysAgo <= 7
                  ? "bg-violet-100 text-violet-700 border border-violet-200"
                  : "bg-gray-100 text-gray-500 border border-gray-200"
              )}
            >
              {daysAgo === 0 ? "Aujourd'hui" : daysAgo === 1 ? "Hier" : `J-${daysAgo}`}
            </span>
            {lead.directorFullName && (
              <span className="text-xs text-gray-500 shrink-0">
                · {lead.directorTitle ? `${lead.directorTitle} : ` : ""}
                <span className="text-gray-700 font-medium">{lead.directorFullName}</span>
              </span>
            )}
          </div>

          {/* Row 2: Location + sector */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            {lead.city && (
              <span className="tabular-nums">
                {lead.zipCode} {lead.city}
              </span>
            )}
            <span className="text-gray-300">·</span>
            <span>{lead.activityLabel || lead.activityCode}</span>
            {lead.siret && (
              <>
                <span className="text-gray-300">·</span>
                <span className="tabular-nums font-mono">SIRET {lead.siret}</span>
              </>
            )}
          </div>

          {/* Row 3: Email badge */}
          <EmailBadge status={lead.emailStatus} email={lead.email} />

          {/* Row 4: Hook (collapsible) */}
          {lead.suggestedHook && (
            <div>
              <button
                onClick={() => setHookOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Accroche IA
                {hookOpen ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {hookOpen && (
                <p className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 leading-relaxed">
                  {lead.suggestedHook}
                </p>
              )}
            </div>
          )}
        </div>

        {/* CTA */}
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

export default function NewbornRadarPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Filter state
  const [sector, setSector] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [daysAgo, setDaysAgo] = useState("7");
  const [withEnrich, setWithEnrich] = useState(false);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [leads, setLeads] = useState<NewbornLeadEnriched[]>([]);

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

  const leadId = (l: NewbornLeadEnriched) => l.siret || `${l.companyName}|${l.siren}`;

  // Waterfall loading animation
  const startLoadingAnimation = useCallback(
    (enrich: boolean) => {
      const steps = enrich ? LOADING_STEPS_ENRICH : LOADING_STEPS;
      setLoadingStep(0);
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        if (i < steps.length) {
          setLoadingStep(i);
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 1800);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleScan = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspaceId || !sector) {
        toast.error("Sélectionnez un secteur d'activité.");
        return;
      }

      setScanning(true);
      setLeads([]);
      setSelectedIds(new Set());
      setAddedIds(new Set());
      startLoadingAnimation(withEnrich);

      try {
        const res = await scanNewbornRadarAction(
          workspaceId,
          {
            daysAgo: Number(daysAgo),
            sectorCode: sector,
            zipCode: zipCode.trim() || undefined,
            limit: 25,
          },
          withEnrich
        );

        if (intervalRef.current) clearInterval(intervalRef.current);

        if (res.success && res.leads?.length) {
          setLeads(res.leads);
          toast.success(
            `${res.leads.length} entreprise(s) détectée(s) — ${res.creditsUsed ?? CREDIT_COSTS.newborn_radar_scan} crédit(s) utilisé(s).`
          );
        } else if (res.success && (!res.leads || res.leads.length === 0)) {
          toast.info("Aucune nouvelle entreprise pour ces critères.");
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
    [workspaceId, sector, zipCode, daysAgo, withEnrich, startLoadingAnimation]
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
    async (lead: NewbornLeadEnriched) => {
      if (!workspaceId) return;
      const id = leadId(lead);
      setAddedIds((prev) => new Set([...prev, id]));
      try {
        const res = await bulkImportNewbornLeadsAction(workspaceId, [lead]);
        if (!res.success) {
          setAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          toast.error(res.error ?? "Erreur lors de l'ajout.");
        } else {
          toast.success(`${lead.companyName} ajouté au pipeline.`);
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
      const res = await bulkImportNewbornLeadsAction(workspaceId, toImport);
      if (res.success && res.imported != null) {
        const importedIds = new Set(toImport.map(leadId));
        setAddedIds((prev) => new Set([...prev, ...importedIds]));
        setSelectedIds(new Set());
        toast.success(`${res.imported} entreprise(s) ajoutée(s) au pipeline CRM.`);
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
      const res = await bulkImportNewbornLeadsAction(workspaceId, toImport);
      if (res.success && res.prospects && res.prospects.length > 0) {
        const importedIds = new Set(toImport.map(leadId));
        setAddedIds((prev) => new Set([...prev, ...importedIds]));
        setSelectedIds(new Set());
        setCampaignProspects(res.prospects);
        setWizardOpen(true);
        toast.success(`${res.imported} entreprise(s) importée(s). Configurez votre campagne.`);
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
  const steps = withEnrich ? LOADING_STEPS_ENRICH : LOADING_STEPS;

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

          {/* Title */}
          <div className="flex items-center gap-3 py-4 border-b border-gray-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-200">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Newborn Radar</h1>
              <p className="text-[11px] text-gray-400">
                Cibler les entreprises à la minute où elles naissent — API Registre INSEE
              </p>
            </div>
            {leads.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {leads.length} entreprise{leads.length > 1 ? "s" : ""} détectée{leads.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Filters form */}
          <form onSubmit={handleScan} className="py-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Sector */}
              <div className="space-y-1.5 min-w-[220px] flex-1">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Secteur d'activité
                </Label>
                <Select value={sector} onValueChange={setSector} disabled={scanning}>
                  <SelectTrigger className="h-9 rounded-xl border-gray-300 bg-white text-gray-900 focus:ring-violet-500/30 focus:border-violet-400">
                    <SelectValue placeholder="Choisir un secteur…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 bg-white text-gray-900">
                    {FRENCH_SECTORS.map((s) => (
                      <SelectItem
                        key={s.code}
                        value={s.code}
                        className="focus:bg-violet-50 focus:text-violet-700"
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Zip code */}
              <div className="space-y-1.5 w-[160px]">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Code postal
                </Label>
                <Input
                  placeholder="ex: 75001, 69"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={scanning}
                  className="h-9 rounded-xl border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-violet-500/30 focus-visible:border-violet-400 tabular-nums"
                />
              </div>

              {/* Days ago */}
              <div className="space-y-1.5 w-[180px]">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Ancienneté max
                </Label>
                <Select value={daysAgo} onValueChange={setDaysAgo} disabled={scanning}>
                  <SelectTrigger className="h-9 rounded-xl border-gray-300 bg-white text-gray-900 focus:ring-violet-500/30 focus:border-violet-400">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 bg-white text-gray-900">
                    <SelectItem value="1" className="focus:bg-violet-50">Créées il y a 24h</SelectItem>
                    <SelectItem value="7" className="focus:bg-violet-50">Créées il y a 7 jours</SelectItem>
                    <SelectItem value="30" className="focus:bg-violet-50">Créées il y a 30 jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Enrich toggle + CTA */}
              <div className="flex items-center gap-3 shrink-0 self-end">
                {/* Enrich checkbox */}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 transition-colors hover:border-violet-300">
                  <input
                    type="checkbox"
                    checked={withEnrich}
                    onChange={(e) => setWithEnrich(e.target.checked)}
                    disabled={scanning}
                    className="h-3.5 w-3.5 rounded border-gray-300 bg-white text-violet-600 focus:ring-violet-500/30"
                  />
                  <span className="text-xs text-gray-600">
                    Enrichir
                    <span className="ml-1 text-violet-600">+2 crédits/lead</span>
                  </span>
                </label>

                {/* Credit cost */}
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Zap className="h-3 w-3 text-violet-500" />
                  {CREDIT_COSTS.newborn_radar_scan} crédits
                </span>

                <Button
                  type="submit"
                  disabled={scanning || !sector}
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

          {/* Progress bar */}
          {scanning && (
            <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-gray-200">
              <div className="scan-line h-full w-1/3 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">

        {/* Loading waterfall */}
        {scanning && (
          <div className="flex flex-col items-center justify-center py-20 gap-8">
            {/* Radar animation */}
            <div className="relative flex items-center justify-center">
              {[64, 48, 32].map((size, i) => (
                <div
                  key={size}
                  className="absolute rounded-full border border-violet-400/30 animate-ping"
                  style={{
                    width: size * 4,
                    height: size * 4,
                    animationDelay: `${i * 0.4}s`,
                    animationDuration: "2s",
                  }}
                />
              ))}
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-xl shadow-violet-200">
                <Building2 className="h-8 w-8 text-white animate-pulse" />
              </div>
            </div>

            {/* Step-by-step text */}
            <div className="space-y-2 text-center">
              {steps.map((step, i) => (
                <div
                  key={step}
                  className={cn(
                    "flex items-center justify-center gap-2 text-sm transition-all duration-500",
                    i < loadingStep
                      ? "text-emerald-600"
                      : i === loadingStep
                      ? "text-gray-900 font-semibold"
                      : "text-gray-300"
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

        {/* Results */}
        {!scanning && leads.length > 0 && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {selectedIds.size === availableForSelect.length && availableForSelect.length > 0
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-violet-600">
                    {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                  </span>
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
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
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
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Rocket className="mr-1.5 h-3.5 w-3.5" />
                      Lancer une campagne ({selectedIds.size})
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Lead cards */}
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

        {/* Empty state after scan */}
        {!scanning && leads.length === 0 && sector && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
              <Building2 className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Aucune nouvelle entreprise trouvée</p>
            <p className="mt-1 text-xs text-gray-400">
              Élargissez la période ou changez de secteur / code postal.
            </p>
          </div>
        )}

        {/* Initial state */}
        {!sector && !scanning && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-8">
            <div className="relative flex items-center justify-center">
              {[56, 40, 24].map((size) => (
                <div
                  key={size}
                  className="absolute rounded-full border border-gray-200"
                  style={{ width: size * 4, height: size * 4 }}
                />
              ))}
              {/* Blips */}
              <div className="absolute top-6 right-10 h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
              <div className="absolute bottom-8 left-12 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: "0.7s" }} />
              <div className="absolute top-16 left-6 h-1 w-1 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: "1.3s" }} />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-xl shadow-violet-200">
                <Building2 className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-gray-800">Newborn Radar</h3>
              <p className="mt-2 max-w-xs text-xs text-gray-500 leading-relaxed">
                Sélectionnez un secteur d'activité et lancez le scan. Skalle interroge le registre
                légal français pour trouver les entreprises créées dans les dernières 24h, 7 ou 30 jours.
              </p>
              <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-gray-400">
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
                  Enrichissement email
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
