"use client";

/**
 * SEO Factory - Redesigned UI
 *
 * Fonctionnalites:
 * 1. Audit SEO instantane et avance
 * 2. Generation d'article unique avec preview
 * 3. Generation en masse (bulk)
 * 4. Liste des articles avec filtres, recherche, pagination
 * 5. Statistiques et analytics
 */

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  Filter,
  TrendingUp,
  Calendar,
  Clock,
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
  getWorkspacePosts,
  runSEOIntelligence,
  getSEOIntelligenceReport,
} from "@/actions/seo";
import { publishPostToCMS } from "@/actions/cms";
import { toast } from "sonner";
import Link from "next/link";
import { getUserWorkspace } from "@/actions/leads";
import { useCreditsContext } from "@/components/providers/credits-provider";
import { VoiceToText } from "@/components/voice/voice-to-text";
import { analyzeTechnicalSEO } from "@/actions/seo-technical";
import { generateContentCluster, type ContentCluster } from "@/actions/content-cluster";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SeoStrategyTab } from "@/components/modules/seo-strategy-tab";

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

export default function SEOFactoryPage() {
  const { isDepleted } = useCreditsContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Audit SEO
  const [auditUrl, setAuditUrl] = useState("");
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // Generation unique
  const [singleKeyword, setSingleKeyword] = useState("");
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<Article | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");

  // Generation bulk
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);

  // Liste articles
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalArticles, setTotalArticles] = useState(0);

  // SEO Intelligence
  const [intelligenceUrl, setIntelligenceUrl] = useState("");
  const [isRunningIntelligence, setIsRunningIntelligence] = useState(false);
  const [intelligenceReport, setIntelligenceReport] = useState<any | null>(null);

  // SEO Technical Score
  const [technicalUrl, setTechnicalUrl] = useState("");
  const [isTechAuditing, setIsTechAuditing] = useState(false);
  const [technicalReport, setTechnicalReport] = useState<import("@/actions/seo-technical").TechnicalReport | null>(null);

  // Topic Cluster
  const [clusterKeyword, setClusterKeyword] = useState("");
  const [clusterContext, setClusterContext] = useState("");
  const [isGeneratingCluster, setIsGeneratingCluster] = useState(false);
  const [cluster, setCluster] = useState<ContentCluster | null>(null);
  const [clusterBatchId, setClusterBatchId] = useState<string | null>(null);

  // Charger le workspace au montage
  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
      }
    });
  }, []);

  // Charger les mots-clés depuis localStorage ou query params
  useEffect(() => {
    // Vérifier query params (depuis Strategy)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const keywordParam = urlParams.get('keyword');
      if (keywordParam) {
        setSingleKeyword(keywordParam);
        // Basculer vers l'onglet de génération unique
        setTimeout(() => {
          const tabs = document.querySelector('[value="generate-single"]') as HTMLElement;
          tabs?.click();
        }, 100);
      }

      // Vérifier localStorage (depuis Keywords)
      const exported = localStorage.getItem('skalle_exported_keywords');
      if (exported && !keywords.trim()) {
        setKeywords(exported);
        toast.success('Mots-clés importés depuis Keywords !');
        localStorage.removeItem('skalle_exported_keywords');
        // Basculer vers l'onglet de génération bulk
        setTimeout(() => {
          const tabs = document.querySelector('[value="generate-bulk"]') as HTMLElement;
          tabs?.click();
        }, 100);
      }
    }
  }, []);

  // Charger les articles quand workspaceId change
  useEffect(() => {
    if (workspaceId) {
      loadArticles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, currentPage, statusFilter]);

  const loadArticles = async () => {
    if (!workspaceId) return;

    setIsLoadingArticles(true);
    try {
      const result = await listArticles({
        workspaceId,
        status: statusFilter !== "all" ? statusFilter as any : undefined,
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
    } catch (error) {
      console.error("Error loading articles:", error);
    } finally {
      setIsLoadingArticles(false);
    }
  };

  const handleGenerateCluster = async () => {
    if (!clusterKeyword.trim()) {
      toast.error("Veuillez entrer un mot-clé pilier");
      return;
    }
    setIsGeneratingCluster(true);
    try {
      const result = await generateContentCluster(
        clusterKeyword,
        clusterContext || undefined
      );
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

  const handleTechnicalAudit = async () => {
    if (!technicalUrl.trim()) {
      toast.error("Veuillez entrer une URL");
      return;
    }
    setIsTechAuditing(true);
    try {
      const result = await analyzeTechnicalSEO(technicalUrl);
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

  const handleAudit = async () => {
    if (!auditUrl || !workspaceId) {
      toast.error("Veuillez entrer une URL");
      return;
    }

    setIsAuditing(true);
    try {
      const result = await runSEOAudit(workspaceId, auditUrl);
      if (result.success && result.data) {
        setAuditReport(result.data);
        toast.success("Audit termine !");
      } else {
        toast.error(result.error || "Erreur lors de l'audit");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSingleGeneration = async () => {
    if (!singleKeyword.trim() || !workspaceId) {
      toast.error("Veuillez entrer un mot-cle");
      return;
    }

    setIsGeneratingSingle(true);
    try {
      const result = await generateSingleArticle(workspaceId, singleKeyword.trim());
      if (result.success && result.data) {
        toast.success(`Article "${result.data.title}" genere avec succes !`);
        setSingleKeyword("");
        loadArticles(); // Recharger la liste
      } else {
        toast.error(result.error || "Erreur lors de la generation");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const handleBulkGeneration = async () => {
    if (!workspaceId) return;

    const keywordList = keywords
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keywordList.length === 0) {
      toast.error("Veuillez entrer au moins un mot-cle");
      return;
    }

    if (keywordList.length > 300) {
      toast.error("Maximum 300 mots-cles par lot");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const result = await startBulkGeneration(workspaceId, keywordList);
      if (result.success && result.batchJobId) {
        setBatchJobId(result.batchJobId);
        toast.success(`Generation lancee pour ${keywordList.length} articles`);

        // Polling pour le progres
        const interval = setInterval(async () => {
          if (result.batchJobId) {
            const progress = await getBatchJobProgress(result.batchJobId);
            if (progress.success && progress.data) {
              const percentage = Math.round(
                (progress.data.completed / progress.data.totalItems) * 100
              );
              setGenerationProgress(percentage);

              if (progress.data.status === "COMPLETED" || progress.data.status === "FAILED") {
                clearInterval(interval);
                setIsGenerating(false);
                loadArticles(); // Recharger la liste
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
        const article = result.data as any;
        setPreviewContent(article.content || "");
        setPreviewOpen(true);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement de l'article");
    }
  };

  const handleDelete = async (articleId: string) => {
    if (!workspaceId) return;

    if (!confirm("Etes-vous sur de vouloir supprimer cet article ?")) return;

    try {
      const result = await deleteArticle(workspaceId, articleId);
      if (result.success) {
        toast.success("Article supprime");
        loadArticles();
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleDuplicate = async (articleId: string) => {
    if (!workspaceId) return;

    try {
      const result = await duplicateArticle(workspaceId, articleId);
      if (result.success && result.data) {
        toast.success(`Article "${result.data.title}" duplique`);
        loadArticles();
      } else {
        toast.error(result.error || "Erreur lors de la duplication");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handleExport = async (articleId: string, format: "html" | "markdown") => {
    if (!workspaceId) return;

    try {
      const result = await exportArticle(workspaceId, articleId, format);
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Article exporte");
      } else {
        toast.error(result.error || "Erreur lors de l'export");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  const handlePublishWordPress = async (articleId: string) => {
    try {
      const result = await publishPostToCMS(articleId);
      if (result.success) {
        toast.success("Article publié sur WordPress !");
        if (result.link) {
          window.open(result.link, "_blank");
        }
        loadArticles();
      } else {
        toast.error(result.error ?? "Erreur lors de la publication");
      }
    } catch {
      toast.error("Une erreur est survenue");
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-gray-500";
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "from-emerald-500 to-teal-500";
    if (score >= 60) return "from-amber-400 to-orange-500";
    return "from-red-500 to-rose-500";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return "stroke-emerald-500";
    if (score >= 60) return "stroke-amber-500";
    return "stroke-red-500";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      DRAFT: { color: "bg-gray-100 text-gray-600 border-gray-200", label: "Brouillon" },
      SCHEDULED: { color: "bg-blue-50 text-blue-600 border-blue-200", label: "Programme" },
      PUBLISHED: { color: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Publie" },
      FAILED: { color: "bg-red-50 text-red-600 border-red-200", label: "Echec" },
    };
    const variant = variants[status] || variants.DRAFT;
    return <Badge variant="outline" className={variant.color}>{variant.label}</Badge>;
  };

  const filteredArticles = articles.filter((article) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        article.title?.toLowerCase().includes(query) ||
        article.excerpt?.toLowerCase().includes(query) ||
        article.keywords.some((k) => k.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Computed stats for articles
  const publishedCount = articles.filter((a) => a.status === "PUBLISHED").length;
  const avgSeoScore = articles.length > 0
    ? Math.round(
        articles.reduce((sum, a) => sum + (a.seoScore || 0), 0) /
          articles.filter((a) => a.seoScore !== null).length || 0
      )
    : 0;
  const keywordCount = keywords.split("\n").filter((k) => k.trim()).length;

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. Les actions de génération sont désactivées.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-teal-50/60 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                SEO Factory
              </span>
            </h1>
            <p className="text-gray-500 mt-2 text-lg max-w-xl">
              Auditez vos pages, analysez la concurrence et generez des articles
              optimises en masse avec l&apos;IA.
            </p>
          </div>

          {/* Stats counters */}
          <div className="flex items-center gap-6">
            <div className="text-center px-5 py-3 rounded-xl bg-white/80 border border-gray-200/60 shadow-sm">
              <div className="text-3xl font-bold text-gray-900">{totalArticles}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-0.5">Articles</div>
            </div>
            <div className="text-center px-5 py-3 rounded-xl bg-white/80 border border-gray-200/60 shadow-sm">
              <div className="text-3xl font-bold text-emerald-600">{publishedCount}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-0.5">Publies</div>
            </div>
            <div className="text-center px-5 py-3 rounded-xl bg-white/80 border border-gray-200/60 shadow-sm">
              <div className="text-3xl font-bold text-teal-600">{avgSeoScore || "--"}</div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-0.5">Score SEO</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs defaultValue="articles" className="space-y-6">
        <TabsList className="inline-flex h-12 items-center gap-1 rounded-xl bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm p-1.5">
          <TabsTrigger
            value="articles"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <FileText className="h-4 w-4 mr-2" />
            Mes Articles
            {totalArticles > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-white/20 text-xs font-semibold px-1.5">
                {totalArticles}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="generate-single"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Generer un Article
          </TabsTrigger>
          <TabsTrigger
            value="generate-bulk"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generation Bulk
          </TabsTrigger>
          <TabsTrigger
            value="intelligence"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Brain className="h-4 w-4 mr-2" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Audit SEO
          </TabsTrigger>
          <TabsTrigger
            value="technical"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Gauge className="h-4 w-4 mr-2" />
            Santé Technique
          </TabsTrigger>
          <TabsTrigger
            value="cluster"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Network className="h-4 w-4 mr-2" />
            Topic Cluster
          </TabsTrigger>
          <TabsTrigger
            value="strategy"
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Brain className="h-4 w-4 mr-2" />
            Stratégie
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
            ARTICLES TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="articles" className="space-y-6">
          {/* Stats bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total articles</p>
                <p className="text-xl font-bold text-gray-900">{totalArticles}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Score SEO moyen</p>
                <p className="text-xl font-bold text-gray-900">{avgSeoScore || "--"}/100</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Publies</p>
                <p className="text-xl font-bold text-gray-900">{publishedCount}</p>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un article..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white/80 border-gray-200 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500/20"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] bg-white/80 border-gray-200 text-gray-900 focus:border-emerald-500">
                    <Filter className="h-4 w-4 mr-2 text-gray-400" />
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="SCHEDULED">Programme</SelectItem>
                    <SelectItem value="PUBLISHED">Publie</SelectItem>
                    <SelectItem value="FAILED">Echec</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Articles Grid */}
          {isLoadingArticles ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm text-gray-500">Chargement des articles...</p>
            </div>
          ) : filteredArticles.length === 0 ? (
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
              <CardContent className="p-16 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                  <FileText className="h-10 w-10 text-emerald-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Aucun article trouve
                </h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {searchQuery
                    ? "Aucun resultat pour votre recherche. Essayez d'autres termes."
                    : "Vous n'avez pas encore genere d'article. Commencez par generer votre premier article SEO."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredArticles.map((article) => (
                <Card
                  key={article.id}
                  className="group bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                >
                  {/* Gradient thumbnail placeholder */}
                  <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />

                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title + Status */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getStatusBadge(article.status)}
                          {article.seoScore !== null && (
                            <Badge
                              variant="outline"
                              className={`${
                                article.seoScore >= 80
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                  : article.seoScore >= 60
                                  ? "bg-amber-50 text-amber-600 border-amber-200"
                                  : "bg-red-50 text-red-600 border-red-200"
                              }`}
                            >
                              SEO {article.seoScore}
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-base font-semibold text-gray-900 leading-snug mb-1.5 line-clamp-2 group-hover:text-emerald-700 transition-colors">
                          {article.title || "Sans titre"}
                        </h3>

                        {article.excerpt && (
                          <p className="text-gray-500 text-sm mb-3 line-clamp-2 leading-relaxed">
                            {article.excerpt}
                          </p>
                        )}

                        {/* SEO Score circular mini + meta info */}
                        <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                          {article.wordCount && (
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5" />
                              {article.wordCount} mots
                            </span>
                          )}
                          {article.readabilityScore !== null && (
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5" />
                              {article.readabilityScore}/100
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(article.createdAt).toLocaleDateString("fr-FR")}
                          </span>
                        </div>

                        {/* Keywords */}
                        {article.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {article.keywords.slice(0, 4).map((keyword, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="bg-emerald-50/80 text-emerald-700 border-emerald-200 text-xs font-normal"
                              >
                                {keyword}
                              </Badge>
                            ))}
                            {article.keywords.length > 4 && (
                              <Badge
                                variant="outline"
                                className="bg-gray-50 text-gray-500 border-gray-200 text-xs font-normal"
                              >
                                +{article.keywords.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Score ring + Dropdown */}
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        {article.seoScore !== null && (
                          <div className="relative h-14 w-14">
                            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                className="text-gray-100"
                              />
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                fill="none"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${(article.seoScore / 100) * 150.8} 150.8`}
                                className={getScoreRingColor(article.seoScore)}
                              />
                            </svg>
                            <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${getScoreColor(article.seoScore)}`}>
                              {article.seoScore}
                            </span>
                          </div>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white/90 backdrop-blur-xl border-gray-200/60 shadow-lg">
                            <DropdownMenuItem
                              onClick={() => handlePreview(article.id)}
                              className="text-gray-700 focus:bg-emerald-50 focus:text-emerald-700"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Previsualiser
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDuplicate(article.id)}
                              className="text-gray-700 focus:bg-emerald-50 focus:text-emerald-700"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Dupliquer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExport(article.id, "markdown")}
                              className="text-gray-700 focus:bg-emerald-50 focus:text-emerald-700"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Exporter (MD)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExport(article.id, "html")}
                              className="text-gray-700 focus:bg-emerald-50 focus:text-emerald-700"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Exporter (HTML)
                            </DropdownMenuItem>
                            {article.status !== "PUBLISHED" && (
                              <DropdownMenuItem
                                onClick={() => handlePublishWordPress(article.id)}
                                className="text-gray-700 focus:bg-emerald-50 focus:text-emerald-700"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Publier sur WordPress
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDelete(article.id)}
                              className="text-red-500 focus:bg-red-50 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Page {currentPage} sur {totalPages} &middot; {totalArticles} articles au total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-gray-200 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                >
                  Precedent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-gray-200 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            GENERATE SINGLE TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="generate-single" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main generation card */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                      <Plus className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Generer un Article Unique</CardTitle>
                      <CardDescription className="text-gray-500">
                        Creez un article SEO optimise pour un mot-cle specifique
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Label className="text-gray-700 font-medium">
                        Mot-cle principal
                      </Label>
                      <VoiceToText
                        onTranscribed={(text) => setSingleKeyword(text)}
                        disabled={isDepleted}
                        label="Dicter"
                      />
                    </div>
                    <Input
                      placeholder="ex: marketing digital pour PME — ou dictez votre idee"
                      value={singleKeyword}
                      onChange={(e) => setSingleKeyword(e.target.value)}
                      className="bg-white/80 border-gray-200 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 text-base"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Utilisez des mots-cles longue traine (3-5 mots) ou dictez votre idee pour un article
                    </p>
                  </div>

                  {/* Keyword suggestion presets */}
                  <div>
                    <Label className="text-gray-500 mb-2 block text-xs uppercase tracking-wider font-medium">
                      Suggestions rapides
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "strategie SEO 2025",
                        "content marketing B2B",
                        "optimisation taux conversion",
                        "marketing automation PME",
                        "referencement local Google",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setSingleKeyword(suggestion)}
                          className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleSingleGeneration}
                    disabled={isGeneratingSingle || !singleKeyword.trim() || isDepleted}
                    title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                    className="w-full h-12 text-base font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm"
                  >
                    {isGeneratingSingle ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Generation en cours...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5 mr-2" />
                        Generer l&apos;article
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Preview side panel */}
            <div className="space-y-6">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-600" />
                    Apercu de l&apos;article
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
                    {singleKeyword.trim() ? (
                      <div className="space-y-3 text-left">
                        <div className="h-3 w-3/4 rounded-full bg-gradient-to-r from-emerald-200 to-teal-200" />
                        <div className="space-y-1.5">
                          <div className="h-2 w-full rounded-full bg-gray-200" />
                          <div className="h-2 w-5/6 rounded-full bg-gray-200" />
                          <div className="h-2 w-4/6 rounded-full bg-gray-200" />
                        </div>
                        <div className="pt-2">
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs">
                            {singleKeyword}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 pt-2">
                          L&apos;article sera genere avec titre, introduction, sections H2/H3,
                          images et conclusion optimises pour le mot-cle &quot;{singleKeyword}&quot;.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto" />
                        <p className="text-xs text-gray-400">
                          Saisissez un mot-cle pour voir l&apos;apercu
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Advanced options */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Options avancees
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Ton</span>
                      <span className="text-gray-700 font-medium">Professionnel</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Longueur</span>
                      <span className="text-gray-700 font-medium">~1500 mots</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Images</span>
                      <span className="text-gray-700 font-medium">Incluses</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-gray-500">Sources</span>
                      <span className="text-gray-700 font-medium">Automatiques</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Les parametres avances sont geres par votre Brand Voice configuree.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            GENERATE BULK TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="generate-bulk" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Generation en Masse</CardTitle>
                      <CardDescription className="text-gray-500">
                        Generez jusqu&apos;a 300 articles SEO optimises en un seul clic
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-gray-700 font-medium">
                        Mots-cles (un par ligne)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const exported = localStorage.getItem('skalle_exported_keywords');
                            if (exported) {
                              const currentKeywords = keywords.trim();
                              const newKeywords = currentKeywords 
                                ? `${currentKeywords}\n${exported}`
                                : exported;
                              setKeywords(newKeywords);
                              toast.success('Mots-clés importés depuis Keywords !');
                              localStorage.removeItem('skalle_exported_keywords');
                            } else {
                              toast.info('Aucun mot-clé exporté trouvé. Exportez d\'abord depuis la page Keywords.');
                            }
                          }}
                          className="text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Importer depuis Keywords
                        </Button>
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          keywordCount > 300
                            ? "bg-red-50 text-red-600"
                            : keywordCount > 0
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          <Target className="h-3 w-3" />
                          {keywordCount}/300
                        </div>
                      </div>
                    </div>
                    <Textarea
                      placeholder={"marketing digital\nSEO local\nstrategie content marketing\n..."}
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      rows={12}
                      className="bg-white/80 border-gray-200 text-gray-900 font-mono text-sm focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="border-gray-200 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Importer CSV
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-white/90 backdrop-blur-xl border-gray-200/60 shadow-lg">
                        <DialogHeader>
                          <DialogTitle className="text-gray-900">
                            Importer un fichier CSV
                          </DialogTitle>
                          <DialogDescription className="text-gray-500">
                            Importez une liste de mots-cles depuis un fichier CSV
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Input
                            type="file"
                            accept=".csv"
                            className="bg-white/80 border-gray-200 text-gray-900"
                          />
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      onClick={handleBulkGeneration}
                      disabled={isGenerating || !keywords.trim() || isDepleted}
                      title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                      className="flex-1 h-11 font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Lancer la generation
                    </Button>
                  </div>

                  {/* Animated progress */}
                  {isGenerating && (
                    <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-50/80 to-teal-50/80 border border-emerald-100 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-medium text-gray-700">
                            Generation en cours...
                          </span>
                        </div>
                        <span className="text-sm font-bold text-emerald-600">
                          {generationProgress}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-white/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out"
                          style={{ width: `${generationProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tips sidebar */}
            <div className="space-y-6">
              {/* Warning Google HCU */}
              <Card className="bg-amber-50/80 backdrop-blur-sm border-amber-200/80 shadow-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-400" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Attention — Google Helpful Content
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Ne publiez <strong>pas 300 articles d&apos;un coup</strong>. Google pénalise les pics de contenu IA massif (Helpful Content Update).
                      </p>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Publiez <strong>5 à 10 articles par semaine</strong> maximum pour un site existant, 2-3 pour un nouveau site.
                      </p>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        <strong>Relisez et enrichissez</strong> chaque article avant publication : ajoutez des exemples concrets, chiffres, et votre expertise.
                      </p>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Utilisez la génération bulk pour <strong>préparer votre pipeline</strong>, pas pour publier en masse immédiatement.
                      </p>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Conseils
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Utilisez des mots-cles longue traine (3-5 mots) pour de meilleurs resultats
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Configurez votre Brand Voice pour un ton coherent
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Les articles sont generes avec sources et images
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 shrink-0 mt-0.5">
                        <XCircle className="h-4 w-4 text-red-400" />
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Evitez les mots-cles trop generiques (ex: &quot;marketing&quot;)
                      </p>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            SEO INTELLIGENCE TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="intelligence" className="space-y-6">
          {/* Search card */}
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-gray-900">SEO Intelligence & Competitive Analysis</CardTitle>
                  <CardDescription className="text-gray-500">
                    Analyse complete de votre site, identification des concurrents et generation d&apos;une strategie SEO personnalisee
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-700 mb-2 block font-medium">
                  URL de votre site a analyser
                </Label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="https://votre-site.com"
                      value={intelligenceUrl}
                      onChange={(e) => setIntelligenceUrl(e.target.value)}
                      className="pl-10 bg-white/80 border-gray-200 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500/20 h-11"
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      if (!intelligenceUrl || !workspaceId) {
                        toast.error("Veuillez entrer une URL");
                        return;
                      }

                      setIsRunningIntelligence(true);
                      try {
                        const result = await runSEOIntelligence(workspaceId, intelligenceUrl);
                        if (result.success && result.data) {
                          setIntelligenceReport(result.data);
                          toast.success("Analyse SEO Intelligence terminee !");
                        } else {
                          toast.error(result.error || "Erreur lors de l'analyse");
                        }
                      } catch {
                        toast.error("Une erreur est survenue");
                      } finally {
                        setIsRunningIntelligence(false);
                      }
                    }}
                    disabled={isRunningIntelligence || !intelligenceUrl.trim()}
                    className="h-11 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm"
                  >
                    {isRunningIntelligence ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyse...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Lancer l&apos;analyse
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  L&apos;analyse peut prendre 1-2 minutes. Elle va scraper votre site, identifier vos concurrents et generer une strategie SEO complete.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Intelligence Results */}
          {intelligenceReport && (
            <div className="space-y-6">
              {/* Overview cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 shrink-0">
                        <Target className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Thematique</p>
                        <p className="text-gray-900 font-semibold mt-0.5">{intelligenceReport.userSite?.theme || "Non analyse"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="h-1 w-full bg-gradient-to-r from-teal-400 to-teal-500" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 shrink-0">
                        <BookOpen className="h-5 w-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mots-cles identifies</p>
                        <p className="text-3xl font-bold text-gray-900 mt-0.5">
                          {intelligenceReport.userSite?.intentKeywords?.length || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 shrink-0">
                        <BarChart3 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Concurrents analyses</p>
                        <p className="text-3xl font-bold text-gray-900 mt-0.5">
                          {intelligenceReport.competitorAnalysis?.length || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Competitor Radar */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                      <Target className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Radar de Competitivite</CardTitle>
                      <CardDescription className="text-gray-500">
                        Comparaison de votre site avec les 3 principaux concurrents
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {intelligenceReport.competitorAnalysis?.slice(0, 3).map((competitor: any, i: number) => {
                      const barColors = ["from-emerald-400 to-emerald-500", "from-teal-400 to-teal-500", "from-cyan-400 to-cyan-500"];
                      return (
                        <div key={i} className="group rounded-xl border border-gray-100 bg-white/50 p-4 hover:border-emerald-200 transition-colors">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
                                {i + 1}
                              </div>
                              <span className="text-gray-900 font-semibold">{competitor.domain}</span>
                            </div>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 font-semibold">
                              {competitor.authorityScore}/100
                            </Badge>
                          </div>
                          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${barColors[i]} transition-all duration-700 ease-out`}
                              style={{ width: `${competitor.authorityScore}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              {competitor.strengths?.length || 0} forces
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                              {competitor.weaknesses?.length || 0} faiblesses
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Keywords Table */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Tableau des Mots-Cles & Opportunites</CardTitle>
                      <CardDescription className="text-gray-500">
                        Mots-cles identifies avec difficulte et concurrents principaux
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="text-left p-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mot-cle</th>
                          <th className="text-left p-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Difficulte</th>
                          <th className="text-left p-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume</th>
                          <th className="text-left p-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Concurrent #1</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {intelligenceReport.marketInsights?.slice(0, 10).map((insight: any, i: number) => (
                          <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                            <td className="p-3.5 text-gray-900 font-medium">{insight.keyword}</td>
                            <td className="p-3.5">
                              <Badge
                                variant="outline"
                                className={
                                  insight.difficulty === "easy"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    : insight.difficulty === "medium"
                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                    : "bg-red-50 text-red-600 border-red-200"
                                }
                              >
                                {insight.difficulty === "easy" ? "Facile" : insight.difficulty === "medium" ? "Moyen" : "Difficile"}
                              </Badge>
                            </td>
                            <td className="p-3.5">
                              <span className={`text-sm font-medium ${
                                insight.volumeEstimate === "high" ? "text-emerald-600" :
                                insight.volumeEstimate === "medium" ? "text-amber-600" :
                                "text-gray-500"
                              }`}>
                                {insight.volumeEstimate === "high" ? "Eleve" : insight.volumeEstimate === "medium" ? "Moyen" : "Faible"}
                              </span>
                            </td>
                            <td className="p-3.5 text-gray-500 text-sm">
                              {insight.competitors?.[0]?.domain || "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Wins */}
              {intelligenceReport.strategy?.quickWins && intelligenceReport.strategy.quickWins.length > 0 && (
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-100">
                        <Zap className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <CardTitle className="text-gray-900">Quick Wins - Opportunites Faciles</CardTitle>
                        <CardDescription className="text-gray-500">
                          Mots-cles a faible difficulte avec fort potentiel
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {intelligenceReport.strategy.quickWins.slice(0, 10).map((win: any, i: number) => {
                        const gradients = [
                          "from-emerald-50 to-teal-50 border-emerald-100",
                          "from-teal-50 to-cyan-50 border-teal-100",
                          "from-emerald-50 to-green-50 border-emerald-100",
                          "from-cyan-50 to-emerald-50 border-cyan-100",
                        ];
                        return (
                          <div key={i} className={`rounded-xl p-4 bg-gradient-to-br ${gradients[i % gradients.length]} border hover:shadow-sm transition-shadow`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-white/80 text-emerald-700 border-emerald-200 shadow-sm">
                                {win.keyword}
                              </Badge>
                              <div className="flex items-center gap-1 ml-auto">
                                {Array.from({ length: 5 }).map((_, si) => (
                                  <div
                                    key={si}
                                    className={`h-1.5 w-3 rounded-full ${
                                      si < win.estimatedImpact ? "bg-amber-400" : "bg-gray-200"
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                            <p className="text-gray-700 text-sm leading-relaxed">{win.opportunity}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Strategic Checklist */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-gray-900">Checklist Strategique</CardTitle>
                      <CardDescription className="text-gray-500">
                        Actions prioritaires pour ameliorer votre SEO
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Technical Actions */}
                    {intelligenceReport.recommendations?.technical && intelligenceReport.recommendations.technical.length > 0 && (
                      <div>
                        <h4 className="text-gray-900 font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                          <AlertTriangle className="h-4 w-4 text-orange-400" />
                          Actions Techniques ({intelligenceReport.recommendations.technical.length})
                        </h4>
                        <div className="space-y-3">
                          {intelligenceReport.recommendations.technical.map((action: any, i: number) => (
                            <div key={i} className="group rounded-xl border border-gray-100 bg-white/60 p-4 hover:border-emerald-200 hover:bg-white/80 transition-all">
                              <div className="flex items-start gap-3">
                                <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 mt-0.5 ${
                                  action.priority === "high" ? "bg-red-100" :
                                  action.priority === "medium" ? "bg-amber-100" :
                                  "bg-gray-100"
                                }`}>
                                  <CheckCircle className={`h-3.5 w-3.5 ${
                                    action.priority === "high" ? "text-red-500" :
                                    action.priority === "medium" ? "text-amber-500" :
                                    "text-gray-400"
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-gray-900 font-medium text-sm">{action.action}</span>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${
                                        action.priority === "high"
                                          ? "bg-red-50 text-red-600 border-red-200"
                                          : action.priority === "medium"
                                          ? "bg-amber-50 text-amber-600 border-amber-200"
                                          : "bg-gray-50 text-gray-500 border-gray-200"
                                      }`}
                                    >
                                      {action.priority === "high" ? "Haute" : action.priority === "medium" ? "Moyenne" : "Basse"}
                                    </Badge>
                                  </div>
                                  <p className="text-gray-500 text-sm">{action.description}</p>
                                  {action.example && (
                                    <p className="text-gray-400 text-xs mt-1.5 italic">Exemple: {action.example}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Semantic Gaps */}
                    {intelligenceReport.recommendations?.semantic && intelligenceReport.recommendations.semantic.length > 0 && (
                      <div>
                        <h4 className="text-gray-900 font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                          <Lightbulb className="h-4 w-4 text-emerald-600" />
                          Gaps Semantiques ({intelligenceReport.recommendations.semantic.length})
                        </h4>
                        <div className="space-y-3">
                          {intelligenceReport.recommendations.semantic.map((gap: any, i: number) => (
                            <div key={i} className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 p-4 hover:shadow-sm transition-shadow">
                              <div className="flex items-start gap-2 mb-1.5">
                                <ArrowRight className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                <span className="text-gray-900 font-medium text-sm">{gap.topic}</span>
                              </div>
                              <p className="text-gray-500 text-sm ml-6">{gap.gap}</p>
                              <div className="flex items-start gap-1.5 ml-6 mt-1.5">
                                <Lightbulb className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-emerald-600 text-sm">{gap.recommendation}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* SWOT Analysis */}
              {intelligenceReport.strategy?.swot && (
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                      </div>
                      <CardTitle className="text-gray-900">Analyse SWOT SEO</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Strengths */}
                      <div className="rounded-xl p-5 bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200/60">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <h4 className="text-emerald-700 font-semibold">Forces</h4>
                        </div>
                        <ul className="space-y-2">
                          {intelligenceReport.strategy.swot.strengths?.map((s: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Weaknesses */}
                      <div className="rounded-xl p-5 bg-gradient-to-br from-red-50 to-rose-50 border border-red-200/60">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
                            <XCircle className="h-4 w-4 text-red-600" />
                          </div>
                          <h4 className="text-red-700 font-semibold">Faiblesses</h4>
                        </div>
                        <ul className="space-y-2">
                          {intelligenceReport.strategy.swot.weaknesses?.map((w: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Opportunities */}
                      <div className="rounded-xl p-5 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200/60">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                            <Lightbulb className="h-4 w-4 text-amber-600" />
                          </div>
                          <h4 className="text-amber-700 font-semibold">Opportunites</h4>
                        </div>
                        <ul className="space-y-2">
                          {intelligenceReport.strategy.swot.opportunities?.map((o: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Threats */}
                      <div className="rounded-xl p-5 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/60">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                          </div>
                          <h4 className="text-orange-700 font-semibold">Menaces</h4>
                        </div>
                        <ul className="space-y-2">
                          {intelligenceReport.strategy.swot.threats?.map((t: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            AUDIT TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="audit" className="space-y-6">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm">
                  <Search className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-gray-900">Audit SEO Instantane</CardTitle>
                  <CardDescription className="text-gray-500">
                    Analysez n&apos;importe quelle page et obtenez un score de 0 a 100
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="https://exemple.com/page"
                    value={auditUrl}
                    onChange={(e) => setAuditUrl(e.target.value)}
                    className="pl-10 bg-white/80 border-gray-200 text-gray-900 focus:border-emerald-500 focus:ring-emerald-500/20 h-11"
                  />
                </div>
                <Button
                  onClick={handleAudit}
                  disabled={isAuditing || isDepleted}
                  title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                  className="h-11 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm"
                >
                  {isAuditing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Analyser
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Audit Results */}
          {auditReport && (
            <div className="space-y-6">
              {/* Large animated score ring */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-8">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    {/* SVG Ring */}
                    <div className="relative h-40 w-40 shrink-0">
                      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 160 160">
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-gray-100"
                        />
                        <circle
                          cx="80"
                          cy="80"
                          r="70"
                          fill="none"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${(auditReport.score / 100) * 439.8} 439.8`}
                          className={`${getScoreRingColor(auditReport.score)} transition-all duration-1000 ease-out`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-5xl font-extrabold ${getScoreColor(auditReport.score)}`}>
                          {auditReport.score}
                        </span>
                        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">/100</span>
                      </div>
                    </div>

                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        Score SEO Global
                      </h3>
                      <p className="text-gray-500 mb-4 leading-relaxed">
                        {auditReport.score >= 80
                          ? "Excellent ! Votre page est bien optimisee pour le referencement."
                          : auditReport.score >= 60
                          ? "Correct, mais des ameliorations sont possibles pour gagner en visibilite."
                          : "Des optimisations importantes sont necessaires pour ameliorer votre positionnement."}
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                        {Object.values(auditReport)
                          .filter((v) => typeof v === "object" && v.issues)
                          .flatMap((v) => (v as { issues: string[] }).issues)
                          .slice(0, 3)
                          .map((issue, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="bg-red-50 text-red-600 border-red-200"
                            >
                              {issue}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Scores as horizontal bars */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900">Scores Detailles</CardTitle>
                  <CardDescription className="text-gray-500">
                    Performance pour chaque critere SEO
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {[
                      { name: "Titre", data: auditReport.title, icon: FileText },
                      { name: "Meta Description", data: auditReport.metaDescription, icon: BookOpen },
                      { name: "Titres (H1-H3)", data: auditReport.headings, icon: BarChart3 },
                      { name: "Images", data: auditReport.images, icon: Eye },
                      { name: "Liens", data: auditReport.links, icon: ExternalLink },
                      { name: "Contenu", data: auditReport.content, icon: FileText },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.name} className="group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 group-hover:bg-emerald-50 transition-colors">
                                <Icon className="h-3.5 w-3.5 text-gray-400 group-hover:text-emerald-500 transition-colors" />
                              </div>
                              <span className="text-sm font-medium text-gray-700">{item.name}</span>
                            </div>
                            <span className={`text-sm font-bold ${getScoreColor(item.data.score)}`}>
                              {item.data.score}/100
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getScoreBarColor(item.data.score)} transition-all duration-700 ease-out`}
                              style={{ width: `${item.data.score}%` }}
                            />
                          </div>
                          {/* Expandable issues */}
                          {item.data.issues.length > 0 && (
                            <div className="mt-2 space-y-1 pl-9">
                              {item.data.issues.map((issue, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs text-gray-500"
                                >
                                  <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                                  {issue}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            SANTÉ TECHNIQUE TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="technical" className="space-y-6">
          {/* Input */}
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-600" />
                Score de Santé Technique
              </CardTitle>
              <CardDescription>
                Analyse PageSpeed + Core Web Vitals + recommandations IA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  placeholder="https://votre-site.fr"
                  value={technicalUrl}
                  onChange={(e) => setTechnicalUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTechnicalAudit()}
                  className="bg-white/60 border-gray-200 text-gray-900"
                />
                <Button
                  onClick={handleTechnicalAudit}
                  disabled={isTechAuditing || !technicalUrl.trim()}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 whitespace-nowrap"
                >
                  {isTechAuditing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-2" />
                  )}
                  Analyser
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {technicalReport && (
            <div className="space-y-6">
              {/* Score + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm sm:col-span-1">
                  <CardContent className="pt-6 text-center">
                    <div
                      className={`text-5xl font-black mb-2 ${
                        technicalReport.performanceScore >= 90
                          ? "text-emerald-600"
                          : technicalReport.performanceScore >= 50
                          ? "text-amber-500"
                          : "text-red-500"
                      }`}
                    >
                      {technicalReport.performanceScore}
                    </div>
                    <p className="text-sm text-gray-500">Score Performance</p>
                    <Badge
                      className={`mt-2 ${
                        technicalReport.overallCategory === "FAST"
                          ? "bg-emerald-100 text-emerald-700"
                          : technicalReport.overallCategory === "AVERAGE"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {technicalReport.overallCategory === "FAST"
                        ? "Rapide"
                        : technicalReport.overallCategory === "AVERAGE"
                        ? "Moyen"
                        : technicalReport.overallCategory === "SLOW"
                        ? "Lent"
                        : "Inconnu"}
                    </Badge>
                  </CardContent>
                </Card>

                {/* Core Web Vitals */}
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm sm:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-gray-900">Core Web Vitals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          { key: "lcp", label: "LCP" },
                          { key: "tbt", label: "TBT" },
                          { key: "cls", label: "CLS" },
                          { key: "fcp", label: "FCP" },
                          { key: "speedIndex", label: "Speed Index" },
                          { key: "ttfb", label: "TTFB" },
                        ] as { key: keyof typeof technicalReport.vitals; label: string }[]
                      ).map(({ key, label }) => {
                        const vital = technicalReport.vitals[key];
                        return (
                          <div
                            key={key}
                            className={`flex items-center justify-between p-2 rounded-lg border ${
                              vital.status === "good"
                                ? "bg-emerald-50 border-emerald-200"
                                : vital.status === "needs-improvement"
                                ? "bg-amber-50 border-amber-200"
                                : "bg-red-50 border-red-200"
                            }`}
                          >
                            <span className="text-xs font-semibold text-gray-600">{label}</span>
                            <div className="text-right">
                              <span
                                className={`text-xs font-bold ${
                                  vital.status === "good"
                                    ? "text-emerald-700"
                                    : vital.status === "needs-improvement"
                                    ? "text-amber-700"
                                    : "text-red-700"
                                }`}
                              >
                                {vital.value}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Opportunities */}
              {technicalReport.opportunities.length > 0 && (
                <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Opportunités d&apos;optimisation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {technicalReport.opportunities.map((opp, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200/60"
                        >
                          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{opp.title}</p>
                            {opp.savings && (
                              <p className="text-xs text-amber-600 mt-0.5">Économie estimée: {opp.savings}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Recommendations */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-gray-900 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-emerald-600" />
                    Analyse IA & Recommandations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-white/50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {technicalReport.aiRecommendations}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    Analysé le {new Date(technicalReport.analyzedAt).toLocaleString("fr-FR")} · Mobile
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {!technicalReport && !isTechAuditing && (
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
              <CardContent className="text-center py-16">
                <Gauge className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Entrez une URL pour analyser sa santé technique</p>
                <p className="text-sm text-gray-400 mt-1">
                  PageSpeed Insights · Core Web Vitals · LCP · CLS · TBT
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TOPIC CLUSTER TAB
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="cluster" className="space-y-6">
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Network className="h-5 w-5 text-emerald-600" />
                Topic Cluster — 1 pilier → 5 articles satellites
              </CardTitle>
              <CardDescription>
                Entrez un mot-clé pilier → l&apos;IA conçoit le cluster SEO et lance la génération des 6 articles en parallèle
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Mot-clé pilier</label>
                  <Input
                    placeholder="Ex: marketing automation"
                    value={clusterKeyword}
                    onChange={(e) => setClusterKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateCluster()}
                    className="bg-white/60 border-gray-200 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Secteur / contexte (optionnel)</label>
                  <Input
                    placeholder="Ex: SaaS B2B, e-commerce, RH..."
                    value={clusterContext}
                    onChange={(e) => setClusterContext(e.target.value)}
                    className="bg-white/60 border-gray-200 text-gray-900"
                  />
                </div>
              </div>
              <Button
                onClick={handleGenerateCluster}
                disabled={isGeneratingCluster || !clusterKeyword.trim()}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                {isGeneratingCluster ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération du cluster…
                  </>
                ) : (
                  <>
                    <Network className="h-4 w-4 mr-2" />
                    Générer le Topic Cluster (6 articles)
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {cluster && (
            <div className="space-y-4">
              {/* Strategy */}
              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200/60 shadow-sm">
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">{cluster.strategy}</p>
                      {clusterBatchId && (
                        <p className="text-xs text-emerald-600">
                          ✓ 6 articles en génération — suivez l&apos;avancement dans &quot;Mes Articles&quot;
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pillar article */}
              <Card className="bg-white/70 backdrop-blur-sm border-emerald-300/60 shadow-sm ring-1 ring-emerald-200">
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 shrink-0">
                      <FileText className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-emerald-600">Article Pilier</span>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">3 000+ mots</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{cluster.pillarTitle}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{cluster.pillarKeyword}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Satellite articles */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cluster.supportingKeywords.map((sat, i) => (
                  <Card key={i} className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-2">
                        <div className="p-1.5 rounded-lg bg-gray-100 shrink-0">
                          <Link2 className="h-3.5 w-3.5 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Satellite {i + 1}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              sat.intent === "informational" ? "bg-sky-100 text-sky-700" :
                              sat.intent === "commercial" ? "bg-amber-100 text-amber-700" :
                              "bg-purple-100 text-purple-700"
                            }`}>
                              {sat.intent}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{sat.keyword}</p>
                          <p className="text-xs text-gray-500 mt-1">{sat.angle}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {!cluster && !isGeneratingCluster && (
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
              <CardContent className="text-center py-16">
                <Network className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Entrez un mot-clé pilier</p>
                <p className="text-sm text-gray-400 mt-1">
                  L&apos;IA conçoit l&apos;architecture du cluster et lance la génération des 6 articles
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Stratégie Tab ─── */}
        <TabsContent value="strategy" className="space-y-6">
          {workspaceId && <SeoStrategyTab workspaceId={workspaceId} />}
        </TabsContent>

      </Tabs>

      {/* ─── Preview Dialog ─── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-white/95 backdrop-blur-xl border-gray-200/60 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-lg">Previsualisation de l&apos;article</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] prose prose-gray max-w-none text-gray-700">
            <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {previewContent}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(previewContent);
                toast.success("Contenu copie dans le presse-papier");
              }}
              className="border-gray-200 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copier le contenu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
