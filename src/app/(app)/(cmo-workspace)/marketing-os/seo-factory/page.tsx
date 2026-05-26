"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Search,
  Upload,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  BarChart3,
  Plus,
  Eye,
  Edit,
  Trash2,
  Copy,
  Download,
  TrendingUp,
  Calendar,
  BookOpen,
  Target,
  ExternalLink,
  MoreVertical,
  Brain,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ArrowRight,
  Activity,
  Gauge,
  Network,
  Link2,
  Globe,
  Users,
  Flag,
  Columns3,
} from "lucide-react";
import {
  runSEOAudit,
  startBulkGeneration,
  generateSingleArticle,
  listArticles,
  getArticle,
  deleteArticle,
  duplicateArticle,
  exportArticle,
  getBatchJobProgress,
  runSEOIntelligence,
  getSEOIntelligenceReport,
  listSeoAudits,
  updateSeoAudit,
  type SeoAuditListItem,
} from "@/actions/seo";
import {
  getSeoSetup,
  saveSeoSetup,
  type SeoPublicationStrategy,
  type SeoContentMode,
  type SeoSiteType,
} from "@/actions/seo-setup";
import { publishPostToCMS } from "@/actions/cms";
import { toast } from "sonner";
import Link from "next/link";
import { getUserWorkspace } from "@/actions/leads";
import { useCreditsContext } from "@/components/providers/credits-provider";
import { VoiceToText } from "@/components/voice/voice-to-text";
import { analyzeTechnicalSEO } from "@/actions/seo-technical";
import { generateContentCluster, type ContentCluster } from "@/actions/content-cluster";
import { SeoStrategyTab } from "@/components/modules/seo-strategy-tab";

// Design token helpers
const E = { fg: "var(--emerald-fg)", soft: "var(--emerald-soft)", line: "var(--emerald-line)" };
const V = { fg: "var(--violet-fg)", soft: "var(--violet-soft)", line: "var(--violet-line)" };
const A = { fg: "var(--amber-fg)", soft: "var(--amber-soft)", line: "var(--amber-line)" };
const D = { fg: "var(--danger-fg)", soft: "var(--danger-soft)", line: "var(--danger-line)" };

const CARD: React.CSSProperties = {
  background: "var(--bg-elev)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  boxShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px -8px rgb(0 0 0 / 0.05)",
};

const CARD_SOFT: React.CSSProperties = {
  background: "oklch(0.985 0.005 260)",
  border: "1px solid var(--line)",
  borderRadius: 12,
};

interface AuditReport {
  score: number;
  title: { value: string | null; length: number; score: number; issues: string[] };
  metaDescription: { value: string | null; length: number; score: number; issues: string[] };
  headings: { h1Count: number; h2Count: number; h3Count: number; score: number; issues: string[] };
  images: { total: number; withAlt: number; score: number; issues: string[] };
  links: { internal: number; external: number; score: number; issues: string[] };
  content: { wordCount: number; score: number; issues: string[] };
}

interface Article {
  id: string;
  title: string | null;
  excerpt: string | null;
  keywords: string[];
  status: string;
  seoScore: number | null;
  readabilityScore: number | null;
  wordCount: number | null;
  imageUrl: string | null;
  metaTitle: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ActiveTab = "articles" | "create" | "analyze" | "settings";
type CreateMode = "single" | "bulk" | "cluster";
type AnalyzeMode = "audit" | "tech" | "intel";

export default function SEOFactoryPage() {
  const { isDepleted } = useCreditsContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // ── Nav state
  const [activeTab, setActiveTab] = useState<ActiveTab>("articles");
  const [createMode, setCreateMode] = useState<CreateMode>("single");
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>("audit");
  const [analyzeUrl, setAnalyzeUrl] = useState("");

  // ── Audit SEO
  const [auditUrl, setAuditUrl] = useState("");
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // ── Generation unique
  const [singleKeyword, setSingleKeyword] = useState("");
  const [singleBrief, setSingleBrief] = useState("");
  const [singleLength, setSingleLength] = useState<"court" | "standard" | "long">("standard");
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");

  // ── Generation bulk
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);

  // ── Liste articles
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalArticles, setTotalArticles] = useState(0);

  // ── SEO Intelligence
  const [intelligenceUrl, setIntelligenceUrl] = useState("");
  const [isRunningIntelligence, setIsRunningIntelligence] = useState(false);
  const [intelligenceReport, setIntelligenceReport] = useState<any | null>(null);
  const [auditHistory, setAuditHistory] = useState<SeoAuditListItem[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [isEditingAudit, setIsEditingAudit] = useState(false);
  const [editedQuickWins, setEditedQuickWins] = useState<string>("");
  const [editedTechnicalActions, setEditedTechnicalActions] = useState<string>("");
  const [editedSemanticGaps, setEditedSemanticGaps] = useState<string>("");
  const [editedSwot, setEditedSwot] = useState<string>("");
  const [isSavingAudit, setIsSavingAudit] = useState(false);

  // ── SEO Technical
  const [technicalUrl, setTechnicalUrl] = useState("");
  const [isTechAuditing, setIsTechAuditing] = useState(false);
  const [technicalReport, setTechnicalReport] = useState<import("@/actions/seo-technical").TechnicalReport | null>(null);

  // ── Topic Cluster
  const [clusterKeyword, setClusterKeyword] = useState("");
  const [clusterContext, setClusterContext] = useState("");
  const [isGeneratingCluster, setIsGeneratingCluster] = useState(false);
  const [cluster, setCluster] = useState<ContentCluster | null>(null);
  const [clusterBatchId, setClusterBatchId] = useState<string | null>(null);

  // ── SEO Setup
  const [seoSetupDone, setSeoSetupDone] = useState<boolean | null>(null);
  const [setupDomainUrl, setSetupDomainUrl] = useState("");
  const [setupFrequency, setSetupFrequency] = useState<SeoPublicationStrategy["frequency"]>("2/week");
  const [setupLanguage, setSetupLanguage] = useState<SeoPublicationStrategy["language"]>("fr");
  const [setupTargetAudience, setSetupTargetAudience] = useState("");
  const [setupGoals, setSetupGoals] = useState<string[]>([]);
  const [setupPillars, setSetupPillars] = useState<string[]>(["", "", ""]);
  const [setupContentMode, setSetupContentMode] = useState<SeoContentMode>("article");
  const [setupSiteType, setSetupSiteType] = useState<SeoSiteType>("saas");
  const [setupBusinessActivity, setSetupBusinessActivity] = useState("");
  const [isSavingSetup, setIsSavingSetup] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const keywordParam = urlParams.get("keyword");
      if (keywordParam) {
        setSingleKeyword(keywordParam);
        setActiveTab("create");
        setCreateMode("single");
      }
      const exported = localStorage.getItem("skalle_exported_keywords");
      if (exported && !keywords.trim()) {
        setKeywords(exported);
        toast.success("Mots-clés importés depuis Keywords !");
        localStorage.removeItem("skalle_exported_keywords");
        setActiveTab("create");
        setCreateMode("bulk");
      }
    }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    getSeoSetup(workspaceId).then((result) => {
      if (result.success && result.data) {
        setSeoSetupDone(result.data.isComplete);
        setSetupDomainUrl(result.data.domainUrl);
        if (result.data.strategy) {
          setSetupFrequency(result.data.strategy.frequency);
          setSetupLanguage(result.data.strategy.language);
          setSetupTargetAudience(result.data.strategy.targetAudience);
          setSetupGoals(result.data.strategy.goals);
          setSetupContentMode(result.data.strategy.contentMode ?? "article");
          setSetupSiteType(result.data.strategy.siteType ?? "saas");
          setSetupBusinessActivity(result.data.strategy.businessActivity ?? "");
          setSetupPillars(
            result.data.strategy.contentPillars.length >= 3
              ? result.data.strategy.contentPillars
              : [...result.data.strategy.contentPillars, "", "", ""].slice(0, 3)
          );
        }
      } else {
        setSeoSetupDone(false);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, currentPage, statusFilter]);

  useEffect(() => {
    if (workspaceId) loadAuditHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const loadArticles = async () => {
    if (!workspaceId) return;
    setIsLoadingArticles(true);
    try {
      const result = await listArticles({
        workspaceId,
        status: statusFilter !== "all" ? (statusFilter as any) : undefined,
        page: currentPage,
        perPage: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (result.success && result.data) {
        setArticles(result.data.items as Article[]);
        setTotalPages(result.data.totalPages);
        setTotalArticles(result.data.total);
      }
    } catch {
      console.error("Error loading articles");
    } finally {
      setIsLoadingArticles(false);
    }
  };

  const loadAuditHistory = async () => {
    if (!workspaceId) return;
    const result = await listSeoAudits(workspaceId, 20);
    if (result.success && result.data) setAuditHistory(result.data);
  };

  const handleLoadAudit = async (auditId: string) => {
    if (!workspaceId) return;
    const result = await getSEOIntelligenceReport(workspaceId, auditId);
    if (result.success && result.data) {
      const audit = result.data;
      const report = audit.report ?? {};
      const merged = {
        ...report,
        userSite: report.userSite ?? audit.metadata,
        marketInsights: report.marketInsights ?? audit.targetKeywords,
        competitorAnalysis: report.competitorAnalysis ?? audit.competitors,
        strategy: report.strategy ?? audit.actionPlan,
        recommendations: report.recommendations ?? {
          technical: audit.actionPlan?.technicalActions,
          semantic: audit.actionPlan?.semanticGap,
        },
      };
      setIntelligenceReport(merged);
      setSelectedAuditId(auditId);
      setIsEditingAudit(false);
    }
  };

  const handleStartEditAudit = () => {
    if (!intelligenceReport) return;
    const qw = intelligenceReport.strategy?.quickWins ?? [];
    const ta = intelligenceReport.recommendations?.technical ?? [];
    const sg = intelligenceReport.recommendations?.semantic ?? [];
    const sw = intelligenceReport.strategy?.swot ?? { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    setEditedQuickWins(qw.map((w: { keyword?: string }) => w.keyword ?? "").join("\n"));
    setEditedTechnicalActions(ta.map((a: { priority?: string; action?: string }) => `[${a.priority ?? "medium"}] ${a.action ?? ""}`).join("\n"));
    setEditedSemanticGaps(sg.map((g: { topic?: string }) => g.topic ?? "").join("\n"));
    setEditedSwot(JSON.stringify(sw, null, 2));
    setIsEditingAudit(true);
  };

  const handleSaveAuditCorrections = async () => {
    if (!workspaceId || !selectedAuditId) return;
    setIsSavingAudit(true);
    try {
      const quickWins = editedQuickWins.split("\n").filter(Boolean).map((kw) => ({
        keyword: kw.trim(), difficulty: "medium" as const, opportunity: kw.trim(), estimatedImpact: 3,
      }));
      const technicalActions = editedTechnicalActions.split("\n").filter(Boolean).map((line) => {
        const match = line.match(/^\[(high|medium|low)\]\s*(.+)/i);
        return {
          priority: (match?.[1] ?? "medium") as "high" | "medium" | "low",
          action: match?.[2]?.trim() ?? line.trim(),
          description: match?.[2]?.trim() ?? line.trim(),
          estimatedImpact: 3,
        };
      });
      const semanticGap = editedSemanticGaps.split("\n").filter(Boolean).map((topic) => ({
        topic: topic.trim(), competitors: [], recommendation: topic.trim(),
      }));
      let swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
      try { swot = JSON.parse(editedSwot); } catch {}
      const result = await updateSeoAudit(workspaceId, selectedAuditId, { quickWins, technicalActions, semanticGap, swot });
      if (result.success) {
        setIntelligenceReport((prev: any) => ({
          ...prev,
          strategy: { ...prev?.strategy, quickWins, swot },
          recommendations: { technical: technicalActions, semantic: semanticGap },
        }));
        setIsEditingAudit(false);
        toast.success("Corrections sauvegardées !");
        loadAuditHistory();
      } else {
        toast.error(result.error ?? "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSavingAudit(false);
    }
  };

  const handleGenerateFromAudit = async () => {
    if (!workspaceId || !intelligenceReport) return;
    const quickWins = (intelligenceReport.strategy?.quickWins ?? []) as Array<{ keyword?: string }>;
    const marketInsights = (intelligenceReport.marketInsights ?? []) as Array<{ keyword?: string }>;
    const keywordList = [
      ...quickWins.map((w) => w.keyword ?? "").filter(Boolean),
      ...marketInsights.slice(0, 5).map((k) => k.keyword ?? "").filter(Boolean),
    ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 30);
    if (keywordList.length === 0) { toast.error("Aucun mot-clé trouvé dans l'analyse"); return; }
    setIsGenerating(true);
    try {
      const result = await startBulkGeneration(workspaceId, keywordList);
      if (result.success && result.batchJobId) {
        setBatchJobId(result.batchJobId);
        setKeywords(keywordList.join("\n"));
        toast.success(`${keywordList.length} articles en cours de génération !`);
        const interval = setInterval(async () => {
          if (result.batchJobId) {
            const progress = await getBatchJobProgress(result.batchJobId);
            if (progress.success && progress.data) {
              const pct = Math.round((progress.data.completed / progress.data.totalItems) * 100);
              setGenerationProgress(pct);
              if (progress.data.status === "COMPLETED" || progress.data.status === "FAILED") {
                clearInterval(interval);
                setIsGenerating(false);
                loadArticles();
              }
            }
          }
        }, 2000);
      } else {
        toast.error(result.error ?? "Erreur lors du lancement");
        setIsGenerating(false);
      }
    } catch {
      toast.error("Une erreur est survenue");
      setIsGenerating(false);
    }
  };

  const handleSaveSetup = async () => {
    if (!workspaceId) return;
    const pillars = setupPillars.map((p) => p.trim()).filter(Boolean);
    if (!setupBusinessActivity.trim()) return toast.error("Décrivez votre activité / produit");
    if (!setupDomainUrl.trim()) return toast.error("Ajoutez l'URL de votre site");
    if (!setupTargetAudience.trim()) return toast.error("Décrivez votre audience cible");
    if (setupGoals.length === 0) return toast.error("Choisissez au moins un objectif");
    if (pillars.length === 0) return toast.error("Ajoutez au moins un pilier de contenu");
    setIsSavingSetup(true);
    try {
      const result = await saveSeoSetup(workspaceId, {
        domainUrl: setupDomainUrl.trim(),
        strategy: {
          frequency: setupFrequency, language: setupLanguage,
          targetAudience: setupTargetAudience.trim(), goals: setupGoals,
          contentPillars: pillars, contentMode: setupContentMode,
          siteType: setupSiteType, businessActivity: setupBusinessActivity.trim(),
        },
      });
      if (result.success) {
        setSeoSetupDone(true);
        toast.success("Configuration SEO sauvegardée !");
      } else {
        toast.error(result.error ?? "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSavingSetup(false);
    }
  };

  const toggleGoal = (goal: string) =>
    setSetupGoals((prev) => prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]);

  const handleGenerateCluster = async () => {
    if (!clusterKeyword.trim()) { toast.error("Veuillez entrer un mot-clé pilier"); return; }
    setIsGeneratingCluster(true);
    try {
      const result = await generateContentCluster(clusterKeyword, clusterContext || undefined);
      if (result.success && result.data) {
        setCluster(result.data);
        setClusterBatchId(result.batchJobId ?? null);
        toast.success("Cluster généré — 6 articles en cours de rédaction !");
      } else {
        toast.error(result.error || "Erreur lors de la génération");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGeneratingCluster(false);
    }
  };

  const handleAudit = async (urlOverride?: string) => {
    const url = urlOverride ?? auditUrl;
    if (!url || !workspaceId) { toast.error("Veuillez entrer une URL"); return; }
    setIsAuditing(true);
    try {
      const result = await runSEOAudit(workspaceId, url);
      if (result.success && result.data) {
        setAuditReport(result.data);
        toast.success("Audit terminé !");
      } else {
        toast.error(result.error || "Erreur lors de l'audit");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsAuditing(false);
    }
  };

  const handleTechnicalAudit = async (urlOverride?: string) => {
    const url = urlOverride ?? technicalUrl;
    if (!url.trim()) { toast.error("Veuillez entrer une URL"); return; }
    setIsTechAuditing(true);
    try {
      const result = await analyzeTechnicalSEO(url);
      if (result.success && result.data) {
        setTechnicalReport(result.data);
        toast.success("Analyse technique terminée !");
      } else {
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsTechAuditing(false);
    }
  };

  const handleRunIntelligence = async (urlOverride?: string) => {
    const url = urlOverride ?? intelligenceUrl;
    if (!url || !workspaceId) { toast.error("Veuillez entrer une URL"); return; }
    setIsRunningIntelligence(true);
    try {
      const result = await runSEOIntelligence(workspaceId, url);
      if (result.success && result.data) {
        setIntelligenceReport(result.data);
        setIsEditingAudit(false);
        toast.success("Analyse SEO Intelligence terminée !");
        const history = await listSeoAudits(workspaceId, 20);
        if (history.success && history.data) {
          setAuditHistory(history.data);
          setSelectedAuditId(history.data[0]?.id ?? null);
        }
      } else {
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsRunningIntelligence(false);
    }
  };

  const handleSingleGeneration = async () => {
    if (!singleKeyword.trim() || !workspaceId) { toast.error("Veuillez entrer un mot-clé"); return; }
    setIsGeneratingSingle(true);
    try {
      const result = await generateSingleArticle(workspaceId, singleKeyword.trim());
      if (result.success && result.data) {
        toast.success(`Article "${result.data.title}" généré avec succès !`);
        setSingleKeyword("");
        setSingleBrief("");
        loadArticles();
      } else {
        toast.error(result.error || "Erreur lors de la génération");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const handleBulkGeneration = async () => {
    if (!workspaceId) return;
    const keywordList = keywords.split("\n").map((k) => k.trim()).filter((k) => k.length > 0);
    if (keywordList.length === 0) { toast.error("Veuillez entrer au moins un mot-clé"); return; }
    if (keywordList.length > 300) { toast.error("Maximum 300 mots-clés par lot"); return; }
    setIsGenerating(true);
    setGenerationProgress(0);
    try {
      const result = await startBulkGeneration(workspaceId, keywordList);
      if (result.success && result.batchJobId) {
        setBatchJobId(result.batchJobId);
        toast.success(`Génération lancée pour ${keywordList.length} articles`);
        const interval = setInterval(async () => {
          if (result.batchJobId) {
            const progress = await getBatchJobProgress(result.batchJobId);
            if (progress.success && progress.data) {
              const pct = Math.round((progress.data.completed / progress.data.totalItems) * 100);
              setGenerationProgress(pct);
              if (progress.data.status === "COMPLETED" || progress.data.status === "FAILED") {
                clearInterval(interval);
                setIsGenerating(false);
                loadArticles();
              }
            }
          }
        }, 2000);
      } else {
        toast.error(result.error || "Erreur lors du lancement");
        setIsGenerating(false);
      }
    } catch {
      toast.error("Une erreur est survenue");
      setIsGenerating(false);
    }
  };

  const handlePreview = async (articleId: string) => {
    if (!workspaceId) return;
    try {
      const result = await getArticle(workspaceId, articleId);
      if (result.success && result.data) {
        setPreviewContent((result.data as any).content || "");
        setPreviewOpen(true);
      }
    } catch {
      toast.error("Erreur lors du chargement de l'article");
    }
  };

  const handleDelete = async (articleId: string) => {
    if (!workspaceId) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) return;
    try {
      const result = await deleteArticle(workspaceId, articleId);
      if (result.success) { toast.success("Article supprimé"); loadArticles(); }
      else toast.error(result.error || "Erreur lors de la suppression");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handleDuplicate = async (articleId: string) => {
    if (!workspaceId) return;
    try {
      const result = await duplicateArticle(workspaceId, articleId);
      if (result.success && result.data) { toast.success(`Article dupliqué`); loadArticles(); }
      else toast.error(result.error || "Erreur lors de la duplication");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handleExport = async (articleId: string, format: "html" | "markdown") => {
    if (!workspaceId) return;
    try {
      const result = await exportArticle(workspaceId, articleId, format);
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = result.data.filename; a.click();
        URL.revokeObjectURL(url);
        toast.success("Article exporté");
      } else toast.error(result.error || "Erreur lors de l'export");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handlePublishWordPress = async (articleId: string) => {
    try {
      const result = await publishPostToCMS(articleId);
      if (result.success) {
        toast.success("Article publié sur WordPress !");
        if (result.link) window.open(result.link, "_blank");
        loadArticles();
      } else toast.error(result.error ?? "Erreur lors de la publication");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handleLaunchAnalysis = () => {
    if (analyzeMode === "audit") handleAudit(analyzeUrl);
    else if (analyzeMode === "tech") handleTechnicalAudit(analyzeUrl);
    else handleRunIntelligence(analyzeUrl);
  };

  const isAnalyzing = isAuditing || isTechAuditing || isRunningIntelligence;

  // Score colors
  const scoreColor = (s: number | null) => {
    if (!s) return "var(--fg-mute)";
    if (s >= 80) return E.fg;
    if (s >= 60) return A.fg;
    return D.fg;
  };
  const scoreBarStyle = (s: number): React.CSSProperties => ({
    width: `${s}%`,
    background: s >= 80 ? E.fg : s >= 60 ? A.fg : D.fg,
  });

  // Article status
  const STATUS_MAP: Record<string, { label: string; color: typeof E }> = {
    PUBLISHED: { label: "Publié", color: E },
    DRAFT: { label: "Brouillon", color: V },
    SCHEDULED: { label: "Programmé", color: A },
    FAILED: { label: "Échec", color: D },
  };
  const getStatus = (s: string) => STATUS_MAP[s] ?? STATUS_MAP.DRAFT;

  // Computed
  const publishedCount = articles.filter((a) => a.status === "PUBLISHED").length;
  const draftCount = articles.filter((a) => a.status === "DRAFT").length;
  const avgSeoScore =
    articles.length > 0
      ? Math.round(
          articles.reduce((sum, a) => sum + (a.seoScore || 0), 0) /
            (articles.filter((a) => a.seoScore !== null).length || 1)
        )
      : 0;
  const keywordCount = keywords.split("\n").filter((k) => k.trim()).length;

  const filteredArticles = articles.filter((article) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      article.title?.toLowerCase().includes(q) ||
      article.excerpt?.toLowerCase().includes(q) ||
      article.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: E.fg }} />
      </div>
    );
  }

  const tabs: { id: ActiveTab; label: string; icon: string; count?: number; warning?: boolean }[] = [
    { id: "articles", label: "Mes articles", icon: "▤", count: totalArticles > 0 ? totalArticles : undefined },
    { id: "create", label: "Créer", icon: "✶" },
    { id: "analyze", label: "Analyser", icon: "⌕" },
    { id: "settings", label: "Réglages", icon: "⛭", warning: seoSetupDone === false },
  ];

  return (
    <div className="space-y-6">
      {/* Credit depleted banner */}
      {isDepleted && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-4"
          style={{ background: D.soft, border: `1px solid ${D.line}` }}>
          <p className="text-sm font-medium" style={{ color: D.fg }}>
            Vous n&apos;avez plus de crédits. Les actions de génération sont désactivées.
          </p>
          <Button asChild size="sm" style={{ background: D.fg, color: "white" }}>
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10.5px] font-mono uppercase tracking-[0.15em] mb-1" style={{ color: "var(--fg-mute)" }}>
            marketing-os · studio
          </p>
          <h1 className="font-display text-[28px] font-bold leading-tight" style={{ color: "var(--fg)" }}>
            SEO Factory
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>
            Auditez vos pages, analysez la concurrence et générez des articles optimisés avec l&apos;IA.
          </p>
        </div>
        {/* KPI mini row */}
        <div className="flex items-center gap-3 shrink-0">
          {[
            { label: "Articles", value: totalArticles },
            { label: "Publiés", value: publishedCount },
            { label: "Score SEO", value: avgSeoScore || "—" },
          ].map((s) => (
            <div key={s.label} className="text-center px-4 py-2.5 rounded-xl" style={CARD}>
              <p className="font-display text-[22px] font-bold tabular leading-none" style={{ color: E.fg }}>{s.value}</p>
              <p className="text-[10px] font-mono uppercase mt-1" style={{ color: "var(--fg-mute)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FactoryTabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "oklch(0.21 0.03 260 / 0.025)", border: "1px solid var(--line)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2 rounded-lg text-[13px] font-medium flex items-center gap-2 transition-all"
            style={
              activeTab === t.id
                ? { background: E.soft, color: E.fg, border: `1px solid ${E.line}` }
                : { color: "var(--fg-dim)", border: "1px solid transparent" }
            }
          >
            <span className="font-mono text-[14px]">{t.icon}</span>
            {t.label}
            {t.count !== undefined && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: activeTab === t.id ? E.fg : "oklch(0.21 0.03 260 / 0.06)",
                  color: activeTab === t.id ? "white" : "var(--fg-mute)",
                }}
              >
                {t.count}
              </span>
            )}
            {t.warning && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: A.fg }} />
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          TAB: Mes articles
      ══════════════════════════════════════════ */}
      {activeTab === "articles" && (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Articles", value: totalArticles, color: E.fg },
              { label: "Publiés", value: publishedCount, color: E.fg },
              { label: "Score SEO moyen", value: avgSeoScore || "—", color: E.fg },
              { label: "Brouillons", value: draftCount, color: V.fg },
            ].map((k) => (
              <div key={k.label} className="p-4 rounded-xl" style={CARD}>
                <p className="text-[10.5px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--fg-mute)" }}>
                  {k.label}
                </p>
                <p className="font-display text-[26px] font-bold tabular mt-2 leading-none" style={{ color: k.color }}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          {/* Search + filter chips */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 max-w-sm"
              style={{ background: "var(--bg-elev)", border: "1px solid var(--line)" }}>
              <span className="font-mono text-[14px]" style={{ color: "var(--fg-mute)" }}>⌕</span>
              <input
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: "var(--fg)" }}
                placeholder="Rechercher un article, un mot-clé..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {[
                { value: "all", label: `Tous · ${totalArticles}` },
                { value: "PUBLISHED", label: `Publiés · ${publishedCount}` },
                { value: "DRAFT", label: `Brouillons · ${draftCount}` },
                { value: "SCHEDULED", label: "Programmés" },
              ].map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => { setStatusFilter(chip.value); setCurrentPage(1); }}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
                  style={
                    statusFilter === chip.value
                      ? { background: E.soft, color: E.fg, border: `1px solid ${E.line}` }
                      : { background: "var(--bg-elev)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                  }
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Articles table */}
          {isLoadingArticles ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: E.fg }} />
              <p className="text-sm" style={{ color: "var(--fg-mute)" }}>Chargement des articles...</p>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="py-20 text-center rounded-xl" style={CARD}>
              <FileText className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--fg-mute)", opacity: 0.4 }} />
              <p className="font-semibold" style={{ color: "var(--fg)" }}>Aucun article trouvé</p>
              <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>
                {searchQuery
                  ? "Essayez d'autres termes."
                  : "Commencez par créer votre premier article SEO."}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => { setActiveTab("create"); setCreateMode("single"); }}
                  className="mt-4 px-4 py-2 rounded-lg text-[13px] font-semibold"
                  style={{ background: E.fg, color: "white" }}
                >
                  ✶ Créer un article
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={CARD}>
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-3 px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider"
                style={{ background: "oklch(0.21 0.03 260 / 0.02)", color: "var(--fg-mute)", borderBottom: "1px solid var(--line)" }}
              >
                <div className="col-span-5">Article</div>
                <div className="col-span-1 text-center">Score</div>
                <div className="col-span-1 text-right">Mots</div>
                <div className="col-span-2">Statut</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-1 text-right"></div>
              </div>
              {filteredArticles.map((article, i) => {
                const st = getStatus(article.status);
                return (
                  <div
                    key={article.id}
                    className="grid grid-cols-12 gap-3 px-5 py-3 items-center text-[12.5px] transition-all hover:bg-black/[0.015]"
                    style={{ borderTop: i > 0 ? "1px solid var(--line)" : "none" }}
                  >
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: st.color.soft, color: st.color.fg, border: `1px solid ${st.color.line}` }}
                      >
                        <span className="font-mono text-[11px]">▤</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>
                          {article.title || "Sans titre"}
                        </p>
                        {article.keywords[0] && (
                          <p className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--fg-mute)" }}>
                            <span className="font-mono">›</span> {article.keywords[0]}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="col-span-1 text-center">
                      {article.seoScore !== null ? (
                        <span
                          className="font-display text-[16px] font-bold tabular"
                          style={{ color: scoreColor(article.seoScore) }}
                        >
                          {article.seoScore}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>—</span>
                      )}
                    </div>
                    <div className="col-span-1 text-right font-mono tabular text-[11.5px]" style={{ color: "var(--fg-dim)" }}>
                      {article.wordCount || "—"}
                    </div>
                    <div className="col-span-2">
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded inline-block"
                        style={{ background: st.color.soft, color: st.color.fg, border: `1px solid ${st.color.line}` }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>
                      {new Date(article.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                    <div className="col-span-1 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="font-mono text-[14px] px-2 py-1 rounded transition-all hover:bg-black/[0.04]"
                            style={{ color: "var(--fg-mute)" }}>⋯</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handlePreview(article.id)}>
                            <Eye className="h-4 w-4 mr-2" />Prévisualiser
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(article.id)}>
                            <Copy className="h-4 w-4 mr-2" />Dupliquer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(article.id, "markdown")}>
                            <Download className="h-4 w-4 mr-2" />Exporter (MD)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport(article.id, "html")}>
                            <Download className="h-4 w-4 mr-2" />Exporter (HTML)
                          </DropdownMenuItem>
                          {article.status !== "PUBLISHED" && (
                            <DropdownMenuItem onClick={() => handlePublishWordPress(article.id)}>
                              <ExternalLink className="h-4 w-4 mr-2" />Publier WordPress
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(article.id)} className="text-red-500 focus:text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[11.5px]" style={{ color: "var(--fg-mute)" }}>
              <span>Affichage page {currentPage} sur {totalPages} · {totalArticles} articles</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded text-[11px] disabled:opacity-40"
                  style={{ background: "var(--bg-elev)", border: "1px solid var(--line)" }}
                >‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className="px-2.5 py-1 rounded text-[11px] font-semibold"
                    style={p === currentPage
                      ? { background: E.fg, color: "white" }
                      : { background: "var(--bg-elev)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                  >{p}</button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded text-[11px] disabled:opacity-40"
                  style={{ background: "var(--bg-elev)", border: "1px solid var(--line)" }}
                >›</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: Créer
      ══════════════════════════════════════════ */}
      {activeTab === "create" && (
        <div className="space-y-5">
          {/* Mode picker */}
          <div className="p-6 rounded-xl" style={CARD}>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] mb-3" style={{ color: E.fg }}>
              Comment voulez-vous créer ?
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { id: "single" as const, icon: "▤", label: "1 article", desc: "Un mot-clé → 1 500 mots optimisés", cost: "8 cr.", time: "~3 min" },
                  { id: "bulk" as const, icon: "≡", label: "Génération en masse", desc: "CSV de mots-clés → série en background", cost: "8/article", time: "Async" },
                  { id: "cluster" as const, icon: "✦", label: "Topic Cluster", desc: "Pillar + 8 articles satellites siloed", cost: "60 cr.", time: "~15 min" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setCreateMode(m.id)}
                  className="p-4 rounded-xl text-left transition-all hover:translate-y-[-1px]"
                  style={
                    createMode === m.id
                      ? { background: E.soft, border: `1px solid ${E.line}` }
                      : { background: "var(--bg-elev)", border: "1px solid var(--line)" }
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center text-[18px]"
                      style={{ background: createMode === m.id ? "white" : E.soft, color: E.fg, border: `1px solid ${E.line}` }}>
                      <span className="font-mono">{m.icon}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-mono uppercase" style={{ color: "var(--fg-mute)" }}>{m.time}</p>
                      <p className="text-[11px] font-mono font-bold mt-0.5" style={{ color: E.fg }}>{m.cost}</p>
                    </div>
                  </div>
                  <p className="font-display text-[15px] font-semibold mt-3" style={{ color: "var(--fg)" }}>{m.label}</p>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Single mode */}
          {createMode === "single" && (
            <div className="p-6 rounded-xl" style={CARD}>
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-7 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                        Mot-clé principal
                      </label>
                      <VoiceToText onTranscribed={(text) => setSingleKeyword(text)} disabled={isDepleted} label="Dicter" />
                    </div>
                    <div className="flex items-center gap-2 p-1 rounded-xl"
                      style={{ background: "white", border: "1px solid var(--line-strong)" }}>
                      <span className="ml-3 font-mono text-[16px]" style={{ color: E.fg }}>◎</span>
                      <input
                        className="flex-1 bg-transparent outline-none py-2.5 text-[14px]"
                        style={{ color: "var(--fg)" }}
                        placeholder="Ex : crm ia b2b"
                        value={singleKeyword}
                        onChange={(e) => setSingleKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSingleGeneration()}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                      Brief additionnel (optionnel)
                    </label>
                    <textarea
                      className="mt-2 w-full p-3 rounded-lg outline-none text-[13px] resize-none"
                      style={{ background: "white", border: "1px solid var(--line)", minHeight: 80, color: "var(--fg)" }}
                      placeholder="Angle, public visé, mots à éviter..."
                      value={singleBrief}
                      onChange={(e) => setSingleBrief(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Longueur</label>
                      <div className="mt-2 flex gap-1 p-1 rounded-lg" style={{ background: "white", border: "1px solid var(--line)" }}>
                        {(["court", "standard", "long"] as const).map((l) => (
                          <button
                            key={l}
                            onClick={() => setSingleLength(l)}
                            className="flex-1 px-2 py-1.5 rounded text-[11.5px] font-medium transition-all"
                            style={
                              singleLength === l
                                ? { background: E.soft, color: E.fg }
                                : { color: "var(--fg-dim)" }
                            }
                          >
                            {l === "court" ? "Court 800" : l === "standard" ? "Standard 1 500" : "Long 2 500"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Ton</label>
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "white", border: "1px solid var(--line)" }}>
                        <span className="text-[13px] flex-1" style={{ color: "var(--fg)" }}>Pédagogique</span>
                        <span className="font-mono text-[11px]" style={{ color: "var(--fg-mute)" }}>▾</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SERP preview panel */}
                <div className="col-span-5">
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: E.fg }} />
                    Analyse en temps réel
                  </p>
                  <div className="p-4 space-y-3 rounded-xl" style={CARD_SOFT}>
                    <div className="space-y-1.5 text-[12px]">
                      <div className="flex items-baseline justify-between">
                        <span style={{ color: "var(--fg-mute)" }}>Volume estimé</span>
                        <span className="font-display text-[18px] font-bold tabular" style={{ color: "var(--fg)" }}>
                          {singleKeyword ? "~4.4k" : "—"}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span style={{ color: "var(--fg-mute)" }}>Difficulté</span>
                        <span className="font-semibold" style={{ color: singleKeyword ? A.fg : "var(--fg-mute)" }}>
                          {singleKeyword ? "32 / 100" : "—"}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span style={{ color: "var(--fg-mute)" }}>CPC moyen</span>
                        <span className="font-semibold tabular" style={{ color: "var(--fg)" }}>
                          {singleKeyword ? "€2.40" : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: "var(--line)" }}>
                      <p className="text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-mute)" }}>
                        Recommandation IA
                      </p>
                      <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-dim)" }}>
                        {singleKeyword
                          ? `Visez 1 500–2 000 mots avec intention commerciale-informative. Couvrez le "pourquoi" avant le "comment".`
                          : "Entrez un mot-clé pour voir les recommandations."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
                <p className="text-[11.5px]" style={{ color: "var(--fg-mute)" }}>
                  Coût total : <strong style={{ color: E.fg }}>8 crédits</strong> · Temps estimé : <strong style={{ color: "var(--fg)" }}>~3 min</strong>
                </p>
                <button
                  onClick={handleSingleGeneration}
                  disabled={isGeneratingSingle || !singleKeyword.trim() || isDepleted}
                  className="px-5 py-2 rounded-lg text-[12.5px] font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ background: E.fg, color: "white" }}
                >
                  {isGeneratingSingle ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Génération...</>
                  ) : (
                    <><span className="font-mono">✦</span> Générer l&apos;article →</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bulk mode */}
          {createMode === "bulk" && (
            <div className="p-6 rounded-xl" style={CARD}>
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-7 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                      Liste de mots-clés
                    </label>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                      style={{
                        background: keywordCount > 300 ? D.soft : keywordCount > 0 ? E.soft : "oklch(0.21 0.03 260 / 0.04)",
                        color: keywordCount > 300 ? D.fg : keywordCount > 0 ? E.fg : "var(--fg-mute)",
                      }}>
                      {keywordCount}/300
                    </span>
                  </div>
                  <textarea
                    className="w-full p-3 rounded-lg outline-none text-[12.5px] font-mono"
                    style={{ background: "white", border: "1px solid var(--line)", minHeight: 200, color: "var(--fg)" }}
                    placeholder={"Un mot-clé par ligne...\ncrm ia b2b\nlead scoring automatique\nprospection linkedin 2026"}
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="px-3 py-1.5 rounded-md text-[12px] font-medium flex items-center gap-1.5"
                          style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                          <Upload className="h-3.5 w-3.5" /> Importer CSV
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Importer un fichier CSV</DialogTitle>
                          <DialogDescription>Importez une liste de mots-clés depuis un fichier CSV</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Input type="file" accept=".csv" />
                        </div>
                      </DialogContent>
                    </Dialog>
                    <button
                      onClick={() => {
                        const exported = localStorage.getItem("skalle_exported_keywords");
                        if (exported) {
                          setKeywords((prev) => prev.trim() ? `${prev}\n${exported}` : exported);
                          toast.success("Mots-clés importés depuis Keywords !");
                          localStorage.removeItem("skalle_exported_keywords");
                        } else {
                          toast.info("Aucun mot-clé exporté trouvé.");
                        }
                      }}
                      className="px-3 py-1.5 rounded-md text-[12px] font-medium"
                      style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                    >
                      ⇄ Depuis Keywords
                    </button>
                  </div>
                </div>
                <div className="col-span-5">
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Résumé</p>
                  <div className="p-4 space-y-3 rounded-xl" style={CARD_SOFT}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Articles à générer</span>
                      <span className="font-display text-[24px] font-bold tabular" style={{ color: "var(--fg)" }}>{keywordCount}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Coût total</span>
                      <span className="font-display text-[18px] font-bold tabular" style={{ color: E.fg }}>{keywordCount * 8} cr.</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Temps estimé</span>
                      <span className="font-display text-[14px] font-semibold" style={{ color: "var(--fg)" }}>~{Math.ceil(keywordCount * 3)} min</span>
                    </div>
                    <p className="text-[11px] pt-2 border-t" style={{ color: "var(--fg-mute)", borderColor: "var(--line)" }}>
                      Générés en background. Vous serez notifié dès que chaque article est prêt.
                    </p>
                  </div>

                  {/* Google HCU warning */}
                  <div className="mt-3 p-3 rounded-xl" style={{ background: A.soft, border: `1px solid ${A.line}` }}>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: A.fg }}>⚠ Google Helpful Content</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                      Publiez 5–10 articles/semaine max. Relisez et enrichissez chaque article avant publication.
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {isGenerating && (
                <div className="mt-4 rounded-xl p-4" style={{ background: E.soft, border: `1px solid ${E.line}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: E.fg }} />
                      <span className="text-[12px] font-medium" style={{ color: E.fg }}>Génération en cours...</span>
                    </div>
                    <span className="text-[12px] font-bold" style={{ color: E.fg }}>{generationProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "white" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${generationProgress}%`, background: E.fg }} />
                  </div>
                </div>
              )}

              <div className="mt-5 pt-4 border-t flex justify-end" style={{ borderColor: "var(--line)" }}>
                <button
                  onClick={handleBulkGeneration}
                  disabled={isGenerating || !keywords.trim() || isDepleted}
                  className="px-5 py-2 rounded-lg text-[12.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: E.fg, color: "white" }}
                >
                  {isGenerating ? "Génération en cours..." : `Lancer la génération (${keywordCount}) →`}
                </button>
              </div>
            </div>
          )}

          {/* Cluster mode */}
          {createMode === "cluster" && (
            <div className="p-6 rounded-xl space-y-5" style={CARD}>
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                  Sujet pilier
                </label>
                <div className="mt-2 flex items-center gap-2 p-1 rounded-xl"
                  style={{ background: "white", border: "1px solid var(--line-strong)" }}>
                  <span className="ml-3 font-mono text-[16px]" style={{ color: E.fg }}>✦</span>
                  <input
                    className="flex-1 bg-transparent outline-none py-2.5 text-[14px]"
                    style={{ color: "var(--fg)" }}
                    placeholder="Ex : prospection b2b automatisée"
                    value={clusterKeyword}
                    onChange={(e) => setClusterKeyword(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                  Secteur / contexte (optionnel)
                </label>
                <input
                  className="mt-2 w-full px-3 py-2.5 rounded-lg outline-none text-[13px]"
                  style={{ background: "white", border: "1px solid var(--line)", color: "var(--fg)" }}
                  placeholder="Ex : SaaS B2B, e-commerce, RH..."
                  value={clusterContext}
                  onChange={(e) => setClusterContext(e.target.value)}
                />
              </div>

              {/* Cluster architecture preview */}
              {cluster ? (
                <div className="p-5 rounded-xl space-y-4" style={CARD_SOFT}>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-[16px]"
                      style={{ background: E.fg, color: "white" }}>P</div>
                    <div className="flex-1">
                      <p className="font-display text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{cluster.pillarTitle}</p>
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Article pilier · couverture sémantique exhaustive</p>
                    </div>
                    {clusterBatchId && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono" style={{ background: E.soft, color: E.fg, border: `1px solid ${E.line}` }}>
                        ✓ Génération en cours
                      </span>
                    )}
                  </div>
                  <div className="ml-6 pl-6 grid grid-cols-2 gap-2" style={{ borderLeft: `2px solid ${E.line}` }}>
                    {cluster.supportingKeywords.map((sat, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: E.fg, opacity: 0.5 }} />
                        <span className="text-[12px] truncate" style={{ color: "var(--fg-dim)" }}>{sat.keyword}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl" style={CARD_SOFT}>
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-3" style={{ color: "var(--fg-mute)" }}>
                    Architecture du cluster (aperçu IA)
                  </p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold"
                      style={{ background: E.fg, color: "white" }}>P</div>
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>Pillar Page · sujet principal exhaustif</p>
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>3 000–4 000 mots · maillage automatique</p>
                    </div>
                  </div>
                  <div className="ml-6 pl-6 grid grid-cols-2 gap-1.5" style={{ borderLeft: `2px solid ${E.line}` }}>
                    {["Satellite 1 — intention informative", "Satellite 2 — comparatif", "Satellite 3 — guide pratique", "Satellite 4 — cas d'usage", "Satellite 5 — outils & ressources", "Satellite 6 — FAQ avancée"].map((s, i) => (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: E.fg, opacity: 0.4 }} />
                        <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
                <p className="text-[11.5px]" style={{ color: "var(--fg-mute)" }}>
                  <strong style={{ color: E.fg }}>60 crédits</strong> · 1 pillar + 8 articles · maillage automatique
                </p>
                <button
                  onClick={handleGenerateCluster}
                  disabled={isGeneratingCluster || !clusterKeyword.trim()}
                  className="px-5 py-2 rounded-lg text-[12.5px] font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: E.fg, color: "white" }}
                >
                  {isGeneratingCluster ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Génération...</>
                  ) : (
                    <><span className="font-mono">✦</span> Générer le cluster →</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: Analyser
      ══════════════════════════════════════════ */}
      {activeTab === "analyze" && (
        <div className="space-y-5">
          {/* Mode picker + URL input */}
          <div className="p-6 rounded-xl space-y-5" style={CARD}>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: E.fg }}>
              Qu&apos;est-ce que vous voulez analyser ?
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { id: "audit" as const, icon: "▤", label: "Audit page", desc: "On-page : titre, meta, balises, contenu", cost: "2 cr." },
                  { id: "tech" as const, icon: "⚙", label: "Santé technique", desc: "Vitesse, mobile, Core Web Vitals, crawl", cost: "3 cr." },
                  { id: "intel" as const, icon: "✦", label: "Intelligence", desc: "Quick wins, gaps sémantiques, SWOT, concurrents", cost: "8 cr." },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAnalyzeMode(m.id)}
                  className="p-3.5 rounded-xl text-left transition-all"
                  style={
                    analyzeMode === m.id
                      ? { background: E.soft, border: `1px solid ${E.line}` }
                      : { background: "var(--bg-elev)", border: "1px solid var(--line)" }
                  }
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center text-[15px]"
                      style={{ background: analyzeMode === m.id ? "white" : E.soft, color: E.fg, border: `1px solid ${E.line}` }}>
                      <span className="font-mono">{m.icon}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "oklch(0.21 0.03 260 / 0.04)", color: "var(--fg-mute)" }}>{m.cost}</span>
                  </div>
                  <p className="font-display text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{m.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{m.desc}</p>
                </button>
              ))}
            </div>

            {/* URL input */}
            <div className="flex items-center gap-2 p-1 rounded-xl"
              style={{ background: "white", border: "1px solid var(--line-strong)" }}>
              <span className="ml-3 font-mono text-[16px]" style={{ color: E.fg }}>⌕</span>
              <input
                className="flex-1 bg-transparent outline-none py-2.5 text-[14px]"
                style={{ color: "var(--fg)" }}
                placeholder="URL de la page ou du domaine à analyser..."
                value={analyzeUrl}
                onChange={(e) => setAnalyzeUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLaunchAnalysis()}
              />
              <button
                onClick={handleLaunchAnalysis}
                disabled={isAnalyzing || !analyzeUrl.trim()}
                className="px-4 py-2 rounded-lg font-semibold text-[13px] mr-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ background: E.fg, color: "white" }}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Lancer l'analyse →"
                )}
              </button>
            </div>
          </div>

          {/* Audit results */}
          {analyzeMode === "audit" && auditReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4">
                {/* Score gauge */}
                <div className="col-span-4 p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--fg-mute)" }}>Score SEO global</p>
                  <div className="mt-4 flex items-center justify-center">
                    <div className="relative h-40 w-40">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.21 0.03 260 / 0.06)" strokeWidth="8" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor(auditReport.score)} strokeWidth="8"
                          strokeDasharray={`${auditReport.score * 2.64} ${100 * 2.64}`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="font-display text-[44px] font-bold tabular leading-none"
                          style={{ color: scoreColor(auditReport.score) }}>{auditReport.score}</p>
                        <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>/ 100</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Issues */}
                <div className="col-span-8 p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-[0.16em] mb-4" style={{ color: "var(--fg-mute)" }}>Scores détaillés</p>
                  <div className="space-y-4">
                    {[
                      { name: "Titre", data: auditReport.title },
                      { name: "Meta description", data: auditReport.metaDescription },
                      { name: "Titres (H1-H3)", data: auditReport.headings },
                      { name: "Images", data: auditReport.images },
                      { name: "Liens", data: auditReport.links },
                      { name: "Contenu", data: auditReport.content },
                    ].map((item) => (
                      <div key={item.name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>{item.name}</span>
                          <span className="text-[12px] font-bold" style={{ color: scoreColor(item.data.score) }}>
                            {item.data.score}/100
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.21 0.03 260 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all duration-700" style={scoreBarStyle(item.data.score)} />
                        </div>
                        {item.data.issues.length > 0 && (
                          <div className="mt-1 space-y-0.5 pl-2">
                            {item.data.issues.slice(0, 2).map((issue, i) => (
                              <p key={i} className="text-[10.5px]" style={{ color: "var(--fg-mute)" }}>
                                · {issue}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Technical results */}
          {analyzeMode === "tech" && technicalReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-6 rounded-xl text-center" style={CARD}>
                  <p className="font-display text-[56px] font-black leading-none"
                    style={{ color: technicalReport.performanceScore >= 90 ? E.fg : technicalReport.performanceScore >= 50 ? A.fg : D.fg }}>
                    {technicalReport.performanceScore}
                  </p>
                  <p className="text-[12px] mt-2" style={{ color: "var(--fg-mute)" }}>Score Performance</p>
                  <span className="mt-2 inline-block text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wider"
                    style={{
                      background: technicalReport.overallCategory === "FAST" ? E.soft : technicalReport.overallCategory === "AVERAGE" ? A.soft : D.soft,
                      color: technicalReport.overallCategory === "FAST" ? E.fg : technicalReport.overallCategory === "AVERAGE" ? A.fg : D.fg,
                    }}>
                    {technicalReport.overallCategory === "FAST" ? "Rapide" : technicalReport.overallCategory === "AVERAGE" ? "Moyen" : "Lent"}
                  </span>
                </div>
                <div className="col-span-2 p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-wider mb-3" style={{ color: "var(--fg-mute)" }}>Core Web Vitals</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["lcp", "tbt", "cls", "fcp", "speedIndex", "ttfb"] as const).map((key) => {
                      const vital = technicalReport.vitals[key];
                      const c = vital.status === "good" ? E : vital.status === "needs-improvement" ? A : D;
                      return (
                        <div key={key} className="p-2.5 rounded-lg" style={{ background: c.soft, border: `1px solid ${c.line}` }}>
                          <p className="text-[10px] font-mono uppercase font-bold" style={{ color: "var(--fg-mute)" }}>{key.toUpperCase()}</p>
                          <p className="text-[13px] font-bold mt-0.5" style={{ color: c.fg }}>{vital.value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {technicalReport.opportunities.length > 0 && (
                <div className="p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-wider mb-3" style={{ color: "var(--fg-mute)" }}>
                    Opportunités d&apos;optimisation
                  </p>
                  <div className="space-y-2">
                    {technicalReport.opportunities.map((opp, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg"
                        style={{ background: A.soft, border: `1px solid ${A.line}` }}>
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: A.fg }} />
                        <div>
                          <p className="text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>{opp.title}</p>
                          {opp.savings && <p className="text-[11px] mt-0.5" style={{ color: A.fg }}>Économie : {opp.savings}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-6 rounded-xl" style={CARD}>
                <p className="text-[10.5px] font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: E.fg }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: E.fg }} />
                  Analyse IA & Recommandations
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
                  {technicalReport.aiRecommendations}
                </p>
              </div>
            </div>
          )}

          {/* Intelligence results */}
          {analyzeMode === "intel" && intelligenceReport && (
            <div className="space-y-4">
              {/* Action bar */}
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl"
                style={{ background: E.soft, border: `1px solid ${E.line}` }}>
                <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--fg)" }}>
                  <CheckCircle className="h-4 w-4" style={{ color: E.fg }} />
                  Analyse chargée — validez, corrigez, puis générez vos articles.
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* History */}
                  {auditHistory.length > 0 && (
                    <Select value={selectedAuditId ?? ""} onValueChange={handleLoadAudit}>
                      <SelectTrigger className="h-8 text-xs w-[180px]">
                        <SelectValue placeholder="Analyses précédentes" />
                      </SelectTrigger>
                      <SelectContent>
                        {auditHistory.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.url.replace(/^https?:\/\//, "").slice(0, 30)} · {a.globalScore}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isEditingAudit ? (
                    <Button size="sm" variant="outline" className="h-8" onClick={handleStartEditAudit} disabled={!selectedAuditId}>
                      <Edit className="h-3.5 w-3.5 mr-1.5" />Corriger
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setIsEditingAudit(false)}>Annuler</Button>
                      <Button size="sm" className="h-8" onClick={handleSaveAuditCorrections} disabled={isSavingAudit}
                        style={{ background: E.fg, color: "white" }}>
                        {isSavingAudit ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                        Sauvegarder
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={handleGenerateFromAudit} disabled={isGenerating}
                    style={{ background: E.fg, color: "white" }}>
                    {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                    Générer des articles
                  </Button>
                </div>
              </div>

              {/* Edit mode */}
              {isEditingAudit && (
                <div className="p-6 rounded-xl" style={{ ...CARD, border: `1px solid ${A.line}`, background: A.soft }}>
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: A.fg }}>
                    <Edit className="h-3.5 w-3.5" />Corriger l&apos;analyse — chaque ligne = un élément
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Quick Wins (un mot-clé/ligne)", val: editedQuickWins, set: setEditedQuickWins, ph: "mot-clé 1\nmot-clé 2" },
                      { label: "Actions techniques ([high/med/low] desc)", val: editedTechnicalActions, set: setEditedTechnicalActions, ph: "[high] Optimiser les balises title" },
                      { label: "Gaps sémantiques (un sujet/ligne)", val: editedSemanticGaps, set: setEditedSemanticGaps, ph: "Sujet 1\nSujet 2" },
                      { label: "SWOT (JSON)", val: editedSwot, set: setEditedSwot, ph: '{"strengths":[],"weaknesses":[]}' },
                    ].map(({ label, val, set, ph }) => (
                      <div key={label} className="space-y-1.5">
                        <Label className="text-xs font-medium" style={{ color: "var(--fg-dim)" }}>{label}</Label>
                        <Textarea value={val} onChange={(e) => set(e.target.value)} rows={5} className="text-xs font-mono resize-none" placeholder={ph} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overview */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Target className="h-5 w-5" />, label: "Thématique", value: intelligenceReport.userSite?.theme || "Non analysé" },
                  { icon: <BookOpen className="h-5 w-5" />, label: "Mots-clés identifiés", value: intelligenceReport.userSite?.intentKeywords?.length || 0 },
                  { icon: <BarChart3 className="h-5 w-5" />, label: "Concurrents analysés", value: intelligenceReport.competitorAnalysis?.length || 0 },
                ].map((k) => (
                  <div key={k.label} className="p-4 rounded-xl" style={CARD}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: E.soft, color: E.fg }}>
                        {k.icon}
                      </div>
                      <div>
                        <p className="text-[10.5px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>{k.label}</p>
                        <p className="font-display text-[22px] font-bold tabular mt-0.5 leading-none" style={{ color: "var(--fg)" }}>{k.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick wins */}
              {intelligenceReport.strategy?.quickWins?.length > 0 && (
                <div className="p-6 rounded-xl" style={CARD}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10.5px] font-mono uppercase tracking-[0.16em] flex items-center gap-1.5" style={{ color: E.fg }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: E.fg }} />
                        Quick wins · proposés par l&apos;IA
                      </p>
                      <h3 className="font-display text-[17px] font-semibold mt-0.5" style={{ color: "var(--fg)" }}>
                        {intelligenceReport.strategy.quickWins.length} opportunités
                      </h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {intelligenceReport.strategy.quickWins.slice(0, 6).map((win: any, i: number) => (
                      <div key={i} className="p-3.5 rounded-lg" style={CARD_SOFT}>
                        <p className="font-display text-[13px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>
                          {win.keyword}
                        </p>
                        <p className="text-[11.5px] mt-1" style={{ color: "var(--fg-mute)" }}>{win.opportunity}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competitor radar */}
              {intelligenceReport.competitorAnalysis?.length > 0 && (
                <div className="p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-[0.16em] mb-4" style={{ color: "var(--fg-mute)" }}>
                    Radar de compétitivité
                  </p>
                  <div className="space-y-3">
                    {intelligenceReport.competitorAnalysis.slice(0, 3).map((comp: any, i: number) => (
                      <div key={i} className="p-4 rounded-xl" style={CARD_SOFT}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                              style={{ background: E.soft, color: E.fg }}>{i + 1}</div>
                            <span className="font-semibold text-[13px]" style={{ color: "var(--fg)" }}>{comp.domain}</span>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                            style={{ background: E.soft, color: E.fg, border: `1px solid ${E.line}` }}>
                            {comp.authorityScore}/100
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.21 0.03 260 / 0.06)" }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${comp.authorityScore}%`, background: E.fg }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategic checklist */}
              {(intelligenceReport.recommendations?.technical?.length > 0 || intelligenceReport.recommendations?.semantic?.length > 0) && (
                <div className="p-6 rounded-xl" style={CARD}>
                  <p className="text-[10.5px] font-mono uppercase tracking-[0.16em] mb-4" style={{ color: "var(--fg-mute)" }}>
                    Checklist stratégique
                  </p>
                  <div className="space-y-5">
                    {intelligenceReport.recommendations?.technical?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: A.fg }}>
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Actions techniques ({intelligenceReport.recommendations.technical.length})
                        </p>
                        <div className="space-y-2">
                          {intelligenceReport.recommendations.technical.map((action: any, i: number) => {
                            const c = action.priority === "high" ? D : action.priority === "medium" ? A : V;
                            return (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-lg"
                                style={{ background: "oklch(0.985 0.005 260)", border: "1px solid var(--line)" }}>
                                <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                  style={{ background: c.soft }}>
                                  <CheckCircle className="h-3.5 w-3.5" style={{ color: c.fg }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>{action.action}</p>
                                  {action.description && action.description !== action.action && (
                                    <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{action.description}</p>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: c.soft, color: c.fg }}>
                                  {action.priority}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {intelligenceReport.recommendations?.semantic?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: E.fg }}>
                          <Lightbulb className="h-3.5 w-3.5" />
                          Gaps sémantiques ({intelligenceReport.recommendations.semantic.length})
                        </p>
                        <div className="space-y-2">
                          {intelligenceReport.recommendations.semantic.map((gap: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg" style={{ background: E.soft, border: `1px solid ${E.line}` }}>
                              <div className="flex items-start gap-2">
                                <ArrowRight className="h-4 w-4 shrink-0 mt-0.5" style={{ color: E.fg }} />
                                <div>
                                  <p className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>{gap.topic}</p>
                                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-dim)" }}>{gap.recommendation}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Generate CTA */}
              <div className="p-6 rounded-xl flex items-center justify-between gap-4"
                style={{ background: E.soft, border: `1px solid ${E.line}` }}>
                <div>
                  <h3 className="font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
                    <Sparkles className="h-4 w-4" style={{ color: E.fg }} />
                    Générer des articles depuis ce diagnostic
                  </h3>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
                    {((intelligenceReport.strategy?.quickWins?.length ?? 0) + Math.min((intelligenceReport.marketInsights?.length ?? 0), 5))} mots-clés identifiés
                  </p>
                </div>
                <button onClick={handleGenerateFromAudit} disabled={isGenerating}
                  className="px-5 py-2 rounded-lg font-semibold text-[13px] flex items-center gap-2 disabled:opacity-50 shrink-0"
                  style={{ background: E.fg, color: "white" }}>
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Rédiger les articles
                </button>
              </div>
            </div>
          )}

          {/* Empty state for analyze */}
          {!auditReport && !technicalReport && !intelligenceReport && !isAnalyzing && (
            <div className="py-16 text-center rounded-xl" style={CARD}>
              <span className="font-mono text-[40px]" style={{ color: "var(--fg-mute)", opacity: 0.3 }}>⌕</span>
              <p className="font-semibold mt-4" style={{ color: "var(--fg)" }}>
                {analyzeMode === "audit" ? "Audit SEO on-page" : analyzeMode === "tech" ? "Santé technique" : "SEO Intelligence"}
              </p>
              <p className="text-[13px] mt-1" style={{ color: "var(--fg-mute)" }}>
                Entrez une URL ci-dessus et lancez l&apos;analyse.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: Réglages
      ══════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="space-y-6 max-w-2xl">
          {/* Setup done banner */}
          {seoSetupDone && (
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: E.soft, border: `1px solid ${E.line}` }}>
              <CheckCircle className="h-4 w-4 shrink-0" style={{ color: E.fg }} />
              <p className="text-[13px] font-medium" style={{ color: E.fg }}>
                Configuration active — la génération d&apos;articles est débloquée.
              </p>
            </div>
          )}

          {/* Step 1 — Content mode */}
          <div className="p-6 rounded-xl space-y-4" style={CARD}>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: E.fg }}>Étape 1 — Type de contenu</p>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
                Choisissez le mode qui correspond à votre stratégie.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { mode: "article" as SeoContentMode, icon: "📝", label: "Article", badge: "Standard" },
                { mode: "affiliation" as SeoContentMode, icon: "🔗", label: "Affiliation", badge: "Conversion" },
                { mode: "ecommerce" as SeoContentMode, icon: "🛒", label: "E-commerce", badge: "Ventes" },
                { mode: "discovery" as SeoContentMode, icon: "🔥", label: "Discovery", badge: "Viral" },
                { mode: "local" as SeoContentMode, icon: "📍", label: "Local SEO", badge: "Local" },
              ] as const).map(({ mode, icon, label, badge }) => (
                <button key={mode} type="button" onClick={() => setSetupContentMode(mode)}
                  className="relative text-left rounded-xl border-2 p-3.5 transition-all"
                  style={setupContentMode === mode
                    ? { borderColor: E.fg, background: E.soft }
                    : { borderColor: "var(--line)", background: "var(--bg-elev)" }}>
                  {setupContentMode === mode && (
                    <CheckCircle className="absolute top-2.5 right-2.5 h-4 w-4" style={{ color: E.fg }} />
                  )}
                  <div className="text-xl mb-1.5">{icon}</div>
                  <p className="font-semibold text-[13px]" style={{ color: "var(--fg)" }}>{label}</p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded mt-1 inline-block"
                    style={{ background: "oklch(0.21 0.03 260 / 0.06)", color: "var(--fg-mute)" }}>
                    {badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Business activity + Site type */}
          <div className="p-6 rounded-xl space-y-4" style={CARD}>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: E.fg }}>Étape 2 — Activité & type de site</p>
            </div>
            <div className="space-y-2">
              <Label>Décrivez votre activité / offre principale</Label>
              <Input
                placeholder="Ex : Logiciel CRM pour PME, Boutique de vêtements bio..."
                value={setupBusinessActivity}
                onChange={(e) => setSetupBusinessActivity(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { value: "saas", icon: "💻", label: "SaaS / App" },
                { value: "ecommerce", icon: "🛍️", label: "E-commerce" },
                { value: "services", icon: "🤝", label: "Services" },
                { value: "blog_affiliation", icon: "✍️", label: "Blog / Affil." },
                { value: "media", icon: "📰", label: "Média" },
                { value: "local_business", icon: "📍", label: "Local" },
                { value: "marketplace", icon: "🏪", label: "Marketplace" },
                { value: "portfolio", icon: "🎨", label: "Portfolio" },
              ] as const).map(({ value, icon, label }) => (
                <button key={value} type="button" onClick={() => setSetupSiteType(value as SeoSiteType)}
                  className="text-left rounded-lg border-2 p-2.5 transition-all"
                  style={setupSiteType === value
                    ? { borderColor: E.fg, background: E.soft }
                    : { borderColor: "var(--line)", background: "var(--bg-elev)" }}>
                  <div className="text-lg mb-0.5">{icon}</div>
                  <p className="font-semibold text-[11.5px]" style={{ color: "var(--fg)" }}>{label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3 — URL */}
          <div className="p-6 rounded-xl space-y-4" style={CARD}>
            <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: E.fg }}>Étape 3 — URL de votre site</p>
            <div className="space-y-2">
              <Label htmlFor="setup-domain">URL du site</Label>
              <Input id="setup-domain" type="url" placeholder="https://monsite.com"
                value={setupDomainUrl} onChange={(e) => setSetupDomainUrl(e.target.value)}
                className="font-mono text-sm" />
            </div>
          </div>

          {/* Step 4 — Strategy */}
          <div className="p-6 rounded-xl space-y-5" style={CARD}>
            <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: E.fg }}>Étape 4 — Stratégie de publication</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fréquence de publication</Label>
                <Select value={setupFrequency} onValueChange={(v) => setSetupFrequency(v as SeoPublicationStrategy["frequency"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1/week">1 article / semaine</SelectItem>
                    <SelectItem value="2/week">2 articles / semaine</SelectItem>
                    <SelectItem value="3/week">3 articles / semaine</SelectItem>
                    <SelectItem value="daily">1 article / jour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Langue des articles</Label>
                <Select value={setupLanguage} onValueChange={(v) => setSetupLanguage(v as SeoPublicationStrategy["language"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-audience" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                Audience cible
              </Label>
              <Textarea id="setup-audience"
                placeholder="Ex : PME françaises cherchant à automatiser leur prospection commerciale"
                value={setupTargetAudience} onChange={(e) => setSetupTargetAudience(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                Objectifs SEO
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "organic_traffic", label: "Trafic organique" },
                  { value: "lead_gen", label: "Génération de leads" },
                  { value: "brand_awareness", label: "Notoriété" },
                  { value: "conversion", label: "Conversion" },
                  { value: "thought_leadership", label: "Expertise métier" },
                ].map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => toggleGoal(value)}
                    className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
                    style={setupGoals.includes(value)
                      ? { background: E.fg, color: "white", borderColor: E.fg }
                      : { background: "var(--bg-elev)", color: "var(--fg-dim)", borderColor: "var(--line)" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Columns3 className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                Piliers de contenu
              </Label>
              <div className="space-y-2">
                {setupPillars.map((pillar, i) => (
                  <Input key={i} placeholder={`Pilier ${i + 1} (ex : Automatisation marketing)`}
                    value={pillar}
                    onChange={(e) => {
                      const next = [...setupPillars];
                      next[i] = e.target.value;
                      setSetupPillars(next);
                    }}
                  />
                ))}
                {setupPillars.length < 6 && (
                  <button type="button" onClick={() => setSetupPillars([...setupPillars, ""])}
                    className="text-xs flex items-center gap-1" style={{ color: E.fg }}>
                    <Plus className="h-3 w-3" /> Ajouter un pilier
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button onClick={handleSaveSetup} disabled={isSavingSetup}
              className="px-5 py-2.5 rounded-lg font-semibold text-[13px] flex items-center gap-2 disabled:opacity-50"
              style={{ background: E.fg, color: "white" }}>
              {isSavingSetup ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sauvegarde…</>
              ) : (
                <><CheckCircle className="h-4 w-4" />Valider la configuration</>
              )}
            </button>
          </div>

          {/* Strategy tab */}
          {workspaceId && (
            <div className="pt-4 border-t" style={{ borderColor: "var(--line)" }}>
              <SeoStrategyTab workspaceId={workspaceId} />
            </div>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Prévisualisation de l&apos;article</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] prose prose-gray max-w-none">
            <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {previewContent}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(previewContent);
              toast.success("Contenu copié dans le presse-papier");
            }}>
              <Copy className="h-4 w-4 mr-2" />Copier le contenu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
