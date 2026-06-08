"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, Sparkles, Rocket, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { initializeStrategy, startContentFactory } from "@/actions/social-factory";
import { getWorkspaceBrandType } from "@/actions/workspace";
import type { MarketingPersona, DailyContext } from "@/lib/services/social/content-factory";
import { useCreditsContext } from "@/components/providers/credits-provider";

const NETWORKS_OPTIONS = [
  { value: "LINKEDIN", label: "LinkedIn", icon: "💼" },
  { value: "X", label: "X (Twitter)", icon: "𝕏" },
  { value: "INSTAGRAM", label: "Instagram", icon: "📸" },
  { value: "TIKTOK", label: "TikTok", icon: "🎵" },
  { value: "FACEBOOK", label: "Facebook", icon: "👥" },
];

const OBJECTIVES_OPTIONS = [
  { value: "leads", label: "Génération de leads" },
  { value: "authority", label: "Autorité / Expertise" },
  { value: "awareness", label: "Notoriété de marque" },
  { value: "engagement", label: "Engagement communauté" },
  { value: "traffic", label: "Trafic vers le site" },
  { value: "sales", label: "Ventes directes" },
];

const BRAND_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  PERSONAL_BRAND: { label: "Personal Brand", icon: "👤" },
  B2B: { label: "B2B", icon: "🏢" },
  B2C: { label: "B2C", icon: "🛍️" },
};

const MOOD_OPTIONS = [
  { value: "Motivé", emoji: "⚡" },
  { value: "Réfléchi", emoji: "🧠" },
  { value: "En challenge", emoji: "💪" },
  { value: "En célébration", emoji: "🎉" },
  { value: "Inspiré", emoji: "✨" },
];

interface StrategyFormProps {
  workspaceId: string;
  existingPersona?: MarketingPersona | null;
  onPlanCreated: (contentPlanId: string) => void;
}

export function StrategyForm({
  workspaceId,
  existingPersona,
  onPlanCreated,
}: StrategyFormProps) {
  const { isDepleted } = useCreditsContext();
  const [vision, setVision] = useState("");
  const [niche, setNiche] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [networks, setNetworks] = useState<string[]>(["LINKEDIN", "X", "INSTAGRAM", "TIKTOK", "FACEBOOK"]);
  const [persona, setPersona] = useState<MarketingPersona | null>(existingPersona ?? null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandType, setBrandType] = useState<string | null>(null);
  const [showDailyContext, setShowDailyContext] = useState(false);
  const [dailyContext, setDailyContext] = useState<DailyContext>({});

  useEffect(() => {
    getWorkspaceBrandType(workspaceId).then(setBrandType);
  }, [workspaceId]);

  const toggleObjective = (value: string) => {
    setObjectives((prev) =>
      prev.includes(value) ? prev.filter((o) => o !== value) : [...prev, value]
    );
  };

  const toggleNetwork = (value: string) => {
    setNetworks((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev; // garder au moins 1
        return prev.filter((n) => n !== value);
      }
      return [...prev, value];
    });
  };

  const handleInitStrategy = async () => {
    setIsInitializing(true);
    try {
      const result = await initializeStrategy(workspaceId);
      if (result.success && result.data) {
        setPersona(result.data);
        toast.success("Stratégie de marque initialisée !");
      } else {
        toast.error(result.error ?? "Erreur lors de l'initialisation");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleGenerate = async () => {
    if (!vision.trim()) {
      toast.error("Veuillez entrer votre vision");
      return;
    }
    if (!niche.trim()) {
      toast.error("Veuillez entrer votre niche");
      return;
    }
    if (objectives.length === 0) {
      toast.error("Sélectionnez au moins un objectif");
      return;
    }

    const now = new Date();
    const nextMonth = now.getMonth() + 2; // +2 car getMonth() est 0-indexed
    const year = nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();
    const month = nextMonth > 12 ? nextMonth - 12 : nextMonth;

    setIsGenerating(true);
    try {
      const hasDailyCtx = Object.values(dailyContext).some((v) => v?.trim());
      const result = await startContentFactory(workspaceId, {
        vision,
        niche,
        objectives,
        networks,
        month,
        year,
        dailyContext: hasDailyCtx ? dailyContext : undefined,
      });

      if (result.success && result.contentPlanId) {
        toast.success("Génération lancée ! Suivi en cours...");
        onPlanCreated(result.contentPlanId);
      } else {
        toast.error(result.error ?? "Erreur lors du lancement");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {brandType && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Prompts optimisés pour :</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium text-xs">
            {BRAND_TYPE_LABELS[brandType]?.icon} {BRAND_TYPE_LABELS[brandType]?.label}
          </span>
          <Link href="/marketing-os/settings" className="text-xs text-gray-400 hover:text-emerald-600 underline underline-offset-2">
            Modifier
          </Link>
        </div>
      )}
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. La stratégie et la génération de contenu sont désactivées.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* Brand Strategy Init */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-emerald-600" />
            Marketing Persona
          </CardTitle>
          <CardDescription>
            Analyse automatique de votre site web pour extraire votre identité de marque
          </CardDescription>
        </CardHeader>
        <CardContent>
          {persona ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Ton</p>
                  <p className="text-sm">{persona.tone}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Audience cible</p>
                  <p className="text-sm">{persona.targetAudience}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Proposition de valeur</p>
                  <p className="text-sm">{persona.uniqueValueProp}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {persona.services.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Piliers de contenu</p>
                <div className="flex flex-wrap gap-1">
                  {persona.contentPillars.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInitStrategy}
                disabled={isInitializing || isDepleted}
                title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
              >
                {isInitializing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Recalculer
              </Button>
            </div>
          ) : (
            <Button onClick={handleInitStrategy} disabled={isInitializing || isDepleted} title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}>
              {isInitializing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Initialiser la stratégie de marque
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Content Strategy Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-emerald-600" />
            Stratégie de contenu
          </CardTitle>
          <CardDescription>
            Définissez votre vision pour générer 30 posts optimisés pour le mois prochain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vision">Vision / Mission</Label>
            <Textarea
              id="vision"
              placeholder="Ex: Aider les PME à automatiser leur marketing grâce à l'IA..."
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="niche">Niche / Secteur</Label>
            <Input
              id="niche"
              placeholder="Ex: Marketing digital, SaaS B2B, E-commerce..."
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Objectifs (sélectionnez 1 à 3)</Label>
            <div className="flex flex-wrap gap-2">
              {OBJECTIVES_OPTIONS.map((obj) => (
                <Badge
                  key={obj.value}
                  variant={objectives.includes(obj.value) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleObjective(obj.value)}
                >
                  {obj.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Réseaux & canaux</Label>
            <div className="flex flex-wrap gap-2">
              {NETWORKS_OPTIONS.map((net) => (
                <Badge
                  key={net.value}
                  variant={networks.includes(net.value) ? "default" : "outline"}
                  className="cursor-pointer transition-colors select-none"
                  onClick={() => toggleNetwork(net.value)}
                >
                  <span className="mr-1">{net.icon}</span>
                  {net.label}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-gray-400">Du contenu sera généré uniquement pour les réseaux sélectionnés</p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !vision.trim() || !niche.trim() || objectives.length === 0 || isDepleted}
            title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Générer 30 posts pour le mois prochain
          </Button>
        </CardContent>
      </Card>

      {/* Daily Context Card */}
      <Card className="border-violet-100">
        <CardHeader
          className="cursor-pointer select-none pb-3"
          onClick={() => setShowDailyContext((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-violet-500" />
              <div>
                <CardTitle className="text-base">Contexte du jour</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Partagez votre actualité pour personnaliser les posts générés
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {Object.values(dailyContext).some((v) => v?.trim()) && (
                <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700 border-violet-200">
                  Actif
                </Badge>
              )}
              {showDailyContext ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
        </CardHeader>

        {showDailyContext && (
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Qu&apos;avez-vous accompli récemment ?
                <span className="ml-1 font-normal text-gray-400">(optionnel)</span>
              </Label>
              <Textarea
                placeholder="Ex: J'ai signé un nouveau client, lancé une fonctionnalité, terminé une formation..."
                value={dailyContext.todayAccomplishment ?? ""}
                onChange={(e) =>
                  setDailyContext((prev) => ({ ...prev, todayAccomplishment: e.target.value }))
                }
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Quel insight ou apprentissage récent à partager ?
                <span className="ml-1 font-normal text-gray-400">(optionnel)</span>
              </Label>
              <Textarea
                placeholder="Ex: J'ai réalisé que les emails courts convertissent 3x mieux, j'ai découvert une nouvelle approche..."
                value={dailyContext.recentInsight ?? ""}
                onChange={(e) =>
                  setDailyContext((prev) => ({ ...prev, recentInsight: e.target.value }))
                }
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Quelle est votre énergie du moment ?</Label>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((mood) => (
                  <Badge
                    key={mood.value}
                    variant={dailyContext.currentMood === mood.value ? "default" : "outline"}
                    className={`cursor-pointer transition-colors text-sm py-1.5 px-3 ${
                      dailyContext.currentMood === mood.value
                        ? "bg-violet-600 hover:bg-violet-700 border-violet-600"
                        : "hover:border-violet-300 hover:text-violet-700"
                    }`}
                    onClick={() =>
                      setDailyContext((prev) => ({
                        ...prev,
                        currentMood:
                          prev.currentMood === mood.value ? undefined : mood.value,
                      }))
                    }
                  >
                    {mood.emoji} {mood.value}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Une actualité de votre secteur à commenter ?
                <span className="ml-1 font-normal text-gray-400">(optionnel)</span>
              </Label>
              <Textarea
                placeholder="Ex: Google vient de lancer une mise à jour majeure, un concurrent a levé des fonds..."
                value={dailyContext.industryNews ?? ""}
                onChange={(e) =>
                  setDailyContext((prev) => ({ ...prev, industryNews: e.target.value }))
                }
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Un projet ou objectif en cours à mettre en avant ?
                <span className="ml-1 font-normal text-gray-400">(optionnel)</span>
              </Label>
              <Textarea
                placeholder="Ex: Je lance un programme de formation en septembre, je développe un nouveau service..."
                value={dailyContext.currentProject ?? ""}
                onChange={(e) =>
                  setDailyContext((prev) => ({ ...prev, currentProject: e.target.value }))
                }
                rows={2}
                className="text-sm"
              />
            </div>

            <p className="text-xs text-gray-400 border-t pt-3">
              Ces informations sont injectées dans les prompts IA pour que vos posts reflètent votre actualité réelle — plus authentiques, plus engageants.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
