"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Flame,
  MessageCircle,
  Search,
  Share2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { approveDecision, rejectDecision } from "@/actions/agent-brain";
import { toast } from "sonner";

const ACTION_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  SEO_ARTICLE: { label: "Article SEO", icon: FileText, color: "bg-blue-100 text-blue-700" },
  SOCIAL_POST: { label: "Post Social", icon: Share2, color: "bg-purple-100 text-purple-700" },
  AD_REMIX: { label: "Remix Pub", icon: Flame, color: "bg-orange-100 text-orange-700" },
  PROSPECT_DM: { label: "DM Prospect", icon: MessageCircle, color: "bg-green-100 text-green-700" },
  DISCOVERY_SCAN: { label: "Scan Concurrent", icon: Search, color: "bg-cyan-100 text-cyan-700" },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200" },
  2: { label: "Important", color: "bg-orange-100 text-orange-700 border-orange-200" },
  3: { label: "Normal", color: "bg-blue-100 text-blue-700 border-blue-200" },
  4: { label: "Mineur", color: "bg-gray-100 text-gray-600 border-gray-200" },
  5: { label: "Optionnel", color: "bg-gray-50 text-gray-500 border-gray-200" },
};

interface DecisionCardProps {
  id: string;
  reasoning: string;
  actionType: string;
  priority: number;
  impact: string | null;
  status: string;
  linkedPost?: { id: string; type: string; title: string | null } | null;
  onStatusChange?: () => void;
}

export function DecisionCard({
  id,
  reasoning,
  actionType,
  priority,
  impact,
  status,
  linkedPost,
  onStatusChange,
}: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const action = ACTION_CONFIG[actionType] ?? ACTION_CONFIG.SEO_ARTICLE;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[3];
  const ActionIcon = action.icon;

  const handleApprove = async () => {
    setLoading(true);
    const result = await approveDecision(id);
    if (result.success) {
      toast.success("Décision approuvée");
      onStatusChange?.();
    } else {
      toast.error(result.error ?? "Erreur");
    }
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);
    const result = await rejectDecision(id);
    if (result.success) {
      toast.success("Décision rejetée");
      onStatusChange?.();
    } else {
      toast.error(result.error ?? "Erreur");
    }
    setLoading(false);
  };

  const isActionable = status === "PENDING";

  return (
    <Card className={`transition-all ${status === "APPROVED" ? "ring-1 ring-emerald-300 bg-emerald-50/30" : status === "REJECTED" ? "opacity-50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`p-2 rounded-lg ${action.color} shrink-0`}>
            <ActionIcon className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs border ${action.color}`}>
                {action.label}
              </Badge>
              <Badge className={`text-xs border ${priorityConfig.color}`}>
                P{priority} - {priorityConfig.label}
              </Badge>
              {status !== "PENDING" && (
                <Badge variant={status === "APPROVED" ? "default" : status === "EXECUTED" ? "default" : "outline"} className="text-xs">
                  {status}
                </Badge>
              )}
            </div>

            {/* Reasoning preview */}
            <p className={`text-sm text-gray-700 ${expanded ? "" : "line-clamp-2"}`}>
              {reasoning}
            </p>

            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Moins" : "Voir le raisonnement complet"}
            </button>

            {/* Impact */}
            {impact && (
              <p className="text-xs text-emerald-600 font-medium">
                Impact estimé : {impact}
              </p>
            )}

            {/* Linked Post */}
            {linkedPost && (
              <p className="text-xs text-gray-500">
                Asset : {linkedPost.type} - {linkedPost.title ?? "Brouillon"}
              </p>
            )}

            {/* Actions */}
            {isActionable && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleApprove}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Approuver
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={handleReject}
                  disabled={loading}
                >
                  <X className="h-3 w-3 mr-1" />
                  Rejeter
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
