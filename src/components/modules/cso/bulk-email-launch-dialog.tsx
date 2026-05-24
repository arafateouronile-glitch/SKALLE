"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Mail, Search, CheckCircle2, ChevronRight, ChevronLeft, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Prospect {
  id: string;
  name: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  status: string;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onLaunched: (count: number) => void;
}

const ELIGIBLE_STATUSES = ["NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", RESEARCHED: "Recherché", MESSAGES_GENERATED: "Msgs générés",
  CONTACTED: "Contacté", RESPONDED: "Répondu",
};

const VARIABLES = [
  { label: "Prénom", token: "{{prénom}}" },
  { label: "Nom", token: "{{nom}}" },
  { label: "Entreprise", token: "{{entreprise}}" },
  { label: "Poste", token: "{{poste}}" },
];

const DELAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14];

// ─── Component ───────────────────────────────────────────────────────────────

export function BulkEmailLaunchDialog({ workspaceId, open, onClose, onLaunched }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [inQueue, setInQueue] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingProspects, setLoadingProspects] = useState(false);

  // Template
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpContent, setFollowUpContent] = useState("");
  const [followUpDelay, setFollowUpDelay] = useState(3);

  const [focusedField, setFocusedField] = useState<"subject" | "content" | "fuSubject" | "fuContent" | null>(null);
  const [launching, setLaunching] = useState(false);

  // Load prospects + queue status
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelected(new Set());
    setSearch("");

    const load = async () => {
      setLoadingProspects(true);
      try {
        const [pRes, qRes] = await Promise.all([
          fetch(`/api/prospects?workspaceId=${workspaceId}&statuses=${ELIGIBLE_STATUSES.join(",")}`),
          fetch(`/api/email-sequences?workspaceId=${workspaceId}`),
        ]);
        if (pRes.ok) {
          const data = await pRes.json();
          const list: Prospect[] = (data.prospects ?? data).filter(
            (p: Prospect) => ELIGIBLE_STATUSES.includes(p.status) && p.email
          );
          setProspects(list);
        }
        if (qRes.ok) {
          const qData = await qRes.json();
          setInQueue(new Set(qData.inQueueProspectIds ?? []));
        }
      } catch {
        toast.error("Erreur lors du chargement des prospects");
      } finally {
        setLoadingProspects(false);
      }
    };
    load();
  }, [open, workspaceId]);

  const filtered = prospects.filter(
    (p) =>
      !inQueue.has(p.id) &&
      (search === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.company.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const insertVar = (token: string) => {
    const setter =
      focusedField === "subject" ? setSubject
      : focusedField === "content" ? setContent
      : focusedField === "fuSubject" ? setFollowUpSubject
      : focusedField === "fuContent" ? setFollowUpContent
      : null;
    if (setter) setter((prev) => prev + token);
  };

  // Preview with first selected prospect
  const previewProspect = prospects.find((p) => selected.has(p.id));
  function preview(tpl: string) {
    if (!previewProspect) return tpl;
    const parts = previewProspect.name.trim().split(/\s+/);
    return tpl
      .replace(/\{\{prénom\}\}/gi, parts[0] ?? "")
      .replace(/\{\{prenom\}\}/gi, parts[0] ?? "")
      .replace(/\{\{nom\}\}/gi, parts.slice(1).join(" ") ?? "")
      .replace(/\{\{entreprise\}\}/gi, previewProspect.company ?? "")
      .replace(/\{\{poste\}\}/gi, previewProspect.jobTitle ?? "")
      .replace(/\{\{name\}\}/gi, previewProspect.name ?? "");
  }

  const canLaunch = selected.size > 0 && subject.trim() && content.trim() &&
    (!hasFollowUp || followUpContent.trim());

  const handleLaunch = async () => {
    if (!canLaunch) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/email-sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prospectIds: [...selected],
          subject,
          content,
          ...(hasFollowUp && followUpContent ? {
            followUpSubject: followUpSubject || `Re: ${subject}`,
            followUpContent,
            followUpDelayDays: followUpDelay,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      toast.success(`${data.created} séquence(s) email créées — envoi ce soir à 8h`);
      onLaunched(data.created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-500" />
            Lancer des séquences email
            <span className="ml-auto text-xs font-normal text-gray-400">Étape {step}/2</span>
          </DialogTitle>
        </DialogHeader>

        {/* ── Étape 1 : Sélection des prospects ── */}
        {step === 1 && (
          <div className="space-y-4">
            {inQueue.size > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {inQueue.size} prospect(s) déjà en queue email (masqués)
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un prospect..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{selected.size} sélectionné(s) · {filtered.length} éligibles (avec email)</span>
              <button onClick={toggleAll} className="text-emerald-600 hover:underline font-medium">
                {selected.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            {loadingProspects ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                {prospects.length === 0
                  ? "Aucun prospect éligible avec email trouvé."
                  : "Aucun résultat pour cette recherche."}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const next = new Set(selected);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      setSelected(next);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                      selected.has(p.id)
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    )}
                  >
                    <div className={cn(
                      "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0",
                      selected.has(p.id) ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                    )}>
                      {selected.has(p.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {p.company}{p.jobTitle && ` · ${p.jobTitle}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                      <span className="text-[10px] text-gray-400 truncate max-w-32">{p.email}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button
                onClick={() => setStep(2)}
                disabled={selected.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Suivant ({selected.size})
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Étape 2 : Template email ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Variable buttons */}
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.token}
                  onClick={() => insertVar(v.token)}
                  disabled={!focusedField}
                  className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {v.label}
                </button>
              ))}
              <span className="text-xs text-gray-400 self-center ml-1">
                {focusedField ? "↑ cliquez pour insérer" : "Cliquez dans un champ d'abord"}
              </span>
            </div>

            {/* Objet */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Objet *</Label>
              <Input
                placeholder="Ex: {{prénom}}, une question sur {{entreprise}}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setFocusedField("subject")}
              />
              {previewProspect && subject && (
                <p className="text-[11px] text-gray-400">
                  Prévisualisation : <span className="text-gray-700">{preview(subject)}</span>
                </p>
              )}
            </div>

            {/* Corps */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-xs font-medium text-gray-600">Corps *</Label>
                <span className="text-[10px] text-gray-400">{content.length} car.</span>
              </div>
              <Textarea
                rows={6}
                placeholder={"Bonjour {{prénom}},\n\nJ'ai vu que {{entreprise}} est en pleine croissance..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onFocus={() => setFocusedField("content")}
                className="resize-none font-mono text-sm"
              />
            </div>

            {/* Follow-up toggle */}
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFollowUp}
                  onChange={(e) => setHasFollowUp(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Ajouter un email de suivi</span>
              </label>

              {hasFollowUp && (
                <div className="space-y-3 pl-6">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500 whitespace-nowrap">Délai</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DELAY_OPTIONS.map((d) => (
                        <button
                          key={d}
                          onClick={() => setFollowUpDelay(d)}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs border transition-all",
                            followUpDelay === d
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          )}
                        >
                          J+{d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Objet (défaut: Re: {subject || "…"})</Label>
                    <Input
                      placeholder={`Re: ${subject || "(objet principal)"}`}
                      value={followUpSubject}
                      onChange={(e) => setFollowUpSubject(e.target.value)}
                      onFocus={() => setFocusedField("fuSubject")}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Corps du suivi *</Label>
                    <Textarea
                      rows={4}
                      placeholder={"Bonjour {{prénom}}, je me permets de relancer..."}
                      value={followUpContent}
                      onChange={(e) => setFollowUpContent(e.target.value)}
                      onFocus={() => setFocusedField("fuContent")}
                      className="resize-none font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            {previewProspect && subject && content && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Prévisualisation — {previewProspect.name}
                </p>
                <p className="text-sm font-medium text-gray-800">{preview(subject)}</p>
                <div className="text-sm text-gray-600 whitespace-pre-wrap font-mono border-t border-gray-200 pt-2 max-h-40 overflow-y-auto">
                  {preview(content)}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              <p className="font-semibold mb-1">Récapitulatif</p>
              <ul className="space-y-0.5 text-xs">
                <li>• <strong>{selected.size}</strong> prospect(s) sélectionné(s)</li>
                <li>• 1 email principal immédiat</li>
                {hasFollowUp && followUpContent && (
                  <li>• 1 email de suivi à J+{followUpDelay}</li>
                )}
                <li>• Envoi via SMTP — prochain run à <strong>8h (lun–ven)</strong></li>
              </ul>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Retour
              </Button>
              <Button
                onClick={handleLaunch}
                disabled={!canLaunch || launching}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {launching ? "Création..." : `Lancer ${selected.size} séquence(s)`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
