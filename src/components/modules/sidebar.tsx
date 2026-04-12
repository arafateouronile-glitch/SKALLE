"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, getCreditAlert } from "@/lib/credits";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  CalendarDays,
  ArrowRight,
  Plug,
  Webhook,
  Code2,
  LogOut,
  ChevronRight,
  Cpu,
  AlertCircle,
} from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  BUSINESS: "Business",
  AGENCY: "Agence",
  SCALE: "Scale",
};

interface SidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
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
    label: "Command Center",
    items: [
      { name: "Dashboard", href: "/marketing-os", icon: LayoutDashboard },
      { name: "Autopilot", href: "/marketing-os/autopilot", icon: Sparkles, highlight: true },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { name: "Keywords", href: "/marketing-os/keywords", icon: Target },
      { name: "Concurrents", href: "/marketing-os/discovery", icon: Search },
    ],
  },
  {
    label: "Création",
    items: [
      { name: "Superscale Ads", href: "/marketing-os/superscale-ads", icon: Zap },
      { name: "SEO Factory", href: "/marketing-os/seo-factory", icon: FileText },
      { name: "Content Factory", href: "/marketing-os/social/factory", icon: Factory },
      { name: "Calendrier", href: "/marketing-os/content", icon: CalendarDays },
      { name: "Images IA", href: "/marketing-os/images", icon: Image },
    ],
  },
  {
    label: "Reporting",
    items: [
      { name: "Analytics", href: "/marketing-os/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Paramètres", href: "/marketing-os/settings", icon: Settings },
      { name: "Intégrations", href: "/marketing-os/settings/integrations", icon: Plug },
      { name: "Webhooks", href: "/marketing-os/settings/webhooks", icon: Webhook },
      { name: "API Docs", href: "/marketing-os/developer", icon: Code2 },
    ],
  },
];

type BudgetStatus = {
  spentUsd: string;
  limitUsd: string;
  remainingCents: number;
  limitCents: number;
};

export function Sidebar({ user, credits, plan, className }: SidebarProps & { className?: string }) {
  const pathname = usePathname();
  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const maxCredits = PLAN_LIMITS[planKey].monthlyCredits;
  const creditPct = maxCredits ? Math.min(100, Math.round((credits / maxCredits) * 100)) : 0;
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const alert = getCreditAlert(credits, maxCredits);

  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  useEffect(() => {
    fetch("/api/agents/budget")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setBudget(data))
      .catch(() => null);
  }, []);

  const nameParts = (user.name ?? "").split(" ").filter(Boolean);
  const initials =
    (nameParts.length > 0 ? nameParts.map((n) => n[0]).join("").toUpperCase() : "") ||
    user.email?.[0]?.toUpperCase() ||
    "U";

  const isActive = (href: string) =>
    pathname === href || (href !== "/marketing-os" && pathname.startsWith(href));

  return (
    <div className={cn("hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[15rem] lg:flex-col", className)}>
      <div className="flex w-full grow flex-col overflow-y-auto bg-[#0f1117] border-r border-white/[0.06]">

        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4 border-b border-white/[0.06]">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
            <Zap className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">Skalle</span>
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            CMO
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col px-3 py-3 gap-y-0.5 overflow-y-auto">
          {sections.map((section, si) => (
            <div key={section.label} className={cn(si > 0 && "mt-4")}>
              <p className="px-2 pb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
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
                          "group flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-all duration-150",
                          active
                            ? "bg-white/10 text-white border-l-2 border-emerald-400 pl-[6px]"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.06] border-l-2 border-transparent pl-[6px]"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-[15px] w-[15px] shrink-0 transition-colors",
                            active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300",
                            item.highlight && !active && "text-emerald-500"
                          )}
                        />
                        <span className="flex-1 truncate">{item.name}</span>
                        {item.highlight && !active && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
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

          {/* Budget IA */}
          {budget && (
            <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/[0.08] p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu className="h-3 w-3 text-violet-400 shrink-0" />
                <span className="text-[11px] font-medium text-slate-400 flex-1">Budget IA</span>
                <span className={cn(
                  "text-[11px] font-bold",
                  budget.remainingCents === 0 ? "text-red-400" :
                  budget.remainingCents < budget.limitCents * 0.2 ? "text-amber-400" :
                  "text-violet-400"
                )}>
                  ${budget.spentUsd} / ${budget.limitUsd}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1">
                <div
                  className={cn(
                    "h-1 rounded-full transition-all",
                    budget.remainingCents === 0 ? "bg-red-500" :
                    budget.remainingCents < budget.limitCents * 0.2 ? "bg-amber-500" :
                    "bg-violet-500"
                  )}
                  style={{ width: `${Math.min(100, Math.round(((budget.limitCents - budget.remainingCents) / budget.limitCents) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Credits */}
          <div className="mt-2 rounded-lg bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-400">Crédits</span>
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                alert.level === "depleted" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                alert.level === "critical" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              )}>
                {planLabel}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1">
              <div
                className={cn(
                  "h-1 rounded-full transition-all",
                  alert.level === "depleted" ? "bg-red-500" :
                  alert.level === "critical" ? "bg-amber-500" :
                  "bg-emerald-500"
                )}
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {credits.toLocaleString("fr-FR")} / {maxCredits.toLocaleString("fr-FR")}
            </p>
            {alert.level !== "none" && (
              <div className="mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-400 truncate">{alert.message}</span>
              </div>
            )}
          </div>

          {/* Switch to CSO */}
          <Link
            href="/sales-os"
            className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md bg-violet-500/10 border border-violet-500/20 text-[12px] font-medium text-violet-400 hover:bg-violet-500/15 transition-all"
          >
            <div className="p-1 rounded bg-violet-500/20">
              <Zap className="h-3 w-3 text-violet-400" />
            </div>
            <span className="flex-1">Sales OS</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Link>
        </nav>

        {/* User profile footer */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={user.image || undefined} alt={user.name || ""} />
              <AvatarFallback className="text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/[0.08] transition-all"
              title="Déconnexion"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
