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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Settings,
  Mail,
  AlertTriangle,
  Plus,
  Trash2,
  Star,
  StarOff,
} from "lucide-react";
import {
  saveSmtpConfig,
  testSmtpConnection,
  getSmtpConfigs,
  deleteSmtpConfig,
  setDefaultSmtpConfig,
} from "@/actions/campaigns";
import { toast } from "sonner";

const PRESETS: Record<
  string,
  { host: string; port: number; secure: boolean; label: string; help: string; imapHost?: string; imapPort?: number }
> = {
  gmail: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    label: "Gmail",
    help: "Utilisez un mot de passe d'application : Google Account > Sécurité > Mots de passe des applications",
    imapHost: "imap.gmail.com",
    imapPort: 993,
  },
  outlook: {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    label: "Outlook / Office 365",
    help: "Utilisez votre mot de passe habituel ou un mot de passe d'application si 2FA est activé",
    imapHost: "outlook.office365.com",
    imapPort: 993,
  },
  custom: {
    host: "",
    port: 587,
    secure: false,
    label: "Personnalisé",
    help: "Entrez les paramètres SMTP de votre fournisseur",
  },
};

interface SmtpConfig {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  provider: string;
  isVerified: boolean;
  isDefault: boolean;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean;
  dailyLimit: number;
  perMinuteLimit: number;
}

interface SmtpConfigFormProps {
  workspaceId: string;
}

const emptyForm = {
  label: "",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
};

export function SmtpConfigForm({ workspaceId }: SmtpConfigFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [provider, setProvider] = useState("gmail");
  const [showImap, setShowImap] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setIsLoading(true);
    try {
      const result = await getSmtpConfigs(workspaceId);
      if (result.success && result.data) {
        setConfigs(result.data as SmtpConfig[]);
      }
    } catch {
      // No configs yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const preset = PRESETS[value];
    if (preset) {
      setForm((prev) => ({
        ...prev,
        host: preset.host || prev.host,
        port: preset.port,
        secure: preset.secure,
        imapHost: preset.imapHost || prev.imapHost,
        imapPort: preset.imapPort || prev.imapPort,
      }));
    }
  };

  const handleSave = async () => {
    if (!form.username || !form.password || !form.fromEmail || !form.fromName) {
      toast.error("Tous les champs obligatoires sont requis");
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveSmtpConfig(workspaceId, {
        label: form.label || form.fromEmail,
        host: form.host,
        port: form.port,
        secure: form.secure,
        username: form.username,
        password: form.password,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        provider,
        imapHost: showImap ? form.imapHost : undefined,
        imapPort: showImap ? form.imapPort : undefined,
        imapSecure: showImap ? form.imapSecure : undefined,
      });
      if (result.success) {
        toast.success("Compte email ajouté");
        setShowAddDialog(false);
        setForm({ ...emptyForm });
        setProvider("gmail");
        setShowImap(false);
        await loadConfigs();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (configId: string) => {
    setIsTesting(configId);
    try {
      const result = await testSmtpConnection(configId);
      if (result.success) {
        toast.success("Connexion SMTP vérifiée !");
        await loadConfigs();
      } else {
        toast.error(result.error || "Connexion échouée");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setIsTesting(null);
    }
  };

  const handleDelete = async (configId: string) => {
    setIsDeleting(configId);
    try {
      const result = await deleteSmtpConfig(configId);
      if (result.success) {
        toast.success("Compte email supprimé");
        await loadConfigs();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSetDefault = async (configId: string) => {
    try {
      const result = await setDefaultSmtpConfig(configId);
      if (result.success) {
        toast.success("Compte par défaut mis à jour");
        await loadConfigs();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Comptes d'envoi</h3>
          <p className="text-sm text-slate-400">
            Configurez plusieurs comptes SMTP pour vos campagnes
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un compte
        </Button>
      </div>

      {/* Sender cards */}
      {configs.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="py-12 text-center">
            <Mail className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-4">
              Aucun compte SMTP configuré
            </p>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter votre premier compte
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {configs.map((cfg) => (
            <Card
              key={cfg.id}
              className={`bg-slate-900/50 border-slate-800 ${
                cfg.isDefault ? "ring-1 ring-purple-500/50" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-purple-400" />
                    {cfg.label || cfg.fromEmail}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {cfg.isDefault && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                        Par défaut
                      </Badge>
                    )}
                    {cfg.isVerified ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Vérifié
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Non vérifié
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-slate-400 text-sm">
                  {cfg.fromName} &lt;{cfg.fromEmail}&gt;
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-500 space-y-1">
                  <div>Serveur: {cfg.host}:{cfg.port}</div>
                  <div>Fournisseur: {PRESETS[cfg.provider]?.label || cfg.provider}</div>
                  <div>Limite: {cfg.dailyLimit}/jour, {cfg.perMinuteLimit}/min</div>
                  {cfg.imapHost && (
                    <div className="text-blue-400">
                      IMAP: {cfg.imapHost}:{cfg.imapPort} (détection réponses active)
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 text-xs"
                    onClick={() => handleTest(cfg.id)}
                    disabled={isTesting === cfg.id}
                  >
                    {isTesting === cfg.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    Tester
                  </Button>
                  {!cfg.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 text-xs"
                      onClick={() => handleSetDefault(cfg.id)}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Défaut
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-800 text-red-400 text-xs ml-auto hover:bg-red-900/30"
                    onClick={() => handleDelete(cfg.id)}
                    disabled={isDeleting === cfg.id}
                  >
                    {isDeleting === cfg.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add SMTP Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Ajouter un compte email</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configurez un nouveau compte SMTP pour vos campagnes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Label */}
            <div className="space-y-2">
              <Label>Nom du compte</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: Gmail Principal, Outlook Pro..."
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Provider */}
            <div className="space-y-2">
              <Label>Fournisseur</Label>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {PRESETS[provider]?.help && (
                <p className="text-xs text-slate-500">{PRESETS[provider].help}</p>
              )}
            </div>

            {/* SMTP Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Serveur SMTP</Label>
                <Input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="smtp.example.com"
                  className="bg-slate-800 border-slate-700"
                  disabled={provider !== "custom"}
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                  className="bg-slate-800 border-slate-700"
                  disabled={provider !== "custom"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom d'utilisateur (email)</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="votre@email.com"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mot de passe d'application"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email expéditeur</Label>
                <Input
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                  placeholder="votre@email.com"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Nom expéditeur</Label>
                <Input
                  value={form.fromName}
                  onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                  placeholder="Jean Dupont"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            {/* IMAP Section */}
            <div className="border-t border-slate-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-sm font-medium">Détection de réponses (IMAP)</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Détectez automatiquement les réponses pour stopper les follow-ups
                  </p>
                </div>
                <Switch checked={showImap} onCheckedChange={setShowImap} />
              </div>

              {showImap && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Serveur IMAP</Label>
                    <Input
                      value={form.imapHost}
                      onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                      placeholder="imap.gmail.com"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port IMAP</Label>
                    <Input
                      type="number"
                      value={form.imapPort}
                      onChange={(e) => setForm({ ...form, imapPort: parseInt(e.target.value) || 993 })}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="border-slate-700 text-slate-300"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
