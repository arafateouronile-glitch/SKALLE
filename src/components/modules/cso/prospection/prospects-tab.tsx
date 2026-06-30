"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Plus, Loader2, Sparkles, MoreVertical, Linkedin, Building2, Mail,
  MessageSquare, ExternalLink, Copy, Check, Rocket, Download, Upload, FileSpreadsheet,
  CheckCircle2, Info,
} from "lucide-react";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CSVImportDialog } from "@/components/prospection/csv-import-dialog";
import { LinkedInImportDialog } from "@/components/prospection/linkedin-import-dialog";
import { LookalikeDialog } from "@/components/prospection/lookalike-dialog";
import { createProspect, generateProspectionSequence, getProspects } from "@/actions/prospects";
import { getProspectLists } from "@/actions/prospect-lists";
import { exportProspectsCSV } from "@/actions/csv-import-export";
import { prepareProspectOutreachAction } from "@/actions/cso-sales";
import type { PrepareProspectOutreachResult } from "@/lib/services/sales/closer";
import { toast } from "sonner";
import type { Prospect, ProspectMessages, statusColors, statusLabels } from "./types";
import { statusColors as SC, statusLabels as SL } from "./types";

export function ProspectsTab({ workspaceId }: { workspaceId: string }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [selectedForCampaign, setSelectedForCampaign] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showLinkedInImport, setShowLinkedInImport] = useState(false);
  const [showLookalikeDialog, setShowLookalikeDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lists, setLists] = useState<Array<{ id: string; name: string; _count: { prospects: number } }>>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", company: "", jobTitle: "", linkedInUrl: "", email: "", notes: "" });
  const [csoResult, setCsoResult] = useState<PrepareProspectOutreachResult | null>(null);
  const [csoLoading, setCsoLoading] = useState<string | null>(null);

  useEffect(() => { loadLists(); loadProspects(); }, []);
  useEffect(() => { loadProspects(); }, [selectedListId]);

  const loadLists = async () => {
    try {
      const result = await getProspectLists(workspaceId);
      if (result.success && result.data) setLists(result.data);
    } catch { /* ignore */ }
  };

  const loadProspects = async () => {
    setIsLoading(true);
    try {
      const data = await getProspects(workspaceId, selectedListId || undefined);
      setProspects(data.map((p: any) => ({ ...p, messages: p.messages as ProspectMessages | null })));
    } catch { toast.error("Erreur lors du chargement des prospects"); }
    finally { setIsLoading(false); }
  };

  const handleCreateProspect = async () => {
    if (!formData.name || !formData.company) { toast.error("Nom et entreprise requis"); return; }
    setIsLoading(true);
    try {
      const result = await createProspect(workspaceId, formData);
      if (result.success && result.data) {
        await loadProspects();
        setIsDialogOpen(false);
        setFormData({ name: "", company: "", jobTitle: "", linkedInUrl: "", email: "", notes: "" });
        toast.success("Prospect ajouté !");
      } else toast.error(result.error || "Erreur");
    } catch { toast.error("Une erreur est survenue"); }
    finally { setIsLoading(false); }
  };

  const handleCsoStrategy = async (prospect: Prospect) => {
    setCsoLoading(prospect.id); setCsoResult(null);
    try {
      const result = await prepareProspectOutreachAction(prospect.id, { workspaceId, runEnrichment: true, runAdIntelligence: false, platform: "LINKEDIN" });
      setCsoResult(result);
      if (result.success) toast.success("Stratégie CSO prête — 10 crédits utilisés");
      else toast.error(result.error || "Erreur");
    } catch { toast.error("Erreur lors de la génération"); }
    finally { setCsoLoading(null); }
  };

  const handleGenerateMessages = async (prospect: Prospect) => {
    setIsGenerating(prospect.id);
    try {
      const result = await generateProspectionSequence(prospect.id);
      if (result.success && result.data) {
        setProspects(prospects.map((p) => p.id === prospect.id ? { ...p, messages: result.data } : p));
        setSelectedProspect({ ...prospect, messages: result.data });
        toast.success("Messages générés !");
      } else toast.error(result.error || "Erreur");
    } catch { toast.error("Une erreur est survenue"); }
    finally { setIsGenerating(null); }
  };

  const copyMessage = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedMessage(key);
    toast.success("Message copié");
    setTimeout(() => setCopiedMessage(null), 2000);
  };

  const toggleCampaignSelection = (id: string) => {
    const next = new Set(selectedForCampaign);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedForCampaign(next);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const result = await exportProspectsCSV(workspaceId, selectedListId || undefined);
      if (result.success && result.csv) {
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export CSV téléchargé");
      } else toast.error(result.error || "Erreur d'export");
    } catch { toast.error("Erreur lors de l'export"); }
    finally { setIsExporting(false); }
  };

  const campaignProspects = prospects.filter((p) => selectedForCampaign.has(p.id));

  if (isLoading && prospects.length === 0) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-8">
      {/* RGPD notice */}
      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
        <span>
          Les données prospects (nom, email, profil LinkedIn) sont traitées sur la base de{" "}
          <strong>l&apos;intérêt légitime B2B</strong> (RGPD art. 6.1.f). Droit d&apos;opposition :{" "}
          <a href="mailto:privacy@skalle.io" className="underline hover:text-blue-900">privacy@skalle.io</a>.{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">Politique de confidentialité →</a>
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mes Prospects</h2>
          <p className="text-gray-500 mt-1">Gerez vos prospects et generez des sequences personnalisees</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedListId && prospects.length > 0 && (
            <Button onClick={() => { setSelectedForCampaign(new Set(prospects.map((p) => p.id))); setShowWizard(true); }}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
              <Rocket className="h-4 w-4 mr-2" /> Campagne depuis cette liste ({prospects.length})
            </Button>
          )}
          {selectedListId && prospects.length >= 3 && (
            <Button variant="outline" onClick={() => setShowLookalikeDialog(true)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50/50">
              <Sparkles className="h-4 w-4 mr-2" /> Trouver des similaires
            </Button>
          )}
          {selectedForCampaign.size > 0 && (
            <Button onClick={() => setShowWizard(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
              <Rocket className="h-4 w-4 mr-2" /> Créer campagne ({selectedForCampaign.size})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-gray-200 text-gray-700">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Importer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <DropdownMenuItem className="text-gray-700" onClick={() => setShowCSVImport(true)}>
                <Upload className="h-4 w-4 mr-2" /> Importer CSV
              </DropdownMenuItem>
              <DropdownMenuItem className="text-gray-700" onClick={() => setShowLinkedInImport(true)}>
                <Linkedin className="h-4 w-4 mr-2" /> Importer LinkedIn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="border-gray-200 text-gray-700" onClick={handleExportCSV} disabled={isExporting || prospects.length === 0}>
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exporter CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                <Plus className="h-4 w-4 mr-2" /> Nouveau prospect
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <DialogHeader>
                <DialogTitle className="text-gray-900">Ajouter un prospect</DialogTitle>
                <DialogDescription className="text-gray-500">Entrez les informations du prospect LinkedIn</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700">Nom *</Label>
                    <Input placeholder="Jean Dupont" value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-white/60 border-gray-200 text-gray-900" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Entreprise *</Label>
                    <Input placeholder="Acme Inc" value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="bg-white/60 border-gray-200 text-gray-900" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700">Poste</Label>
                    <Input placeholder="CEO" value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="bg-white/60 border-gray-200 text-gray-900" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Email</Label>
                    <Input type="email" placeholder="jean@acme.com" value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="bg-white/60 border-gray-200 text-gray-900" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">URL LinkedIn</Label>
                  <Input placeholder="https://linkedin.com/in/jean-dupont" value={formData.linkedInUrl}
                    onChange={(e) => setFormData({ ...formData, linkedInUrl: e.target.value })}
                    className="bg-white/60 border-gray-200 text-gray-900" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Notes</Label>
                  <Textarea placeholder="Informations supplémentaires..." value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="bg-white/60 border-gray-200 text-gray-900" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-gray-200 text-gray-700">Annuler</Button>
                <Button onClick={handleCreateProspect} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtres par liste */}
      {lists.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button variant={selectedListId === null ? "default" : "outline"} size="sm"
            onClick={() => setSelectedListId(null)}
            className={selectedListId === null ? "bg-emerald-600 hover:bg-emerald-700" : "border-gray-200 text-gray-500"}>
            Tous
          </Button>
          {lists.map((list) => (
            <Button key={list.id} variant={selectedListId === list.id ? "default" : "outline"} size="sm"
              onClick={() => setSelectedListId(list.id)}
              className={selectedListId === list.id ? "bg-emerald-600 hover:bg-emerald-700" : "border-gray-200 text-gray-500"}>
              {list.name} ({list._count.prospects})
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {prospects.length > 0 ? prospects.map((prospect) => (
            <Card key={prospect.id}
              className={`bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 cursor-pointer transition-all ${selectedProspect?.id === prospect.id ? "ring-2 ring-emerald-500" : "hover:border-gray-300"}`}
              onClick={() => setSelectedProspect(prospect)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <input type="checkbox" checked={selectedForCampaign.has(prospect.id)}
                        onChange={(e) => { e.stopPropagation(); toggleCampaignSelection(prospect.id); }}
                        onClick={(e) => e.stopPropagation()} className="rounded mt-1" title="Sélectionner pour campagne" />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                        {prospect.name.charAt(0)}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        {prospect.name}
                        {prospect.emailVerified && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Email vérifié
                          </Badge>
                        )}
                        {prospect.linkedInUrl && (
                          <a href={prospect.linkedInUrl} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Building2 className="h-3 w-3" /> {prospect.company}
                        {prospect.jobTitle && <><span>•</span>{prospect.jobTitle}</>}
                      </div>
                      {prospect.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                          <Mail className="h-3 w-3" /> {prospect.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={SC[prospect.status]}>{SL[prospect.status]}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-gray-500" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                        <DropdownMenuItem className="text-gray-700" onClick={(e) => { e.stopPropagation(); handleGenerateMessages(prospect); }}>
                          <Sparkles className="h-4 w-4 mr-2" /> Générer messages
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-gray-700" disabled={csoLoading === prospect.id}
                          onClick={(e) => { e.stopPropagation(); handleCsoStrategy(prospect); }}>
                          {csoLoading === prospect.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                          Stratégie CSO (Click-to-Send)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {isGenerating === prospect.id && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Génération des messages...
                  </div>
                )}
              </CardContent>
            </Card>
          )) : (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardContent className="py-16 text-center">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun prospect</h3>
                <p className="text-gray-500 mb-4">Commencez par ajouter vos premiers prospects LinkedIn</p>
                <Button onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4 mr-2" /> Ajouter un prospect
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" /> Séquence de messages
              </CardTitle>
              <CardDescription className="text-gray-500">
                {selectedProspect ? `Messages pour ${selectedProspect.name}` : "Sélectionnez un prospect"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedProspect?.messages ? (
                <div className="space-y-4">
                  {[{ key: "message1", label: "1. Approche" }, { key: "message2", label: "2. Valeur" }, { key: "message3", label: "3. CTA" }].map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-emerald-600">{label}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-gray-900"
                          onClick={() => copyMessage(selectedProspect.messages![key as keyof ProspectMessages], key)}>
                          {copiedMessage === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="bg-white/50 rounded-lg p-3 text-sm text-gray-700">
                        {selectedProspect.messages?.[key as keyof ProspectMessages] || ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedProspect ? (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm mb-4">Aucun message généré</p>
                  <Button onClick={() => handleGenerateMessages(selectedProspect)} disabled={isGenerating === selectedProspect.id} className="bg-emerald-600 hover:bg-emerald-700">
                    {isGenerating === selectedProspect.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Générer
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">Sélectionnez un prospect pour voir ses messages</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CampaignWizard workspaceId={workspaceId} prospects={campaignProspects} open={showWizard} onOpenChange={setShowWizard}
        onCreated={() => setSelectedForCampaign(new Set())} />

      {/* CSO Strategy Dialog */}
      <Dialog open={!!csoResult} onOpenChange={(open) => !open && setCsoResult(null)}>
        <DialogContent className="max-w-lg bg-white/95 backdrop-blur-sm border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-emerald-600" /> Stratégie CSO — Elite Sales Closer
            </DialogTitle>
            <DialogDescription>
              {csoResult?.success ? "Accroche, follow-ups et script d'objection." : csoResult?.error}
            </DialogDescription>
          </DialogHeader>
          {csoResult?.success && csoResult.strategy && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <span className="text-gray-500">Score lead</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  {csoResult.strategy.leadScore}/10
                </Badge>
              </div>
              {csoResult.recommendedMessage && (
                <div>
                  <Label className="text-gray-600">Message recommandé</Label>
                  <div className="mt-1 flex gap-2">
                    <Textarea readOnly value={csoResult.recommendedMessage} className="min-h-[80px] resize-none bg-gray-50 text-gray-800" rows={3} />
                    <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(csoResult!.recommendedMessage!); toast.success("Copié !"); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {csoResult.messagingLink && (
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <a href={csoResult.messagingLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> Ouvrir la messagerie {csoResult.platform ? `(${csoResult.platform})` : ""}
                  </a>
                </Button>
              )}
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="font-medium text-gray-700">Douleur identifiée</p>
                <p className="text-gray-600">{csoResult.strategy.painAnalysis}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="font-medium text-gray-700">Relances</p>
                <p className="text-gray-600">J+3 : {csoResult.strategy.followUp1}</p>
                <p className="text-gray-600">J+6 : {csoResult.strategy.followUp2}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                <p className="font-medium text-amber-800">Objection anticipée</p>
                <p className="text-amber-700">{csoResult.strategy.objectionHandling.objection}</p>
                <p className="text-gray-600">{csoResult.strategy.objectionHandling.response}</p>
              </div>
              {csoResult.remainingCredits != null && (
                <p className="text-gray-500 text-xs">Crédits restants : {csoResult.remainingCredits}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CSVImportDialog workspaceId={workspaceId} open={showCSVImport} onOpenChange={setShowCSVImport}
        onImported={() => { loadProspects(); loadLists(); }} />
      <LinkedInImportDialog workspaceId={workspaceId} open={showLinkedInImport} onOpenChange={setShowLinkedInImport}
        onImported={() => { loadProspects(); loadLists(); }} />
      {selectedListId && (
        <LookalikeDialog workspaceId={workspaceId} listId={selectedListId}
          listName={lists.find((l) => l.id === selectedListId)?.name || ""}
          open={showLookalikeDialog} onOpenChange={setShowLookalikeDialog}
          onImported={() => { loadProspects(); loadLists(); }} />
      )}
    </div>
  );
}
