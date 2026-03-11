"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, getCreditAlert } from "@/lib/credits";
import {
  Zap,
  LayoutDashboard,
  Search,
  FileText,
  Settings,
  TrendingUp,
  Image,
  Sparkles,
  Target,
  Factory,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Plug,
  Webhook,
  Cpu,
} from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  BUSINESS: "Business",
  AGENCY: "Agence",
  SCALE: "Scale",
};

interface SidebarProps {
  credits: number;
  plan: string;
}

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  highlight?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    label: "COMMAND CENTER",
    items: [
      { name: "Dashboard", href: "/marketing-os", icon: LayoutDashboard },
      { name: "Autopilot", href: "/marketing-os/autopilot", icon: Sparkles, highlight: true },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { name: "Keywords", href: "/marketing-os/keywords", icon: Target },
      { name: "Concurrents", href: "/marketing-os/discovery", icon: Search },
    ],
  },
  {
    label: "CRÉATION",
    items: [
      { name: "SEO Factory", href: "/marketing-os/seo-factory", icon: FileText },
      { name: "Content Factory", href: "/marketing-os/social/factory", icon: Factory },
      { name: "Images IA", href: "/marketing-os/images", icon: Image },
    ],
  },
  {
    label: "MESURE & CONFIG",
    items: [
      { name: "Analytics", href: "/marketing-os/analytics", icon: TrendingUp },
      { name: "Paramètres", href: "/marketing-os/settings", icon: Settings },
      { name: "Intégrations API", href: "/marketing-os/settings/integrations", icon: Plug },
      { name: "Webhooks", href: "/marketing-os/settings/webhooks", icon: Webhook },
    ],
  },
];

type BudgetStatus = {
  spentUsd: string;
  limitUsd: string;
  remainingCents: number;
  limitCents: number;
};

export function Sidebar({ credits, plan }: SidebarProps) {
  const pathname = usePathname();
  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const maxCredits = PLAN_LIMITS[planKey].monthlyCredits;
  const creditPct = maxCredits ? Math.min(100, Math.round((credits / maxCredits) * 100)) : 0;
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const alert = getCreditAlert(credits, maxCredits);
  const showAlert = alert.level !== "none";

  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  useEffect(() => {
    fetch("/api/agents/budget")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setBudget(data))
      .catch(() => null);
  }, []);

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/marketing-os" && pathname.startsWith(href));

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-72 lg:flex-col lg:pt-4 lg:pb-4 lg:pl-4">
      <div className="flex w-full grow flex-col overflow-y-auto rounded-2xl border border-white/20 bg-white/60 shadow-2xl shadow-black/5 backdrop-blur-xl px-4 pb-4">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold text-gray-900">Skalle</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
              CMO
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-y-1 mt-2">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-2 pt-4 pb-1 text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                {section.label}
              </p>
              <ul role="list" className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium leading-6 transition-all duration-200",
                          active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-100/80"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4.5 w-4.5 shrink-0 transition-colors",
                            active
                              ? "text-emerald-600"
                              : "text-gray-400 group-hover:text-gray-600",
                            item.highlight && !active && "text-emerald-500"
                          )}
                          style={{ width: "1.125rem", height: "1.125rem" }}
                        />
                        <span className="flex-1">{item.name}</span>
                        {item.highlight && !active && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                            IA
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Footer: Budget IA + Alerte crédits + Crédits + Switch to CSO */}
          <div className="mt-auto pt-4 space-y-3">
            {budget && (
              <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/40 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Cpu className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-500 flex-1">Budget IA du jour</span>
                  <span className={cn(
                    "text-xs font-bold",
                    budget.remainingCents === 0 ? "text-red-600" :
                    budget.remainingCents < budget.limitCents * 0.2 ? "text-amber-600" :
                    "text-violet-600"
                  )}>
                    ${budget.spentUsd} / ${budget.limitUsd}
                  </span>
                </div>
                <div className="w-full bg-violet-100 rounded-full h-1.5">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      budget.remainingCents === 0 ? "bg-red-500" :
                      budget.remainingCents < budget.limitCents * 0.2 ? "bg-amber-500" :
                      "bg-gradient-to-r from-violet-500 to-purple-500"
                    )}
                    style={{ width: `${Math.min(100, Math.round(((budget.limitCents - budget.remainingCents) / budget.limitCents) * 100))}%` }}
                  />
                </div>
              </div>
            )}
            {showAlert && (
              <Link
                href="/marketing-os/settings"
                className={cn(
                  "flex items-start gap-2 rounded-xl border p-3 text-left text-xs font-medium transition-colors hover:opacity-90",
                  alert.level === "depleted" &&
                    "border-red-200 bg-red-50 text-red-800",
                  alert.level === "critical" &&
                    "border-amber-200 bg-amber-50 text-amber-800",
                  alert.level === "warning" &&
                    "border-amber-100 bg-amber-50/70 text-amber-700"
                )}
              >
                {alert.level === "depleted" ? (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                )}
                <span className="flex-1">{alert.message}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-current opacity-70" />
              </Link>
            )}
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">
                  Crédits disponibles
                </span>
                <span className="text-xs font-bold text-emerald-600">
                  Plan {planLabel}
                </span>
              </div>
              <div className="w-full bg-emerald-100 rounded-full h-1.5">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    alert.level === "depleted"
                      ? "bg-red-500"
                      : alert.level === "critical"
                        ? "bg-amber-500"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500"
                  )}
                  style={{ width: `${creditPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {credits.toLocaleString("fr-FR")} / {maxCredits.toLocaleString("fr-FR")} crédits
              </p>
            </div>

            <Link
              href="/sales-os"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200/40 text-sm font-medium text-violet-700 hover:bg-violet-100/80 transition-all"
            >
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              Découvrir Sales OS
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
