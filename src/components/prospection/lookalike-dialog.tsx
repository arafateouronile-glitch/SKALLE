"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  Plus,
  Users,
  Sparkles,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { findLookalikes } from "@/actions/lookalike";
import { importLeads } from "@/actions/leads";
import {
  createProspectList,
  getProspectLists,
} from "@/actions/prospect-lists";
import type {
  SynthesizedICP,
  LookalikeResult,
} from "@/lib/prospection/lookalike-analysis";

interface LookalikeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  listId: string;
  listName: string;
  onImported: () => void;
}

export function LookalikeDialog({
  open,
  onOpenChange,
  workspaceId,
  listId,
  listName,
  onImported,
}: LookalikeDialogProps) {
  const [step, setStep] = useState<
    "analyzing" | "results" | "importing" | "done"
  >("analyzing");
  const [results, setResults] = useState<LookalikeResult[]>([]);
  const [icp, setIcp] = useState<SynthesizedICP | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // List selection
  const [lists, setLists] = useState<
    Array<{ id: string; name: string; _count: { prospects: number } }>
  >([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Import result
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
  } | null>(null);

  // Reset and start analysis when dialog opens
  useEffect(() => {
    if (open) {
      setStep("analyzing");
      setResults([]);
      setIcp(null);
      setSelected(new Set());
      setError(null);
      setSelectedListId("");
      setNewListName("");
      setImportResult(null);
      startAnalysis();
      loadLists();
    }
  }, [open, listId]);

  const loadLists = async () => {
    const res = await getProspectLists(workspaceId);
    if (res.success && res.data) {
      setLists(res.data);
    }
  };

  const startAnalysis = async () => {
    try {
      const res = await findLookalikes(workspaceId, listId, { limit: 50 });
      if (res.success && res.results && res.icp) {
        setResults(res.results);
        setIcp(res.icp);
        // Pre-select results with score >= 50
        const preSelected = new Set<number>();
        res.results.forEach((r, i) => {
          if (r.similarityScore >= 50) preSelected.add(i);
        });
        setSelected(preSelected);
        setStep("results");
      } else {
        setError(res.error || "Erreur inconnue");
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(results.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setIsCreatingList(true);
    try {
      const res = await createProspectList(workspaceId, newListName.trim());
      if (res.success && res.data) {
        setSelectedListId(res.data.id);
        setNewListName("");
        await loadLists();
        toast.success(`Liste "${res.data.name}" creee`);
      } else {
        toast.error(res.error || "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la creation");
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error("Selectionnez au moins un profil");
      return;
    }

    setStep("importing");

    const leads = Array.from(selected).map((i) => {
      const r = results[i];
      return {
        name: r.name,
        email: r.email,
        company: r.company,
        jobTitle: r.jobTitle,
        linkedInUrl: r.linkedInUrl,
        location: r.location,
        industry: r.industry,
      };
    });

    try {
      const res = await importLeads(
        workspaceId,
        leads,
        selectedListId || undefined
      );
      if (res.success) {
        setImportResult({
          imported: res.imported || 0,
          duplicates: res.duplicates || 0,
        });
        setStep("done");
        toast.success(`${res.imported || 0} profil(s) importe(s)`);
        onImported();
      } else {
        toast.error(res.error || "Erreur d'import");
        setStep("results");
      }
    } catch {
      toast.error("Erreur d'import");
      setStep("results");
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-slate-400";
  };

  const scoreBg = (score: number) => {
    if (score >= 70) return "bg-green-900/30";
    if (score >= 40) return "bg-yellow-900/30";
    return "bg-slate-800";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Trouver des profils similaires
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {step === "analyzing" &&
              `Analyse de la liste "${listName}" en cours...`}
            {step === "results" &&
              `${results.length} profil(s) similaire(s) trouve(s)`}
            {step === "importing" && "Import en cours..."}
            {step === "done" && "Import termine"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 min-h-0">
          {/* Step 1: Analyzing */}
          {step === "analyzing" && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
                <Search className="h-5 w-5 text-purple-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Analyse en cours</p>
                <p className="text-sm text-slate-400 mt-1">
                  Extraction des traits communs, synthese ICP, recherche de
                  profils...
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-center py-12">
              <p className="text-red-400 mb-2">{error}</p>
              <Button
                variant="outline"
                className="border-slate-700"
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
            </div>
          )}

          {/* Step 2: Results */}
          {step === "results" && icp && (
            <>
              {/* ICP Card */}
              <div className="bg-purple-900/20 border border-purple-800/40 rounded-lg p-4">
                <h3 className="text-sm font-medium text-purple-300 mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Profil type detecte (ICP)
                </h3>
                <p className="text-sm text-slate-300 mb-3">{icp.summary}</p>
                <div className="flex flex-wrap gap-1.5">
                  {icp.targetJobTitles.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                  {icp.targetIndustries.slice(0, 2).map((i) => (
                    <span
                      key={i}
                      className="text-xs bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded"
                    >
                      {i}
                    </span>
                  ))}
                  {icp.targetLocations.slice(0, 2).map((l) => (
                    <span
                      key={l}
                      className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Selection controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {selected.size}/{results.length} selectionne(s)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={selectAll}
                  >
                    Tout selectionner
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={deselectAll}
                  >
                    Deselectionner
                  </Button>
                </div>
              </div>

              {/* Results list */}
              <div className="space-y-1.5">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(index)
                        ? "bg-slate-800 border-purple-700/50"
                        : "bg-slate-800/50 border-slate-700/50 opacity-70"
                    }`}
                    onClick={() => toggleSelect(index)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(index)}
                      onChange={() => toggleSelect(index)}
                      className="rounded border-slate-600"
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm truncate">
                          {result.name}
                        </span>
                        {result.linkedInUrl && (
                          <a
                            href={result.linkedInUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300 shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        {result.jobTitle && <span>{result.jobTitle}</span>}
                        {result.jobTitle && result.company && <span>-</span>}
                        <span>{result.company}</span>
                      </div>
                      {result.matchReasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {result.matchReasons.map((reason, ri) => (
                            <span
                              key={ri}
                              className="text-[10px] bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    <div
                      className={`shrink-0 text-center px-2.5 py-1 rounded ${scoreBg(result.similarityScore)}`}
                    >
                      <span
                        className={`text-sm font-bold ${scoreColor(result.similarityScore)}`}
                      >
                        {result.similarityScore}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Destination list */}
              <div className="border-t border-slate-800 pt-4">
                <label className="text-sm text-slate-400 mb-2 block">
                  Ajouter a une liste (optionnel)
                </label>
                <div className="flex gap-2">
                  <Select
                    value={selectedListId}
                    onValueChange={setSelectedListId}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white flex-1">
                      <SelectValue placeholder="Aucune liste" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="none">Aucune liste</SelectItem>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list._count.prospects})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Nouvelle liste..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white w-40"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleCreateList()
                      }
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="border-slate-700 shrink-0"
                      onClick={handleCreateList}
                      disabled={isCreatingList || !newListName.trim()}
                    >
                      {isCreatingList ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              <p className="text-slate-400">
                Import de {selected.size} profil(s)...
              </p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && importResult && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <div className="text-center">
                <p className="text-white font-medium">Import termine</p>
                <p className="text-sm text-slate-400 mt-1">
                  {importResult.imported} profil(s) importe(s)
                  {importResult.duplicates > 0 &&
                    `, ${importResult.duplicates} doublon(s) ignore(s)`}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "results" && (
            <>
              <Button
                variant="outline"
                className="border-slate-700"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleImport}
                disabled={selected.size === 0}
              >
                <Users className="h-4 w-4 mr-2" />
                Importer {selected.size} profil(s)
              </Button>
            </>
          )}
          {step === "done" && (
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => onOpenChange(false)}
            >
              Fermer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
