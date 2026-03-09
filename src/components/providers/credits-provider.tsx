"use client";

import { createContext, useContext, useMemo } from "react";
import { PLAN_LIMITS } from "@/lib/credits";

interface CreditsContextValue {
  credits: number;
  plan: string;
  monthlyCredits: number;
  isDepleted: boolean;
  canAfford: (cost: number) => boolean;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({
  children,
  credits,
  plan,
}: {
  children: React.ReactNode;
  credits: number;
  plan: string;
}) {
  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const monthlyCredits = PLAN_LIMITS[planKey].monthlyCredits;
  const value = useMemo(
    () => ({
      credits,
      plan,
      monthlyCredits,
      isDepleted: credits <= 0,
      canAfford: (cost: number) => credits >= cost,
    }),
    [credits, plan, monthlyCredits]
  );
  return (
    <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>
  );
}

export function useCreditsContext(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    return {
      credits: 0,
      plan: "FREE",
      monthlyCredits: 100,
      isDepleted: true,
      canAfford: () => false,
    };
  }
  return ctx;
}
