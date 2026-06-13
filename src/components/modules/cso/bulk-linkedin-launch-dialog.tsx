"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Linkedin,
  Users,
  ChevronRight,
  ChevronLeft,
  Rocket,
  CheckCircle2,
  Search,
  Variable,
} from "lucide-react";
import { toast } from "sonner";

interface Prospect {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  linkedInUrl: string;
  status: string;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onLaunched?: (created: number) => void;
}

const VARIABLES = ["{{prénom}}", "{{nom}}", "{{entreprise}}", "{{poste}}"];

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  RESEARCHED: "Enrichi",
  MESSAGES_GENERATED: "Messages générés",
  CONTACTED: "Contacté",
  RESPONDED: "Répondu",
};

const ELIGBLE_STATUSES = new Set(["NEW", "RESEARCHED", "MESSAGES_GENERATED"]);

export function BulkLinkedInLaunchDialog({ workspaceId, open, onClose, onLaunched }: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — prospects
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [inQueue, setInQueue] = useState<Set<string>>(new Set());

  // Step 2 — templates
  const [followUpMessage, setFollowUpMessage] = useState(
    "Bonjour {{prénom}},\n\nMerci d'avoir accepté ma demande ! Je voulais te parler d'une opportunité qui pourrait t'intéresser chez {{entreprise}}.\n\nDisponible pour un appel de 15 min cette semaine ?"
  );
  const [followUpDelayDays, setFollowUpDelayDays] = useState(2);
  const [withFollowUp, setWithFollowUp] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);

  const loadProspects = useCallback(async () => {
    setLoadingProspects(true);
    try {
      const [pRes, qRes] = await Promise.all([
        fetch(`/api/prospects?workspaceId=${workspaceId}&limit=500`),
        fetch(`/api/linkedin-sequences?workspaceId=${workspaceId}`),
      ]);
      if (pRes.ok) {
        const data = await pRes.json() as { data?: Prospect[] } | Prospect[];
        const list: Prospect[] = Array.isArray(data) ? data : (data.data ?? []);
        setProspects(list.filter((p) => p.linkedInUrl));
      }
      if (qRes.ok) {
        const qData = await qRes.json() as { inQueueProspectIds?: string[] };
        setInQueue(new Set(qData.inQueueProspectIds ?? []));
      }
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoadingProspects(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      loadProspects();
      setStep(1);
      setSelected(new Set());
      setSearch("");
    }
  }, [open, loadProspects]);

  function handleReset() {
    setStep(1);
    setSelected(new Set());
    setSearch("");
    setIsLaunching(false);
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  const eligible = prospects.filter(
    (p) => ELIGBLE_STATUSES.has(p.status) && !inQueue.has(p.id)
  );

  const filtered = eligible.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.company.toLowerCase().includes(q) ||
      (p.jobTitle ?? "").toLowerCase().includes(q)
    );
  });

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  async function handleLaunch() {
    if (!selected.size) return;
    setIsLaunching(true);
    try {
      const res = await fetch("/api/linkedin-sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prospectIds: [...selected],
          followUpMessage: withFollowUp ? followUpMessage : undefined,
          followUpDelayDays,
        }),
      });
      const data = await res.json() as { ok?: boolean; created?: number; skipped?: number; error?: string };
      if (!data.ok) { toast.error(data.error ?? "Erreur"); return; }

      toast.success(
        `${data.created} séquence${(data.created ?? 0) > 1 ? "s" : ""} ajoutée${(data.created ?? 0) > 1 ? "s" : ""} à la queue` +
        (data.skipped ? ` · ${data.skipped} ignoré${data.skipped > 1 ? "s" : ""}` : "")
      );
      onLaunched?.(data.created ?? 0);
      handleClose();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setIsLaunching(false);
    }
  }

  function insertVar(variable: string) {
    setFollowUpMessage((v) => v + variable);
  }

  // Preview with first selected prospect
  const previewProspect = prospects.find((p) => selected.has(p.id));
  function preview(tpl: string) {
    if (!previewProspect) return tpl;
    const parts = previewProspect.name.split(" ");
    return tpl
      .replace(/\{\{prénom\}\}/gi, parts[0] ?? "")
      .replace(/\{\{prenom\}\}/gi, parts[0] ?? "")
      .replace(/\{\{nom\}\}/gi, parts.slice(1).join(" ") ?? "")
      .replace(/\{\{entreprise\}\}/gi, previewProspect.company ?? "")
      .replace(/\{\{poste\}\}/gi, previewProspect.jobTitle ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Rocket className="h-4 w-4 text-sky-400" />
            Lancer des séquences LinkedIn en bulk
          </DialogTitle>
          <DialogDescription className="sr-only">Sélectionne des prospects et configure le message</DialogDescription>

          {/* Steps indicator */}
          <div className="flex items-center gap-2 mt-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  step === s ? "bg-sky-500 text-white" : step > s ? "bg-emerald-500 text-white" : "bg-white/[0.08] text-slate-400"
                }`}>{step > s ? "✓" : s}</div>
                <span className={`text-[11px] ${step === s ? "text-white" : "text-slate-500"}`}>
                  {s === 1 ? "Prospects" : "Messages"}
                </span>
                {s < 2 && <ChevronRight className="h-3 w-3 text-slate-600" />}
              </div>
            ))}
            <span className="ml-auto text-[11px] text-slate-500">
              {selected.size} prospect{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-2">

          {/* ── STEP 1 : Sélection des prospects ── */}
          {step === 1 && (
            <div className="space-y-3">
              {/* Info queue */}
              {inQueue.size > 0 && (
                <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  {inQueue.size} prospect{inQueue.size > 1 ? "s" : ""} déjà en queue LinkedIn (masqués)
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un prospect…"
                  className="bg-white/[0.03] border-white/[0.08] text-white pl-9 h-9 text-[12px] placeholder:text-slate-600"
                />
              </div>

              {loadingProspects ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-[13px] text-slate-500">
                  {prospects.length === 0
                    ? "Aucun prospect avec URL LinkedIn trouvé"
                    : "Aucun prospect éligible (non contacté avec URL LinkedIn)"}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={toggleAll}
                      className="text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      {selected.size === filtered.length ? "Tout désélectionner" : `Tout sélectionner (${filtered.length})`}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Statuts : NEW, RESEARCHED, MESSAGES_GENERATED uniquement
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {filtered.map((p) => {
                      const isSel = selected.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            const next = new Set(selected);
                            if (isSel) next.delete(p.id); else next.add(p.id);
                            setSelected(next);
                          }}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors ${
                            isSel
                              ? "border-sky-500/40 bg-sky-500/10"
                              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                          }`}
                        >
                          <div className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center ${
                            isSel ? "border-sky-400 bg-sky-500" : "border-white/[0.2]"
                          }`}>
                            {isSel && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-white truncate">{p.name}</span>
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${
                                p.status === "NEW" ? "text-slate-400 border-slate-600"
                                : "text-emerald-400 border-emerald-600"
                              }`}>
                                {STATUS_LABELS[p.status] ?? p.status}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-slate-500 truncate block">
                              {p.jobTitle ? `${p.jobTitle} · ` : ""}{p.company}
                            </span>
                          </div>
                          <Linkedin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 2 : Templates ── */}
          {step === 2 && (
            <div className="space-y-4">
              {previewProspect && (
                <div className="text-[11px] text-slate-500 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                  Aperçu pour <span className="text-white font-medium">{previewProspect.name}</span> · {previewProspect.company}
                </div>
              )}

              {/* Note de connexion */}
              {/* Toggle follow-up */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWithFollowUp((v) => !v)}
                  className={`h-5 w-9 rounded-full transition-colors ${withFollowUp ? "bg-sky-500" : "bg-white/[0.1]"}`}
                >
                  <div className={`h-4 w-4 rounded-full bg-white mx-0.5 transition-transform ${withFollowUp ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-[12px] text-white">Message de suivi</span>
                {withFollowUp && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-slate-500">J+</span>
                    <Input
                      type="number"
                      min={1}
                      max={14}
                      value={followUpDelayDays}
                      onChange={(e) => setFollowUpDelayDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 2)))}
                      className="w-14 h-7 bg-white/[0.03] border-white/[0.08] text-white text-[12px] text-center"
                    />
                    <span className="text-[11px] text-slate-500">après connexion</span>
                  </div>
                )}
              </div>

              {/* Message de suivi */}
              {withFollowUp && (
                <div className="space-y-2">
                  <Label className="text-[12px] text-white font-medium">Message de suivi</Label>
                  <Textarea
                    value={followUpMessage}
                    onChange={(e) => setFollowUpMessage(e.target.value)}
                    rows={5}
                    className="bg-white/[0.03] border-white/[0.08] text-white text-[12px] resize-none"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    <Variable className="h-3 w-3 text-slate-500" />
                    {VARIABLES.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVar(v)}
                        className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded px-1.5 py-0.5 hover:bg-sky-500/20"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {previewProspect && (
                    <p className="text-[11px] text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded px-2 py-1.5 italic">
                      {preview(followUpMessage).slice(0, 150)}{preview(followUpMessage).length > 150 ? "…" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Résumé */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[12px] text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <Rocket className="h-3.5 w-3.5" />
                  Récapitulatif
                </div>
                <p>• {selected.size} prospect{selected.size > 1 ? "s" : ""} · {selected.size} demande{selected.size > 1 ? "s" : ""} de connexion sans note</p>
                {withFollowUp && <p>• {selected.size} message{selected.size > 1 ? "s" : ""} de suivi à J+{followUpDelayDays}</p>}
                <p className="text-emerald-400/60">Envoi automatique dès le prochain cron (lun–ven 10h)</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-white/[0.06] pt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={step === 1 ? handleClose : () => setStep(1)}
          >
            {step === 1 ? "Annuler" : <><ChevronLeft className="h-3.5 w-3.5 mr-1" />Retour</>}
          </Button>

          {step === 1 ? (
            <Button
              size="sm"
              className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 gap-1.5"
              disabled={selected.size === 0}
              onClick={() => setStep(2)}
            >
              Configurer les messages
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 gap-1.5"
              disabled={isLaunching}
              onClick={handleLaunch}
            >
              {isLaunching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {isLaunching ? "Création…" : `Lancer ${selected.size} séquence${selected.size > 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
