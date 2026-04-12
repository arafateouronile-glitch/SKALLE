"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PLAN_LIMITS, getCreditAlert } from "@/lib/credits";
import {
  Zap,
  LayoutDashboard,
  Users,
  MessageCircle,
  Settings,
  ChevronRight,
  GitMerge,
  Target,
  LayoutGrid,
  BarChart3,
  Radio,
  MapPin,
  Building2,
  Handshake,
  LogOut,
  AlertCircle,
} from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  BUSINESS: "Business",
  AGENCY: "Agence",
  SCALE: "Scale",
};

interface SalesSidebarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  credits?: number;
  plan?: string;
  className?: string;
}

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  matchHref?: string;
  indent?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    label: "Command Center",
    items: [
      { name: "Dashboard", href: "/sales-os", icon: LayoutDashboard },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { name: "Radar à Signaux", href: "/sales-os/signals-radar", icon: Radio },
      { name: "Local Radar", href: "/sales-os/local-radar", icon: MapPin },
      { name: "Newborn Radar", href: "/sales-os/newborn-radar", icon: Building2 },
      { name: "Lead Scoring", href: "/sales-os/dashboard", icon: Target },
    ],
  },
  {
    label: "CRM & Pipeline",
    items: [
      { name: "CRM Pipeline", href: "/sales-os/crm", icon: LayoutGrid },
      { name: "Pipeline Analytics", href: "/sales-os/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Prospection",
    items: [
      { name: "Prospection", href: "/sales-os/prospection", icon: Users },
      {
        name: "Séquences",
        href: "/sales-os/prospection?tab=sequences",
        icon: GitMerge,
        matchHref: "/sales-os/prospection",
        indent: true,
      },
      {
        name: "Découverte",
        href: "/sales-os/prospection?tab=leads",
        icon: Target,
        matchHref: "/sales-os/prospection",
        indent: true,
      },
      { name: "Social Prospector", href: "/sales-os/social-prospector", icon: MessageCircle },
      { name: "Reply Assistant", href: "/sales-os/reply-assistant", icon: MessageCircle },
      { name: "Partnership Hub", href: "/sales-os/partnerships", icon: Handshake },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Paramètres", href: "/sales-os/settings", icon: Settings },
    ],
  },
];

export function SalesSidebar({ user, credits = 0, plan = "FREE", className }: SalesSidebarProps) {
  const pathname = usePathname();

  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const maxCredits = PLAN_LIMITS[planKey].monthlyCredits;
  const creditPct = maxCredits ? Math.min(100, Math.round((credits / maxCredits) * 100)) : 0;
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const alert = getCreditAlert(credits, maxCredits);

  const nameParts = (user?.name ?? "").split(" ").filter(Boolean);
  const initials =
    (nameParts.length > 0 ? nameParts.map((n) => n[0]).join("").toUpperCase() : "") ||
    user?.email?.[0]?.toUpperCase() ||
    "U";

  const isActive = (item: NavItem) => {
    const matchPath = item.matchHref ?? item.href.split("?")[0];
    if (matchPath === "/sales-os") return pathname === "/sales-os";
    return pathname === matchPath || pathname.startsWith(matchPath);
  };

  return (
    <div className={cn("hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[15rem] lg:flex-col", className)}>
      <div className="flex w-full grow flex-col overflow-y-auto bg-[#0f1117] border-r border-white/[0.06]">

        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4 border-b border-white/[0.06]">
          <div className="p-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30">
            <Zap className="h-4 w-4 text-violet-400" />
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">Skalle</span>
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20">
            CSO
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
                  const active = isActive(item);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-x-2.5 rounded-md py-1.5 text-[13px] font-medium transition-all duration-150",
                          item.indent ? "px-6" : "px-2",
                          active
                            ? "bg-white/10 text-white border-l-2 border-violet-400 !pl-[6px]"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.06] border-l-2 border-transparent",
                          item.indent && !active && "pl-8"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-[15px] w-[15px] shrink-0 transition-colors",
                            active ? "text-violet-400" : "text-slate-500 group-hover:text-slate-300"
                          )}
                        />
                        <span className="flex-1 truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Credits */}
          <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-400">Crédits Sales OS</span>
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                alert.level === "depleted" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                alert.level === "critical" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                "bg-violet-500/15 text-violet-400 border border-violet-500/20"
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
                  "bg-violet-500"
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

          {/* Switch to CMO */}
          <Link
            href="/marketing-os"
            className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[12px] font-medium text-emerald-400 hover:bg-emerald-500/15 transition-all"
          >
            <div className="p-1 rounded bg-emerald-500/20">
              <Zap className="h-3 w-3 text-emerald-400" />
            </div>
            <span className="flex-1">Marketing OS</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Link>
        </nav>

        {/* User profile footer */}
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={user?.image || undefined} alt={user?.name || ""} />
              <AvatarFallback className="text-[11px] font-semibold bg-violet-500/20 text-violet-400 border border-violet-500/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
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
