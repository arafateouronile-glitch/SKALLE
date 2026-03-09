"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Brain,
  Loader2,
  Plus,
  Target,
  TrendingUp,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import {
  getLatestAudit,
  triggerSeoAnalysis,
  type SEOAuditData,
} from "@/actions/seo-actions";
import { toast } from "sonner";

interface SeoStrategyTabProps {
  workspaceId: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-500/20 text-green-700 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-700 border-yellow-500/30",
  hard: "bg-red-500/20 text-red-700 border-red-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/20 text-red-700",
  medium: "bg-yellow-500/20 text-yellow-700",
  low: "bg-gray-500/20 text-gray-700",
};

function ScoreGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-emerald-600" : score >= 40 ? "text-yellow-500" : "text-red-500";
  const barColor =
    score >= 70
      ? "from-emerald-500 to-teal-500"
      : score >= 40
      ? "from-yellow-400 to-orange-400"
      : "from-red-400 to-red-500";

  return (
    <div className="text-center">
      <div
        className={`text-5xl font-extrabold ${color}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </div>
      <p className="text-xs text-gray-400 mt-1">/100</p>
      <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function SeoStrategyTab({ workspaceId }: SeoStrategyTabProps) {
  const [audit, setAudit] = useState<SEOAuditData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [newAuditDialogOpen, setNewAuditDialogOpen] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());

  const loadAudit = async () => {
    try {
      const data = await getLatestAudit(workspaceId);
      setAudit(data);
    } catch {
      // no audit yet
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [workspaceId]);

  const handleRunAudit = async () => {
    if (!auditUrl.trim()) {
      toast.error("Saisissez une URL");
      return;
    }
    setIsRunningAudit(true);
    try {
      const result = await triggerSeoAnalysis(workspaceId, auditUrl.trim());
      if (result.success) {
        toast.success("Analyse lancée ! Rechargement dans 5 secondes...");
        setNewAuditDialogOpen(false);
        setTimeout(() => loadAudit(), 5000);
      } else {
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsRunningAudit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 mb-5 shadow-sm">
            <Brain className="h-9 w-9 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Aucune analyse SEO disponible
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
            Lancez votre première analyse pour obtenir votre score SEO, vos opportunités de mots-clés et un plan d'action personnalisé.
          </p>
          <Dialog open={newAuditDialogOpen} onOpenChange={setNewAuditDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Lancer une analyse SEO
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200">
              <DialogHeader>
                <DialogTitle>Nouvelle analyse SEO</DialogTitle>
                <DialogDescription>
                  Entrez l'URL de votre site pour analyser son positionnement SEO
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>URL du site</Label>
                  <Input
                    placeholder="https://votresite.com"
                    value={auditUrl}
                    onChange={(e) => setAuditUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRunAudit()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewAuditDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleRunAudit}
                  disabled={isRunningAudit}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600"
                >
                  {isRunningAudit ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Analyser
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  const actionPlan = audit.actionPlan;
  const targetKeywords = audit.targetKeywords ?? [];
  const competitors = audit.competitors ?? [];

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Analyse de{" "}
            <span className="font-medium text-gray-800">{audit.url}</span> ·{" "}
            {new Date(audit.createdAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <Dialog open={newAuditDialogOpen} onOpenChange={setNewAuditDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle analyse
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle>Nouvelle analyse SEO</DialogTitle>
              <DialogDescription>
                Entrez l'URL de votre site pour une nouvelle analyse
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>URL du site</Label>
                <Input
                  placeholder="https://votresite.com"
                  value={auditUrl}
                  onChange={(e) => setAuditUrl(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewAuditDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleRunAudit}
                disabled={isRunningAudit}
                className="bg-gradient-to-r from-emerald-600 to-teal-600"
              >
                {isRunningAudit ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Analyser
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Score + KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Score SEO Global</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreGauge score={audit.globalScore} />
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">{targetKeywords.length}</p>
              <p className="text-xs text-gray-500 mt-1">Mots-clés analysés</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">
                {targetKeywords.filter((k) => k.difficulty === "easy").length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Opportunités faciles</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-500">
                {actionPlan?.quickWins?.length ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Quick Wins</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keywords + Competitors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target Keywords */}
        {targetKeywords.length > 0 && (
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-600" />
                Mots-clés prioritaires
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {targetKeywords.slice(0, 8).map((kw, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/50 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {kw.priority && (
                      <span className="text-yellow-400 text-xs shrink-0">★</span>
                    )}
                    <span className="text-sm text-gray-800 truncate">{kw.term}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs capitalize">
                      {kw.intent}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${DIFFICULTY_COLORS[kw.difficulty] ?? ""}`}
                    >
                      {kw.difficulty}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Competitors */}
        {competitors.length > 0 && (
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-600" />
                Concurrents analysés
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {competitors.slice(0, 4).map((comp, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{comp.domain}</span>
                    <Badge variant="outline" className="text-xs">
                      Score: {comp.authorityScore}
                    </Badge>
                  </div>
                  <Progress value={comp.authorityScore} className="h-1.5 bg-gray-100" />
                  {comp.strength.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {comp.strength.slice(0, 3).map((s, j) => (
                        <span
                          key={j}
                          className="text-[11px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 border border-emerald-100"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Plan */}
      {actionPlan && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Wins */}
          {actionPlan.quickWins?.length > 0 && (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-400" />
                  Quick Wins
                </CardTitle>
                <CardDescription>Opportunités à fort impact, faible effort</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionPlan.quickWins.map((win, i) => (
                  <div key={i} className="bg-yellow-50/60 rounded-lg p-3 border border-yellow-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{win.keyword}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${DIFFICULTY_COLORS[win.difficulty] ?? ""}`}
                      >
                        {win.difficulty}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">{win.opportunity}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs text-emerald-600 font-medium">
                        Impact estimé: {win.estimatedImpact}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Technical Actions */}
          {actionPlan.technicalActions?.length > 0 && (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Plan d'action technique
                </CardTitle>
                <CardDescription>Cliquez pour marquer comme fait</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {actionPlan.technicalActions.slice(0, 6).map((action, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setCompletedActions((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className={`w-full text-left flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all ${
                      completedActions.has(i)
                        ? "bg-green-50/60 border border-green-100 opacity-60"
                        : "bg-white/50 border border-gray-100 hover:border-emerald-200"
                    }`}
                  >
                    <div
                      className={`mt-0.5 shrink-0 ${
                        completedActions.has(i) ? "text-green-500" : "text-gray-400"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            completedActions.has(i)
                              ? "line-through text-gray-400"
                              : "text-gray-800"
                          }`}
                        >
                          {action.action}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${PRIORITY_COLORS[action.priority] ?? ""}`}
                        >
                          {action.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Semantic Gaps + SWOT */}
      {actionPlan && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Semantic Gaps */}
          {actionPlan.semanticGap?.length > 0 && (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-violet-500" />
                  Lacunes sémantiques
                </CardTitle>
                <CardDescription>Sujets couverts par vos concurrents, pas vous</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionPlan.semanticGap.slice(0, 5).map((gap, i) => (
                  <div key={i} className="bg-violet-50/60 rounded-lg p-3 border border-violet-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-800">{gap.topic}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-1.5">{gap.recommendation}</p>
                    <div className="flex flex-wrap gap-1">
                      {gap.competitors.slice(0, 3).map((c, j) => (
                        <span
                          key={j}
                          className="text-[11px] bg-white text-gray-600 rounded px-1.5 py-0.5 border border-gray-200"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* SWOT */}
          {actionPlan.swot && (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-emerald-600" />
                  Analyse SWOT
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  { label: "Forces", items: actionPlan.swot.strengths, color: "bg-emerald-50 border-emerald-100 text-emerald-700" },
                  { label: "Faiblesses", items: actionPlan.swot.weaknesses, color: "bg-red-50 border-red-100 text-red-700" },
                  { label: "Opportunités", items: actionPlan.swot.opportunities, color: "bg-yellow-50 border-yellow-100 text-yellow-700" },
                  { label: "Menaces", items: actionPlan.swot.threats, color: "bg-gray-50 border-gray-200 text-gray-700" },
                ].map(({ label, items, color }) => (
                  <div key={label} className={`rounded-lg p-3 border ${color}`}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1.5 opacity-80">
                      {label}
                    </p>
                    <ul className="space-y-1">
                      {(items ?? []).slice(0, 3).map((item, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
