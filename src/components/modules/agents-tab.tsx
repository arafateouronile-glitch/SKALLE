"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Share2,
  Users,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  executeSEOAgent,
  executeDiscoveryAgent,
  executeSocialAgent,
  executeProspectionAgent,
  getAgentExecutionHistory,
} from "@/actions/agents";
import { toast } from "sonner";
import { useEffect } from "react";

interface AgentsTabProps {
  workspaceId: string;
}

type HistoryItem = {
  id: string;
  agentType: string;
  credits: number;
  createdAt: Date;
  metadata: unknown;
};

const FOCUS_AREAS = [
  { value: "seo", label: "SEO" },
  { value: "content", label: "Contenu" },
  { value: "keywords", label: "Mots-clés" },
  { value: "strategy", label: "Stratégie" },
] as const;

const SOCIAL_PLATFORMS = ["X", "LINKEDIN", "TIKTOK", "INSTAGRAM"] as const;

const CONTENT_TYPES = [
  { value: "article", label: "Article" },
  { value: "video_transcript", label: "Transcription vidéo" },
  { value: "podcast_notes", label: "Notes podcast" },
  { value: "presentation", label: "Présentation" },
] as const;

export function AgentsTab({ workspaceId }: AgentsTabProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // SEO Agent state
  const [seoKeyword, setSeoKeyword] = useState("");
  const [seoLength, setSeoLength] = useState<"short" | "medium" | "long">("long");
  const [seoGenerateImage, setSeoGenerateImage] = useState(true);
  const [isRunningSEO, setIsRunningSEO] = useState(false);

  // Discovery Agent state
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [discoveryIndustry, setDiscoveryIndustry] = useState("business");
  const [discoveryFocus, setDiscoveryFocus] = useState<string[]>(["seo", "content", "keywords", "strategy"]);
  const [isRunningDiscovery, setIsRunningDiscovery] = useState(false);

  // Social Agent state
  const [socialContent, setSocialContent] = useState("");
  const [socialContentType, setSocialContentType] = useState<"article" | "video_transcript" | "podcast_notes" | "presentation">("article");
  const [socialPlatforms, setSocialPlatforms] = useState<string[]>(["LINKEDIN"]);
  const [isRunningSocial, setIsRunningSocial] = useState(false);

  // Prospection Agent state
  const [prospectName, setProspectName] = useState("");
  const [prospectCompany, setProspectCompany] = useState("");
  const [prospectJobTitle, setProspectJobTitle] = useState("");
  const [prospectLinkedIn, setProspectLinkedIn] = useState("");
  const [prospectNotes, setProspectNotes] = useState("");
  const [ourOffer, setOurOffer] = useState("");
  const [prospectTone, setProspectTone] = useState<"formal" | "professional" | "friendly" | "casual">("professional");
  const [isRunningProspection, setIsRunningProspection] = useState(false);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await getAgentExecutionHistory(workspaceId);
      setHistory(data);
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [workspaceId]);

  const handleRunSEO = async () => {
    if (!seoKeyword.trim()) {
      toast.error("Saisissez un mot-clé");
      return;
    }
    setIsRunningSEO(true);
    try {
      const result = await executeSEOAgent({
        workspaceId,
        keyword: seoKeyword.trim(),
        generateImage: seoGenerateImage,
        targetLength: seoLength,
      });
      if (result.success) {
        toast.success("Agent SEO exécuté avec succès !");
        setSeoKeyword("");
        loadHistory();
      } else {
        toast.error(result.error || "Erreur lors de l'exécution");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsRunningSEO(false);
    }
  };

  const handleRunDiscovery = async () => {
    if (!discoveryUrl.trim()) {
      toast.error("Saisissez l'URL du concurrent");
      return;
    }
    setIsRunningDiscovery(true);
    try {
      const result = await executeDiscoveryAgent({
        workspaceId,
        competitorUrl: discoveryUrl.trim(),
        industry: discoveryIndustry,
        focusAreas: discoveryFocus as ("seo" | "content" | "keywords" | "strategy")[],
      });
      if (result.success) {
        toast.success("Agent Discovery exécuté avec succès !");
        setDiscoveryUrl("");
        loadHistory();
      } else {
        toast.error(result.error || "Erreur lors de l'exécution");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsRunningDiscovery(false);
    }
  };

  const handleRunSocial = async () => {
    if (!socialContent.trim()) {
      toast.error("Saisissez le contenu source");
      return;
    }
    if (socialPlatforms.length === 0) {
      toast.error("Sélectionnez au moins une plateforme");
      return;
    }
    setIsRunningSocial(true);
    try {
      const result = await executeSocialAgent({
        workspaceId,
        sourceContent: socialContent.trim(),
        contentType: socialContentType,
        targetPlatforms: socialPlatforms as ("X" | "LINKEDIN" | "TIKTOK" | "INSTAGRAM")[],
      });
      if (result.success) {
        toast.success("Agent Social exécuté avec succès !");
        setSocialContent("");
        loadHistory();
      } else {
        toast.error(result.error || "Erreur lors de l'exécution");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsRunningSocial(false);
    }
  };

  const handleRunProspection = async () => {
    if (!prospectName.trim() || !prospectCompany.trim()) {
      toast.error("Nom et entreprise requis");
      return;
    }
    setIsRunningProspection(true);
    try {
      const result = await executeProspectionAgent({
        workspaceId,
        prospect: {
          name: prospectName.trim(),
          company: prospectCompany.trim(),
          jobTitle: prospectJobTitle.trim(),
          linkedInUrl: prospectLinkedIn.trim() || undefined,
          notes: prospectNotes.trim() || undefined,
        },
        ourOffer: ourOffer.trim() || undefined,
        preferredTone: prospectTone,
      });
      if (result.success) {
        toast.success("Agent Prospection exécuté avec succès !");
        setProspectName("");
        setProspectCompany("");
        setProspectJobTitle("");
        setProspectLinkedIn("");
        setProspectNotes("");
        loadHistory();
      } else {
        toast.error(result.error || "Erreur lors de l'exécution");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setIsRunningProspection(false);
    }
  };

  const toggleFocusArea = (area: string) => {
    setDiscoveryFocus((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const togglePlatform = (platform: string) => {
    setSocialPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SEO Agent */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-gray-900">Agent SEO</CardTitle>
                <CardDescription>Génère un article optimisé pour un mot-clé</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-700">Mot-clé cible</Label>
              <Input
                placeholder="ex: logiciel CRM PME"
                value={seoKeyword}
                onChange={(e) => setSeoKeyword(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Longueur de l'article</Label>
              <Select value={seoLength} onValueChange={(v) => setSeoLength(v as typeof seoLength)}>
                <SelectTrigger className="bg-white/60 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Court (~500 mots)</SelectItem>
                  <SelectItem value="medium">Moyen (~1000 mots)</SelectItem>
                  <SelectItem value="long">Long (~2000 mots)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="seo-image"
                checked={seoGenerateImage}
                onCheckedChange={(v) => setSeoGenerateImage(!!v)}
              />
              <Label htmlFor="seo-image" className="text-gray-700 cursor-pointer">
                Générer une image de couverture
              </Label>
            </div>
            <Button
              onClick={handleRunSEO}
              disabled={isRunningSEO}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {isRunningSEO ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Générer l'article
            </Button>
          </CardContent>
        </Card>

        {/* Discovery Agent */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Search className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-gray-900">Agent Discovery</CardTitle>
                <CardDescription>Analyse complète d'un concurrent</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-700">URL du concurrent</Label>
              <Input
                placeholder="https://concurrent.com"
                value={discoveryUrl}
                onChange={(e) => setDiscoveryUrl(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Industrie</Label>
              <Input
                placeholder="ex: SaaS, e-commerce, finance..."
                value={discoveryIndustry}
                onChange={(e) => setDiscoveryIndustry(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Axes d'analyse</Label>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map((area) => (
                  <Button
                    key={area.value}
                    type="button"
                    size="sm"
                    variant={discoveryFocus.includes(area.value) ? "default" : "outline"}
                    onClick={() => toggleFocusArea(area.value)}
                    className={discoveryFocus.includes(area.value) ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  >
                    {area.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleRunDiscovery}
              disabled={isRunningDiscovery}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {isRunningDiscovery ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Analyser le concurrent
            </Button>
          </CardContent>
        </Card>

        {/* Social Agent */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-500/20">
                <Share2 className="h-5 w-5 text-teal-500" />
              </div>
              <div>
                <CardTitle className="text-gray-900">Agent Social</CardTitle>
                <CardDescription>Repurpose du contenu pour les réseaux</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-700">Type de contenu source</Label>
              <Select value={socialContentType} onValueChange={(v) => setSocialContentType(v as typeof socialContentType)}>
                <SelectTrigger className="bg-white/60 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Contenu source</Label>
              <Textarea
                placeholder="Collez votre article, transcript ou notes ici..."
                value={socialContent}
                onChange={(e) => setSocialContent(e.target.value)}
                rows={4}
                className="bg-white/60 border-gray-200 resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Plateformes cibles</Label>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <Button
                    key={platform}
                    type="button"
                    size="sm"
                    variant={socialPlatforms.includes(platform) ? "default" : "outline"}
                    onClick={() => togglePlatform(platform)}
                    className={socialPlatforms.includes(platform) ? "bg-teal-600 hover:bg-teal-700" : ""}
                  >
                    {platform}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleRunSocial}
              disabled={isRunningSocial}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700"
            >
              {isRunningSocial ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              Repurposer le contenu
            </Button>
          </CardContent>
        </Card>

        {/* Prospection Agent */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Users className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-gray-900">Agent Prospection</CardTitle>
                <CardDescription>Génère un message personnalisé pour un prospect</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-gray-700">Nom</Label>
                <Input
                  placeholder="Jean Dupont"
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  className="bg-white/60 border-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700">Entreprise</Label>
                <Input
                  placeholder="Acme Corp"
                  value={prospectCompany}
                  onChange={(e) => setProspectCompany(e.target.value)}
                  className="bg-white/60 border-gray-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Poste</Label>
              <Input
                placeholder="Directeur Marketing"
                value={prospectJobTitle}
                onChange={(e) => setProspectJobTitle(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">LinkedIn (optionnel)</Label>
              <Input
                placeholder="https://linkedin.com/in/..."
                value={prospectLinkedIn}
                onChange={(e) => setProspectLinkedIn(e.target.value)}
                className="bg-white/60 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Notre offre</Label>
              <Textarea
                placeholder="Décrivez brièvement votre offre ou valeur ajoutée..."
                value={ourOffer}
                onChange={(e) => setOurOffer(e.target.value)}
                rows={2}
                className="bg-white/60 border-gray-200 resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Ton du message</Label>
              <Select value={prospectTone} onValueChange={(v) => setProspectTone(v as typeof prospectTone)}>
                <SelectTrigger className="bg-white/60 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formel</SelectItem>
                  <SelectItem value="professional">Professionnel</SelectItem>
                  <SelectItem value="friendly">Amical</SelectItem>
                  <SelectItem value="casual">Décontracté</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleRunProspection}
              disabled={isRunningProspection}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {isRunningProspection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Générer le message
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Execution History */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-gray-900">Historique d'exécution</CardTitle>
              <CardDescription>Les 50 dernières exécutions d'agents</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadHistory} disabled={isLoadingHistory}>
              {isLoadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10">
              <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Aucune exécution pour le moment</p>
              <p className="text-gray-400 text-xs mt-1">Lancez un agent ci-dessus pour commencer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize text-xs">
                      {item.agentType}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {new Date(item.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-yellow-500 border-yellow-400/30">
                    -{item.credits} crédits
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
