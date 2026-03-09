"use client";

/**
 * PlanGuard — Bloque l'accès aux features premium.
 *
 * Usage :
 *   <PlanGuard requiredPlan="BUSINESS" currentPlan={user.plan}>
 *     <MonComposantPremium />
 *   </PlanGuard>
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Lock, Zap } from "lucide-react";

const PLAN_ORDER: Record<string, number> = {
  FREE: 0,
  BUSINESS: 1,
  AGENCY: 2,
  SCALE: 3,
};

const PLAN_LABELS: Record<string, string> = {
  FREE: "Gratuit",
  BUSINESS: "Business",
  AGENCY: "Agency",
  SCALE: "Scale",
};

interface PlanGuardProps {
  requiredPlan: "BUSINESS" | "AGENCY" | "SCALE";
  currentPlan: string;
  children: React.ReactNode;
  /** Message personnalisé affiché dans la modale */
  featureLabel?: string;
}

export function PlanGuard({
  requiredPlan,
  currentPlan,
  children,
  featureLabel,
}: PlanGuardProps) {
  const [open, setOpen] = useState(false);
  const hasAccess = (PLAN_ORDER[currentPlan] ?? 0) >= (PLAN_ORDER[requiredPlan] ?? 1);

  if (hasAccess) return <>{children}</>;

  const handleUpgrade = async () => {
    const res = await fetch("/api/stripe/checkout-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: requiredPlan }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <>
      <div
        className="relative cursor-pointer group"
        onClick={() => setOpen(true)}
        title={`Fonctionnalité ${PLAN_LABELS[requiredPlan]}`}
      >
        {/* Overlay verrouillé */}
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-1 text-gray-500">
            <Lock className="h-5 w-5" />
            <span className="text-xs font-medium">{PLAN_LABELS[requiredPlan]}</span>
          </div>
        </div>
        <div className="pointer-events-none opacity-40 select-none">{children}</div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Fonctionnalité {PLAN_LABELS[requiredPlan]}
            </DialogTitle>
            <DialogDescription>
              {featureLabel
                ? `${featureLabel} est disponible à partir du plan ${PLAN_LABELS[requiredPlan]}.`
                : `Cette fonctionnalité nécessite le plan ${PLAN_LABELS[requiredPlan]} ou supérieur.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Plus tard
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleUpgrade}
            >
              Passer au plan {PLAN_LABELS[requiredPlan]}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
