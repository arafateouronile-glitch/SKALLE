"use client";

import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const PLANS = [
  {
    id: "FREE",
    name: "Free",
    price: 0,
    priceAnnual: 0,
    credits: 100,
    workspaces: 1,
    prospects: 50,
    popular: false,
    description: "Pour tester Skalle.",
    features: [
      "100 crédits / mois",
      "1 workspace",
      "50 prospects",
      "CMO basique (SEO, audits)",
      "Articles SEO courts",
    ],
    missing: ["Agent Brain", "Autopilot", "CSO / Sales OS", "API publique"],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 39,
    priceAnnual: 29,
    credits: 600,
    workspaces: 1,
    prospects: 200,
    popular: false,
    description: "CMO + CSO complets.",
    features: [
      "600 crédits / mois",
      "1 workspace",
      "200 prospects",
      "CMO complet (SEO Factory, Content, Ads)",
      "CSO / Sales OS",
      "Lead scoring",
      "Séquences multi-canal",
    ],
    missing: ["Agent Brain", "Autopilot", "API publique"],
  },
  {
    id: "AGENCY",
    name: "Agency",
    price: 89,
    priceAnnual: 69,
    credits: 2000,
    workspaces: 3,
    prospects: 1000,
    popular: true,
    description: "Autopilot + Agent Brain activés.",
    features: [
      "2 000 crédits / mois",
      "3 workspaces",
      "1 000 prospects",
      "Tout Business inclus",
      "Agent Brain (pilote automatique)",
      "Autopilot activé",
      "Support prioritaire",
    ],
    missing: ["API publique"],
  },
  {
    id: "SCALE",
    name: "Scale",
    price: 249,
    priceAnnual: 199,
    credits: 6000,
    workspaces: 10,
    prospects: 5000,
    popular: false,
    description: "Tout débloqué. API incluse.",
    features: [
      "6 000 crédits / mois",
      "10 workspaces",
      "5 000 prospects",
      "Tout Agency inclus",
      "API publique (Zapier, Make…)",
      "Support dédié",
    ],
    missing: [],
  },
];

interface PricingTableProps {
  variant?: "landing" | "app";
  currentPlan?: string;
  onSelectPlan?: (plan: string) => void;
  onTopup?: () => void;
  loadingPlan?: string | null;
}

export function PricingTable({
  variant = "landing",
  currentPlan,
  onSelectPlan,
  onTopup,
  loadingPlan,
}: PricingTableProps) {
  const isLanding = variant === "landing";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isPopular = plan.popular;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-2xl p-6 flex flex-col",
                isLanding
                  ? "bg-slate-900/60 border border-slate-700"
                  : "bg-white border border-gray-200 shadow-sm",
                isPopular && isLanding && "border-2 border-emerald-500/60 bg-gradient-to-b from-emerald-900/30 to-slate-900/60",
                isPopular && !isLanding && "border-2 border-emerald-500 ring-1 ring-emerald-500/30",
                isCurrent && !isLanding && "ring-2 ring-emerald-500"
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-full">
                    Populaire
                  </span>
                </div>
              )}
              {isCurrent && !isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-gray-700 text-white text-xs font-semibold rounded-full">
                    Plan actuel
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className={cn("text-lg font-bold mb-1", isLanding ? "text-white" : "text-gray-900")}>
                  {plan.name}
                </h3>
                <p className={cn("text-sm mb-4", isLanding ? "text-slate-400" : "text-gray-500")}>
                  {plan.description}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-4xl font-bold", isLanding ? "text-white" : "text-gray-900")}>
                    {plan.price === 0 ? "0 €" : `${plan.price} €`}
                  </span>
                  {plan.price > 0 && (
                    <span className={cn("text-sm", isLanding ? "text-slate-400" : "text-gray-500")}>/mois</span>
                  )}
                </div>
                {plan.priceAnnual > 0 && (
                  <p className={cn("text-xs mt-1", isLanding ? "text-slate-500" : "text-gray-400")}>
                    ou {plan.priceAnnual} €/mois en annuel (-25%)
                  </p>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className={cn("text-sm", isLanding ? "text-slate-300" : "text-gray-700")}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isLanding ? (
                <Link href={plan.id === "FREE" ? "/register" : `/register?plan=${plan.id}`}>
                  <Button
                    className={cn(
                      "w-full",
                      isPopular
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : plan.id === "FREE"
                        ? "border border-slate-600 text-slate-300 hover:bg-slate-800 bg-transparent"
                        : "border border-slate-600 text-slate-300 hover:bg-slate-800 bg-transparent"
                    )}
                    variant={isPopular ? "default" : "outline"}
                  >
                    {plan.id === "FREE" ? "Commencer" : `Choisir ${plan.name}`}
                  </Button>
                </Link>
              ) : (
                <div className="space-y-2">
                  {isCurrent ? (
                    <Button disabled className="w-full" variant="outline">
                      Plan actuel
                    </Button>
                  ) : plan.id === "FREE" ? null : (
                    <Button
                      className={cn(
                        "w-full",
                        isPopular ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                      )}
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => onSelectPlan?.(plan.id)}
                      disabled={!!loadingPlan}
                    >
                      {loadingPlan === plan.id ? "Chargement…" : `Choisir ${plan.name}`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Top-up */}
      {variant === "app" && onTopup && (
        <div className={cn(
          "rounded-xl p-4 flex items-center justify-between border",
          "bg-amber-50 border-amber-200"
        )}>
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Besoin de crédits supplémentaires ?</p>
              <p className="text-xs text-gray-500">500 crédits disponibles immédiatement, sans changer de plan.</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={onTopup}
            disabled={!!loadingPlan}
          >
            {loadingPlan === "topup" ? "Chargement…" : "+ 500 crédits • 19 €"}
          </Button>
        </div>
      )}

      {/* FAQ landing */}
      {variant === "landing" && (
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          {[
            { q: "Puis-je annuler ?", a: "Oui, à tout moment. Aucun engagement, aucune pénalité." },
            { q: "Les crédits sont-ils cumulables ?", a: "Non. Ils se remettent à zéro chaque mois. Achetez des top-ups pour en avoir plus." },
            { q: "Que se passe-t-il à 0 crédit ?", a: "Les actions IA sont bloquées. Vos données et workspaces restent accessibles." },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl bg-slate-900/40 border border-slate-700/60 p-4">
              <p className="text-sm font-medium text-white mb-1">{q}</p>
              <p className="text-xs text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
