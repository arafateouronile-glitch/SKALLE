"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles, Loader2, Linkedin, Building2, Mail, ExternalLink,
  CheckCircle2, Check, Copy, Phone, Search, Info,
} from "lucide-react";
import { ImportToListDialog } from "@/components/prospection/import-to-list-dialog";
import {
  searchQualifiedLeads,
  qualifyProspectSearch,
  generateLeadMessage,
  type QualifiedSearchCriteria,
} from "@/actions/leads";
import { saveContactsToDbJSON } from "@/actions/contact-db";
import { toast } from "sonner";
import type { QualifiedLead } from "./types";

// ─── CriteriaBadgeList ────────────────────────────────────────────────────

function CriteriaBadgeList({
  label, items, onRemove, onAdd, placeholder,
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

// ─── FindLeadsTab ─────────────────────────────────────────────────────────

export function FindLeadsTab({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState("");
  const [isQualifying, setIsQualifying] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [criteria, setCriteria] = useState<QualifiedSearchCriteria | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [leads, setLeads] = useState<QualifiedLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [messageModal, setMessageModal] = useState<{
    lead: QualifiedLead;
    message: string;
    connectionRequest?: string;
    score?: number;
    recommendations?: string[];
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }
  useEffect(() => () => stopPoll(), []);

  function autoSaveLeads(parsedLeads: QualifiedLead[]) {
    const contacts = parsedLeads.map((lead) => ({
      name: lead.name,
      email: lead.email,
      emailVerified: lead.emailVerified,
      emailScore: (lead as any).emailScore,
      emailSource: lead.enrichmentData?.emailSource as string | undefined,
      phone: lead.phone,
      linkedInUrl: lead.linkedInUrl,
      company: lead.company,
      jobTitle: lead.jobTitle,
      location: lead.location,
      industry: lead.industry,
      companySize: (lead as any).companySize,
      source: (lead.enrichmentData?.source as string) ?? (lead.enrichmentData?.apolloId ? "apollo" : "linkedin-apify"),
      apolloId: lead.enrichmentData?.apolloId as string | undefined,
      tags: [],
    }));
    saveContactsToDbJSON(workspaceId, JSON.stringify(contacts)).then((r) => {
      if (r.success && (r.saved > 0 || r.updated > 0)) {
        toast.info(`Base contacts : +${r.saved} nouveau${r.saved > 1 ? "x" : ""}, ${r.updated} mis à jour`, { duration: 3000 });
      }
    });
  }

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
    stopPoll();
    setIsSearching(true);
    setScrapeStatus("");

    if (criteria.searchMode === "linkedin") {
      try {
        const res = await fetch("/api/prospects/linkedin-scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(criteria),
        });
        const data = await res.json() as { ok?: boolean; runId?: string; error?: string };
        if (!res.ok || !data.ok || !data.runId) {
          toast.error(data.error ?? "Erreur lancement LinkedIn scraper");
          setIsSearching(false);
          return;
        }
        toast.success("Scraping LinkedIn lancé — résultats dans ~2 min…");
        setScrapeStatus("Scraping LinkedIn en cours…");
        const runId = data.runId;
        let attempts = 0;
        pollRef.current = setInterval(async () => {
          attempts++;
          try {
            const cr = await fetch("/api/prospects/linkedin-scrape?collect=1", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId }),
            });
            const cd = await cr.json() as { status: "running" | "done"; leads?: QualifiedLead[]; error?: string; runStatus?: string };
            if (cd.status === "done") {
              stopPoll();
              setIsSearching(false);
              setScrapeStatus("");
              const foundLeads = cd.leads ?? [];
              if (foundLeads.length > 0) {
                setLeads(foundLeads);
                toast.success(`${foundLeads.length} profils LinkedIn trouvés !`);
                autoSaveLeads(foundLeads);
              } else {
                toast.warning(`Scrape terminé — 0 profils${cd.error ? ` (${cd.error})` : ""}`);
              }
            } else {
              setScrapeStatus(`Scraping LinkedIn en cours… (${cd.runStatus ?? "RUNNING"})`);
            }
          } catch { /* ignore transient */ }
          if (attempts >= 12) {
            stopPoll();
            setIsSearching(false);
            setScrapeStatus("");
            toast.error("Timeout scrape LinkedIn — réessaie.");
          }
        }, 20_000);
      } catch {
        toast.error("Erreur réseau");
        setIsSearching(false);
      }
      return;
    }

    try {
      const result = await searchQualifiedLeads(workspaceId, criteria);
      if (result.success && result.leadsJson) {
        const parsedLeads = JSON.parse(result.leadsJson);
        setLeads(parsedLeads);
        toast.success(`${parsedLeads.length} leads trouvés !`);
        autoSaveLeads(parsedLeads);
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
    if (selectedLeads.size === 0) { toast.error("Selectionnez au moins un lead"); return; }
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
          lead, message: result.message,
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
    if (newSelected.has(index)) newSelected.delete(index);
    else newSelected.add(index);
    setSelectedLeads(newSelected);
  };

  const updateCriteria = (field: keyof QualifiedSearchCriteria, value: unknown) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: value });
  };

  const removeFromList = (field: "jobTitles" | "industries" | "locations" | "keywords" | "companySizes" | "seniorityLevels" | "companyNames", i: number) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: criteria[field].filter((_, idx) => idx !== i) });
  };

  const addToList = (field: "jobTitles" | "industries" | "locations" | "keywords" | "companySizes" | "seniorityLevels" | "companyNames", val: string) => {
    if (!criteria) return;
    setCriteria({ ...criteria, [field]: [...criteria[field], val] });
  };

  return (
    <div className="space-y-6">
      {/* RGPD notice */}
      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
        <span>
          Les données collectées (profils publics LinkedIn, e-mails professionnels) sont traitées sur la base de{" "}
          <strong>l&apos;intérêt légitime B2B</strong> (RGPD art. 6.1.f). Les personnes prospectées peuvent s&apos;opposer
          à tout moment via{" "}
          <a href="mailto:privacy@skalle.io" className="underline hover:text-blue-900">privacy@skalle.io</a>.{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
            Politique de confidentialité →
          </a>
        </span>
      </div>

      {/* Chat Input */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Décrivez votre cible de prospection
          </CardTitle>
          <CardDescription className="text-gray-500">
            L&apos;IA va analyser votre demande et construire les requêtes de recherche optimales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Gérants d'organismes de formation en Île-de-France, ou Directeurs Marketing de startups SaaS B2B à Paris…"
            rows={3}
            className="bg-white border-gray-200 resize-none text-gray-800 placeholder:text-gray-400"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQualify(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Entrée + ⌘/Ctrl pour envoyer</span>
            <Button onClick={handleQualify} disabled={isQualifying || !query.trim()}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
              {isQualifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
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
                <Button variant={criteria.searchMode === "linkedin" ? "default" : "outline"} size="sm"
                  onClick={() => updateCriteria("searchMode", "linkedin")}
                  className={criteria.searchMode === "linkedin" ? "bg-blue-600 hover:bg-blue-700 text-xs h-7" : "border-gray-200 text-gray-500 text-xs h-7"}>
                  <Linkedin className="h-3 w-3 mr-1" /> LinkedIn
                </Button>
                <Button variant={criteria.searchMode === "google_business" ? "default" : "outline"} size="sm"
                  onClick={() => updateCriteria("searchMode", "google_business")}
                  className={criteria.searchMode === "google_business" ? "bg-emerald-600 hover:bg-emerald-700 text-xs h-7" : "border-gray-200 text-gray-500 text-xs h-7"}>
                  <Building2 className="h-3 w-3 mr-1" /> Google
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {criteria.searchMode === "linkedin" && (
                <>
                  <CriteriaBadgeList label="Titres de poste" items={criteria.jobTitles}
                    onRemove={(i) => removeFromList("jobTitles", i)} onAdd={(v) => addToList("jobTitles", v)} placeholder="+ Ajouter..." />
                  <CriteriaBadgeList label="Industries" items={criteria.industries}
                    onRemove={(i) => removeFromList("industries", i)} onAdd={(v) => addToList("industries", v)} placeholder="+ Ajouter..." />
                </>
              )}
              {criteria.searchMode === "google_business" && (
                <CriteriaBadgeList label="Type d'activité" items={criteria.keywords}
                  onRemove={(i) => removeFromList("keywords", i)} onAdd={(v) => addToList("keywords", v)} placeholder="+ Ajouter..." />
              )}
              <CriteriaBadgeList label="Localisations" items={criteria.locations}
                onRemove={(i) => removeFromList("locations", i)} onAdd={(v) => addToList("locations", v)} placeholder="+ Ajouter..." />
              {criteria.searchMode === "linkedin" && (
                <>
                  <CriteriaBadgeList label="Mots-clés" items={criteria.keywords}
                    onRemove={(i) => removeFromList("keywords", i)} onAdd={(v) => addToList("keywords", v)} placeholder="+ Ajouter..." />
                  <CriteriaBadgeList label="Niveau hiérarchique" items={criteria.seniorityLevels}
                    onRemove={(i) => removeFromList("seniorityLevels", i)} onAdd={(v) => addToList("seniorityLevels", v)} placeholder="+ ex: c_suite, director..." />
                  <CriteriaBadgeList
                    label="Taille d'entreprise"
                    items={criteria.companySizes.map((s) => {
                      const labels: Record<string, string> = {
                        "1,10": "1-10", "11,20": "11-20", "21,50": "21-50", "51,100": "51-100",
                        "101,200": "101-200", "201,500": "201-500", "501,1000": "501-1K",
                        "1001,2000": "1K-2K", "2001,5000": "2K-5K", "5001,10000": "5K-10K", "10001,": "+10K",
                      };
                      return labels[s] || s;
                    })}
                    onRemove={(i) => removeFromList("companySizes", i)}
                    onAdd={(v) => {
                      const reverseLabels: Record<string, string> = {
                        "1-10": "1,10", "11-20": "11,20", "21-50": "21,50", "51-100": "51,100",
                        "101-200": "101,200", "201-500": "201,500", "501-1k": "501,1000",
                        "1k-2k": "1001,2000", "2k-5k": "2001,5000", "5k-10k": "5001,10000", "+10k": "10001,",
                      };
                      addToList("companySizes", reverseLabels[v.toLowerCase()] || v);
                    }}
                    placeholder="+ 1-10, PME, ETI..."
                  />
                  <CriteriaBadgeList label="Entreprises spécifiques" items={criteria.companyNames}
                    onRemove={(i) => removeFromList("companyNames", i)} onAdd={(v) => addToList("companyNames", v)} placeholder="+ Ajouter une entreprise..." />
                </>
              )}
            </div>

            <div className="flex items-center gap-6 pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={criteria.requireEmail}
                  onChange={(e) => updateCriteria("requireEmail", e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-600">Email requis</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={criteria.requirePhone}
                  onChange={(e) => updateCriteria("requirePhone", e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-600">Téléphone requis</span>
              </label>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-500">Limite :</span>
                <Input type="number" min={1} max={100} value={criteria.limit}
                  onChange={(e) => updateCriteria("limit", parseInt(e.target.value) || 50)}
                  className="w-20 h-7 text-sm bg-white border-gray-200" />
                <Button onClick={handleSearch} disabled={isSearching}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-8">
                  {isSearching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  {isSearching ? (criteria?.searchMode === "linkedin" ? "Scraping LinkedIn…" : "Recherche...") : "Lancer la recherche"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {scrapeStatus && (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400 flex-shrink-0" />
          {scrapeStatus}
        </div>
      )}

      {/* Results */}
      {leads.length > 0 && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-gray-900">{leads.length} Leads Qualifiés Trouvés</CardTitle>
                <CardDescription className="text-gray-500">{selectedLeads.size} sélectionné(s)</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="border-gray-200 text-gray-600 text-xs h-8"
                  onClick={() => setSelectedLeads(selectedLeads.size === leads.length ? new Set() : new Set(leads.map((_, i) => i.toString())))}>
                  {selectedLeads.size === leads.length ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
                <Button onClick={handleImportClick} disabled={selectedLeads.size === 0} className="bg-emerald-600 hover:bg-emerald-700">
                  Importer {selectedLeads.size > 0 && `(${selectedLeads.size})`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {leads.map((lead, index) => (
                <Card key={index}
                  className={`bg-white/50 backdrop-blur-sm border-gray-200 cursor-pointer transition-all ${selectedLeads.has(index.toString()) ? "ring-2 ring-emerald-500" : "hover:border-gray-300"}`}
                  onClick={() => toggleLeadSelection(index.toString())}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <input type="checkbox" checked={selectedLeads.has(index.toString())}
                          onChange={() => toggleLeadSelection(index.toString())}
                          onClick={(e) => e.stopPropagation()} className="mt-1 rounded" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                            {lead.emailVerified && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Email vérifié
                              </Badge>
                            )}
                            {lead.emailScore && <Badge variant="outline" className="text-xs">Score: {lead.emailScore}/100</Badge>}
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
                              <Building2 className="h-3 w-3" /> {lead.company}
                              {lead.jobTitle && <span>• {lead.jobTitle}</span>}
                              {lead.enrichmentData?.googleCategory && <span className="text-gray-400">• {lead.enrichmentData.googleCategory}</span>}
                            </div>
                            {lead.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3" />
                                <span className={lead.enrichmentData?.emailSource === "pattern-mx" ? "text-gray-400 italic" : ""}>{lead.email}</span>
                                {lead.enrichmentData?.emailSource === "apollo" && <span className="text-xs text-orange-500 font-medium">● Apollo ✓</span>}
                                {lead.enrichmentData?.emailSource === "pattern-mx" && <span className="text-xs text-gray-400">(probable)</span>}
                                {lead.enrichmentData?.emailSource === "google-search" && <span className="text-xs text-green-500">● Google</span>}
                                {lead.enrichmentData?.emailSource === "website-scrape" && <span className="text-xs text-blue-500">● Site web</span>}
                              </div>
                            )}
                            {lead.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" /> {lead.phone}</div>}
                            {(lead.location || lead.industry || !!lead.enrichmentData?.linkedInConnections) && (
                              <div className="flex items-center gap-3 text-gray-400 text-xs flex-wrap">
                                {lead.location && <span>📍 {String(lead.location)}</span>}
                                {lead.industry && <span>🏭 {String(lead.industry)}</span>}
                                {lead.enrichmentData?.linkedInConnections != null && <span>👥 {String(lead.enrichmentData.linkedInConnections)} relations</span>}
                              </div>
                            )}
                            {lead.enrichmentData?.linkedInBio != null && (
                              <div className="text-xs text-gray-400 italic line-clamp-2 mt-1">{String(lead.enrichmentData.linkedInBio)}</div>
                            )}
                            {lead.enrichmentData?.websiteUrl && (
                              <div className="flex items-center gap-2">
                                <ExternalLink className="h-3 w-3" />
                                <a href={lead.enrichmentData.websiteUrl as string} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-400 hover:text-blue-300 hover:underline truncate max-w-[300px]">
                                  {(lead.enrichmentData.websiteUrl as string).replace(/^https?:\/\//, "")}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {lead.linkedInUrl ? (
                        <a href={lead.linkedInUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300">
                          <Linkedin className="h-5 w-5" />
                        </a>
                      ) : lead.enrichmentData?.websiteUrl ? (
                        <a href={lead.enrichmentData.websiteUrl as string} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-emerald-400 hover:text-emerald-300">
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                      <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={generatingFor === index}
                        onClick={(e) => { e.stopPropagation(); handleGenerateMessage(lead, index); }}>
                        {generatingFor === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
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
                {messageModal.score != null && <span className="ml-2 text-xs text-purple-500">Score personnalisation : {messageModal.score}/100</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {messageModal.connectionRequest ? "Message de suivi" : "Message LinkedIn"}
                  </span>
                  <span className="text-xs text-gray-400">{messageModal.message.length}/300 car.</span>
                </div>
                <Textarea value={messageModal.message}
                  onChange={(e) => setMessageModal({ ...messageModal, message: e.target.value })}
                  className="min-h-[120px] text-sm resize-none pr-10" />
              </div>
              {messageModal.connectionRequest && messageModal.connectionRequest !== messageModal.message && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Demande de connexion</span>
                    <span className="text-xs text-gray-400">{messageModal.connectionRequest.length}/300 car.</span>
                  </div>
                  <Textarea value={messageModal.connectionRequest}
                    onChange={(e) => setMessageModal({ ...messageModal, connectionRequest: e.target.value })}
                    className="min-h-[80px] text-sm resize-none" />
                </div>
              )}
              {messageModal.recommendations && messageModal.recommendations.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-700 mb-1.5">Conseils d&apos;envoi</p>
                  <ul className="space-y-1">
                    {messageModal.recommendations.slice(0, 3).map((rec, i) => <li key={i} className="text-xs text-blue-600">• {rec}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                navigator.clipboard.writeText(
                  messageModal.connectionRequest && messageModal.connectionRequest !== messageModal.message
                    ? messageModal.connectionRequest : messageModal.message
                );
                setCopiedMsg(true);
                setTimeout(() => setCopiedMsg(false), 2000);
              }}>
                {copiedMsg ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copiedMsg ? "Copié !" : "Copier"}
              </Button>
              {messageModal.lead.linkedInUrl && (
                <Button size="sm" asChild>
                  <a href={messageModal.lead.linkedInUrl} target="_blank" rel="noopener noreferrer">
                    <Linkedin className="h-3.5 w-3.5 mr-1.5" /> Ouvrir LinkedIn
                  </a>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ImportToListDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        workspaceId={workspaceId}
        leads={leads.filter((_, i) => selectedLeads.has(i.toString())).map((lead) => ({
          name: lead.name, email: lead.email, phone: lead.phone,
          linkedInUrl: lead.linkedInUrl || "", company: lead.company,
          jobTitle: lead.jobTitle, location: lead.location, industry: lead.industry,
        }))}
        onImported={() => setSelectedLeads(new Set())}
      />
    </div>
  );
}
