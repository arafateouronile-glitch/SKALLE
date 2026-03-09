"use client";

import { Badge } from "@/components/ui/badge";
import { Brain, AlertTriangle, Power, Loader2 } from "lucide-react";

interface AgentStatusBadgeProps {
  isActive: boolean;
  hasAlerts: boolean;
  isRunning?: boolean;
}

export function AgentStatusBadge({ isActive, hasAlerts, isRunning }: AgentStatusBadgeProps) {
  if (isRunning) {
    return (
      <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200">
        <Loader2 className="h-3 w-3 animate-spin" />
        En cours
      </Badge>
    );
  }

  if (hasAlerts) {
    return (
      <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">
        <AlertTriangle className="h-3 w-3" />
        Alerte
      </Badge>
    );
  }

  if (isActive) {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
        <Brain className="h-3 w-3" />
        Actif
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-gray-500">
      <Power className="h-3 w-3" />
      Inactif
    </Badge>
  );
}
