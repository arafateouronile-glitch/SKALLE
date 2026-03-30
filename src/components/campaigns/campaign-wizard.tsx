"use client";

import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  Mail,
  Sparkles,
  Eye,
  Rocket,
  AlertTriangle,
  Plus,
  Trash2,
  Info,
  Paperclip,
  X,
  FileText,
} from "lucide-react";
import {
  createCampaign,
  previewPersonalization,
  getDefaultTemplates,
  getSmtpConfigs,
  generateCampaignTemplatesFromGoal,
} from "@/actions/campaigns";
import { toast } from "sonner";

interface Prospect {
  id: string;
  name: string;
  email?: string | null;
  company: string;
  jobTitle?: string | null;
}

interface StepTemplate {
  stepNumber: number;
  subject: string;
  content: string;
  delayDays: number;
}

interface CampaignWizardProps {
  workspaceId: string;
  prospects: Prospect[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const AVAILABLE_VARIABLES = [
  { key: "firstName", label: "Prénom" },
  { key: "company", label: "Entreprise" },
  { key: "jobTitle", label: "Poste" },
  { key: "industry", label: "Secteur" },
  { key: "location", label: "Localisation" },
  { key: "senderName", label: "Votre nom" },
  { key: "senderCompany", label: "Votre entreprise" },
];

export function CampaignWizard({
  workspaceId,
  prospects,
  open,
  onOpenChange,
  onCreated,
}: CampaignWizardProps) {
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Step 1: Name & Prospects
  const [campaignName, setCampaignName] = useState("");
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(
    new Set(prospects.map((p) => p.id))
  );

  // Step 2: Email Steps — but de la campagne → IA → validation
  const [campaignGoal, setCampaignGoal] = useState("");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [stepCount, setStepCount] = useState<2 | 3>(3);
  const [stepTemplates, setStepTemplates] = useState<StepTemplate[]>([]);
  const [personalizationMode, setPersonalizationMode] = useState<"template" | "ai">("template");
  const [hasAI, setHasAI] = useState(false);

  // Step 2: Attachments
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  // Step 3: Preview
  const [previewProspectId, setPreviewProspectId] = useState<string>("");
  const [previewData, setPreviewData] = useState<
    Array<{ subject: string; content: string; score: number }>
  >([]);

  // Step 4: Confirmation
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpVerified, setSmtpVerified] = useState(false);

  useEffect(() => {
    if (open) {
      loadDefaults();
      checkSmtp();
    }
  }, [open]);

  useEffect(() => {
    setSelectedProspectIds(new Set(prospects.map((p) => p.id)));
  }, [prospects]);

  const loadDefaults = async () => {
    const result = await getDefaultTemplates();
    if (result.success) {
      setHasAI(result.hasAI || false);
      setStepTemplates(result.templates3 || []);
    }
  };

  const checkSmtp = async () => {
    const result = await getSmtpConfigs(workspaceId);
    if (result.success && result.data && result.data.length > 0) {
      setSmtpConfigured(true);
      const defaultConfig = result.data.find((c: any) => c.isDefault) || result.data[0];
      setSmtpVerified(defaultConfig.isVerified);
    }
  };

  const handleStepCountChange = async (count: "2" | "3") => {
    const c = parseInt(count) as 2 | 3;
    setStepCount(c);
    const result = await getDefaultTemplates();
    if (result.success) {
      const templates = c === 2 ? result.templates2 : result.templates3;
      if (templates) setStepTemplates(templates);
    }
  };

  const handleGenerateTemplates = async () => {
    if (!campaignGoal.trim()) {
      toast.error("Indiquez le but de la campagne");
      return;
    }
    setIsGeneratingTemplate(true);
    try {
      const result = await generateCampaignTemplatesFromGoal(
        campaignGoal.trim(),
        stepCount
      );
      if (result.success && result.templates?.length) {
        setStepTemplates(result.templates);
        toast.success("Templates générés. Vous pouvez les modifier puis continuer.");
      } else {
        toast.error(result.error || "Impossible de générer les templates");
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const updateTemplate = (index: number, field: keyof StepTemplate, value: string | number) => {
    setStepTemplates((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const insertVariable = (index: number, field: "subject" | "content", variable: string) => {
    const template = stepTemplates[index];
    if (!template) return;
    const insertion = `{${variable}}`;
    updateTemplate(index, field, template[field] + insertion);
  };

  const handlePreview = async () => {
    if (!previewProspectId) {
      const first = [...selectedProspectIds][0];
      if (first) setPreviewProspectId(first);
      else return;
    }

    setIsPreviewing(true);
    const prospectId = previewProspectId || [...selectedProspectIds][0];
    const previews: Array<{ subject: string; content: string; score: number }> = [];

    for (const template of stepTemplates) {
      const result = await previewPersonalization(
        workspaceId,
        prospectId,
        template,
        personalizationMode
      );
      if (result.success && result.data) {
        previews.push(result.data);
      } else {
        previews.push({ subject: template.subject, content: template.content, score: 0 });
      }
    }

    setPreviewData(previews);
    setIsPreviewing(false);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createCampaign(workspaceId, {
        name: campaignName,
        prospectIds: [...selectedProspectIds],
        stepTemplates,
        personalizationMode,
      });

      if (result.success && result.campaignId) {
        // Uploader les pièces jointes si présentes
        if (attachmentFiles.length > 0) {
          let uploadErrors = 0;
          for (const file of attachmentFiles) {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(`/api/campaigns/${result.campaignId}/attachments`, {
              method: "POST",
              body: fd,
            });
            if (!res.ok) uploadErrors++;
          }
          if (uploadErrors > 0) {
            toast.warning(`Campagne créée, mais ${uploadErrors} pièce(s) jointe(s) n'ont pas pu être uploadée(s).`);
          } else {
            toast.success("Campagne créée avec pièces jointes !");
          }
        } else {
          toast.success("Campagne créée !");
        }
        onOpenChange(false);
        onCreated();
        // Reset
        setStep(1);
        setCampaignName("");
        setPreviewData([]);
        setAttachmentFiles([]);
      } else {
        toast.error(result.error || "Erreur de création");
      }
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleProspect = (id: string) => {
    const next = new Set(selectedProspectIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProspectIds(next);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return campaignName.trim().length > 0 && selectedProspectIds.size > 0;
      case 2:
        return stepTemplates.every((t) => t.subject.trim() && t.content.trim());
      case 3:
        return true;
      case 4:
        return smtpConfigured;
      default:
        return false;
    }
  };

  const selectedProspects = prospects.filter((p) => selectedProspectIds.has(p.id));
  const prospectsWithEmail = selectedProspects.filter((p) => p.email);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-200 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Créer une campagne email</DialogTitle>
          <DialogDescription className="text-gray-500">
            Étape {step} sur 4
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-purple-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Name & Prospects */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom de la campagne</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ex: Campagne Formation Q1 2026"
                className="bg-gray-100 border-gray-300"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prospects sélectionnés ({selectedProspectIds.size})</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-gray-300"
                    onClick={() =>
                      setSelectedProspectIds(new Set(prospects.map((p) => p.id)))
                    }
                  >
                    Tout sélectionner
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-gray-300"
                    onClick={() => setSelectedProspectIds(new Set())}
                  >
                    Tout désélectionner
                  </Button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-gray-300 p-2">
                {prospects.map((prospect) => (
                  <div
                    key={prospect.id}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                      selectedProspectIds.has(prospect.id)
                        ? "bg-purple-500/10 border border-purple-500/30"
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => toggleProspect(prospect.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProspectIds.has(prospect.id)}
                      onChange={() => toggleProspect(prospect.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {prospect.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {prospect.company}
                        {prospect.jobTitle && ` - ${prospect.jobTitle}`}
                      </div>
                    </div>
                    {prospect.email ? (
                      <Badge className="bg-green-500/20 text-green-400 text-xs shrink-0">
                        <Mail className="h-3 w-3 mr-1" />
                        Email
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-500/20 text-yellow-400 text-xs shrink-0">
                        Pas d'email
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {prospectsWithEmail.length < selectedProspectIds.size && (
                <div className="flex items-center gap-2 text-xs text-yellow-400">
                  <AlertTriangle className="h-3 w-3" />
                  {selectedProspectIds.size - prospectsWithEmail.length} prospect(s) sans email
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: But de la campagne → Génération IA → Templates à valider */}
        {step === 2 && (
          <div className="space-y-4">
            {/* 2a — But de la campagne */}
            <Card className="bg-gray-50 border-gray-300">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  Quel est le but de cette campagne ?
                </CardTitle>
                <CardDescription className="text-gray-500 text-xs">
                  Décrivez l’objectif (ex. prise de rendez-vous, démo, relance prospects). L’IA rédigera un template de mail personnalisable pour chaque prospect.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Textarea
                  value={campaignGoal}
                  onChange={(e) => setCampaignGoal(e.target.value)}
                  placeholder="Ex. : Prendre des rendez-vous avec des directeurs marketing pour présenter notre outil de génération de leads..."
                  className="bg-gray-200 border-gray-400 text-sm min-h-[80px] resize-none"
                  rows={3}
                />
              </CardContent>
            </Card>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="space-y-2 flex-1 min-w-[140px]">
                <Label>Nombre d'étapes</Label>
                <Select
                  value={String(stepCount)}
                  onValueChange={(v) => handleStepCountChange(v as "2" | "3")}
                >
                  <SelectTrigger className="bg-gray-100 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="2">2 emails</SelectItem>
                    <SelectItem value="3">3 emails</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 flex-1 min-w-[180px]">
                <Label>Mode de personnalisation</Label>
                <Select
                  value={personalizationMode}
                  onValueChange={(v) =>
                    setPersonalizationMode(v as "template" | "ai")
                  }
                >
                  <SelectTrigger className="bg-gray-100 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="template">
                      Template (variables)
                    </SelectItem>
                    <SelectItem value="ai" disabled={!hasAI}>
                      AI (GPT-4) {!hasAI && "- Clé API requise"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                onClick={handleGenerateTemplates}
                disabled={isGeneratingTemplate || !campaignGoal.trim() || !hasAI}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 mt-6"
              >
                {isGeneratingTemplate ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isGeneratingTemplate ? "Génération..." : "Générer les templates avec l'IA"}
              </Button>
            </div>

            {!hasAI && (
              <p className="text-xs text-gray-9000">
                Configurez OPENAI_API_KEY pour que l’IA rédige les templates à partir du but. Sinon, utilisez les templates par défaut ci-dessous après avoir choisi le nombre d’étapes.
              </p>
            )}

            {/* Variables reference */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-9000 mr-1">Variables :</span>
              {AVAILABLE_VARIABLES.map((v) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="text-xs cursor-default border-gray-300 text-gray-500"
                >
                  {`{${v.key}}`} = {v.label}
                </Badge>
              ))}
            </div>

            {/* 2b — Templates à valider / éditer */}
            <div className="text-sm font-medium text-gray-700">
              {stepTemplates.length > 0
                ? "Validez ou modifiez les templates ci-dessous, puis passez à l’étape suivante."
                : "Remplissez le but de la campagne et cliquez sur « Générer les templates avec l’IA », ou choisissez le nombre d’étapes pour charger des templates par défaut."}
            </div>

            {/* Email step editors */}
            {/* Pièces jointes (communes à tous les emails de la campagne) */}
            <Card className="bg-gray-50 border-gray-300">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-gray-900 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-gray-500" />
                  Pièces jointes
                  <span className="text-xs font-normal text-gray-9000">(optionnel — communes à tous les emails)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {attachmentFiles.length > 0 && (
                  <div className="space-y-2">
                    {attachmentFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-200/50 rounded px-3 py-2">
                        <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-gray-9000 shrink-0">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachmentFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-9000 hover:text-red-400 transition-colors shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {attachmentFiles.length < 5 && (
                  <label className="flex items-center gap-2 border border-dashed border-gray-400 rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                    <Paperclip className="h-4 w-4 text-gray-9000" />
                    <span className="text-sm text-gray-9000">
                      Ajouter un fichier (PDF, image, Word, Excel… max 10 MB)
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error("Fichier trop volumineux (max 10 MB)");
                          return;
                        }
                        setAttachmentFiles((prev) => [...prev, file]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {attachmentFiles.length >= 5 && (
                  <p className="text-xs text-gray-9000">Maximum 5 pièces jointes atteint.</p>
                )}
              </CardContent>
            </Card>

            {stepTemplates.map((template, index) => (
              <Card key={index} className="bg-gray-50 border-gray-300">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-gray-900">
                      Étape {template.stepNumber}
                      {template.stepNumber === 1
                        ? " - Premier contact"
                        : template.stepNumber === 2
                        ? " - Relance"
                        : " - Dernier message"}
                    </CardTitle>
                    {template.stepNumber > 1 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-500">Délai :</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={template.delayDays}
                          onChange={(e) =>
                            updateTemplate(
                              index,
                              "delayDays",
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-16 h-7 text-xs bg-gray-200 border-gray-400"
                        />
                        <span className="text-xs text-gray-500">jours</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Objet</Label>
                    <Input
                      value={template.subject}
                      onChange={(e) =>
                        updateTemplate(index, "subject", e.target.value)
                      }
                      placeholder="Objet de l'email..."
                      className="bg-gray-200 border-gray-400 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contenu (HTML)</Label>
                    <Textarea
                      value={template.content}
                      onChange={(e) =>
                        updateTemplate(index, "content", e.target.value)
                      }
                      placeholder="Contenu de l'email..."
                      className="bg-gray-200 border-gray-400 text-sm min-h-[120px] font-mono"
                      rows={6}
                    />
                  </div>
                  {/* Quick variable insert */}
                  <div className="flex flex-wrap gap-1">
                    {AVAILABLE_VARIABLES.map((v) => (
                      <Button
                        key={v.key}
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2 border-gray-400 text-gray-500 hover:text-gray-900"
                        onClick={() => insertVariable(index, "content", v.key)}
                      >
                        +{`{${v.key}}`}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label>Prévisualiser pour :</Label>
                <Select
                  value={previewProspectId || [...selectedProspectIds][0] || ""}
                  onValueChange={(v) => {
                    setPreviewProspectId(v);
                    setPreviewData([]);
                  }}
                >
                  <SelectTrigger className="bg-gray-100 border-gray-300">
                    <SelectValue placeholder="Choisir un prospect" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {selectedProspects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} - {p.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handlePreview}
                disabled={isPreviewing}
                className="bg-purple-600 hover:bg-purple-700 mt-6"
              >
                {isPreviewing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Prévisualiser
              </Button>
            </div>

            {previewData.length > 0 ? (
              <div className="space-y-3">
                {previewData.map((preview, index) => (
                  <Card key={index} className="bg-gray-50 border-gray-300">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          Étape {index + 1}
                        </Badge>
                        {preview.score > 0 && (
                          <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                            Score: {preview.score}/100
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        Objet : {preview.subject}
                      </div>
                      <div
                        className="text-sm text-gray-700 bg-gray-50 rounded p-3 prose prose-sm prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.content) }}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-9000 text-sm">
                <Eye className="h-8 w-8 mx-auto mb-3 opacity-50" />
                Cliquez sur "Prévisualiser" pour voir le rendu personnalisé
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="space-y-4">
            <Card className="bg-gray-50 border-gray-300">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-medium text-gray-900">Résumé de la campagne</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Nom :</span>
                    <span className="text-gray-900 ml-2">{campaignName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Prospects :</span>
                    <span className="text-gray-900 ml-2">{selectedProspectIds.size}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Étapes :</span>
                    <span className="text-gray-900 ml-2">{stepTemplates.length} emails</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Mode :</span>
                    <span className="text-gray-900 ml-2">
                      {personalizationMode === "ai" ? "AI (GPT-4)" : "Template"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Avec email :</span>
                    <span className="text-gray-900 ml-2">{prospectsWithEmail.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total emails :</span>
                    <span className="text-gray-900 ml-2">
                      ~{prospectsWithEmail.length * stepTemplates.length}
                    </span>
                  </div>
                  {attachmentFiles.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Pièces jointes :</span>
                      <span className="text-gray-900 ml-2">
                        {attachmentFiles.map((f) => f.name).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SMTP Check */}
            <Card
              className={`border ${
                smtpVerified
                  ? "bg-green-500/5 border-green-500/30"
                  : smtpConfigured
                  ? "bg-yellow-500/5 border-yellow-500/30"
                  : "bg-red-500/5 border-red-500/30"
              }`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                {smtpVerified ? (
                  <>
                    <Check className="h-5 w-5 text-green-400" />
                    <div>
                      <div className="text-sm font-medium text-green-400">
                        SMTP configuré et vérifié
                      </div>
                      <div className="text-xs text-green-400/70">
                        Prêt pour l'envoi
                      </div>
                    </div>
                  </>
                ) : smtpConfigured ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    <div>
                      <div className="text-sm font-medium text-yellow-400">
                        SMTP configuré mais non vérifié
                      </div>
                      <div className="text-xs text-yellow-400/70">
                        Testez la connexion dans l'onglet SMTP avant de lancer
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <div>
                      <div className="text-sm font-medium text-red-400">
                        SMTP non configuré
                      </div>
                      <div className="text-xs text-red-400/70">
                        Configurez votre SMTP dans l'onglet dédié avant de créer la campagne
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-xs text-gray-9000">
              <Info className="h-3 w-3" />
              La campagne sera créée en mode BROUILLON. Vous pourrez la personnaliser et la lancer depuis le dashboard.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-300">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}
            className="border-gray-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? "Annuler" : "Précédent"}
          </Button>

          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Suivant
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isCreating || !smtpConfigured}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Créer la campagne
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
