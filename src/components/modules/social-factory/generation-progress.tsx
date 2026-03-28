"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getContentPlan, cancelContentPlan } from "@/actions/social-factory";

interface GenerationProgressProps {
  contentPlanId: string;
  onComplete: () => void;
}

export function GenerationProgress({
  contentPlanId,
  onComplete,
}: GenerationProgressProps) {
  const [status, setStatus] = useState<string>("PENDING");
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [total, setTotal] = useState(30);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await getContentPlan(contentPlanId);
      if (result.success && result.data) {
        setStatus(result.data.status);
        setCompleted(result.data.completed);
        setFailed(result.data.failed);
        setTotal(result.data.totalConcepts);

        if (result.data.status === "COMPLETED" || result.data.status === "FAILED") {
          clearInterval(interval);
          onComplete();
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [contentPlanId, onComplete]);

  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
  const isGenerating = status === "GENERATING";
  const isPending = status === "PENDING";
  const isCompleted = status === "COMPLETED";
  const isFailed = status === "FAILED";

  const handleCancel = async () => {
    setIsCancelling(true);
    await cancelContentPlan(contentPlanId);
    onComplete();
  };

  return (
    <Card className={isGenerating ? "ai-glow-card" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isGenerating && <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />}
          {isCompleted && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          {isFailed && <XCircle className="h-5 w-5 text-red-500" />}
          {status === "PENDING" && <Clock className="h-5 w-5 text-gray-400" />}
          Génération en cours
        </CardTitle>
        <CardDescription>
          {isGenerating && "L'IA analyse vos données et génère les posts..."}
          {isCompleted && "Tous les posts ont été générés avec succès !"}
          {isFailed && "La génération a échoué. Veuillez réessayer."}
          {isPending && "En attente de démarrage..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-3" />
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-3">
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {completed} terminés
            </Badge>
            {failed > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {failed} échoués
              </Badge>
            )}
          </div>
          <span className="text-gray-500">{progress}% ({completed + failed}/{total})</span>
        </div>
        {(isPending || isGenerating) && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full mt-2 text-gray-500"
          >
            {isCancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Annuler et recommencer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
