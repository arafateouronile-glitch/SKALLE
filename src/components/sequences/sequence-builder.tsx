"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mail,
  Linkedin,
  Phone,
  MessageSquare,
  Loader2,
  GitMerge,
  Users,
  GitBranch,
  BookOpen,
  X,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createSequence, type SequenceStepInput } from "@/actions/sequences";
import { getProspects } from "@/actions/prospects";
import { toast } from "sonner";
import {
  SEQUENCE_TEMPLATES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  type SequenceTemplate,
  type TemplateCategory,
} from "@/lib/sequence-templates";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerCondition = "ALWAYS" | "IF_NO_REPLY" | "IF_OPENED_NO_REPLY";

const TRIGGER_CONDITION_LABELS: Record<TriggerCondition, string> = {
  ALWAYS: "Toujours",
  IF_NO_REPLY: "Si pas de réponse",
  IF_OPENED_NO_REPLY: "Si ouvert sans réponse",
};

type Channel = "EMAIL" | "LINKEDIN" | "PHONE" | "SMS";
const CREATABLE_CHANNELS: Channel[] = ["EMAIL", "LINKEDIN"];

interface Prospect {
  id: string;
  name: string;
  email: string | null;
  company: string;
  jobTitle: string | null;
}

interface SequenceBuilderProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// ─── Channel config ───────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<
  Channel,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bg: string;
    border: string;
    dot: string;
  }
> = {
  EMAIL: {
    icon: Mail,
    label: "Email",
    color: "text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/30",
    dot: "bg-violet-400",
  },
  LINKEDIN: {
    icon: Linkedin,
    label: "LinkedIn",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/30",
    dot: "bg-blue-400",
  },
  PHONE: {
    icon: Phone,
    label: "Téléphone",
    color: "text-green-400",
    bg: "bg-green-500/15",
    border: "border-green-500/30",
    dot: "bg-green-400",
  },
  SMS: {
    icon: MessageSquare,
    label: "SMS",
    color: "text-orange-400",
    bg: "bg-orange-500/15",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
};

const STEPS_CONFIG = [
  { label: "Informations", icon: Users },
  { label: "Étapes", icon: GitMerge },
  { label: "Aperçu & Confirmation", icon: Check },
];

function getCumulativeDay(steps: SequenceStepInput[], index: number): number {
  return steps.slice(0, index + 1).reduce((sum, s) => sum + s.delayDays, 0);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SequenceBuilder({
  workspaceId,
  open,
  onOpenChange,
  onCreated,
}: SequenceBuilderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingProspects, setLoadingProspects] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);

  // Template picker
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory | "all">("all");
  const [previewTemplate, setPreviewTemplate] = useState<SequenceTemplate | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [prospectSearch, setProspectSearch] = useState("");

  // Step 2
  const [steps, setSteps] = useState<SequenceStepInput[]>([
    { stepNumber: 1, channel: "EMAIL", subject: "", content: "", delayDays: 0, triggerCondition: "ALWAYS" },
  ]);

  useEffect(() => {
    if (!open) return;
    setLoadingProspects(true);
    getProspects(workspaceId)
      .then((data) => setProspects(data as Prospect[]))
      .catch(() => toast.error("Impossible de charger les prospects"))
      .finally(() => setLoadingProspects(false));
  }, [open, workspaceId]);

  function reset() {
    setCurrentStep(0);
    setName("");
    setSelectedProspectId("");
    setProspectSearch("");
    setSteps([
      { stepNumber: 1, channel: "EMAIL", subject: "", content: "", delayDays: 0, triggerCondition: "ALWAYS" },
    ]);
    setShowTemplatePicker(false);
    setPreviewTemplate(null);
    setTemplateCategory("all");
  }

  function loadTemplate(template: SequenceTemplate) {
    setSteps(
      template.steps.map((s) => ({
        stepNumber: s.stepNumber,
        channel: s.channel,
        subject: s.subject ?? "",
        content: s.content,
        delayDays: s.delayDays,
        triggerCondition: s.triggerCondition,
      }))
    );
    if (!name.trim()) setName(template.name);
    setShowTemplatePicker(false);
    setPreviewTemplate(null);
    toast.success(`Template "${template.name}" chargé — personnalisez le contenu`);
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  // ── Step management ──────────────────────────────────────────────────────

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        stepNumber: prev.length + 1,
        channel: "EMAIL",
        subject: "",
        content: "",
        delayDays: 3,
        triggerCondition: "IF_NO_REPLY",
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stepNumber: i + 1 }))
    );
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  }

  function updateStep<K extends keyof SequenceStepInput>(
    index: number,
    key: K,
    value: SequenceStepInput[K]
  ) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: value } : s))
    );
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function step1Valid() {
    return name.trim().length > 0 && selectedProspectId.length > 0;
  }

  function step2Valid() {
    return steps.every(
      (s) =>
        s.content.trim().length > 0 &&
        (s.channel !== "EMAIL" || (s.subject ?? "").trim().length > 0)
    );
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleCreate() {
    setSaving(true);
    try {
      const result = await createSequence(workspaceId, selectedProspectId, {
        name: name.trim(),
        steps,
        isActive: false, // user must click "Lancer" to trigger Inngest
      });
      if (!result.success) throw new Error(result.error);
      toast.success("Séquence créée avec succès");
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(String(err) || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  // ── Filtered prospects ───────────────────────────────────────────────────

  const filteredProspects = prospects.filter(
    (p) =>
      p.name.toLowerCase().includes(prospectSearch.toLowerCase()) ||
      (p.company ?? "").toLowerCase().includes(prospectSearch.toLowerCase())
  );

  const selectedProspect = prospects.find((p) => p.id === selectedProspectId);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <GitMerge className="h-4 w-4 text-violet-400" />
            Nouvelle séquence
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-[12px]">
            Créez une séquence multi-canal personnalisée pour votre prospect.
          </DialogDescription>
        </DialogHeader>

        {/* Progress steps */}
        <div className="flex items-center gap-0 mb-6">
          {STEPS_CONFIG.map((s, i) => (
            <div key={s.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center border text-[11px] font-bold transition-all",
                    i < currentStep
                      ? "bg-violet-500 border-violet-500 text-white"
                      : i === currentStep
                      ? "border-violet-400 text-violet-400 bg-violet-500/10"
                      : "border-white/10 text-slate-600"
                  )}
                >
                  {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] whitespace-nowrap",
                    i === currentStep ? "text-violet-400" : "text-slate-600"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS_CONFIG.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-2 mt-[-12px] transition-all",
                    i < currentStep ? "bg-violet-500" : "bg-white/[0.06]"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Infos ── */}
        {currentStep === 0 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-slate-300">Nom de la séquence</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Outreach Directeurs OF — Mai 2026"
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] text-slate-300">Prospect cible</Label>
              {loadingProspects ? (
                <div className="flex items-center gap-2 py-3 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[12px]">Chargement des prospects…</span>
                </div>
              ) : (
                <>
                  <Input
                    value={prospectSearch}
                    onChange={(e) => setProspectSearch(e.target.value)}
                    placeholder="Rechercher par nom ou entreprise…"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 text-[12px] mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-white/[0.06] p-2">
                    {filteredProspects.length === 0 ? (
                      <p className="text-[12px] text-slate-500 text-center py-4">
                        Aucun prospect trouvé
                      </p>
                    ) : (
                      filteredProspects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProspectId(p.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all",
                            selectedProspectId === p.id
                              ? "bg-violet-500/15 border border-violet-500/30"
                              : "hover:bg-white/[0.04] border border-transparent"
                          )}
                        >
                          <div className="h-7 w-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-[11px] font-bold text-violet-400 shrink-0">
                            {p.name[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-white truncate">{p.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {p.jobTitle ? `${p.jobTitle} · ` : ""}{p.company}
                            </p>
                          </div>
                          {selectedProspectId === p.id && (
                            <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setCurrentStep(1)}
                disabled={!step1Valid()}
                className="gap-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30 disabled:opacity-40"
              >
                Suivant
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Steps editor ── */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-slate-400">
                Ajoutez les étapes de votre séquence. Chaque étape peut utiliser un canal différent.
              </p>
              <button
                onClick={() => { setShowTemplatePicker(true); setPreviewTemplate(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[11px] font-semibold border transition-all hover:brightness-110 shrink-0"
                style={{ background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.3)", color: "#a78bfa" }}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Templates
              </button>
            </div>

            {/* Template picker overlay */}
            {showTemplatePicker && (
              <div className="rounded-xl border border-violet-500/20 bg-[#0c0e1a] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-[13px] font-semibold text-white flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-violet-400" />
                    Choisir un template
                  </p>
                  <button onClick={() => { setShowTemplatePicker(false); setPreviewTemplate(null); }}
                    className="p-1 rounded text-slate-500 hover:text-white transition-all">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Category tabs */}
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.06] overflow-x-auto">
                  {(["all", ...Object.keys(CATEGORY_LABELS)] as (TemplateCategory | "all")[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setTemplateCategory(cat)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all"
                      style={
                        templateCategory === cat
                          ? { background: "rgba(139,92,246,0.2)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }
                          : { background: "transparent", color: "#64748b", border: "1px solid transparent" }
                      }
                    >
                      {cat === "all" ? "Tous" : CATEGORY_LABELS[cat as TemplateCategory]}
                    </button>
                  ))}
                </div>

                <div className="flex" style={{ maxHeight: 340 }}>
                  {/* Template list */}
                  <div className="w-1/2 overflow-y-auto border-r border-white/[0.06]">
                    {SEQUENCE_TEMPLATES
                      .filter((t) => templateCategory === "all" || t.category === templateCategory)
                      .map((t) => {
                        const cat = CATEGORY_COLORS[t.category];
                        const isSelected = previewTemplate?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setPreviewTemplate(t)}
                            className="w-full text-left px-4 py-3 border-b border-white/[0.04] last:border-0 transition-all"
                            style={{ background: isSelected ? "rgba(139,92,246,0.08)" : undefined }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[12px] font-semibold text-white truncate pr-2">{t.name}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{ background: cat.bg, color: cat.fg }}>
                                {CATEGORY_LABELS[t.category]}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{t.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-slate-600">{t.steps.length} étapes</span>
                              <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                                <TrendingUp className="h-2.5 w-2.5" />{t.avgReplyRate}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {/* Preview panel */}
                  <div className="w-1/2 overflow-y-auto">
                    {previewTemplate ? (
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="text-[12px] font-semibold text-white">{previewTemplate.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{previewTemplate.description}</p>
                          <p className="text-[10px] text-slate-600 mt-1">Cible : {previewTemplate.useCase}</p>
                        </div>
                        <div className="space-y-2">
                          {previewTemplate.steps.map((step, i) => {
                            const Icon = step.channel === "EMAIL" ? Mail : Linkedin;
                            const color = step.channel === "EMAIL" ? "#818cf8" : "#38bdf8";
                            return (
                              <div key={i} className="flex items-start gap-2">
                                <div className="flex flex-col items-center">
                                  <div className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                                    style={{ background: `${color}20` }}>
                                    <Icon className="h-3 w-3" style={{ color }} />
                                  </div>
                                  {i < previewTemplate.steps.length - 1 && (
                                    <div className="w-px h-4 bg-white/[0.06] my-0.5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 pb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-medium" style={{ color }}>
                                      Étape {step.stepNumber}
                                    </span>
                                    {step.delayDays > 0 && (
                                      <span className="text-[9px] text-slate-600">+{step.delayDays}j</span>
                                    )}
                                    {step.triggerCondition !== "ALWAYS" && (
                                      <span className="text-[9px] text-violet-500">
                                        {step.triggerCondition === "IF_NO_REPLY" ? "si pas de réponse" : "si ouvert"}
                                      </span>
                                    )}
                                  </div>
                                  {step.subject && (
                                    <p className="text-[10px] text-slate-400 truncate italic">"{step.subject}"</p>
                                  )}
                                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                                    {step.content.substring(0, 100)}…
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => loadTemplate(previewTemplate)}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                          style={{ background: "rgba(139,92,246,0.8)", color: "white" }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          Utiliser ce template
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full py-10 text-slate-600 text-[12px]">
                        ← Sélectionnez un template
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {steps.map((step, index) => {
                const cfg = CHANNEL_CONFIG[step.channel];
                const Icon = cfg.icon;
                return (
                  <div key={index}>
                  {/* Condition connector between steps */}
                  {index > 0 && (
                    <div className="flex items-center gap-2 py-1 px-1">
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <div className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-2.5 py-1">
                        <GitBranch className="h-3 w-3 text-violet-400 shrink-0" />
                        <select
                          value={step.triggerCondition ?? "ALWAYS"}
                          onChange={(e) =>
                            updateStep(index, "triggerCondition", e.target.value as TriggerCondition)
                          }
                          className="bg-transparent text-[11px] text-violet-300 border-none outline-none cursor-pointer pr-1"
                        >
                          {(Object.keys(TRIGGER_CONDITION_LABELS) as TriggerCondition[]).map((k) => (
                            <option key={k} value={k} className="bg-[#1a1d27] text-white">
                              {TRIGGER_CONDITION_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                  )}
                  <div
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3"
                  >
                    {/* Step header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded-lg border", cfg.bg, cfg.border)}>
                          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                        </div>
                        <span className="text-[13px] font-semibold text-white">
                          Étape {step.stepNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveStep(index, -1)}
                          disabled={index === 0}
                          className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-20 transition-all"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveStep(index, 1)}
                          disabled={index === steps.length - 1}
                          className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-20 transition-all"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {steps.length > 1 && (
                          <button
                            onClick={() => removeStep(index)}
                            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Channel + delay */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-500">Canal</Label>
                        <Select
                          value={step.channel}
                          onValueChange={(v) =>
                            updateStep(index, "channel", v as Channel)
                          }
                        >
                          <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white text-[12px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1d27] border-white/[0.08] text-white">
                            {CREATABLE_CHANNELS.map((c) => {
                              const CIcon = CHANNEL_CONFIG[c].icon;
                              return (
                                <SelectItem key={c} value={c} className="text-[12px]">
                                  <div className="flex items-center gap-2">
                                    <CIcon className={cn("h-3.5 w-3.5", CHANNEL_CONFIG[c].color)} />
                                    {CHANNEL_CONFIG[c].label}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-500">
                          {index === 0 ? "Envoi (jours depuis maintenant)" : "Délai après étape précédente"}
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            value={step.delayDays}
                            onChange={(e) =>
                              updateStep(index, "delayDays", Math.max(0, parseInt(e.target.value) || 0))
                            }
                            className="bg-white/[0.04] border-white/[0.08] text-white text-[12px] h-8 w-16"
                          />
                          <span className="text-[11px] text-slate-500">jours</span>
                        </div>
                      </div>
                    </div>

                    {/* Subject (email only) */}
                    {step.channel === "EMAIL" && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-500">Objet</Label>
                        <Input
                          value={step.subject ?? ""}
                          onChange={(e) => updateStep(index, "subject", e.target.value)}
                          placeholder="Ex : Votre logiciel de gestion — question rapide"
                          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 text-[12px] h-8"
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-500">
                        {step.channel === "EMAIL"
                          ? "Corps du message"
                          : step.channel === "LINKEDIN"
                          ? "Message LinkedIn"
                          : step.channel === "PHONE"
                          ? "Script d'appel / notes"
                          : "Message SMS"}
                      </Label>
                      <Textarea
                        value={step.content}
                        onChange={(e) => updateStep(index, "content", e.target.value)}
                        placeholder={
                          step.channel === "EMAIL"
                            ? "Bonjour {firstName},\n\nJ'ai vu que vous gérez un organisme de formation…"
                            : step.channel === "LINKEDIN"
                            ? "Bonjour {firstName}, je découvre votre OF sur LinkedIn…"
                            : step.channel === "PHONE"
                            ? "Présentation rapide + question ouverte sur leur process actuel…"
                            : "Bonjour {firstName}, suite à mon email…"
                        }
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 text-[12px] min-h-[80px] resize-none"
                      />
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={addStep}
              className="w-full h-9 border border-dashed border-white/[0.12] text-slate-400 hover:text-white hover:border-white/20 gap-2 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une étape
            </Button>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep(0)}
                className="gap-2 text-slate-400 hover:text-white text-[12px]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour
              </Button>
              <Button
                onClick={() => setCurrentStep(2)}
                disabled={!step2Valid()}
                className="gap-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30 disabled:opacity-40 text-[12px]"
              >
                Aperçu
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Timeline preview ── */}
        {currentStep === 2 && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-400">Séquence</span>
                <span className="text-[13px] font-semibold text-white">{name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-400">Prospect</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-white">
                    {selectedProspect?.name}
                  </span>
                  <span className="text-[11px] text-slate-500">{selectedProspect?.company}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-slate-400">Durée totale</span>
                <span className="text-[13px] font-medium text-white">
                  {getCumulativeDay(steps, steps.length - 1)} jours
                </span>
              </div>
              {/* Channel counts */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {(Object.keys(CHANNEL_CONFIG) as Channel[])
                  .map((c) => ({ c, count: steps.filter((s) => s.channel === c).length }))
                  .filter((x) => x.count > 0)
                  .map(({ c, count }) => {
                    const cfg = CHANNEL_CONFIG[c];
                    return (
                      <Badge
                        key={c}
                        variant="outline"
                        className={cn("text-[10px] px-2 py-0", cfg.bg, cfg.border, cfg.color)}
                      >
                        {cfg.label} × {count}
                      </Badge>
                    );
                  })}
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-0">
              <p className="text-[11px] text-slate-500 mb-3">Timeline</p>
              {steps.map((step, index) => {
                const cfg = CHANNEL_CONFIG[step.channel];
                const Icon = cfg.icon;
                const dayN = getCumulativeDay(steps, index);
                const isLast = index === steps.length - 1;
                return (
                  <div key={index} className="flex gap-3">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-1",
                          cfg.bg,
                          cfg.border
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 bg-white/[0.06] my-1" style={{ minHeight: "24px" }} />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn("pb-4 flex-1", isLast && "pb-0")}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[12px] font-semibold text-white">
                          Étape {step.stepNumber} — {cfg.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-white/10 text-slate-500"
                        >
                          J+{dayN}
                        </Badge>
                        {index > 0 && step.triggerCondition && step.triggerCondition !== "ALWAYS" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-400 flex items-center gap-1"
                          >
                            <GitBranch className="h-2.5 w-2.5" />
                            {TRIGGER_CONDITION_LABELS[step.triggerCondition]}
                          </Badge>
                        )}
                      </div>
                      {step.channel === "EMAIL" && step.subject && (
                        <p className="text-[11px] text-slate-400 mb-1">
                          <span className="text-slate-500">Objet :</span> {step.subject}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {step.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep(1)}
                className="gap-2 text-slate-400 hover:text-white text-[12px]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white border-0 text-[12px]"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Créer la séquence
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
