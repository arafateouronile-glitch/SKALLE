"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Zap,
  ImageIcon,
  SquareIcon,
  SmartphoneIcon,
  MonitorIcon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-workspace";
import { useCreditsContext } from "@/components/providers/credits-provider";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AdVariant {
  id: string;
  angle: string;
  framework: string;
  primaryText: string;
  headline: string;
  subheadline: string;
  imagePrompt: string;
  backgroundUrl: string | null;
  squareUrl: string | null;
  storyUrl: string | null;
  landscapeUrl: string | null;
  metaAdId: string | null;
  exportedAt: string | null;
}

interface CompetitorInsights {
  topHooks: string[];
  dominantFrameworks: string[];
  avgDaysActive: number;
  adsAnalyzed: number;
  usedFallback: boolean;
}

interface Campaign {
  id: string;
  niche: string;
  status: "GENERATING" | "READY" | "FAILED" | "EXPORTED";
  errorMessage: string | null;
  competitorInsights: CompetitorInsights | null;
  variants: AdVariant[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STEPS
// ═══════════════════════════════════════════════════════════════════════════

const PIPELINE_STEPS = [
  { icon: "🕵️", label: "Analyse des concurrents", desc: "Scrape des pubs actives sur Meta Ad Library" },
  { icon: "✍️", label: "Copywriting IA", desc: "3 angles marketing + textes (GPT-4o)" },
  { icon: "🎨", label: "Génération visuelle", desc: "Fonds HD via Nano Banana (Imagen 3)" },
  { icon: "📐", label: "Déclinaison formats", desc: "Carré, Story, Paysage via Bannerbear" },
  { icon: "💾", label: "Sauvegarde", desc: "Stockage des créas prêtes à l'emploi" },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function VariantCard({ variant, index }: { variant: AdVariant; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [activeFormat, setActiveFormat] = useState<"square" | "story" | "landscape">("square");

  const formats = {
    square: { label: "Carré 1:1", icon: SquareIcon, url: variant.squareUrl },
    story: { label: "Story 9:16", icon: SmartphoneIcon, url: variant.storyUrl },
    landscape: { label: "Paysage 16:9", icon: MonitorIcon, url: variant.landscapeUrl },
  };

  const currentUrl = formats[activeFormat].url ?? variant.backgroundUrl;

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié !`));
  }

  const frameworkColors: Record<string, string> = {
    AIDA: "bg-blue-100 text-blue-700",
    PAS: "bg-orange-100 text-orange-700",
    BRIDGE: "bg-purple-100 text-purple-700",
  };

  return (
    <Card className="border-2 hover:border-primary/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {index + 1}
            </span>
            <div>
              <CardTitle className="text-base">{variant.angle}</CardTitle>
              <Badge
                variant="outline"
                className={`mt-0.5 text-xs ${frameworkColors[variant.framework] ?? "bg-gray-100 text-gray-700"}`}
              >
                {variant.framework}
              </Badge>
            </div>
          </div>
          {variant.exportedAt && (
            <Badge className="bg-green-100 text-green-700 shrink-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Exporté Meta
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Image preview avec sélecteur de format */}
        <div className="space-y-2">
          <div className="flex gap-1">
            {(["square", "story", "landscape"] as const).map((fmt) => {
              const F = formats[fmt];
              return (
                <button
                  key={fmt}
                  onClick={() => setActiveFormat(fmt)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    activeFormat === fmt
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <F.icon className="h-3 w-3" />
                  {F.label}
                </button>
              );
            })}
          </div>

          {currentUrl ? (
            <div className="relative overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt={`${variant.angle} — ${formats[activeFormat].label}`}
                className="w-full object-cover max-h-56"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm">
              <ImageIcon className="h-5 w-5 mr-2 opacity-50" />
              Image non générée
            </div>
          )}
        </div>

        {/* Headline + subheadline */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
                Headline
              </p>
              <p className="font-semibold text-sm leading-tight">{variant.headline}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => copyText(variant.headline, "Headline")}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">{variant.subheadline}</p>
        </div>

        {/* Primary text (collapsible) */}
        <div className="space-y-1">
          <button
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((e) => !e)}
          >
            <span>Texte du post Facebook</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <div className="relative">
              <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                {variant.primaryText}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 h-6 text-xs gap-1"
                onClick={() => copyText(variant.primaryText, "Texte du post")}
              >
                <Copy className="h-3 w-3" />
                Copier
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {currentUrl && (
            <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                Ouvrir image
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════

export default function SuperscaleAdsPage() {
  const { workspaceId } = useWorkspace();
  const { isDepleted } = useCreditsContext();
  const [niche, setNiche] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling pendant la génération
  useEffect(() => {
    if (!campaign || campaign.status !== "GENERATING") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/superscale-ads/${campaign.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as Campaign;
        setCampaign(data);
        // Simuler la progression des étapes
        setCurrentStep((s) => Math.min(s + 1, PIPELINE_STEPS.length - 1));
      } catch {
        // ignore network errors during polling
      }
    }, 4000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [campaign?.id, campaign?.status]);

  async function handleLaunch() {
    if (!niche.trim()) {
      toast.error("Décris ton produit ou service");
      return;
    }
    if (!workspaceId) {
      toast.error("Workspace non chargé, réessaie dans un instant");
      return;
    }
    if (isDepleted) {
      toast.error("Crédits insuffisants (50 crédits requis)");
      return;
    }

    setIsLaunching(true);
    setCurrentStep(0);
    setCampaign(null);

    try {
      const res = await fetch("/api/superscale-ads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim(), workspaceId }),
      });

      const data = (await res.json()) as { campaignId?: string; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors du lancement");
        return;
      }

      // Créer une campagne locale pour démarrer le polling
      setCampaign({
        id: data.campaignId!,
        niche: niche.trim(),
        status: "GENERATING",
        errorMessage: null,
        competitorInsights: null,
        variants: [],
        createdAt: new Date().toISOString(),
      });

      toast.success("Pipeline lancé ! Allez prendre un café ☕");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setIsLaunching(false);
    }
  }

  function handleReset() {
    setCampaign(null);
    setCurrentStep(0);
    setNiche("");
  }

  const isGenerating = campaign?.status === "GENERATING";
  const isReady = campaign?.status === "READY";
  const isFailed = campaign?.status === "FAILED";

  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Superscale Ad Agent</h1>
          <Badge className="bg-primary/10 text-primary border-0">50 crédits</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          De l&apos;idée à la créa Facebook/Instagram prête à publier — en un prompt.
          L&apos;IA analyse tes concurrents, rédige les textes et génère les visuels déclinés en 3 formats.
        </p>
      </div>

      {/* Input */}
      {!isGenerating && !isReady && !isFailed && (
        <Card className="border-2 border-dashed border-primary/30">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Décris ton produit ou service
              </label>
              <Textarea
                placeholder="Ex: Je vends un logiciel de comptabilité pour freelances qui gagne 2h par semaine..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                rows={3}
                className="resize-none text-sm"
                disabled={isLaunching}
              />
              <p className="text-xs text-muted-foreground">
                Plus tu es précis (cible, bénéfice clé, prix), meilleures seront les créas.
              </p>
            </div>
            <Button
              onClick={handleLaunch}
              disabled={isLaunching || !niche.trim() || isDepleted || !workspaceId}
              className="w-full gap-2"
              size="lg"
            >
              {isLaunching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lancement...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer mes publicités
                </>
              )}
            </Button>
            {isDepleted && (
              <p className="text-xs text-center text-destructive">
                Crédits insuffisants. Upgradez votre plan pour accéder au Superscale Agent.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline Progress */}
      {(isGenerating || isReady || isFailed) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {isReady && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {isFailed && <XCircle className="h-4 w-4 text-destructive" />}
                {isGenerating && "Pipeline en cours..."}
                {isReady && `Campagne prête — "${campaign?.niche}"`}
                {isFailed && "Échec du pipeline"}
              </CardTitle>
              {(isReady || isFailed) && (
                <Button variant="outline" size="sm" className="gap-1" onClick={handleReset}>
                  <RefreshCw className="h-3 w-3" />
                  Nouvelle campagne
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = isReady || (isGenerating && i < currentStep);
                const isActive = isGenerating && i === currentStep;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                      isActive
                        ? "bg-primary/5 border border-primary/20"
                        : isDone
                          ? "text-muted-foreground"
                          : "text-muted-foreground/40"
                    }`}
                  >
                    <span className="text-base">{step.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${isDone ? "line-through opacity-50" : ""}`}>
                        {step.label}
                      </span>
                      {isActive && (
                        <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                      )}
                    </div>
                    {isDone && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  </div>
                );
              })}
            </div>

            {isFailed && campaign?.errorMessage && (
              <div className="mt-3 rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs text-destructive">
                {campaign.errorMessage}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Competitor Insights */}
      {isReady && campaign?.competitorInsights && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-2xl font-bold">{campaign.competitorInsights.adsAnalyzed}</p>
            <p className="text-xs text-muted-foreground">Pubs analysées</p>
          </Card>
          <Card className="p-3">
            <p className="text-2xl font-bold">{campaign.competitorInsights.avgDaysActive}j</p>
            <p className="text-xs text-muted-foreground">Durée moy. active</p>
          </Card>
          <Card className="p-3">
            <p className="text-sm font-semibold truncate">
              {campaign.competitorInsights.dominantFrameworks.join(", ") || "—"}
            </p>
            <p className="text-xs text-muted-foreground">Frameworks gagnants</p>
          </Card>
          <Card className="p-3">
            <p className="text-2xl font-bold">{campaign.variants.length}</p>
            <p className="text-xs text-muted-foreground">Variantes générées</p>
          </Card>
        </div>
      )}

      {/* Results */}
      {isReady && campaign && campaign.variants.length > 0 && (
        <div className="space-y-4">
          <Tabs defaultValue="variants">
            <TabsList>
              <TabsTrigger value="variants">
                Créatifs ({campaign.variants.length})
              </TabsTrigger>
              {campaign.competitorInsights?.topHooks?.length ? (
                <TabsTrigger value="insights">Accroches concurrents</TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="variants" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {campaign.variants.map((variant, i) => (
                  <VariantCard key={variant.id} variant={variant} index={i} />
                ))}
              </div>
            </TabsContent>

            {campaign.competitorInsights?.topHooks?.length ? (
              <TabsContent value="insights" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Top hooks du marché — &quot;{campaign.niche}&quot;
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {campaign.competitorInsights.topHooks.map((hook, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                        <p className="text-sm">{hook}</p>
                      </div>
                    ))}
                    {campaign.competitorInsights.usedFallback && (
                      <p className="text-xs text-amber-600 mt-2">
                        * Données de démo — configurez META_FB_ACCESS_TOKEN pour des données réelles.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}
    </div>
  );
}
