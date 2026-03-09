"use client";

import { useState } from "react";
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
import {
  Loader2,
  Megaphone,
  Download,
  TrendingUp,
  Users,
  Target,
} from "lucide-react";
import {
  generateCampaignPlan,
  type CampaignPlan,
  type CampaignDay,
} from "@/actions/content-campaign";
import { toast } from "sonner";

const BUSINESS_OBJECTIVES = [
  { value: "Générer des leads B2B", label: "Génération de leads B2B" },
  { value: "Augmenter la notoriété de marque", label: "Notoriété de marque" },
  { value: "Lancer un nouveau produit", label: "Lancement produit" },
  { value: "Fidéliser les clients existants", label: "Fidélisation clients" },
  { value: "Augmenter les ventes e-commerce", label: "Ventes e-commerce" },
  { value: "Recruter des talents", label: "Recrutement" },
] as const;

const FUNNEL_COLORS: Record<string, string> = {
  TOFU: "bg-blue-100 text-blue-700 border-blue-200",
  MOFU: "bg-yellow-100 text-yellow-700 border-yellow-200",
  BOFU: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const CHANNEL_COLORS: Record<string, string> = {
  Blog: "text-emerald-600",
  LinkedIn: "text-blue-600",
  X: "text-gray-900",
  Instagram: "text-orange-500",
  Newsletter: "text-purple-600",
  TikTok: "text-pink-500",
};

function exportToCSV(plan: CampaignPlan) {
  const headers = ["Jour", "Canal", "Type", "Sujet", "CTA", "Funnel"];
  const rows = plan.days.map((d) => [
    d.day,
    d.channel,
    d.contentType,
    `"${d.topic.replace(/"/g, '""')}"`,
    `"${d.cta.replace(/"/g, '""')}"`,
    d.funnel,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campagne-${plan.objective.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Plan exporté en CSV");
}

export function CampaignTab() {
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [keywords, setKeywords] = useState("");
  const [brandTone, setBrandTone] = useState("professionnel et accessible");
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [funnelFilter, setFunnelFilter] = useState<string>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");

  const handleGenerate = async () => {
    if (!objective.trim() || !audience.trim()) {
      toast.error("Objectif et audience requis");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateCampaignPlan({
        objective: objective.trim(),
        audience: audience.trim(),
        keywords: keywords.trim(),
        brandTone: brandTone.trim() || "professionnel et accessible",
      });
      if (result.success && result.data) {
        setPlan(result.data);
        toast.success(`Plan 30 jours généré ! (${result.data.days.length} actions)`);
      } else {
        toast.error(result.error || "Erreur lors de la génération");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredDays = plan?.days.filter((d) => {
    if (funnelFilter !== "ALL" && d.funnel !== funnelFilter) return false;
    if (channelFilter !== "ALL" && d.channel !== channelFilter) return false;
    return true;
  }) ?? [];

  const channels = plan ? [...new Set(plan.days.map((d) => d.channel))] : [];

  return (
    <div className="space-y-6">
      {/* Form */}
      {!plan ? (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-emerald-600" />
              Planificateur de campagne 30 jours
            </CardTitle>
            <CardDescription>
              L'IA génère un plan de contenu cross-canal complet avec distribution TOFU/MOFU/BOFU
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-700">Objectif business</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {BUSINESS_OBJECTIVES.map((obj) => (
                  <button
                    key={obj.value}
                    type="button"
                    onClick={() => setObjective(obj.value)}
                    className={`text-sm rounded-lg px-3 py-2 border text-left transition-all ${
                      objective === obj.value
                        ? "bg-emerald-50 border-emerald-400 text-emerald-700 font-medium"
                        : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50"
                    }`}
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Ou décrivez votre objectif..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="bg-white/60 border-gray-200 mt-2"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-gray-700">
                  <Users className="h-3.5 w-3.5 inline mr-1.5" />
                  Audience cible
                </Label>
                <Textarea
                  placeholder="ex: Directeurs Marketing PME SaaS B2B, 30-50 ans, cherchant à automatiser leur marketing..."
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  rows={3}
                  className="bg-white/60 border-gray-200 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700">
                  <Target className="h-3.5 w-3.5 inline mr-1.5" />
                  Mots-clés / thèmes
                </Label>
                <Textarea
                  placeholder="ex: marketing automation, CRM, productivité, IA, growth hacking..."
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  rows={3}
                  className="bg-white/60 border-gray-200 resize-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">Ton de marque</Label>
              <Input
                placeholder="ex: professionnel et accessible, expert et bienveillant..."
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-11"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Génération en cours... (~30s)
                </>
              ) : (
                <>
                  <Megaphone className="h-4 w-4 mr-2" />
                  Générer le plan 30 jours
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Plan header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Plan généré — {plan.duration} jours</h3>
              <p className="text-sm text-gray-500 mt-0.5">{plan.summary}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportToCSV(plan)}>
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPlan(null)}>
                Nouveau plan
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {(["TOFU", "MOFU", "BOFU"] as const).map((funnel) => {
              const count = plan.days.filter((d) => d.funnel === funnel).length;
              return (
                <Card key={funnel} className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-xs ${FUNNEL_COLORS[funnel]}`}>
                        {funnel}
                      </Badge>
                      <span className="text-xl font-bold text-gray-900">{count}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {Math.round((count / plan.days.length) * 100)}% du plan
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">Funnel:</span>
              {["ALL", "TOFU", "MOFU", "BOFU"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFunnelFilter(f)}
                  className={`text-xs rounded-md px-2.5 py-1 border transition-all ${
                    funnelFilter === f
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                  }`}
                >
                  {f === "ALL" ? "Tous" : f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 font-medium">Canal:</span>
              <button
                type="button"
                onClick={() => setChannelFilter("ALL")}
                className={`text-xs rounded-md px-2.5 py-1 border transition-all ${
                  channelFilter === "ALL"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                }`}
              >
                Tous
              </button>
              {channels.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannelFilter(c)}
                  className={`text-xs rounded-md px-2.5 py-1 border transition-all ${
                    channelFilter === c
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Plan table */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">J</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Canal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sujet</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">CTA</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Funnel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDays.map((day: CampaignDay) => (
                    <tr key={day.day} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 rounded-full w-7 h-7 inline-flex items-center justify-center">
                          {day.day}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium text-sm ${CHANNEL_COLORS[day.channel] ?? "text-gray-700"}`}>
                          {day.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">
                          {day.contentType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-800">{day.topic}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                          {day.cta}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${FUNNEL_COLORS[day.funnel] ?? ""}`}
                        >
                          {day.funnel}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {filteredDays.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">
              Aucune action correspond aux filtres sélectionnés
            </p>
          )}
        </div>
      )}
    </div>
  );
}
