"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Play,
  Pause,
  Rocket,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Users,
  TrendingUp,
  Eye,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getCampaigns,
  getCampaignDetail,
  personalizeCampaign,
  launchCampaign,
  pauseCampaign,
} from "@/actions/campaigns";
import { toast } from "sonner";

interface CampaignDashboardProps {
  workspaceId: string;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  DRAFT: {
    label: "Brouillon",
    color: "bg-gray-400/20 text-gray-500 border-gray-500/30",
    icon: <Clock className="h-3 w-3" />,
  },
  PERSONALIZING: {
    label: "Personnalisation...",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: <Sparkles className="h-3 w-3" />,
  },
  READY: {
    label: "Prête",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  SENDING: {
    label: "En cours d'envoi",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: <Mail className="h-3 w-3" />,
  },
  PAUSED: {
    label: "En pause",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: <Pause className="h-3 w-3" />,
  },
  COMPLETED: {
    label: "Terminée",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  FAILED: {
    label: "Échouée",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function CampaignDashboard({ workspaceId }: CampaignDashboardProps) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const result = await getCampaigns(workspaceId);
      if (result.success && result.data) {
        setCampaigns(result.data);
      }
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpand = async (campaignId: string) => {
    if (expandedId === campaignId) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }

    setExpandedId(campaignId);
    const result = await getCampaignDetail(campaignId);
    if (result.success && result.data) {
      setExpandedDetail(result.data);
    }
  };

  const handlePersonalize = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      const result = await personalizeCampaign(campaignId);
      if (result.success) {
        toast.success("Personnalisation terminée !");
        loadCampaigns();
      } else {
        toast.error(result.error || "Erreur de personnalisation");
      }
    } catch {
      toast.error("Erreur");
    } finally {
      setActionLoading(null);
    }
  };

  const handleLaunch = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      const result = await launchCampaign(campaignId);
      if (result.success) {
        toast.success("Campagne lancée !");
        loadCampaigns();
      } else {
        toast.error(result.error || "Erreur de lancement");
      }
    } catch {
      toast.error("Erreur");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      const result = await pauseCampaign(campaignId);
      if (result.success) {
        toast.success("Campagne mise en pause");
        loadCampaigns();
      } else {
        toast.error(result.error || "Erreur");
      }
    } catch {
      toast.error("Erreur");
    } finally {
      setActionLoading(null);
    }
  };

  const getProgressPercentage = (campaign: any) => {
    const total = campaign.totalProspects || 0;
    const sent = campaign.totalSent || 0;
    if (total === 0) return 0;
    return Math.round((sent / total) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="py-16 text-center">
          <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucune campagne
          </h3>
          <p className="text-gray-500 mb-4">
            Sélectionnez des prospects dans l'onglet "Prospects" pour créer votre première campagne
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Campagnes</div>
            <div className="text-2xl font-bold text-gray-900">{campaigns.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">En cours</div>
            <div className="text-2xl font-bold text-purple-400">
              {campaigns.filter((c) => c.status === "SENDING").length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Emails envoyés</div>
            <div className="text-2xl font-bold text-green-400">
              {campaigns.reduce((sum: number, c: any) => sum + (c.totalSent || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Échecs</div>
            <div className="text-2xl font-bold text-red-400">
              {campaigns.reduce((sum: number, c: any) => sum + (c.totalFailed || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign list */}
      {campaigns.map((campaign) => {
        const status = statusConfig[campaign.status] || statusConfig.DRAFT;
        const progress = getProgressPercentage(campaign);
        const isExpanded = expandedId === campaign.id;

        return (
          <Card key={campaign.id} className="bg-gray-50 border-gray-200">
            <CardContent className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                    <Badge variant="outline" className={status.color}>
                      {status.icon}
                      <span className="ml-1">{status.label}</span>
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {campaign.totalProspects} prospects
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {campaign.totalSent || 0} envoyés
                    </span>
                    {campaign.totalFailed > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle className="h-3 w-3" />
                        {campaign.totalFailed} échoués
                      </span>
                    )}
                    <span>
                      {new Date(campaign.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Actions based on status */}
                  {campaign.status === "DRAFT" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-300 text-xs"
                      onClick={() => handlePersonalize(campaign.id)}
                      disabled={actionLoading === campaign.id}
                    >
                      {actionLoading === campaign.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Personnaliser
                    </Button>
                  )}
                  {(campaign.status === "READY" || campaign.status === "PAUSED") && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-xs"
                      onClick={() => handleLaunch(campaign.id)}
                      disabled={actionLoading === campaign.id}
                    >
                      {actionLoading === campaign.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      Lancer
                    </Button>
                  )}
                  {campaign.status === "SENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-500/30 text-orange-400 text-xs"
                      onClick={() => handlePause(campaign.id)}
                      disabled={actionLoading === campaign.id}
                    >
                      {actionLoading === campaign.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Pause className="h-3 w-3 mr-1" />
                      )}
                      Pause
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-500"
                    onClick={() => handleExpand(campaign.id)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              {(campaign.status === "SENDING" || campaign.status === "COMPLETED") && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Progression</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        campaign.status === "COMPLETED"
                          ? "bg-green-500"
                          : "bg-purple-500"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && expandedDetail && (
                <div className="border-t border-gray-300 pt-3 mt-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    Détail par prospect
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {expandedDetail.sequences?.map((seq: any) => (
                      <div
                        key={seq.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                      >
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">
                            {seq.prospect?.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {seq.prospect?.email || "Pas d'email"} -{" "}
                            {seq.prospect?.company}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {seq.steps?.map((s: any) => {
                            const stepColor =
                              s.status === "SENT"
                                ? "bg-green-500"
                                : s.status === "FAILED"
                                ? "bg-red-500"
                                : s.status === "PENDING"
                                ? "bg-gray-300"
                                : "bg-yellow-500";
                            return (
                              <div
                                key={s.id || s.stepNumber}
                                className={`w-6 h-6 rounded-full ${stepColor} flex items-center justify-center text-xs text-gray-900 font-medium`}
                                title={`Étape ${s.stepNumber}: ${s.status}`}
                              >
                                {s.stepNumber}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
