"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Flame,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMailboxesWarmupStatusAction,
  startMailboxWarmupAction,
  pauseMailboxWarmupAction,
  resumeMailboxWarmupAction,
  resetMailboxWarmupAction,
  type MailboxWarmupEntry,
} from "@/actions/warmup";

interface Props {
  workspaceId: string;
}

const TARGET_OPTIONS = [
  { label: "50 emails/jour", value: 50 },
  { label: "100 emails/jour", value: 100 },
  { label: "200 emails/jour", value: 200 },
  { label: "300 emails/jour", value: 300 },
  { label: "500 emails/jour", value: 500 },
];

const STATUS_CONFIG: Record<
  MailboxWarmupEntry["status"],
  { label: string; color: string; icon: React.ElementType }
> = {
  inactive:  { label: "Inactif",    color: "bg-gray-100 text-gray-600",              icon: Clock },
  running:   { label: "En cours",   color: "bg-emerald-100 text-emerald-700",         icon: Flame },
  paused:    { label: "En pause",   color: "bg-amber-100 text-amber-700",             icon: Pause },
  completed: { label: "Terminé",    color: "bg-blue-100 text-blue-700",               icon: CheckCircle2 },
};

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  office365: "Office 365",
  custom: "SMTP",
};

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full rounded-full bg-gray-100 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function ScheduleTable({ schedule }: { schedule: MailboxWarmupEntry["schedule"]; currentDay: number }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-10 gap-0.5 p-2">
        {schedule.map((s) => (
          <div
            key={s.day}
            className="flex flex-col items-center gap-0.5"
            title={`Jour ${s.day}: ${s.limit} emails`}
          >
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(4, Math.round(s.pct / 4))}px`,
                background: `oklch(0.55 0.2 290 / ${0.3 + s.pct / 140})`,
              }}
            />
            {s.day % 5 === 0 && (
              <span className="text-[9px] text-gray-400">{s.day}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between px-2 pb-1">
        <span className="text-[10px] text-gray-400">Jour 1: {schedule[0]?.limit} emails</span>
        <span className="text-[10px] text-gray-400">Jour 30: {schedule[29]?.limit} emails</span>
      </div>
    </div>
  );
}

function MailboxCard({
  mailbox,
  onRefresh,
  workspaceId,
}: {
  mailbox: MailboxWarmupEntry;
  onRefresh: () => void;
  workspaceId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [targetVolume, setTargetVolume] = useState(mailbox.warmupTargetVol || 100);

  const statusCfg = STATUS_CONFIG[mailbox.status];
  const StatusIcon = statusCfg.icon;

  const handle = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setLoading(true);
    try {
      const res = await fn();
      if (res.success) {
        onRefresh();
      } else {
        toast.error(res.error || "Erreur");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const isActive = mailbox.status === "running" || mailbox.status === "paused";
  const completionDate = mailbox.estimatedCompletionDate
    ? new Date(mailbox.estimatedCompletionDate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <Card className="border-gray-200/70 bg-white shadow-sm">
      <CardContent className="pt-4 pb-4 px-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
              <Mail className="h-4.5 w-4.5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{mailbox.fromEmail}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-gray-400">{mailbox.label}</span>
                <span className="text-gray-200">·</span>
                <span className="text-xs text-gray-400">
                  {PROVIDER_LABELS[mailbox.provider] || mailbox.provider}
                </span>
                {!mailbox.isVerified && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-amber-500 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      Non vérifié
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <Badge className={`text-xs px-2 py-0.5 font-medium border-0 flex-shrink-0 ${statusCfg.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusCfg.label}
          </Badge>
        </div>

        {/* Progress row — only when warmup has started */}
        {isActive && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Jour {mailbox.warmupDay}/30</span>
              <span>{mailbox.progressPct}%</span>
            </div>
            <ProgressBar value={mailbox.progressPct} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                Aujourd'hui:{" "}
                <span className="font-medium text-gray-800">
                  {mailbox.warmupSentToday}/{mailbox.todayLimit}
                </span>{" "}
                emails
              </span>
              {completionDate && (
                <span className="text-gray-400">
                  Fin estimée : {completionDate}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mt-3 flex items-center gap-2">
          {mailbox.status === "inactive" && (
            <>
              <Select
                value={String(targetVolume)}
                onValueChange={(v) => setTargetVolume(Number(v))}
              >
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                disabled={loading || !mailbox.isVerified}
                onClick={() =>
                  handle(() =>
                    startMailboxWarmupAction(workspaceId, mailbox.id, targetVolume)
                  )
                }
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Flame className="h-3 w-3 mr-1.5" />
                )}
                Démarrer
              </Button>
            </>
          )}

          {mailbox.status === "running" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={loading}
                onClick={() =>
                  handle(() => pauseMailboxWarmupAction(workspaceId, mailbox.id))
                }
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Pause className="h-3 w-3 mr-1.5" />}
                Pause
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-gray-500"
                onClick={() => setShowSchedule((v) => !v)}
              >
                Plan <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showSchedule ? "rotate-180" : ""}`} />
              </Button>
            </>
          )}

          {mailbox.status === "paused" && (
            <>
              <Button
                size="sm"
                className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                disabled={loading}
                onClick={() =>
                  handle(() => resumeMailboxWarmupAction(workspaceId, mailbox.id))
                }
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Play className="h-3 w-3 mr-1.5" />}
                Reprendre
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-gray-500"
                disabled={loading}
                onClick={() =>
                  handle(() => resetMailboxWarmupAction(workspaceId, mailbox.id))
                }
              >
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Réinitialiser
              </Button>
            </>
          )}

          {mailbox.status === "completed" && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Warm-up terminé — boite mail prête
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-gray-400 ml-2"
                disabled={loading}
                onClick={() =>
                  handle(() => resetMailboxWarmupAction(workspaceId, mailbox.id))
                }
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>
          )}
        </div>

        {/* Expandable schedule chart */}
        {isActive && showSchedule && (
          <ScheduleTable schedule={mailbox.schedule} currentDay={mailbox.warmupDay} />
        )}
      </CardContent>
    </Card>
  );
}

export function EmailWarmupDashboard({ workspaceId }: Props) {
  const [mailboxes, setMailboxes] = useState<MailboxWarmupEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      const res = await getMailboxesWarmupStatusAction(workspaceId);
      if (res.success && res.data) {
        setMailboxes(res.data);
      }
    } catch {
      toast.error("Erreur lors du chargement des boites mail");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeCount = mailboxes.filter((m) => m.status === "running").length;
  const completedCount = mailboxes.filter((m) => m.status === "completed").length;

  return (
    <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Warm-up des boites mail
            </CardTitle>
            <CardDescription className="text-gray-500 mt-1">
              Chauffe progressivement tes boites mail sur 30 jours pour bâtir une réputation solide et éviter les spams.
            </CardDescription>
          </div>
          {mailboxes.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {activeCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Zap className="h-3 w-3" />
                  {activeCount} en cours
                </span>
              )}
              {completedCount > 0 && (
                <span className="flex items-center gap-1 text-blue-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {completedCount} terminé{completedCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : mailboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mail className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-1">Aucune boite mail configurée</p>
            <p className="text-xs text-gray-400">
              Ajoute une boite mail dans l'onglet <strong>SMTP</strong> ci-dessus pour commencer.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mailboxes.map((m) => (
              <MailboxCard
                key={m.id}
                mailbox={m}
                workspaceId={workspaceId}
                onRefresh={load}
              />
            ))}
          </div>
        )}

        {/* Info banner */}
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700 flex gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Comment ça marche ?</strong> Le warm-up limite automatiquement les envois de campagnes via cette boite mail selon un plan progressif sur 30 jours.
            {" "}L'objectif : bâtir une réputation d'expéditeur légitime avant d'envoyer à grande échelle.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
