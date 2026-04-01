"use client";

/**
 * 🎯 Prospection LinkedIn - Interface Complète
 *
 * 3 onglets principaux:
 * 1. Find Leads - Recherche de leads qualifiés
 * 2. Sequences - Gestion des séquences multi-canal
 * 3. Prospects - Liste des prospects
 * 4. Deliverability - Configuration email
 */

import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  Loader2,
  Sparkles,
  MoreVertical,
  Linkedin,
  Building2,
  Mail,
  MessageSquare,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Mail as MailIcon,
  Phone,
  MessageCircle,
  Send,
  Play,
  Pause,
  Settings,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Shield,
  Activity,
  Rocket,
  Download,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { SmtpConfigForm } from "@/components/campaigns/smtp-config-form";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CampaignDashboard } from "@/components/campaigns/campaign-dashboard";
import { CSVImportDialog } from "@/components/prospection/csv-import-dialog";
import { LinkedInImportDialog } from "@/components/prospection/linkedin-import-dialog";
import { LinkedInActionsQueue } from "@/components/prospection/linkedin-actions-queue";
import { LookalikeDialog } from "@/components/prospection/lookalike-dialog";
import { createProspect, generateProspectionSequence, getProspects } from "@/actions/prospects";
import {
  searchQualifiedLeads,
  enrichLead,
  saveSearchCriteria,
  getSearchCriteria,
  getUserWorkspace,
  qualifyProspectSearch,
  generateLeadMessage,
  type QualifiedSearchCriteria,
} from "@/actions/leads";
import { getProspectLists } from "@/actions/prospect-lists";
import { ImportToListDialog } from "@/components/prospection/import-to-list-dialog";
import {
  createSequence,
  getSequences,
  startSequence,
  pauseSequence,
  getSequenceStats,
} from "@/actions/sequences";
import {
  getDeliverabilityConfig,
  saveDeliverabilityConfig,
  verifyDNSRecords,
  getWarmupStatus,
  getMonitoringStatus,
} from "@/actions/deliverability";
import { exportProspectsCSV } from "@/actions/csv-import-export";
import { prepareProspectOutreachAction } from "@/actions/cso-sales";
import type { PrepareProspectOutreachResult } from "@/lib/services/sales/closer";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProspectMessages {
  message1: string;
  message2: string;
  message3: string;
}

interface Prospect {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  linkedInUrl: string;
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  location?: string | null;
  industry?: string | null;
  notes?: string | null;
  status: string;
  messages?: ProspectMessages | null;
}

interface QualifiedLead {
  name: string;
  email?: string;
  emailVerified: boolean;
  emailScore?: number;
  phone?: string;
  phoneVerified: boolean;
  linkedInUrl?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  enrichmentData?: {
    source?: string;
    googleRating?: number;
    googleReviewCount?: number;
    googleCategory?: string;
    websiteUrl?: string;
    googleAddress?: string;
    [key: string]: unknown;
  };
}

const statusColors: Record<string, string> = {
  NEW: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  CONTACTED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  REPLIED: "bg-green-500/20 text-green-400 border-green-500/30",
  CONVERTED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  REPLIED: "Répondu",
  CONVERTED: "Converti",
  REJECTED: "Rejeté",
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 FIND LEADS TAB - Recherche IA de Leads Qualifiés
// ═══════════════════════════════════════════════════════════════════════════

function CriteriaBadgeList({
  label,
  items,
  onRemove,
  onAdd,
  placeholder,
}: {
  label: string;
  items: string[];
  onRemove: (i: number) => void;
  onAdd: (val: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500 uppercase tracking-wide">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="cursor-pointer bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-600 transition-colors text-xs"
            onClick={() => onRemove(i)}
          >
            {item} ×
          </Badge>
        ))}
        <input
          ref={inputRef}
          placeholder={placeholder}
          className="text-xs border border-dashed border-gray-300 rounded px-2 py-0.5 bg-transparent text-gray-600 placeholder:text-gray-400 focus:outline-none focus:border-emerald-400 w-32"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              onAdd(e.currentTarget.value.trim());
              e.currentTarget.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}

function FindLeadsTab({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState("");
  const [isQualifying, setIsQualifying] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [criteria, setCriteria] = useState<QualifiedSearchCriteria | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [leads, setLeads] = useState<QualifiedLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Message generation
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [messageModal, setMessageModal] = useState<{
    lead: QualifiedLead;
    message: string;
    connectionRequest?: string;
    score?: number;
    recommendations?: string[];
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const handleQualify = async () => {
    if (!query.trim()) return;
    setIsQualifying(true);
    setCriteria(null);
    setLeads([]);
    setSelectedLeads(new Set());
    try {
      const result = await qualifyProspectSearch(query);
      if (result.success && result.criteria) {
        setCriteria(result.criteria);
        setAiSummary(result.summary || "");
      } else {
        toast.error(result.error || "Erreur lors de la qualification");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsQualifying(false);
    }
  };

  const handleSearch = async () => {
    if (!criteria) return;
    setIsSearching(true);
    try {
      const result = await searchQualifiedLeads(workspaceId, criteria);
      if (result.success && result.leads) {
        setLeads(result.leads);
        toast.success(`${result.leads.length} leads trouvés !`);
      } else {
        toast.error(result.error || "Erreur de recherche");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportClick = () => {
    if (selectedLeads.size === 0) {
      toast.error("Selectionnez au moins un lead");
      return;
    }
    setShowImportDialog(true);
  };

  const handleGenerateMessage = async (lead: QualifiedLead, index: number) => {
    setGeneratingFor(index);
    try {
      const result = await generateLeadMessage(workspaceId, {
        name: lead.name,
        company: lead.company,
        jobTitle: lead.jobTitle,
        linkedInUrl: lead.linkedInUrl,
        location: lead.location,
        industry: lead.industry,
        enrichmentData: lead.enrichmentData as Record<string, unknown> | undefined,
      });
      if (result.success && result.message) {
        setMessageModal({
          lead,
          message: result.message,
          connectionRequest: result.connectionRequest,
          score: result.personalizationScore,
          recommendations: result.recommendations,
        });
      } else {
        toast.error(result.error || "Erreur de génération");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setGeneratingFor(null);
    }
  };

  const toggleLeadSelection = (index: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedLeads(newSelected);
  };

  const updateCriteria = (field: keyof QualifiedSearchCriteria, value: unknown) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: value });
  };

  const removeFromList = (field: "jobTitles" | "industries" | "locations" | "keywords", i: number) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: criteria[field].filter((_, idx) => idx !== i) });
  };

  const addToList = (field: "jobTitles" | "industries" | "locations" | "keywords", val: string) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: [...criteria[field], val] });
  };

  return (
    <div className="space-y-6">
      {/* Chat Input */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Décrivez votre cible de prospection
          </CardTitle>
          <CardDescription className="text-gray-500">
            L'IA va analyser votre demande et construire les requêtes de recherche optimales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Gérants d'organismes de formation en Île-de-France, ou Directeurs Marketing de startups SaaS B2B à Paris, ou Restaurateurs ayant une bonne note Google à Lyon..."
            rows={3}
            className="bg-white border-gray-200 resize-none text-gray-800 placeholder:text-gray-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQualify();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Entrée + ⌘/Ctrl pour envoyer</span>
            <Button
              onClick={handleQualify}
              disabled={isQualifying || !query.trim()}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {isQualifying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isQualifying ? "Analyse en cours..." : "Qualifier avec l'IA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Qualification Result */}
      {criteria && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-emerald-200/60">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-gray-900 text-base">Cible qualifiée</CardTitle>
                <CardDescription className="text-gray-600 mt-0.5">{aiSummary}</CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={criteria.searchMode === "linkedin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateCriteria("searchMode", "linkedin")}
                  className={criteria.searchMode === "linkedin"
                    ? "bg-blue-600 hover:bg-blue-700 text-xs h-7"
                    : "border-gray-200 text-gray-500 text-xs h-7"}
                >
                  <Linkedin className="h-3 w-3 mr-1" />
                  LinkedIn
                </Button>
                <Button
                  variant={criteria.searchMode === "google_business" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateCriteria("searchMode", "google_business")}
                  className={criteria.searchMode === "google_business"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-xs h-7"
                    : "border-gray-200 text-gray-500 text-xs h-7"}
                >
                  <Building2 className="h-3 w-3 mr-1" />
                  Google
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {criteria.searchMode === "linkedin" && (
                <>
                  <CriteriaBadgeList
                    label="Titres de poste"
                    items={criteria.jobTitles}
                    onRemove={(i) => removeFromList("jobTitles", i)}
                    onAdd={(v) => addToList("jobTitles", v)}
                    placeholder="+ Ajouter..."
                  />
                  <CriteriaBadgeList
                    label="Industries"
                    items={criteria.industries}
                    onRemove={(i) => removeFromList("industries", i)}
                    onAdd={(v) => addToList("industries", v)}
                    placeholder="+ Ajouter..."
                  />
                </>
              )}
              {criteria.searchMode === "google_business" && (
                <CriteriaBadgeList
                  label="Type d'activité"
                  items={criteria.keywords}
                  onRemove={(i) => removeFromList("keywords", i)}
                  onAdd={(v) => addToList("keywords", v)}
                  placeholder="+ Ajouter..."
                />
              )}
              <CriteriaBadgeList
                label="Localisations"
                items={criteria.locations}
                onRemove={(i) => removeFromList("locations", i)}
                onAdd={(v) => addToList("locations", v)}
                placeholder="+ Ajouter..."
              />
              {criteria.searchMode === "linkedin" && (
                <CriteriaBadgeList
                  label="Mots-clés"
                  items={criteria.keywords}
                  onRemove={(i) => removeFromList("keywords", i)}
                  onAdd={(v) => addToList("keywords", v)}
                  placeholder="+ Ajouter..."
                />
              )}
            </div>

            <div className="flex items-center gap-6 pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={criteria.requireEmail}
                  onChange={(e) => updateCriteria("requireEmail", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Email requis</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={criteria.requirePhone}
                  onChange={(e) => updateCriteria("requirePhone", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Téléphone requis</span>
              </label>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-500">Limite :</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={criteria.limit}
                  onChange={(e) => updateCriteria("limit", parseInt(e.target.value) || 50)}
                  className="w-20 h-7 text-sm bg-white border-gray-200"
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-8"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {isSearching ? "Recherche..." : "Lancer la recherche"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {leads.length > 0 && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-gray-900">
                  {leads.length} Leads Qualifiés Trouvés
                </CardTitle>
                <CardDescription className="text-gray-500">
                  {selectedLeads.size} sélectionné(s)
                </CardDescription>
              </div>
              <Button
                onClick={handleImportClick}
                disabled={selectedLeads.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Importer {selectedLeads.size > 0 && `(${selectedLeads.size})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {leads.map((lead, index) => (
                <Card
                  key={index}
                  className={`bg-white/50 backdrop-blur-sm border-gray-200 cursor-pointer transition-all ${
                    selectedLeads.has(index.toString())
                      ? "ring-2 ring-emerald-500"
                      : "hover:border-gray-300"
                  }`}
                  onClick={() => toggleLeadSelection(index.toString())}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(index.toString())}
                          onChange={() => toggleLeadSelection(index.toString())}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                            {lead.emailVerified && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Email vérifié
                              </Badge>
                            )}
                            {lead.emailScore && (
                              <Badge variant="outline" className="text-xs">
                                Score: {lead.emailScore}/100
                              </Badge>
                            )}
                            {lead.enrichmentData?.googleRating && (
                              <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-xs">
                                {"★"} {lead.enrichmentData.googleRating}
                                {lead.enrichmentData.googleReviewCount != null && (
                                  <span className="text-gray-500 ml-1">({lead.enrichmentData.googleReviewCount})</span>
                                )}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 space-y-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3 w-3" />
                              {lead.company}
                              {lead.jobTitle && <span>• {lead.jobTitle}</span>}
                              {lead.enrichmentData?.googleCategory && (
                                <span className="text-gray-400">• {lead.enrichmentData.googleCategory}</span>
                              )}
                            </div>
                            {lead.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3" />
                                <span className={lead.enrichmentData?.emailSource === "pattern-mx" ? "text-gray-400 italic" : ""}>
                                  {lead.email}
                                </span>
                                {lead.enrichmentData?.emailSource === "pattern-mx" && (
                                  <span className="text-xs text-gray-400">(probable)</span>
                                )}
                                {lead.enrichmentData?.emailSource === "google-search" && (
                                  <span className="text-xs text-green-500">● Google</span>
                                )}
                                {lead.enrichmentData?.emailSource === "website-scrape" && (
                                  <span className="text-xs text-blue-500">● Site web</span>
                                )}
                              </div>
                            )}
                            {lead.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </div>
                            )}
                            {(lead.location || lead.industry || !!lead.enrichmentData?.linkedInConnections) && (
                              <div className="flex items-center gap-3 text-gray-400 text-xs flex-wrap">
                                {lead.location && <span>📍 {String(lead.location)}</span>}
                                {lead.industry && <span>🏭 {String(lead.industry)}</span>}
                                {lead.enrichmentData?.linkedInConnections != null && (
                                  <span>👥 {String(lead.enrichmentData.linkedInConnections)} relations</span>
                                )}
                              </div>
                            )}
                            {lead.enrichmentData?.linkedInBio != null && (
                              <div className="text-xs text-gray-400 italic line-clamp-2 mt-1">
                                {String(lead.enrichmentData.linkedInBio)}
                              </div>
                            )}
                            {lead.enrichmentData?.websiteUrl && (
                              <div className="flex items-center gap-2">
                                <ExternalLink className="h-3 w-3" />
                                <a
                                  href={lead.enrichmentData.websiteUrl as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-400 hover:text-blue-300 hover:underline truncate max-w-[300px]"
                                >
                                  {(lead.enrichmentData.websiteUrl as string).replace(/^https?:\/\//, "")}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {lead.linkedInUrl ? (
                        <a
                          href={lead.linkedInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <Linkedin className="h-5 w-5" />
                        </a>
                      ) : lead.enrichmentData?.websiteUrl ? (
                        <a
                          href={lead.enrichmentData.websiteUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      ) : null}
                    </div>
                    {/* Bouton générer message */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5"
                        disabled={generatingFor === index}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateMessage(lead, index);
                        }}
                      >
                        {generatingFor === index ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        {generatingFor === index ? "Génération..." : "Générer message"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal message généré */}
      {messageModal && (
        <Dialog open={!!messageModal} onOpenChange={() => { setMessageModal(null); setCopiedMsg(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Message pour {messageModal.lead.name}
              </DialogTitle>
              <DialogDescription>
                {messageModal.lead.jobTitle && `${messageModal.lead.jobTitle} · `}{messageModal.lead.company}
                {messageModal.score != null && (
                  <span className="ml-2 text-xs text-purple-500">Score personnalisation : {messageModal.score}/100</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Message principal */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {messageModal.connectionRequest ? "Message de suivi" : "Message LinkedIn"}
                  </span>
                  <span className="text-xs text-gray-400">{messageModal.message.length}/300 car.</span>
                </div>
                <div className="relative">
                  <Textarea
                    value={messageModal.message}
                    onChange={(e) => setMessageModal({ ...messageModal, message: e.target.value })}
                    className="min-h-[120px] text-sm resize-none pr-10"
                  />
                </div>
              </div>

              {/* Message de connexion si étape 1 */}
              {messageModal.connectionRequest && messageModal.connectionRequest !== messageModal.message && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Demande de connexion</span>
                    <span className="text-xs text-gray-400">{messageModal.connectionRequest.length}/300 car.</span>
                  </div>
                  <Textarea
                    value={messageModal.connectionRequest}
                    onChange={(e) => setMessageModal({ ...messageModal, connectionRequest: e.target.value })}
                    className="min-h-[80px] text-sm resize-none"
                  />
                </div>
              )}

              {/* Recommandations */}
              {messageModal.recommendations && messageModal.recommendations.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-700 mb-1.5">Conseils d'envoi</p>
                  <ul className="space-y-1">
                    {messageModal.recommendations.slice(0, 3).map((rec, i) => (
                      <li key={i} className="text-xs text-blue-600">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(
                    messageModal.connectionRequest && messageModal.connectionRequest !== messageModal.message
                      ? messageModal.connectionRequest
                      : messageModal.message
                  );
                  setCopiedMsg(true);
                  setTimeout(() => setCopiedMsg(false), 2000);
                }}
              >
                {copiedMsg ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copiedMsg ? "Copié !" : "Copier"}
              </Button>
              {messageModal.lead.linkedInUrl && (
                <Button size="sm" asChild>
                  <a href={messageModal.lead.linkedInUrl} target="_blank" rel="noopener noreferrer">
                    <Linkedin className="h-3.5 w-3.5 mr-1.5" />
                    Ouvrir LinkedIn
                  </a>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Dialog */}
      <ImportToListDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        workspaceId={workspaceId}
        leads={leads
          .filter((_, i) => selectedLeads.has(i.toString()))
          .map((lead) => ({
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            linkedInUrl: lead.linkedInUrl || "",
            company: lead.company,
            jobTitle: lead.jobTitle,
            location: lead.location,
            industry: lead.industry,
          }))}
        onImported={() => {
          setSelectedLeads(new Set());
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 SEQUENCES TAB - Gestion des Séquences Multi-Canal
// ═══════════════════════════════════════════════════════════════════════════

function SequencesTab({ workspaceId }: { workspaceId: string }) {
  const [sequences, setSequences] = useState<any[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSequences();
  }, []);

  const loadSequences = async () => {
    setIsLoading(true);
    try {
      const result = await getSequences(workspaceId);
      if (result.success && result.data) {
        setSequences(result.data);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSequence = async (sequenceId: string) => {
    try {
      const result = await startSequence(sequenceId);
      if (result.success) {
        toast.success("Séquence démarrée !");
        loadSequences();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handlePauseSequence = async (sequenceId: string) => {
    try {
      const result = await pauseSequence(sequenceId);
      if (result.success) {
        toast.success("Séquence mise en pause");
        loadSequences();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "LINKEDIN":
        return <Linkedin className="h-4 w-4 text-blue-400" />;
      case "EMAIL":
        return <MailIcon className="h-4 w-4 text-emerald-600" />;
      case "PHONE":
        return <Phone className="h-4 w-4 text-green-400" />;
      case "SMS":
        return <MessageCircle className="h-4 w-4 text-yellow-400" />;
      default:
        return <Send className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      PENDING: { label: "En attente", color: "bg-gray-500/20 text-gray-400" },
      SENT: { label: "Envoyé", color: "bg-blue-500/20 text-blue-400" },
      DELIVERED: { label: "Délivré", color: "bg-green-500/20 text-green-400" },
      OPENED: { label: "Ouvert", color: "bg-emerald-500/20 text-emerald-400" },
      REPLIED: { label: "Répondu", color: "bg-emerald-500/20 text-emerald-400" },
      FAILED: { label: "Échoué", color: "bg-red-500/20 text-red-400" },
    };
    const config = statusConfig[status] || statusConfig.PENDING;
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Séquences Multi-Canal</h2>
          <p className="text-gray-500 mt-1">
            Gérez vos séquences de prospection LinkedIn et Email
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle séquence
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Créer une séquence</DialogTitle>
              <DialogDescription className="text-gray-500">
                Créez une séquence multi-canal personnalisée
              </DialogDescription>
            </DialogHeader>
            <div className="text-center py-8 text-gray-500">
              Formulaire de création de séquence à implémenter
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {sequences.length === 0 ? (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardContent className="py-16 text-center">
            <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune séquence</h3>
            <p className="text-gray-500 mb-4">
              Créez votre première séquence multi-canal
            </p>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Créer une séquence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sequences List */}
          <div className="lg:col-span-2 space-y-4">
            {sequences.map((sequence) => (
              <Card
                key={sequence.id}
                className={`bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 cursor-pointer transition-all ${
                  selectedSequence?.id === sequence.id
                    ? "ring-2 ring-emerald-500"
                    : "hover:border-gray-300"
                }`}
                onClick={() => setSelectedSequence(sequence)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">{sequence.name}</h3>
                        <Badge
                          variant={sequence.isActive ? "default" : "outline"}
                          className={
                            sequence.isActive
                              ? "bg-green-500/20 text-green-400"
                              : "bg-gray-500/20 text-gray-400"
                          }
                        >
                          {sequence.isActive ? "Active" : "Pause"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <Users className="h-3 w-3" />
                        {sequence.prospect?.name}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sequence.steps?.filter((step: any) => step.channel !== "PHONE" && step.channel !== "SMS").map((step: any) => (
                          <Badge
                            key={step.id}
                            variant="outline"
                            className="text-xs flex items-center gap-1"
                          >
                            {getChannelIcon(step.channel)}
                            Étape {step.stepNumber}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sequence.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePauseSequence(sequence.id);
                          }}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartSequence(sequence.id);
                          }}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Démarrer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sequence Details */}
          <div className="space-y-4">
            {selectedSequence ? (
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-gray-900 text-lg">
                    {selectedSequence.name}
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    {selectedSequence.prospect?.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedSequence.steps?.filter((step: any) => step.channel !== "PHONE" && step.channel !== "SMS").map((step: any) => (
                    <div
                      key={step.id}
                      className="bg-white/50 backdrop-blur-sm rounded-lg p-3 border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getChannelIcon(step.channel)}
                          <span className="text-sm font-medium text-gray-900">
                            Étape {step.stepNumber} - {step.channel}
                          </span>
                        </div>
                        {getStatusBadge(step.status)}
                      </div>
                      {step.subject && (
                        <div className="text-xs text-gray-500 mb-1">
                          Objet: {step.subject}
                        </div>
                      )}
                      <div className="text-sm text-gray-700 mb-2">
                        {step.content.slice(0, 100)}...
                      </div>
                      <div className="text-xs text-gray-400">
                        Délai: {step.delayDays} jours
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="py-12 text-center text-gray-500 text-sm">
                  Sélectionnez une séquence pour voir les détails
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📨 DELIVERABILITY TAB - Configuration Email
// ═══════════════════════════════════════════════════════════════════════════

function DeliverabilityTab({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState<any | null>(null);
  const [dnsCheck, setDnsCheck] = useState<any | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState<{
    googlePostmaster: boolean;
    senderScore: boolean;
    microsoftSNDS: boolean;
  } | null>(null);

  useEffect(() => {
    loadConfig();
    loadWarmupStatus();
    getMonitoringStatus().then(setMonitoringStatus).catch(() => {});
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const result = await getDeliverabilityConfig(workspaceId);
      if (result.success && result.data) {
        setConfig(result.data);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const loadWarmupStatus = async () => {
    try {
      const result = await getWarmupStatus(workspaceId);
      if (result.success && result.data) {
        setWarmupStatus(result.data);
      }
    } catch (error) {
      // Ignore if config doesn't exist
    }
  };

  const handleVerifyDNS = async () => {
    try {
      const result = await verifyDNSRecords(workspaceId);
      if (result.success && result.data) {
        setDnsCheck(result.data);
        toast.success("DNS records vérifiés !");
        loadConfig();
      } else {
        toast.error(result.error || "Erreur de vérification");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const result = await saveDeliverabilityConfig(workspaceId, {
        sendingDomain: config.sendingDomain || "",
        fromEmail: config.fromEmail || "",
        fromName: config.fromName || "",
        replyToEmail: config.replyToEmail || "",
        warmupEnabled: config.warmupEnabled ?? true,
        dailySendingLimit: config.dailySendingLimit || 50,
      });

      if (result.success) {
        toast.success("Configuration sauvegardée !");
        loadConfig();
        loadWarmupStatus();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* DNS Configuration */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            Configuration DNS (SPF/DKIM/DMARC)
          </CardTitle>
          <CardDescription className="text-gray-500">
            Vérifiez la configuration de votre domaine d'envoi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Domaine d'envoi</Label>
              <Input
                placeholder="example.com"
                value={config?.sendingDomain || ""}
                onChange={(e) =>
                  setConfig({ ...config, sendingDomain: e.target.value })
                }
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label>Email expéditeur</Label>
              <Input
                type="email"
                placeholder="hello@example.com"
                value={config?.fromEmail || ""}
                onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label>Nom expéditeur</Label>
              <Input
                placeholder="Skalle Team"
                value={config?.fromName || ""}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label>Email de réponse (optionnel)</Label>
              <Input
                type="email"
                placeholder="reply@example.com"
                value={config?.replyToEmail || ""}
                onChange={(e) =>
                  setConfig({ ...config, replyToEmail: e.target.value })
                }
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={handleVerifyDNS}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Vérifier DNS
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Sauvegarder
            </Button>
          </div>

          {/* DNS Status */}
          {config && (config.spfConfigured || config.dkimConfigured || config.dmarcConfigured) && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                {config.spfConfigured ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-900">SPF</div>
                  <div className="text-xs text-gray-500">
                    {config.spfConfigured ? "Configuré" : "Non configuré"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {config.dkimConfigured ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-900">DKIM</div>
                  <div className="text-xs text-gray-500">
                    {config.dkimConfigured ? "Configuré" : "Non configuré"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {config.dmarcConfigured ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-900">DMARC</div>
                  <div className="text-xs text-gray-500">
                    {config.dmarcConfigured ? "Configuré" : "Non configuré"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {dnsCheck?.recommendations && dnsCheck.recommendations.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <h4 className="font-medium text-yellow-400">Recommandations</h4>
              </div>
              <ul className="space-y-1 text-sm text-yellow-300">
                {dnsCheck.recommendations.map((rec: string, i: number) => (
                  <li key={i}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warm-up Status */}
      {warmupStatus && warmupStatus.warmupEnabled && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              Statut Warm-up
            </CardTitle>
            <CardDescription className="text-gray-500">
              Progression du warm-up de votre domaine
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Progression</span>
                  <span className="text-sm font-medium text-gray-900">
                    {warmupStatus.warmupProgress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all"
                    style={{ width: `${warmupStatus.warmupProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Jour actuel</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {warmupStatus.currentDay || 0}
                  </div>
                </div>
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Emails aujourd'hui</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {warmupStatus.emailsSentToday || 0} / {warmupStatus.targetEmails || 0}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {config && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Métriques de Performance
              </CardTitle>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                Données réelles — mises à jour à chaque envoi
              </span>
            </div>
            <CardDescription className="text-gray-500">
              Statistiques de délivrabilité email
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!config.openRate && !config.replyRate && !config.bounceRate && !config.spamRate ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
                <TrendingUp className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Aucune donnée pour l&apos;instant</p>
                <p className="text-xs mt-1">Les métriques s&apos;afficheront automatiquement après l&apos;envoi de vos premières séquences email.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Taux d&apos;ouverture</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {config.openRate?.toFixed(1) || 0}%
                  </div>
                </div>
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Taux de réponse</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {config.replyRate?.toFixed(1) || 0}%
                  </div>
                </div>
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Taux de rebond</div>
                  <div className="text-2xl font-bold text-red-400">
                    {config.bounceRate?.toFixed(1) || 0}%
                  </div>
                </div>
                <div className="bg-white/50 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Taux de spam</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {config.spamRate?.toFixed(1) || 0}%
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monitoring Externe */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-500" />
            Monitoring Externe de Réputation
          </CardTitle>
          <CardDescription className="text-gray-500">
            Connectez des outils tiers pour surveiller votre réputation d&apos;expéditeur en temps réel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Postmaster Tools */}
          <div className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white/50">
            <div className="mt-0.5">
              {monitoringStatus?.googlePostmaster ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">Google Postmaster Tools</span>
                {monitoringStatus?.googlePostmaster ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Configuré</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non configuré</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Surveille la réputation de votre domaine pour les emails envoyés vers Gmail (40% des boîtes).
                Données en temps réel : taux de spam, réputation IP/domaine.
              </p>
              {!monitoringStatus?.googlePostmaster && (
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mb-2">
                  <li>Créez un projet Google Cloud et activez l&apos;API <em>Gmail Postmaster Tools</em></li>
                  <li>Créez un compte de service (Service Account) et téléchargez le JSON</li>
                  <li>Ajoutez votre domaine dans <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">postmaster.google.com</a> et vérifiez-le</li>
                  <li>Copiez le JSON dans la variable d&apos;env : <code className="bg-gray-100 px-1 rounded">GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON</code></li>
                </ol>
              )}
            </div>
          </div>

          {/* SenderScore / Validity */}
          <div className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white/50">
            <div className="mt-0.5">
              {monitoringStatus?.senderScore ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">SenderScore (Validity)</span>
                {monitoringStatus?.senderScore ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Configuré</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non configuré</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Score de réputation global 0-100 utilisé par de nombreux FAI.
                Score &gt; 80 = excellente délivrabilité.
              </p>
              {!monitoringStatus?.senderScore && (
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mb-2">
                  <li>Créez un compte gratuit sur <a href="https://www.validity.com/products/senderscore/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">validity.com/senderscore</a></li>
                  <li>Obtenez votre clé API dans les paramètres du compte</li>
                  <li>Ajoutez la variable d&apos;env : <code className="bg-gray-100 px-1 rounded">SENDERSCORE_API_KEY</code></li>
                </ol>
              )}
            </div>
          </div>

          {/* Microsoft SNDS */}
          <div className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white/50">
            <div className="mt-0.5">
              {monitoringStatus?.microsoftSNDS ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">Microsoft SNDS</span>
                {monitoringStatus?.microsoftSNDS ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Configuré (manuel)</span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Processus manuel</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Surveille la réputation pour Outlook/Hotmail (30% des boîtes pro).
                Pas d&apos;API publique — nécessite une inscription manuelle par adresse IP.
              </p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mb-2">
                <li>Inscrivez votre IP sur <a href="https://sendersupport.olc.protection.outlook.com/snds/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">SNDS Microsoft</a></li>
                <li>Consultez votre score dans le portail SNDS (vert = OK, rouge = problème)</li>
                <li>Pour l&apos;afficher dans SKALLE : définissez <code className="bg-gray-100 px-1 rounded">MICROSOFT_SNDS_SCORE=85</code> (valeur 0-100)</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 👥 PROSPECTS TAB - Liste des Prospects (existant)
// ═══════════════════════════════════════════════════════════════════════════

function ProspectsTab({ workspaceId }: { workspaceId: string }) {
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

  // Listes de prospects
  const [lists, setLists] = useState<Array<{ id: string; name: string; _count: { prospects: number } }>>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    company: "",
    jobTitle: "",
    linkedInUrl: "",
    email: "",
    notes: "",
  });

  // CSO Sales OS — Stratégie + Click-to-Send
  const [csoResult, setCsoResult] = useState<PrepareProspectOutreachResult | null>(null);
  const [csoLoading, setCsoLoading] = useState<string | null>(null);

  // Charger les listes et prospects depuis la DB
  useEffect(() => {
    loadLists();
    loadProspects();
  }, []);

  useEffect(() => {
    loadProspects();
  }, [selectedListId]);

  const loadLists = async () => {
    try {
      const result = await getProspectLists(workspaceId);
      if (result.success && result.data) {
        setLists(result.data);
      }
    } catch {
      // ignore
    }
  };

  const loadProspects = async () => {
    setIsLoading(true);
    try {
      const data = await getProspects(workspaceId, selectedListId || undefined);
      setProspects(
        data.map((p: any) => ({
          ...p,
          messages: p.messages as ProspectMessages | null,
        }))
      );
    } catch {
      toast.error("Erreur lors du chargement des prospects");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProspect = async () => {
    if (!formData.name || !formData.company) {
      toast.error("Nom et entreprise requis");
      return;
    }

    setIsLoading(true);
    try {
      const result = await createProspect(workspaceId, formData);
      if (result.success && result.data) {
        await loadProspects();
        setIsDialogOpen(false);
        setFormData({
          name: "",
          company: "",
          jobTitle: "",
          linkedInUrl: "",
          email: "",
          notes: "",
        });
        toast.success("Prospect ajouté !");
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsoStrategy = async (prospect: Prospect) => {
    setCsoLoading(prospect.id);
    setCsoResult(null);
    try {
      const result = await prepareProspectOutreachAction(prospect.id, {
        workspaceId,
        runEnrichment: true,
        runAdIntelligence: false,
        platform: "LINKEDIN",
      });
      setCsoResult(result);
      if (result.success) {
        toast.success("Stratégie CSO prête — 10 crédits utilisés");
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Erreur lors de la génération");
    } finally {
      setCsoLoading(null);
    }
  };

  const handleGenerateMessages = async (prospect: Prospect) => {
    setIsGenerating(prospect.id);
    try {
      const result = await generateProspectionSequence(prospect.id);
      if (result.success && result.data) {
        setProspects(
          prospects.map((p) =>
            p.id === prospect.id ? { ...p, messages: result.data } : p
          )
        );
        setSelectedProspect({ ...prospect, messages: result.data });
        toast.success("Messages générés !");
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGenerating(null);
    }
  };

  const copyMessage = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedMessage(key);
    toast.success("Message copié");
    setTimeout(() => setCopiedMessage(null), 2000);
  };

  const toggleCampaignSelection = (id: string) => {
    const next = new Set(selectedForCampaign);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedForCampaign(next);
  };

  const campaignProspects = prospects.filter((p) => selectedForCampaign.has(p.id));

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
      } else {
        toast.error(result.error || "Erreur d'export");
      }
    } catch {
      toast.error("Erreur lors de l'export");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && prospects.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mes Prospects</h2>
          <p className="text-gray-500 mt-1">
            Gerez vos prospects et generez des sequences personnalisees
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Campagne depuis la liste selectionnee */}
          {selectedListId && prospects.length > 0 && (
            <Button
              onClick={() => {
                setSelectedForCampaign(new Set(prospects.map((p) => p.id)));
                setShowWizard(true);
              }}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Campagne depuis cette liste ({prospects.length})
            </Button>
          )}
          {/* Trouver des profils similaires */}
          {selectedListId && prospects.length >= 3 && (
            <Button
              variant="outline"
              onClick={() => setShowLookalikeDialog(true)}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50/50"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Trouver des similaires
            </Button>
          )}
          {selectedForCampaign.size > 0 && (
            <Button
              onClick={() => setShowWizard(true)}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Créer campagne ({selectedForCampaign.size})
            </Button>
          )}

          {/* Import / Export buttons */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-gray-200 text-gray-700">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Importer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <DropdownMenuItem
                className="text-gray-700"
                onClick={() => setShowCSVImport(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importer CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-gray-700"
                onClick={() => setShowLinkedInImport(true)}
              >
                <Linkedin className="h-4 w-4 mr-2" />
                Importer LinkedIn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="border-gray-200 text-gray-700"
            onClick={handleExportCSV}
            disabled={isExporting || prospects.length === 0}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exporter CSV
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Nouveau prospect
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Ajouter un prospect</DialogTitle>
              <DialogDescription className="text-gray-500">
                Entrez les informations du prospect LinkedIn
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">Nom *</Label>
                  <Input
                    placeholder="Jean Dupont"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Entreprise *</Label>
                  <Input
                    placeholder="Acme Inc"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">Poste</Label>
                  <Input
                    placeholder="CEO"
                    value={formData.jobTitle}
                    onChange={(e) =>
                      setFormData({ ...formData, jobTitle: e.target.value })
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Email</Label>
                  <Input
                    type="email"
                    placeholder="jean@acme.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700">URL LinkedIn</Label>
                <Input
                  placeholder="https://linkedin.com/in/jean-dupont"
                  value={formData.linkedInUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, linkedInUrl: e.target.value })
                  }
                  className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700">Notes</Label>
                <Textarea
                  placeholder="Informations supplémentaires..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="border-gray-200 text-gray-700"
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateProspect}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Ajouter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Barre de filtres par liste */}
      {lists.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button
            variant={selectedListId === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedListId(null)}
            className={selectedListId === null
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "border-gray-200 text-gray-500"}
          >
            Tous
          </Button>
          {lists.map((list) => (
            <Button
              key={list.id}
              variant={selectedListId === list.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedListId(list.id)}
              className={selectedListId === list.id
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "border-gray-200 text-gray-500"}
            >
              {list.name} ({list._count.prospects})
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {prospects.length > 0 ? (
            prospects.map((prospect) => (
              <Card
                key={prospect.id}
                className={`bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 cursor-pointer transition-all ${
                  selectedProspect?.id === prospect.id
                    ? "ring-2 ring-emerald-500"
                    : "hover:border-gray-300"
                }`}
                onClick={() => setSelectedProspect(prospect)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedForCampaign.has(prospect.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCampaignSelection(prospect.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded mt-1"
                          title="Sélectionner pour campagne"
                        />
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                          {prospect.name.charAt(0)}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          {prospect.name}
                          {prospect.emailVerified && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Email vérifié
                            </Badge>
                          )}
                          {prospect.linkedInUrl && (
                            <a
                              href={prospect.linkedInUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <Linkedin className="h-4 w-4" />
                            </a>
                          )}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <Building2 className="h-3 w-3" />
                          {prospect.company}
                          {prospect.jobTitle && (
                            <>
                              <span>•</span>
                              {prospect.jobTitle}
                            </>
                          )}
                        </div>
                        {prospect.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                            <Mail className="h-3 w-3" />
                            {prospect.email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={statusColors[prospect.status]}
                      >
                        {statusLabels[prospect.status]}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-gray-500"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60"
                        >
                          <DropdownMenuItem
                            className="text-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateMessages(prospect);
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Générer messages
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCsoStrategy(prospect);
                            }}
                            disabled={csoLoading === prospect.id}
                          >
                            {csoLoading === prospect.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Rocket className="h-4 w-4 mr-2" />
                            )}
                            Stratégie CSO (Click-to-Send)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {isGenerating === prospect.id && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Génération des messages...
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardContent className="py-16 text-center">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Aucun prospect
                </h3>
                <p className="text-gray-500 mb-4">
                  Commencez par ajouter vos premiers prospects LinkedIn
                </p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un prospect
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
                Séquence de messages
              </CardTitle>
              <CardDescription className="text-gray-500">
                {selectedProspect
                  ? `Messages pour ${selectedProspect.name}`
                  : "Sélectionnez un prospect"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedProspect?.messages ? (
                <div className="space-y-4">
                  {[
                    { key: "message1", label: "1. Approche" },
                    { key: "message2", label: "2. Valeur" },
                    { key: "message3", label: "3. CTA" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-emerald-600">
                          {label}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-gray-500 hover:text-gray-900"
                          onClick={() =>
                            copyMessage(
                              selectedProspect.messages![
                                key as keyof typeof selectedProspect.messages
                              ],
                              key
                            )
                          }
                        >
                          {copiedMessage === key ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm rounded-lg p-3 text-sm text-gray-700">
                        {selectedProspect.messages?.[key as keyof ProspectMessages] || ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedProspect ? (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm mb-4">
                    Aucun message généré
                  </p>
                  <Button
                    onClick={() => handleGenerateMessages(selectedProspect)}
                    disabled={isGenerating === selectedProspect.id}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isGenerating === selectedProspect.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Générer
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Sélectionnez un prospect pour voir ses messages
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Campaign Wizard */}
      <CampaignWizard
        workspaceId={workspaceId}
        prospects={campaignProspects}
        open={showWizard}
        onOpenChange={setShowWizard}
        onCreated={() => {
          setSelectedForCampaign(new Set());
        }}
      />

      {/* CSO Sales OS — Stratégie + Click-to-Send */}
      <Dialog open={!!csoResult} onOpenChange={(open) => !open && setCsoResult(null)}>
        <DialogContent className="max-w-lg bg-white/95 backdrop-blur-sm border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-emerald-600" />
              Stratégie CSO — Elite Sales Closer
            </DialogTitle>
            <DialogDescription>
              {csoResult?.success
                ? "Accroche, follow-ups et script d'objection. Utilise le lien pour ouvrir la messagerie."
                : csoResult?.error}
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
                  <Label className="text-gray-600">Message recommandé (copier / envoyer)</Label>
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      readOnly
                      value={csoResult.recommendedMessage}
                      className="min-h-[80px] resize-none bg-gray-50 text-gray-800"
                      rows={3}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(csoResult!.recommendedMessage!);
                        toast.success("Copié !");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {csoResult.messagingLink && (
                <Button
                  asChild
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <a
                    href={csoResult.messagingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ouvrir la messagerie {csoResult.platform ? `(${csoResult.platform})` : ""}
                  </a>
                </Button>
              )}
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="font-medium text-gray-700">Douleur identifiée</p>
                <p className="text-gray-600">{csoResult.strategy.painAnalysis}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="font-medium text-gray-700">2 autres accroches</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {csoResult.strategy.hooks.slice(1).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
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

      {/* CSV Import Dialog */}
      <CSVImportDialog
        workspaceId={workspaceId}
        open={showCSVImport}
        onOpenChange={setShowCSVImport}
        onImported={() => {
          loadProspects();
          loadLists();
        }}
      />

      {/* LinkedIn Import Dialog */}
      <LinkedInImportDialog
        workspaceId={workspaceId}
        open={showLinkedInImport}
        onOpenChange={setShowLinkedInImport}
        onImported={() => {
          loadProspects();
          loadLists();
        }}
      />

      {/* Lookalike Dialog */}
      {selectedListId && (
        <LookalikeDialog
          workspaceId={workspaceId}
          listId={selectedListId}
          listName={lists.find((l) => l.id === selectedListId)?.name || ""}
          open={showLookalikeDialog}
          onOpenChange={setShowLookalikeDialog}
          onImported={() => {
            loadProspects();
            loadLists();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🖥️ MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ProspectionPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
      }
    });
  }, []);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 bg-clip-text text-transparent flex items-center gap-3">
            <Users className="h-8 w-8 text-emerald-500" />
            Prospection LinkedIn
          </h1>
          <p className="text-gray-500 mt-2">
            Trouvez des leads qualifiés, gérez des séquences multi-canal et optimisez votre délivrabilité
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="find-leads" className="space-y-6">
        <TabsList className="bg-white/50 backdrop-blur-sm border border-gray-200">
          <TabsTrigger
            value="find-leads"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Search className="h-4 w-4 mr-2" />
            Find Leads
          </TabsTrigger>
          <TabsTrigger
            value="prospects"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Users className="h-4 w-4 mr-2" />
            Prospects
          </TabsTrigger>
          <TabsTrigger
            value="campaigns"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Rocket className="h-4 w-4 mr-2" />
            Campagnes
          </TabsTrigger>
          <TabsTrigger
            value="sequences"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Sequences
          </TabsTrigger>
          <TabsTrigger
            value="linkedin-queue"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Linkedin className="h-4 w-4 mr-2" />
            LinkedIn
          </TabsTrigger>
          <TabsTrigger
            value="smtp"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Settings className="h-4 w-4 mr-2" />
            SMTP
          </TabsTrigger>
          <TabsTrigger
            value="deliverability"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            <Shield className="h-4 w-4 mr-2" />
            Délivrabilité
          </TabsTrigger>
        </TabsList>

        <TabsContent value="find-leads">
          <FindLeadsTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectsTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="campaigns">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Campagnes Email</h2>
              <p className="text-gray-500 mt-1">
                Gérez vos campagnes d'emailing multi-étapes avec personnalisation
              </p>
            </div>
            <CampaignDashboard workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="sequences">
          <SequencesTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="linkedin-queue">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Actions LinkedIn</h2>
              <p className="text-gray-500 mt-1">
                File d'attente des actions LinkedIn (invitations, messages, InMail)
              </p>
            </div>
            <LinkedInActionsQueue workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="smtp">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Comptes d'envoi SMTP</h2>
              <p className="text-gray-500 mt-1">
                Configurez vos comptes email pour envoyer des campagnes (multi-sender)
              </p>
            </div>
            <SmtpConfigForm workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="deliverability">
          <DeliverabilityTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
