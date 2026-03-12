"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Settings,
  User,
  CreditCard,
  Zap,
  Crown,
  Loader2,
  Plug,
  Plus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Globe,
  ShoppingBag,
  BarChart3,
  Key,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { saveCMSConfig, deleteCMSConfig } from "@/actions/cms";
import { getCurrentUserSettings } from "@/actions/credits";
import { getGSCAuthUrlAction, getGSCStatusAction, disconnectGSCAction } from "@/actions/integrations";
import { listApiKeysAction, createApiKeyAction, revokeApiKeyAction } from "@/actions/api-keys";
import { PricingTable, PLANS } from "@/components/pricing/pricing-table";
import { toast } from "sonner";

interface UserSettings {
  name: string;
  email: string;
  plan: "FREE" | "BUSINESS" | "AGENCY" | "SCALE";
  credits: number;
  maxCredits: number;
  hasStripeCustomer?: boolean;
}

interface CMSConfig {
  platform: "WORDPRESS" | "SHOPIFY";
  apiUrl: string;
  username?: string;
  connected: boolean;
}

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const integrationsList = [
  {
    id: "wordpress",
    name: "WordPress",
    description: "Publiez automatiquement vos articles sur WordPress",
    icon: Globe,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    available: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Publiez sur le blog de votre boutique Shopify",
    icon: ShoppingBag,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    available: true,
  },
  {
    id: "webflow",
    name: "Webflow",
    description: "Intégration Webflow CMS",
    icon: Globe,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    available: false,
  },
  {
    id: "ghost",
    name: "Ghost",
    description: "Publication sur Ghost CMS",
    icon: Globe,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    available: false,
  },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<UserSettings>({
    name: "",
    email: "",
    plan: "FREE",
    credits: 0,
    maxCredits: 100,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [stripeLoading, setStripeLoading] = useState< string | null>(null); // "portal" | "checkout" | plan id

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
  });

  useEffect(() => {
    getCurrentUserSettings().then((res) => {
      if (res.success && res.user) {
        const u = res.user;
        setUser({
          name: u.name ?? "",
          email: u.email,
          plan: u.plan,
          credits: u.credits,
          maxCredits: u.monthlyCredits,
          hasStripeCustomer: u.hasStripeCustomer,
        });
        setFormData({ name: u.name ?? "", email: u.email });
      }
      setSettingsLoaded(true);
    });
  }, []);

  // Charger le statut GSC au montage
  useEffect(() => {
    getGSCStatusAction().then(setGscStatus);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    const gsc = searchParams.get("gsc");
    if (gsc === "connected") {
      toast.success("Google Search Console connecté avec succès !");
      getGSCStatusAction().then(setGscStatus);
    }
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "subscription") {
      toast.success("Abonnement activé. Vos crédits ont été rechargés.");
      getCurrentUserSettings().then((r) => {
        if (r.success && r.user) {
          setUser((prev) => ({
            ...prev,
            plan: r.user!.plan,
            credits: r.user!.credits,
            maxCredits: r.user!.monthlyCredits,
            hasStripeCustomer: r.user!.hasStripeCustomer,
          }));
        }
      });
    }
    if (success === "topup") {
      toast.success("500 crédits ajoutés à votre compte !");
      getCurrentUserSettings().then((r) => {
        if (r.success && r.user) {
          setUser((prev) => ({ ...prev, credits: r.user!.credits }));
        }
      });
    }
    if (canceled) toast.info("Paiement annulé.");
  }, [settingsLoaded, searchParams]);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, name: user.name, email: user.email }));
  }, [user.name, user.email]);

  // GSC state
  const [gscStatus, setGscStatus] = useState<{
    isConnected: boolean;
    siteUrl?: string;
    lastSyncedAt?: Date | null;
  }>({ isConnected: false });
  const [gscLoading, setGscLoading] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [apiKeysPlan, setApiKeysPlan] = useState<string>("FREE");
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const loadApiKeys = async () => {
    const res = await listApiKeysAction();
    if (res.success && res.keys) {
      setApiKeys(res.keys);
      setApiKeysPlan(res.plan ?? "FREE");
    }
    setApiKeysLoaded(true);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Nom requis");
      return;
    }
    setIsCreatingKey(true);
    const res = await createApiKeyAction(newKeyName);
    setIsCreatingKey(false);
    if (res.success && res.key) {
      setCreatedKey(res.key);
      setShowCreatedKey(false);
      setNewKeyName("");
      setIsCreateKeyOpen(false);
      await loadApiKeys();
    } else {
      toast.error(res.error ?? "Erreur lors de la création");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setRevokingKeyId(keyId);
    const res = await revokeApiKeyAction(keyId);
    setRevokingKeyId(null);
    if (res.success) {
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("Clé révoquée");
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  // Integrations state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCmsLoading, setIsCmsLoading] = useState(false);
  const [cmsConfig, setCmsConfig] = useState<CMSConfig | null>(null);
  const [cmsFormData, setCmsFormData] = useState({
    platform: "WORDPRESS" as "WORDPRESS" | "SHOPIFY",
    apiUrl: "",
    username: "",
    apiKey: "",
  });

  const handleSaveProfile = async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setUser({ ...user, ...formData });
    toast.success("Profil mis à jour !");
    setIsLoading(false);
  };

  const handleConnect = async () => {
    if (!cmsFormData.apiUrl || !cmsFormData.apiKey) {
      toast.error("URL et clé API requises");
      return;
    }
    setIsCmsLoading(true);
    try {
      const result = await saveCMSConfig("workspace-id", cmsFormData);
      if (result.success) {
        setCmsConfig({
          platform: cmsFormData.platform,
          apiUrl: cmsFormData.apiUrl,
          username: cmsFormData.username,
          connected: true,
        });
        setIsDialogOpen(false);
        toast.success("CMS connecté avec succès !");
      } else {
        toast.error(result.error || "Échec de la connexion");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsCmsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsCmsLoading(true);
    try {
      const result = await deleteCMSConfig("workspace-id");
      if (result.success) {
        setCmsConfig(null);
        toast.success("CMS déconnecté");
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsCmsLoading(false);
    }
  };

  const currentPlan = PLANS.find((p) => p.id === user.plan);
  const creditsUsed = Math.max(0, user.maxCredits - user.credits);
  const creditsPercentage = user.maxCredits ? (creditsUsed / user.maxCredits) * 100 : 0;

  if (!settingsLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Settings className="h-8 w-8 text-emerald-600" />
          Paramètres
        </h1>
        <p className="text-gray-500 mt-2">
          Gérez votre compte, abonnement et intégrations
        </p>
      </div>

      <Tabs defaultValue="compte">
        <TabsList className="bg-white/60 backdrop-blur-sm border border-gray-200/60">
          <TabsTrigger value="compte">Compte</TabsTrigger>
          <TabsTrigger value="integrations">Intégrations</TabsTrigger>
          <TabsTrigger value="api" onClick={() => { if (!apiKeysLoaded) loadApiKeys(); }}>
            Clés API
          </TabsTrigger>
        </TabsList>

        {/* ── Compte ── */}
        <TabsContent value="compte" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <User className="h-5 w-5 text-emerald-600" />
                    Profil
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Vos informations personnelles
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-gray-700">Nom</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700">Email</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveProfile}
                    disabled={isLoading}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isLoading && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Enregistrer
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-emerald-600" />
                    Facturation
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Gérez votre abonnement et vos paiements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/50 backdrop-blur-sm border border-gray-200">
                    <div>
                      <p className="font-medium text-gray-900">
                        Plan {currentPlan?.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {currentPlan?.credits.toLocaleString()} crédits/mois
                      </p>
                    </div>
                    <Badge
                      className={
                        user.plan === "FREE"
                          ? "bg-gray-500/20 text-gray-500"
                          : "bg-emerald-500/20 text-emerald-600"
                      }
                    >
                      {currentPlan?.price === 0 ? "Gratuit" : `${currentPlan?.price} €/mois`}
                    </Badge>
                  </div>

                  <Separator className="bg-gray-200" />

                  {user.hasStripeCustomer && user.plan !== "FREE" ? (
                    <Button
                      variant="outline"
                      className="border-gray-200 text-gray-700"
                      disabled={stripeLoading === "portal"}
                      onClick={async () => {
                        setStripeLoading("portal");
                        try {
                          const r = await fetch("/api/stripe/portal", { method: "POST" });
                          const data = await r.json();
                          if (data.url) window.location.href = data.url;
                          else toast.error(data.error || "Erreur");
                        } catch {
                          toast.error("Erreur lors de l'ouverture du portail");
                        } finally {
                          setStripeLoading(null);
                        }
                      }}
                    >
                      {stripeLoading === "portal" ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      )}
                      Gérer mon abonnement
                    </Button>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Passez à un plan payant pour débloquer plus de crédits et gérer votre abonnement depuis le portail Stripe.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-400" />
                    Crédits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-gray-900">
                      {user.credits}
                    </p>
                    <p className="text-sm text-gray-500">
                      sur {user.maxCredits} crédits
                    </p>
                  </div>

                  <Progress value={creditsPercentage} className="h-3 bg-gray-200" />

                  <div className="text-sm text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Utilisés ce mois</span>
                      <span>{creditsUsed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Restants</span>
                      <span className="text-green-400">{user.credits}</span>
                    </div>
                  </div>

                  <Separator className="bg-gray-200" />

                  <div className="text-xs text-gray-400 space-y-1">
                    <p>• 1 article SEO = 1 crédit</p>
                    <p>• 1 image = 1 crédit</p>
                    <p>• 1 recherche = 0.1 crédit</p>
                    <p>• 1 repurpose = 1 crédit</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Plans */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-400" />
              Changer de plan
            </h2>
            <PricingTable
              variant="app"
              currentPlan={user.plan}
              loadingPlan={stripeLoading}
              onSelectPlan={async (planId) => {
                setStripeLoading(planId);
                try {
                  const r = await fetch("/api/stripe/checkout-subscription", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan: planId }),
                  });
                  const data = await r.json();
                  if (data.url) window.location.href = data.url;
                  else toast.error(data.error || "Erreur");
                } catch {
                  toast.error("Erreur lors de la redirection vers Stripe");
                } finally {
                  setStripeLoading(null);
                }
              }}
              onTopup={async () => {
                setStripeLoading("topup");
                try {
                  const r = await fetch("/api/stripe/checkout-topup", { method: "POST" });
                  const data = await r.json();
                  if (data.url) window.location.href = data.url;
                  else toast.error(data.error || "Erreur");
                } catch {
                  toast.error("Erreur lors du top-up");
                } finally {
                  setStripeLoading(null);
                }
              }}
            />
          </div>
        </TabsContent>

        {/* ── Intégrations ── */}
        <TabsContent value="integrations" className="mt-6 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Plug className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Intégrations
              </h2>
              <p className="text-sm text-gray-500">
                Connectez vos outils et publiez automatiquement
              </p>
            </div>
          </div>

          {/* Connected CMS */}
          {cmsConfig && (
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-green-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      {cmsConfig.platform === "WORDPRESS" ? (
                        <Globe className="h-6 w-6 text-green-400" />
                      ) : (
                        <ShoppingBag className="h-6 w-6 text-green-400" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-gray-900 flex items-center gap-2">
                        {cmsConfig.platform}
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connecté
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-gray-500">
                        {cmsConfig.apiUrl}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(cmsConfig.apiUrl, "_blank")}
                      className="border-gray-200 text-gray-700"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Ouvrir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={isCmsLoading}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Déconnecter
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Google Search Console */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Analytics & SEO
            </h3>
            <Card className={`bg-white/60 backdrop-blur-sm shadow-sm ${gscStatus.isConnected ? "border-emerald-500/40" : "border-gray-200/60"}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${gscStatus.isConnected ? "bg-emerald-500/10" : "bg-blue-500/10"}`}>
                      <BarChart3 className={`h-6 w-6 ${gscStatus.isConnected ? "text-emerald-600" : "text-blue-500"}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        Google Search Console
                        {gscStatus.isConnected && (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connecté
                          </Badge>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {gscStatus.isConnected
                          ? `Site : ${gscStatus.siteUrl ?? "—"} · Synchro : ${gscStatus.lastSyncedAt ? new Date(gscStatus.lastSyncedAt).toLocaleDateString("fr-FR") : "jamais"}`
                          : "Connectez GSC pour enrichir l'Agent Brain avec vos données SEO réelles (clics, positions, pages en déclin)"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    {gscStatus.isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-500 hover:bg-red-50"
                        disabled={gscLoading}
                        onClick={async () => {
                          setGscLoading(true);
                          const r = await disconnectGSCAction();
                          if (r.success) {
                            setGscStatus({ isConnected: false });
                            toast.success("Google Search Console déconnecté");
                          } else {
                            toast.error(r.error ?? "Erreur");
                          }
                          setGscLoading(false);
                        }}
                      >
                        {gscLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Déconnecter
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={gscLoading}
                        onClick={async () => {
                          setGscLoading(true);
                          const r = await getGSCAuthUrlAction();
                          if (r.success && r.url) {
                            window.location.href = r.url;
                          } else {
                            toast.error(r.error ?? "Erreur de configuration GSC");
                            setGscLoading(false);
                          }
                        }}
                      >
                        {gscLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        Connecter
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Available Integrations */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              CMS & Plateformes
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {integrationsList.map((integration) => (
                <Card
                  key={integration.id}
                  className={`bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60 ${
                    !integration.available && "opacity-60"
                  }`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${integration.bgColor}`}>
                          <integration.icon
                            className={`h-6 w-6 ${integration.color}`}
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            {integration.name}
                            {!integration.available && (
                              <Badge
                                variant="outline"
                                className="bg-white/60 backdrop-blur-sm text-gray-500 border-gray-200"
                              >
                                Bientôt
                              </Badge>
                            )}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {integration.description}
                          </p>
                        </div>
                      </div>

                      {integration.available && !cmsConfig && (
                        <Dialog
                          open={isDialogOpen}
                          onOpenChange={setIsDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              onClick={() =>
                                setCmsFormData({
                                  ...cmsFormData,
                                  platform:
                                    integration.id.toUpperCase() as
                                      | "WORDPRESS"
                                      | "SHOPIFY",
                                })
                              }
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Connecter
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                            <DialogHeader>
                              <DialogTitle className="text-gray-900">
                                Connecter {cmsFormData.platform}
                              </DialogTitle>
                              <DialogDescription className="text-gray-500">
                                Entrez vos identifiants API pour connecter votre
                                CMS
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label className="text-gray-700">
                                  Plateforme
                                </Label>
                                <Select
                                  value={cmsFormData.platform}
                                  onValueChange={(v) =>
                                    setCmsFormData({
                                      ...cmsFormData,
                                      platform: v as "WORDPRESS" | "SHOPIFY",
                                    })
                                  }
                                >
                                  <SelectTrigger className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                                    <SelectItem value="WORDPRESS">
                                      WordPress
                                    </SelectItem>
                                    <SelectItem value="SHOPIFY">
                                      Shopify
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-gray-700">
                                  URL du site
                                </Label>
                                <Input
                                  placeholder="https://monsite.com"
                                  value={cmsFormData.apiUrl}
                                  onChange={(e) =>
                                    setCmsFormData({
                                      ...cmsFormData,
                                      apiUrl: e.target.value,
                                    })
                                  }
                                  className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                                />
                              </div>

                              {cmsFormData.platform === "WORDPRESS" && (
                                <div className="space-y-2">
                                  <Label className="text-gray-700">
                                    Nom d&apos;utilisateur
                                  </Label>
                                  <Input
                                    placeholder="admin"
                                    value={cmsFormData.username}
                                    onChange={(e) =>
                                      setCmsFormData({
                                        ...cmsFormData,
                                        username: e.target.value,
                                      })
                                    }
                                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                                  />
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label className="text-gray-700">
                                  {cmsFormData.platform === "WORDPRESS"
                                    ? "Application Password"
                                    : "Clé API"}
                                </Label>
                                <Input
                                  type="password"
                                  placeholder="••••••••••••"
                                  value={cmsFormData.apiKey}
                                  onChange={(e) =>
                                    setCmsFormData({
                                      ...cmsFormData,
                                      apiKey: e.target.value,
                                    })
                                  }
                                  className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200 text-gray-900"
                                />
                                {cmsFormData.platform === "WORDPRESS" && (
                                  <p className="text-xs text-gray-400">
                                    Créez un Application Password dans
                                    WordPress: Utilisateurs {">"} Votre profil{" "}
                                    {">"} Application Passwords
                                  </p>
                                )}
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
                                onClick={handleConnect}
                                disabled={isCmsLoading}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                {isCmsLoading && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Connecter
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}

                      {cmsConfig &&
                        cmsConfig.platform ===
                          integration.id.toUpperCase() && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Actif
                          </Badge>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* API Keys Info */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900">
                Clés API configurées
              </CardTitle>
              <CardDescription className="text-gray-500">
                Ces clés sont définies dans les variables d&apos;environnement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "OpenAI", envVar: "OPENAI_API_KEY", status: true },
                  {
                    name: "Anthropic",
                    envVar: "ANTHROPIC_API_KEY",
                    status: true,
                  },
                  { name: "Serper", envVar: "SERPER_API_KEY", status: true },
                  {
                    name: "Banana.dev",
                    envVar: "BANANA_API_KEY",
                    status: false,
                  },
                ].map((api) => (
                  <div
                    key={api.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/50 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      {api.status ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      <span className="text-gray-900">{api.name}</span>
                    </div>
                    <code className="text-xs text-gray-400">{api.envVar}</code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Clés API ── */}
        <TabsContent value="api" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="h-6 w-6 text-emerald-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Clés API</h2>
                <p className="text-sm text-gray-500">
                  Intégrez Skalle dans vos outils (Zapier, Make, Airtable…)
                </p>
              </div>
            </div>

            {["AGENCY", "SCALE"].includes(apiKeysPlan) && (
              <Dialog open={isCreateKeyOpen} onOpenChange={setIsCreateKeyOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Nouvelle clé
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white border-gray-200">
                  <DialogHeader>
                    <DialogTitle className="text-gray-900">Créer une clé API</DialogTitle>
                    <DialogDescription className="text-gray-500">
                      Donnez un nom à cette clé pour vous en souvenir (ex&nbsp;: &quot;Zapier CRM&quot;).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label className="text-gray-700">Nom de la clé</Label>
                      <Input
                        placeholder="Zapier, Make, Airtable…"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                        className="border-gray-200 text-gray-900"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateKeyOpen(false)}
                      className="border-gray-200 text-gray-700"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleCreateKey}
                      disabled={isCreatingKey}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {isCreatingKey ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4 mr-2" />
                      )}
                      Créer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Plan restriction banner */}
          {!["AGENCY", "SCALE"].includes(apiKeysPlan) && apiKeysLoaded && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Accès API réservé aux plans AGENCY et SCALE
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Passez à un plan supérieur pour créer des clés API et connecter vos outils externes.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Clé affichée après création */}
          {createdKey && (
            <Card className="bg-emerald-50 border-emerald-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-emerald-800 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Clé créée — copiez-la maintenant
                </CardTitle>
                <CardDescription className="text-emerald-700 text-xs">
                  Cette clé ne sera plus affichée. Stockez-la dans un endroit sûr.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white/80 border border-emerald-200 rounded px-3 py-2 font-mono text-emerald-900 overflow-auto">
                    {showCreatedKey ? createdKey : "sk_live_" + "•".repeat(48)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreatedKey((v) => !v)}
                    className="text-emerald-700 hover:bg-emerald-100"
                  >
                    {showCreatedKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(createdKey);
                      toast.success("Clé copiée !");
                    }}
                    className="text-emerald-700 hover:bg-emerald-100"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreatedKey(null)}
                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                >
                  J&apos;ai copié ma clé
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Liste des clés */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base">
                Clés actives ({apiKeys.length}/10)
              </CardTitle>
              <CardDescription className="text-gray-500 text-xs">
                Auth : <code className="bg-gray-100 px-1 rounded">Authorization: Bearer sk_live_…</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!apiKeysLoaded ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                </div>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Aucune clé API créée
                </p>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/70 border border-gray-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Key className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {key.name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {key.keyPrefix}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-gray-400">
                            {key.lastUsedAt
                              ? `Utilisée ${new Date(key.lastUsedAt).toLocaleDateString("fr-FR")}`
                              : "Jamais utilisée"}
                          </p>
                          <p className="text-xs text-gray-300">
                            Créée {new Date(key.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeKey(key.id)}
                          disabled={revokingKeyId === key.id}
                          className="border-red-200 text-red-500 hover:bg-red-50"
                        >
                          {revokingKeyId === key.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Endpoints disponibles */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base">Endpoints disponibles</CardTitle>
              <CardDescription className="text-gray-500 text-xs">
                Base URL : <code className="bg-gray-100 px-1 rounded">https://votredomaine.com/api/v1</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  {
                    method: "POST",
                    path: "/api/v1/leads",
                    description: "Injecter un prospect dans le CRM",
                    color: "bg-blue-100 text-blue-700",
                  },
                  {
                    method: "POST",
                    path: "/api/v1/seo/generate",
                    description: "Déclencher la génération d'un article SEO",
                    color: "bg-emerald-100 text-emerald-700",
                  },
                ].map((ep) => (
                  <div
                    key={ep.path}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/70 border border-gray-200"
                  >
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${ep.color}`}>
                      {ep.method}
                    </span>
                    <code className="text-xs text-gray-700 font-mono">{ep.path}</code>
                    <span className="text-xs text-gray-400 hidden sm:inline">
                      — {ep.description}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
