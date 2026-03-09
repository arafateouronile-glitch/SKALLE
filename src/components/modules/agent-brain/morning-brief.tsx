"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DecisionCard } from "./decision-card";
import { AgentStatusBadge } from "./agent-status-badge";
import {
  approveAllDecisions,
  executeApprovedDecisions,
  triggerManualCycle,
} from "@/actions/agent-brain";
import { toast } from "sonner";
import {
  Brain,
  CheckCheck,
  Play,
  RefreshCw,
  Loader2,
  Coffee,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Decision {
  id: string;
  reasoning: string;
  actionType: string;
  priority: number;
  impact: string | null;
  status: string;
  linkedPost?: { id: string; type: string; title: string | null } | null;
}

interface MorningBriefProps {
  workspaceId: string;
  decisions: Decision[];
  isAutopilotActive: boolean;
  hasAlerts: boolean;
}

export function MorningBrief({
  workspaceId,
  decisions,
  isAutopilotActive,
  hasAlerts,
}: MorningBriefProps) {
  const [localDecisions, setLocalDecisions] = useState<Decision[]>(decisions);
  const [isPending, startTransition] = useTransition();
  const [isExecuting, setIsExecuting] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);

  const pendingCount = localDecisions.filter((d) => d.status === "PENDING").length;
  const approvedCount = localDecisions.filter((d) => d.status === "APPROVED").length;

  const refreshDecisions = () => {
    // Reload current page to refresh server data
    window.location.reload();
  };

  const handleApproveAll = () => {
    startTransition(async () => {
      const result = await approveAllDecisions(workspaceId);
      if (result.success) {
        setLocalDecisions((prev) =>
          prev.map((d) => (d.status === "PENDING" ? { ...d, status: "APPROVED" } : d))
        );
        toast.success(`${pendingCount} décision(s) approuvée(s)`);
      } else {
        toast.error(result.error ?? "Erreur lors de l'approbation");
      }
    });
  };

  const handleExecuteAll = async () => {
    setIsExecuting(true);
    const result = await executeApprovedDecisions(workspaceId);
    if (result.success) {
      toast.success(`Exécution lancée pour ${result.count} décision(s)`);
      setTimeout(refreshDecisions, 2000);
    } else {
      toast.error(result.error ?? "Erreur lors de l'exécution");
    }
    setIsExecuting(false);
  };

  const handleManualCycle = async () => {
    setIsTriggering(true);
    const result = await triggerManualCycle(workspaceId);
    if (result.success) {
      toast.success("Cycle d'analyse lancé – résultats disponibles dans quelques minutes");
    } else {
      toast.error(result.error ?? "Erreur");
    }
    setIsTriggering(false);
  };

  const today = format(new Date(), "EEEE d MMMM", { locale: fr });

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
                Morning Brief
                <AgentStatusBadge
                  isActive={isAutopilotActive}
                  hasAlerts={hasAlerts}
                  isRunning={isTriggering}
                />
              </CardTitle>
              <CardDescription className="capitalize">{today}</CardDescription>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualCycle}
              disabled={isTriggering}
              className="text-xs gap-1"
            >
              {isTriggering ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Analyser maintenant
            </Button>

            {pendingCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApproveAll}
                disabled={isPending}
                className="text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Tout valider ({pendingCount})
              </Button>
            )}

            {approvedCount > 0 && (
              <Button
                size="sm"
                onClick={handleExecuteAll}
                disabled={isExecuting}
                className="text-xs gap-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {isExecuting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Exécuter ({approvedCount})
              </Button>
            )}
          </div>
        </div>

        {/* Stats row */}
        {localDecisions.length > 0 && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Brain className="h-3 w-3" />
              <span>{localDecisions.length} décision(s) générée(s)</span>
            </div>
            {pendingCount > 0 && (
              <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                {pendingCount} en attente
              </Badge>
            )}
            {approvedCount > 0 && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                {approvedCount} approuvée(s)
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {localDecisions.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Aucune décision aujourd&apos;hui</p>
            <p className="text-xs mt-1">
              {isAutopilotActive
                ? "L'agent analysera vos données ce soir à 7h"
                : "Activez l'Autopilot ou lancez une analyse manuelle"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualCycle}
              disabled={isTriggering}
              className="mt-4 text-xs"
            >
              {isTriggering ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Lancer une analyse
            </Button>
          </div>
        ) : (
          localDecisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              {...decision}
              onStatusChange={() => {
                // Optimistic: we'll let the user reload for full sync
              }}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
