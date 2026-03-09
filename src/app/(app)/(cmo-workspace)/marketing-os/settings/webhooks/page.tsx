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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Webhook,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Shield,
  Send,
} from "lucide-react";
import {
  listWebhookEndpointsAction,
  getWebhookSecretAction,
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  sendWebhookTestAction,
  WEBHOOK_EVENT_OPTIONS,
} from "@/actions/webhooks";
import { toast } from "sonner";

type EndpointRow = {
  id: string;
  url: string;
  secretMasked: string;
  isActive: boolean;
  events: string[];
  createdAt: Date;
};

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addEvents, setAddEvents] = useState<string[]>(["seo.article.completed", "webhook.ping"]);
  const [addLoading, setAddLoading] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const [copyId, setCopyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const eventOptions = WEBHOOK_EVENT_OPTIONS;

  const load = async () => {
    setLoading(true);
    const res = await listWebhookEndpointsAction();
    if (res.success && res.endpoints) setEndpoints(res.endpoints);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    setAddLoading(true);
    const res = await createWebhookEndpointAction(addUrl.trim(), addEvents);
    setAddLoading(false);
    if (res.success && res.secret) {
      setCreatedSecret(res.secret);
      toast.success("Webhook créé. Copiez le secret maintenant.");
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleCloseAdd = () => {
    setAddOpen(false);
    setAddUrl("");
    setAddEvents(["seo.article.completed", "webhook.ping"]);
    setCreatedSecret(null);
    load();
  };

  const handleCopySecret = async (endpointId: string) => {
    setCopyId(endpointId);
    const res = await getWebhookSecretAction(endpointId);
    setCopyId(null);
    if (res.success && res.secret) {
      await navigator.clipboard.writeText(res.secret);
      toast.success("Secret copié dans le presse-papiers");
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    const res = await deleteWebhookEndpointAction(deleteId);
    setDeleteLoading(false);
    setDeleteId(null);
    if (res.success) {
      toast.success("Webhook supprimé");
      load();
    } else {
      toast.error(res.error ?? "Erreur");
    }
  };

  const handleTest = async () => {
    setTestLoading(true);
    const res = await sendWebhookTestAction();
    setTestLoading(false);
    if (res.success) {
      toast.success("Test envoyé aux endpoints abonnés à « Test (ping) ».");
    } else {
      toast.error(res.error ?? "Échec du test");
    }
  };

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Webhooks Outbound
        </h1>
        <p className="text-muted-foreground mt-1">
          Skalle envoie un POST vers vos URLs (Zapier, Make, CRM) lorsque des événements se produisent.
          Vérifiez l&apos;authenticité avec la signature HMAC.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secret de signature (HMAC SHA-256)
          </CardTitle>
          <CardDescription>
            Chaque requête inclut le header <code className="rounded bg-muted px-1">X-Skalle-Signature</code> :
            c&apos;est le HMAC SHA-256 du body JSON avec votre secret. Vérifiez-le côté serveur pour garantir
            que le message vient bien de Skalle.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>
              URLs qui recevront les événements (ex : Zapier Catch Hook).
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testLoading || endpoints.length === 0}>
              {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer un test
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter un webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun webhook. Ajoutez une URL pour recevoir les événements (article SEO terminé, etc.).
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {endpoints.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{e.url}</p>
                    <p className="text-sm text-muted-foreground">
                      Secret : <span className="font-mono">{e.secretMasked}</span> · {e.events.join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Créé le {formatDate(e.createdAt)} · {e.isActive ? "Actif" : "Inactif"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopySecret(e.id)}
                      disabled={copyId === e.id}
                    >
                      {copyId === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      Copier le secret
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteId(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dialog: ajouter webhook */}
      <Dialog open={addOpen} onOpenChange={(open) => !open && handleCloseAdd()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdSecret ? "Secret du webhook — copiez-le" : "Nouveau webhook"}
            </DialogTitle>
            <DialogDescription>
              {createdSecret
                ? "Ce secret ne sera plus affiché en clair ici. Utilisez le bouton « Copier le secret » sur l’endpoint pour le récupérer plus tard."
                : "Indiquez l’URL qui recevra les événements (ex : URL Zapier Catch Hook) et les événements à écouter."}
            </DialogDescription>
          </DialogHeader>
          {!createdSecret ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="webhook-url">URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://hooks.zapier.com/..."
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Événements</Label>
                <div className="flex flex-col gap-2">
                  {eventOptions.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={addEvents.includes(opt.value)}
                        onCheckedChange={(checked) => {
                          if (checked) setAddEvents((prev) => [...prev, opt.value]);
                          else setAddEvents((prev) => prev.filter((x) => x !== opt.value));
                        }}
                      />
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-muted-foreground text-xs">({opt.value})</span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseAdd}>
                  Annuler
                </Button>
                <Button onClick={handleAdd} disabled={!addUrl.trim() || addEvents.length === 0 || addLoading}>
                  {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-muted p-4 font-mono text-sm break-all">
                {createdSecret}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(createdSecret!);
                  toast.success("Secret copié");
                }}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copier le secret
              </Button>
              <DialogFooter>
                <Button onClick={handleCloseAdd}>J’ai copié le secret</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmer suppression */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce webhook ?</DialogTitle>
            <DialogDescription>
              Les événements ne seront plus envoyés à cette URL. Vous pourrez la recréer plus tard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
