"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Linkedin,
  Play,
  Settings,
  CheckCircle2,
  Clock,
  Zap,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

interface AutomationConfig {
  id: string;
  isActive: boolean;
  dailyConnectLimit: number;
  dailyMessageLimit: number;
  sendAt: string;
  lastRunAt: string | null;
  lastRunStats: { sent: number; failed: number; skipped?: number } | null;
}

interface Props {
  workspaceId: string;
}

export function LinkedInAutomationSettings({ workspaceId }: Props) {
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggeringRun, setIsTriggeringRun] = useState(false);

  const [liAt, setLiAt] = useState("");
  const [showLiAt, setShowLiAt] = useState(false);
  const [dailyConnectLimit, setDailyConnectLimit] = useState(20);
  const [dailyMessageLimit, setDailyMessageLimit] = useState(50);
  const [sendAt, setSendAt] = useState("10:00");

  useEffect(() => {
    loadConfig();
  }, [workspaceId]);

  async function loadConfig() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/linkedin-automation?workspaceId=${workspaceId}`);
      const data = await res.json() as {
        config: AutomationConfig | null;
        hasSession: boolean;
        pendingCount: number;
      };
      setConfig(data.config);
      setHasSession(data.hasSession);
      setPendingCount(data.pendingCount);
      if (data.config) {
        setDailyConnectLimit(data.config.dailyConnectLimit);
        setDailyMessageLimit(data.config.dailyMessageLimit);
        setSendAt(data.config.sendAt);
      }
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        workspaceId,
        dailyConnectLimit,
        dailyMessageLimit,
        sendAt,
      };
      if (liAt.trim()) body.liAt = liAt.trim();

      const res = await fetch("/api/linkedin-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; config?: AutomationConfig; error?: string };
      if (!data.ok) { toast.error(data.error ?? "Erreur"); return; }

      setConfig(data.config ?? null);
      if (liAt.trim()) { setHasSession(true); setLiAt(""); }
      toast.success("Configuration sauvegardée");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!config) return;
    try {
      const res = await fetch("/api/linkedin-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, isActive: !config.isActive }),
      });
      const data = await res.json() as { ok?: boolean; config?: AutomationConfig };
      if (data.ok && data.config) {
        setConfig(data.config);
        toast.success(data.config.isActive ? "Automation activée" : "Automation désactivée");
      }
    } catch {
      toast.error("Erreur");
    }
  }

  async function handleTriggerNow() {
    if (!hasSession) { toast.error("Configurez d'abord votre cookie li_at"); return; }
    setIsTriggeringRun(true);
    try {
      const res = await fetch("/api/linkedin-automation?trigger=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (data.ok) {
        toast.success(data.message ?? "Envoi déclenché");
      } else {
        toast.error(data.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setIsTriggeringRun(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    );
  }

  const isActive = config?.isActive ?? false;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Linkedin className="h-5 w-5 text-sky-400" />
          <h3 className="text-[15px] font-semibold text-white">Automation LinkedIn</h3>
          <Badge
            variant="outline"
            className={
              isActive
                ? "text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "text-[10px] bg-slate-500/10 text-slate-400 border-slate-500/20"
            }
          >
            {isActive ? "● Actif" : "○ Inactif"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {config && (
            <button
              onClick={handleToggleActive}
              className="text-slate-400 hover:text-white transition-colors"
              title={isActive ? "Désactiver" : "Activer"}
            >
              {isActive ? (
                <ToggleRight className="h-6 w-6 text-emerald-400" />
              ) : (
                <ToggleLeft className="h-6 w-6" />
              )}
            </button>
          )}
          <Button
            size="sm"
            className="h-8 text-[12px] gap-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30"
            onClick={handleTriggerNow}
            disabled={isTriggeringRun || !hasSession}
            title={!hasSession ? "Configurez d'abord votre cookie li_at" : ""}
          >
            {isTriggeringRun ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Envoyer maintenant
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="text-[10px] text-slate-500 mb-1">En attente</div>
          <div className="text-[20px] font-bold text-white">{pendingCount}</div>
          <div className="text-[10px] text-slate-600">steps LinkedIn</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="text-[10px] text-slate-500 mb-1">Dernier envoi</div>
          <div className="text-[13px] font-semibold text-white">
            {config?.lastRunAt
              ? new Date(config.lastRunAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="text-[10px] text-slate-500 mb-1">Stats dernière run</div>
          {config?.lastRunStats ? (
            <div className="text-[12px] text-slate-300">
              <span className="text-emerald-400">{config.lastRunStats.sent} envoyés</span>
              {" · "}
              <span className="text-red-400">{config.lastRunStats.failed} échoués</span>
            </div>
          ) : (
            <div className="text-[12px] text-slate-600">—</div>
          )}
        </div>
      </div>

      {/* Cookie session */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-slate-400" />
          <span className="text-[13px] font-medium text-white">Session LinkedIn</span>
          {hasSession ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Cookie configuré
            </span>
          ) : (
            <span className="text-[10px] text-amber-400">Cookie manquant</span>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-500">
            Cookie <code className="bg-white/[0.05] px-1 rounded text-sky-400">li_at</code>
            {" "}(depuis les DevTools LinkedIn)
          </Label>
          <div className="relative">
            <Input
              type={showLiAt ? "text" : "password"}
              value={liAt}
              onChange={(e) => setLiAt(e.target.value)}
              placeholder={hasSession ? "••••••••••• (laisser vide pour conserver)" : "Colle ton cookie li_at ici"}
              className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-600 text-[12px] pr-10 h-9"
            />
            <button
              type="button"
              onClick={() => setShowLiAt((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showLiAt ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            DevTools → Application → Cookies → linkedin.com → cherche <code className="text-sky-500">li_at</code>
          </p>
        </div>
      </div>

      {/* Limits config */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-[13px] font-medium text-white">Limites quotidiennes</span>
          <span className="text-[10px] text-slate-600">(pour protéger ton compte)</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Connexions / jour (max 40)</Label>
            <Input
              type="number"
              min={1}
              max={40}
              value={dailyConnectLimit}
              onChange={(e) => setDailyConnectLimit(Math.min(40, parseInt(e.target.value) || 1))}
              className="bg-white/[0.03] border-white/[0.08] text-white h-9 text-[12px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">Messages / jour (max 100)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={dailyMessageLimit}
              onChange={(e) => setDailyMessageLimit(Math.min(100, parseInt(e.target.value) || 1))}
              className="bg-white/[0.03] border-white/[0.08] text-white h-9 text-[12px]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Heure d'envoi automatique
          </Label>
          <Input
            type="time"
            value={sendAt}
            onChange={(e) => setSendAt(e.target.value)}
            className="bg-white/[0.03] border-white/[0.08] text-white h-9 text-[12px] w-32"
          />
          <p className="text-[10px] text-slate-600">Lun–Ven, heure locale serveur (UTC)</p>
        </div>
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full h-9 text-[13px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30"
      >
        {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Sauvegarder la configuration
      </Button>
    </div>
  );
}
