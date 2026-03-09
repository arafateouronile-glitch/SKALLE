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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Key,
  Plug,
  Plus,
  Copy,
  Trash2,
  Loader2,
  AlertTriangle,
  Shield,
  ExternalLink,
} from "lucide-react";
import {
  createSkalleApiKeyAction,
  listSkalleApiKeysAction,
  revokeSkalleApiKeyAction,
  createExternalIntegrationAction,
  listExternalIntegrationsAction,
  deleteExternalIntegrationAction,
} from "@/actions/integrations-api";
import {
  EXTERNAL_INTEGRATION_PROVIDERS,
  type ExternalIntegrationProvider,
} from "@/lib/constants/integrations";
import { toast } from "sonner";

interface IntegrationsClientProps {
  workspaceId: string;
}

export function IntegrationsClient({ workspaceId }: IntegrationsClientProps) {
  const [inboundKeys, setInboundKeys] = useState<
    Array<{ id: string; name: string; keyPrefix: string; lastUsedAt: Date | null; createdAt: Date }>
  >([]);
  const [outboundList, setOutboundList] = useState<
    Array<{ id: string; provider: string; createdAt: Date }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Inbound: create key modal
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdKeyPrefix, setCreatedKeyPrefix] = useState<string | null>(null);
  const [createKeyLoading, setCreateKeyLoading] = useState(false);

  // Inbound: revoke confirm
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Outbound: connect modal
  const [connectProvider, setConnectProvider] = useState<ExternalIntegrationProvider | null>(null);
  const [connectApiKey, setConnectApiKey] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);

  // WordPress specific fields
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");

  // Outbound: delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const providers = EXTERNAL_INTEGRATION_PROVIDERS;

  const loadData = async () => {
    setLoading(true);
    setApiError(null);
    const [keysRes, intRes] = await Promise.all([
      listSkalleApiKeysAction(workspaceId),
      listExternalIntegrationsAction(workspaceId),
    ]);
    if (keysRes.success && keysRes.keys) setInboundKeys(keysRes.keys);
    else if (keysRes.error) setApiError(keysRes.error);
    if (intRes.success && intRes.integrations) setOutboundList(intRes.integrations);
    else if (intRes.error && !keysRes.error) setApiError(intRes.error);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const handleCreateKey = async () => {
    setCreateKeyLoading(true);
    const res = await createSkalleApiKeyAction(newKeyName || "Clé API", workspaceId);
    setCreateKeyLoading(false);
    if (res.success && res.key) {
      setCreatedKey(res.key);
      setCreatedKeyPrefix(res.keyPrefix ?? null);
      setNewKeyName("");
      toast.success("Clé créée. Copiez-la maintenant, elle ne sera plus affichée.");
    } else {
      toast.error(res.error ?? "Erreur lors de la création");
    }
  };

  const handleCloseCreateKeyModal = () => {
    setCreateKeyOpen(false);
    setCreatedKey(null);
    setCreatedKeyPrefix(null);
    setNewKeyName("");
    if (createdKey) loadData();
  };

  const handleCopyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      toast.success("Clé copiée dans le presse-papiers");
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    setRevokeLoading(true);
    const res = await revokeSkalleApiKeyAction(revokeId, workspaceId);
    setRevokeLoading(false);
    setRevokeId(null);
    if (res.success) {
      toast.success("Clé révoquée");
      loadData();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleConnectOutbound = async () => {
    if (!connectProvider) return;
    setConnectLoading(true);

    // WordPress : sérialiser les 3 champs en JSON
    const apiKeyValue =
      connectProvider === "WORDPRESS"
        ? JSON.stringify({ siteUrl: wpSiteUrl, username: wpUsername, applicationPassword: wpAppPassword })
        : connectApiKey;

    const res = await createExternalIntegrationAction(connectProvider, apiKeyValue, workspaceId);
    setConnectLoading(false);
    if (res.success) {
      toast.success("Connecteur configuré. La clé est chiffrée et stockée de manière sécurisée.");
      setConnectProvider(null);
      setConnectApiKey("");
      setWpSiteUrl("");
      setWpUsername("");
      setWpAppPassword("");
      loadData();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleDeleteIntegration = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    const res = await deleteExternalIntegrationAction(deleteId, workspaceId);
    setDeleteLoading(false);
    setDeleteId(null);
    if (res.success) {
      toast.success("Intégration supprimée");
      loadData();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const formatDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Developer & Integration Hub
        </h1>
        <p className="text-muted-foreground mt-1">
          Clés API Skalle (entrée) et connecteurs externes (sortie). Sécurité bancaire.
        </p>
      </div>

      {apiError && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">{apiError}</p>
              <p className="text-sm text-muted-foreground">
                Passez à un plan AGENCY ou SCALE pour activer les intégrations API.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="inbound" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Skalle (Inbound)
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Outils connectés (Outbound)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Clés API Skalle
              </CardTitle>
              <CardDescription>
                Les autres services (Zapier, Make, Typeform) utilisent ces clés pour appeler Skalle.
                Seul le hash est stocké en base — jamais la clé en clair.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => setCreateKeyOpen(true)}
                disabled={!!apiError}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Créer une nouvelle clé secrète
              </Button>

              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </div>
              ) : inboundKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune clé. Créez-en une pour connecter vos outils.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {inboundKeys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{k.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">
                          {k.keyPrefix}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Dernière utilisation : {formatDate(k.lastUsedAt)} · Créée le{" "}
                          {formatDate(k.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRevokeId(k.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Révoquer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbound" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                Connecteurs externes
              </CardTitle>
              <CardDescription>
                Vos clés (WordPress, SendGrid, CRM…) sont chiffrées en AES-256 avant stockage.
                Skalle les déchiffre uniquement au moment de l&apos;appel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {providers.map((p) => {
                    const connected = outboundList.some(
                      (i) => i.provider === p.value
                    );
                    return (
                      <Card
                        key={p.value}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => {
                          if (apiError) return;
                          setConnectProvider(p.value);
                          setConnectApiKey("");
                        }}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{p.label}</CardTitle>
                            {connected ? (
                              <span className="text-xs font-medium text-green-600">
                                Connecté
                              </span>
                            ) : (
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <CardDescription className="text-sm">
                            {p.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              )}

              {outboundList.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-2">Configurés</h4>
                  <ul className="divide-y rounded-md border">
                    {outboundList.map((i) => (
                      <li
                        key={i.id}
                        className="flex items-center justify-between px-4 py-2"
                      >
                        <span>
                          {providers.find((p) => p.value === i.provider)?.label ?? i.provider}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(i.id);
                          }}
                        >
                          Supprimer
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal: créer clé — avertissement puis affichage une fois */}
      <Dialog open={createKeyOpen} onOpenChange={(open) => !open && handleCloseCreateKeyModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdKey ? "Clé créée — copiez-la maintenant" : "Créer une clé secrète"}
            </DialogTitle>
            <DialogDescription>
              {createdKey
                ? "Cette clé ne sera plus jamais affichée. Stockez-la dans un endroit sûr (ex: gestionnaire de mots de passe)."
                : "Un nom optionnel pour identifier cette clé (ex: Zapier, Make)."}
            </DialogDescription>
          </DialogHeader>
          {!createdKey ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="key-name">Nom (optionnel)</Label>
                <Input
                  id="key-name"
                  placeholder="ex: Zapier Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateKeyOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreateKey} disabled={createKeyLoading}>
                  {createKeyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Générer la clé"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-muted p-4 font-mono text-sm break-all">
                {createdKey}
              </div>
              <Button variant="outline" onClick={handleCopyKey} className="gap-2">
                <Copy className="h-4 w-4" />
                Copier la clé
              </Button>
              <DialogFooter>
                <Button onClick={handleCloseCreateKeyModal}>
                  J&apos;ai copié la clé
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: connecter un provider Outbound */}
      <Dialog
        open={!!connectProvider}
        onOpenChange={(open) => !open && setConnectProvider(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {connectProvider &&
                providers.find((p) => p.value === connectProvider)?.label}{" "}
              — Configuration
            </DialogTitle>
            <DialogDescription>
              {connectProvider === "WORDPRESS"
                ? "Entrez l'URL de votre site et vos identifiants WordPress (mot de passe d'application)."
                : connectProvider === "WEBHOOK" || connectProvider === "CUSTOM_CRM"
                ? 'Entrez l\'URL du endpoint. Format JSON optionnel : {"url":"...","secret":"..."} ou {"url":"...","token":"Bearer xxx"}'
                : "Entrez la clé API fournie par le service. Elle sera chiffrée avant d'être stockée."}
            </DialogDescription>
          </DialogHeader>

          {connectProvider === "WORDPRESS" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="wp-site-url">URL du site WordPress</Label>
                <Input
                  id="wp-site-url"
                  placeholder="https://monsite.com"
                  value={wpSiteUrl}
                  onChange={(e) => setWpSiteUrl(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wp-username">Nom d&apos;utilisateur WordPress</Label>
                <Input
                  id="wp-username"
                  placeholder="admin"
                  value={wpUsername}
                  onChange={(e) => setWpUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wp-app-password">Mot de passe d&apos;application</Label>
                <Input
                  id="wp-app-password"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  value={wpAppPassword}
                  onChange={(e) => setWpAppPassword(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Générez un mot de passe d&apos;application dans WordPress : Utilisateurs → Profil → Mots de passe d&apos;application
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="api-key">
                {connectProvider === "WEBHOOK" || connectProvider === "CUSTOM_CRM"
                  ? "URL du endpoint"
                  : "Clé API"}
              </Label>
              <Input
                id="api-key"
                type={connectProvider === "WEBHOOK" || connectProvider === "CUSTOM_CRM" ? "url" : "password"}
                placeholder={
                  connectProvider === "WEBHOOK"
                    ? "https://hooks.zapier.com/..."
                    : connectProvider === "CUSTOM_CRM"
                    ? "https://api.moncrm.com/contacts"
                    : "Coller la clé ici"
                }
                value={connectApiKey}
                onChange={(e) => setConnectApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectProvider(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleConnectOutbound}
              disabled={
                connectLoading ||
                (connectProvider === "WORDPRESS"
                  ? !wpSiteUrl.trim() || !wpUsername.trim() || !wpAppPassword.trim()
                  : !connectApiKey.trim())
              }
            >
              {connectLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Enregistrer (chiffré)"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm revoke */}
      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Révoquer cette clé ?</DialogTitle>
            <DialogDescription>
              Toute requête utilisant cette clé échouera immédiatement. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeLoading}
            >
              {revokeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Révoquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete integration */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette intégration ?</DialogTitle>
            <DialogDescription>
              La clé stockée sera supprimée. Vous pourrez la reconfigurer plus tard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteIntegration}
              disabled={deleteLoading}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
