"use client";

/**
 * 🗺️ Local Radar — Chalutier (Maps Lead Gen) — thème clair
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { MapPin, Loader2, Ship, Download, ExternalLink, Sparkles, Zap } from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import { scanLocalRadarAction, bulkImportLocalLeadsAction } from "@/actions/cso-sales";
import type { LocalLeadEvaluated, LocalPainTag } from "@/lib/services/sales/local-scraper";
import { toast } from "sonner";
import { CREDIT_COSTS } from "@/lib/credits";
import { cn } from "@/lib/utils";

const MIN_LEADS = 10;
const MAX_LEADS = 100;
const COST = CREDIT_COSTS.local_maps_scan;

function PainBadge({ tag }: { tag: LocalPainTag }) {
  if (!tag) return <span className="text-gray-400 text-xs">—</span>;
  if (tag === "NO_WEBSITE")
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600">
        Pas de site
      </span>
    );
  if (tag === "BAD_REPUTATION")
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold text-red-600">
        Mauvaise note
      </span>
    );
  if (tag === "LOW_VISIBILITY")
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
        Faible visibilité
      </span>
    );
  return null;
}

export default function LocalRadarPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activity, setActivity] = useState("");
  const [city, setCity] = useState("");
  const [volume, setVolume] = useState(50);
  const [scanning, setScanning] = useState(false);
  const [leads, setLeads] = useState<LocalLeadEvaluated[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  const leadId = (l: LocalLeadEvaluated) => `${l.name}|${l.phone ?? ""}|${l.address ?? ""}`;

  const handleScan = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspaceId || !activity.trim() || !city.trim()) {
        toast.error("Saisissez une activité et une ville / code postal.");
        return;
      }
      const query = `${activity.trim()} à ${city.trim()}`;
      setScanning(true);
      setLeads([]);
      setSelectedIds(new Set());
      try {
        const res = await scanLocalRadarAction(workspaceId, query, volume);
        if (res.success && res.leads?.length) {
          setLeads(res.leads);
          toast.success(
            `${res.leads.length} prospect(s) local(aux) — ${res.creditsUsed ?? COST} crédit(s).`
          );
        } else if (res.success && (!res.leads || res.leads.length === 0)) {
          toast.info("Aucun résultat pour cette zone.");
        } else {
          toast.error(res.error ?? "Erreur lors du scan.");
        }
      } catch {
        toast.error("Erreur lors du scan.");
      } finally {
        setScanning(false);
      }
    },
    [workspaceId, activity, city, volume]
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
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(leadId)));
    }
  }, [leads, selectedIds.size]);

  const handleBulkImport = useCallback(async () => {
    if (!workspaceId || selectedIds.size === 0) {
      toast.error("Sélectionnez au moins un prospect.");
      return;
    }
    const toImport = leads.filter((l) => selectedIds.has(leadId(l)));
    setImporting(true);
    try {
      const res = await bulkImportLocalLeadsAction(workspaceId, toImport);
      if (res.success && res.imported != null) {
        setLeads((prev) => prev.filter((l) => !selectedIds.has(leadId(l))));
        setSelectedIds(new Set());
        toast.success(`${res.imported} prospect(s) importé(s) dans le CRM.`);
      } else {
        toast.error(res.error ?? "Erreur lors de l'import.");
      }
    } catch {
      toast.error("Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }, [workspaceId, leads, selectedIds]);

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
              <Ship className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Local Radar</h1>
              <p className="text-[11px] text-gray-500">
                Chalutier local — trouvez des prospects par activité et localisation
              </p>
            </div>
            {leads.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {leads.length} prospect{leads.length > 1 ? "s" : ""} trouvé{leads.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Formulaire */}
          <form onSubmit={handleScan} className="py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 min-w-[200px] flex-1">
                <Label
                  htmlFor="activity"
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  Activité
                </Label>
                <Input
                  id="activity"
                  placeholder="ex: Agence immobilière, Plombier…"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  className="h-9 rounded-xl border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-400"
                  disabled={scanning}
                />
              </div>
              <div className="space-y-1.5 min-w-[160px]">
                <Label
                  htmlFor="city"
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  Ville / Code postal
                </Label>
                <Input
                  id="city"
                  placeholder="ex: Lyon, 69001"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-9 rounded-xl border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-500/30 focus-visible:border-indigo-400"
                  disabled={scanning}
                />
              </div>
              <div className="space-y-1.5 w-[200px]">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Volume ciblé :{" "}
                  <span className="text-indigo-600 normal-case font-bold">{volume}</span>
                </Label>
                <input
                  type="range"
                  min={MIN_LEADS}
                  max={MAX_LEADS}
                  step={10}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-indigo-600 cursor-pointer"
                  disabled={scanning}
                />
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
                      <Ship className="mr-2 h-4 w-4" />
                      Lancer le Chalutier
                    </>
                  )}
                </Button>
              </div>
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
                <Ship className="h-8 w-8 animate-pulse text-white" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Chalutier en action…</p>
              <p className="mt-1 text-xs text-gray-500">
                Scan de{" "}
                <span className="font-medium text-indigo-600">{activity}</span> à{" "}
                <span className="font-medium text-indigo-600">{city}</span> —{" "}
                {volume} prospects ciblés
              </p>
            </div>
          </div>
        )}

        {/* Résultats */}
        {!scanning && leads.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <span className="text-xs text-gray-500">
                {leads.length} résultat{leads.length > 1 ? "s" : ""} — survolez une ligne pour voir le Hook IA
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                  onClick={toggleSelectAll}
                >
                  {selectedIds.size === leads.length ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-xl border-0 bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-semibold text-white hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
                  disabled={selectedIds.size === 0 || importing}
                  onClick={handleBulkImport}
                >
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Importer ({selectedIds.size}) dans le CRM
                    </>
                  )}
                </Button>
              </div>
            </div>

            <TooltipProvider delayDuration={300}>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 hover:bg-transparent">
                    <TableHead className="w-10 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Sel.
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Nom
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Téléphone
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Site web
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Note
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Problème détecté
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const id = leadId(lead);
                    return (
                      <Tooltip key={id}>
                        <TooltipTrigger asChild>
                          <TableRow
                            className={cn(
                              "border-gray-100 cursor-default transition-colors hover:bg-gray-50/80",
                              selectedIds.has(id) && "bg-indigo-50/40"
                            )}
                          >
                            <TableCell className="w-10">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(id)}
                                onChange={() => toggleSelect(id)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/30"
                              />
                            </TableCell>
                            <TableCell className="text-sm font-semibold text-gray-900">
                              {lead.name}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {lead.phone ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {lead.website ? (
                                <a
                                  href={
                                    lead.website.startsWith("http")
                                      ? lead.website
                                      : `https://${lead.website}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Voir
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-gray-700">
                              {lead.rating != null ? (
                                <span className="flex items-center gap-1">
                                  {lead.rating}
                                  <span className="text-amber-400">★</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <PainBadge tag={lead.tag} />
                            </TableCell>
                          </TableRow>
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          className="max-w-sm rounded-xl border border-indigo-100 bg-white text-xs p-4 shadow-xl"
                        >
                          <div className="mb-2 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                            <p className="font-bold uppercase tracking-widest text-[10px] text-indigo-500">
                              Hook IA
                            </p>
                          </div>
                          <p className="leading-relaxed text-gray-700 whitespace-pre-wrap">
                            {lead.suggestedHook}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        )}

        {/* Aucun résultat */}
        {!scanning && leads.length === 0 && (activity || city) && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
              <MapPin className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">Aucun prospect pour cette zone</p>
            <p className="mt-1 text-xs text-gray-400">
              Modifiez l&apos;activité ou la localisation.
            </p>
          </div>
        )}

        {/* État initial */}
        {!activity && !city && !scanning && (
          <div className="flex flex-col items-center justify-center py-24 gap-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-56 w-56 rounded-full border border-gray-200" />
              <div className="absolute h-40 w-40 rounded-full border border-gray-200" />
              <div className="absolute h-24 w-24 rounded-full border border-gray-200" />
              <div
                className="absolute top-8 right-12 h-2 w-2 rounded-full bg-amber-400 animate-pulse"
                style={{ boxShadow: "0 0 6px rgba(251,191,36,0.6)" }}
              />
              <div
                className="absolute bottom-10 left-12 h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"
                style={{ animationDelay: "0.7s" }}
              />
              <div
                className="absolute top-20 left-6 h-1 w-1 rounded-full bg-emerald-400 animate-pulse"
                style={{ animationDelay: "1.2s" }}
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                <Ship className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-gray-900">Chalutier Local</h3>
              <p className="mt-1.5 max-w-xs text-xs text-gray-500">
                Saisissez une activité et une ville, choisissez le volume (10–100), puis lancez le scan.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
