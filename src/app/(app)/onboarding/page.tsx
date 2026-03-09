"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  getOnboardingState,
  setOnboardingDomain,
  runOnboardingBrandAnalysis,
  generateOnboardingFirstArticle,
  completeOnboarding,
} from "@/actions/onboarding";
import { getGSCAuthUrlAction, getGSCStatusAction } from "@/actions/integrations";
import { getMetaConnectionStatus } from "@/actions/meta-connection";
import { toast } from "sonner";
import {
  Globe,
  Palette,
  FileText,
  Rocket,
  Loader2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  BarChart3,
  Facebook,
  Mail,
  ExternalLink,
} from "lucide-react";

const STEPS = [
  { id: 1, title: "Votre espace", desc: "Nom et site web", icon: Globe },
  { id: 2, title: "Ton de marque", desc: "Analyse automatique", icon: Palette },
  { id: 3, title: "Premier article", desc: "Génération SEO", icon: FileText },
  { id: 4, title: "C'est parti", desc: "Activer l'autopilot", icon: Rocket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [domainUrl, setDomainUrl] = useState("");
  const [brandLoading, setBrandLoading] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleKeyword, setArticleKeyword] = useState("comment améliorer son référencement naturel");
  const [finishLoading, setFinishLoading] = useState(false);
  const [enableAutopilot, setEnableAutopilot] = useState(true);

  // Connexions comptes (step 4)
  const [gscConnected, setGscConnected] = useState(false);
  const [gscLoading, setGscLoading] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);

  useEffect(() => {
    getOnboardingState().then((res) => {
      if (res.success && res.workspaceId != null && res.step != null) {
        setWorkspaceId(res.workspaceId);
        setStep(res.step);
        if (res.name) setName(res.name);
        if (res.domainUrl) setDomainUrl(res.domainUrl);
        if (res.step === 0) router.replace("/marketing-os");

        // Charger le statut des connexions si on arrive à l'étape 4
        if (res.step >= 4 && res.workspaceId) {
          loadConnectionStatus(res.workspaceId);
        }
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Détecter le retour depuis OAuth GSC ou Facebook
  useEffect(() => {
    if (searchParams.get("gsc") === "connected") {
      toast.success("Google Search Console connecté !");
    }
  }, [searchParams]);

  const loadConnectionStatus = async (wsId: string) => {
    const [gscRes, metaRes] = await Promise.all([
      getGSCStatusAction(wsId),
      getMetaConnectionStatus(wsId),
    ]);
    setGscConnected(gscRes.isConnected);
    setFacebookConnected(
      metaRes.success && (metaRes.data?.accounts?.length ?? 0) > 0
    );
  };

  const handleConnectGSC = async () => {
    if (!workspaceId) return;
    setGscLoading(true);
    const res = await getGSCAuthUrlAction(workspaceId);
    setGscLoading(false);
    if (res.success && res.url) {
      window.location.href = res.url;
    } else {
      toast.error(res.error ?? "Impossible d'obtenir l'URL Google");
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;
    setLoading(true);
    const res = await setOnboardingDomain(workspaceId, { name, domainUrl });
    setLoading(false);
    if (res.success) {
      setStep(2);
      toast.success("Espace configuré");
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleStep2 = async () => {
    if (!workspaceId) return;
    setBrandLoading(true);
    const res = await runOnboardingBrandAnalysis(workspaceId);
    setBrandLoading(false);
    if (res.success) {
      setStep(3);
      toast.success("Ton de marque analysé");
    } else {
      toast.error(res.error ?? "Erreur lors de l'analyse");
    }
  };

  const handleStep3 = async () => {
    if (!workspaceId) return;
    setArticleLoading(true);
    const res = await generateOnboardingFirstArticle(workspaceId, articleKeyword);
    setArticleLoading(false);
    if (res.success) {
      setStep(4);
      toast.success(res.title ? `Article créé : ${res.title}` : "Article créé");
      // Charger le statut des connexions dès qu'on arrive à l'étape 4
      if (workspaceId) loadConnectionStatus(workspaceId);
    } else {
      toast.error(res.error ?? "Erreur lors de la génération");
    }
  };

  const handleFinish = async () => {
    if (!workspaceId) return;
    setFinishLoading(true);
    const res = await completeOnboarding(workspaceId, enableAutopilot);
    setFinishLoading(false);
    if (res.success) {
      toast.success("Bienvenue sur Skalle !");
      router.replace("/marketing-os");
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  if (loading && !workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Configuration en 4 étapes
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bienvenue sur Skalle</h1>
          <p className="text-gray-500 mt-1">On configure votre espace en quelques minutes.</p>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="flex justify-between text-xs text-gray-500">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col items-center gap-1 ${step >= s.id ? "text-emerald-600 font-medium" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step > s.id ? "bg-emerald-500 text-white" : step === s.id ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                }`}
              >
                {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              </div>
              <span>{s.title}</span>
            </div>
          ))}
        </div>

        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {(() => {
                const currentStep = STEPS[step - 1];
                const StepIcon = currentStep?.icon;
                return (
                  <>
                    {StepIcon && <StepIcon className="h-5 w-5 text-emerald-600" />}
                    {currentStep?.title}
                  </>
                );
              })()}
            </CardTitle>
            <CardDescription>{STEPS[step - 1]?.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <form onSubmit={handleStep1} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nom de l'espace</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Mon entreprise"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="domainUrl">URL de votre site</Label>
                  <Input
                    id="domainUrl"
                    type="url"
                    value={domainUrl}
                    onChange={(e) => setDomainUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="mt-1"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuer"}
                </Button>
              </form>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  On va analyser le ton et le style de votre site pour que tous vos contenus restent alignés avec votre marque.
                </p>
                <Button
                  onClick={handleStep2}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={brandLoading}
                >
                  {brandLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Palette className="h-4 w-4 mr-2" />
                  )}
                  Analyser le ton de marque
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="keyword">Mot-clé pour votre premier article</Label>
                  <Input
                    id="keyword"
                    value={articleKeyword}
                    onChange={(e) => setArticleKeyword(e.target.value)}
                    placeholder="ex: référencement naturel"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleStep3}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={articleLoading}
                >
                  {articleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Générer mon premier article SEO
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                {/* Connexions optionnelles */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Connectez vos outils <span className="text-gray-400 font-normal">(optionnel — vous pourrez le faire plus tard)</span>
                  </p>
                  <div className="space-y-2">
                    {/* Google Search Console */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <BarChart3 className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">Google Search Console</p>
                          <p className="text-xs text-gray-500">Analyse SEO de votre site</p>
                        </div>
                      </div>
                      {gscConnected ? (
                        <Badge variant="secondary" className="text-emerald-600 bg-emerald-50">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Connecté
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={handleConnectGSC} disabled={gscLoading}>
                          {gscLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Connecter"}
                        </Button>
                      )}
                    </div>

                    {/* Facebook / Instagram */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Facebook className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium">Facebook & Instagram</p>
                          <p className="text-xs text-gray-500">Pages, DMs et engagement</p>
                        </div>
                      </div>
                      {facebookConnected ? (
                        <Badge variant="secondary" className="text-emerald-600 bg-emerald-50">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Connecté
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <a href="/marketing-os/settings?tab=social" target="_blank" rel="noopener noreferrer">
                            Connecter <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      )}
                    </div>

                    {/* Boite mail */}
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium">Boite mail (SMTP)</p>
                          <p className="text-xs text-gray-500">Envoi de campagnes email</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <a href="/marketing-os/settings?tab=email" target="_blank" rel="noopener noreferrer">
                          Configurer <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Autopilot */}
                <div className="border-t pt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableAutopilot}
                      onChange={(e) => setEnableAutopilot(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-sm font-medium">Activer l'autopilot</span>
                      <p className="text-xs text-gray-500">L'IA propose chaque matin des actions à valider en un clic</p>
                    </div>
                  </label>
                </div>

                <Button
                  onClick={handleFinish}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={finishLoading}
                >
                  {finishLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Accéder à mon tableau de bord
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
