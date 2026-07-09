"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PLAN_LIMITS, getCreditAlert } from "@/lib/credits";
import {
  LayoutDashboard,
  Sparkles,
  Search,
  Zap,
  TrendingUp,
  Target,
  Mail,
  Settings,
  HelpCircle,
  ArrowLeftRight,
  LogOut,
  Users,
  Bot,
  Inbox,
  Kanban,
  Heart,
  GitBranch,
  Globe,
  ShieldCheck,
} from "lucide-react";

interface AppSidebarProps {
  os: "cmo" | "cso";
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  credits: number;
  plan: string;
}

const CMO_NAV = [
  { id: "dashboard", name: "Dashboard", href: "/marketing-os",         icon: LayoutDashboard, desc: "" },
  { id: "cmo-agent", name: "Agent CMO", href: "/marketing-os/cmo-agent", icon: Bot,             desc: "Objectifs & auto" },
  { id: "studio",    name: "Studio",    href: "/marketing-os/studio",   icon: Sparkles,        desc: "Tout créer" },
  { id: "persona",     name: "Persona",     href: "/marketing-os/persona",      icon: Users,  desc: "ICP client cible" },
  { id: "brand-voice", name: "Brand Voice", href: "/marketing-os/brand-voice",  icon: Globe,  desc: "Ton & voix de marque" },
  { id: "spy",         name: "Spy",         href: "/marketing-os/spy",          icon: Search, desc: "Veille concurrence" },
  { id: "ads",       name: "Ads",       href: "/marketing-os/ads",      icon: Zap,             desc: "" },
  { id: "insights",  name: "Insights",  href: "/marketing-os/insights", icon: TrendingUp,      desc: "" },
] as const;

const CSO_NAV = [
  { id: "dashboard",         name: "Dashboard",   href: "/sales-os",                   icon: LayoutDashboard, desc: "" },
  { id: "inbox",             name: "Inbox",       href: "/sales-os/inbox",             icon: Inbox,           desc: "Conversations" },
  { id: "cso-agent",         name: "Agent CSO",   href: "/sales-os/agent",             icon: Bot,             desc: "Pipeline auto" },
  { id: "crm",               name: "CRM",         href: "/sales-os/crm",               icon: Kanban,          desc: "Kanban prospects" },
  { id: "hunt",              name: "Hunt",        href: "/sales-os/hunt",              icon: Search,          desc: "Trouver des leads" },
  { id: "social-prospector", name: "Warm Leads",  href: "/sales-os/social-prospector", icon: Heart,           desc: "Viewers · Engagers" },
  { id: "prospection",       name: "Séquences",   href: "/sales-os/prospection",       icon: GitBranch,       desc: "Multi-canal" },
  { id: "outreach",          name: "Outreach",    href: "/sales-os/outreach",          icon: Mail,            desc: "Messages & relances" },
  { id: "personas",          name: "Personas",    href: "/sales-os/personas",          icon: Users,           desc: "Profils ICP" },
  { id: "analytics",         name: "Analytics",   href: "/sales-os/analytics",         icon: TrendingUp,      desc: "Métriques & pipeline" },
  { id: "deliverability",    name: "Délivrabilité", href: "/sales-os/deliverability",  icon: ShieldCheck,     desc: "SPF · DKIM · DMARC" },
] as const;

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  BUSINESS: "Business",
  AGENCY: "Agence",
  SCALE: "Scale",
};

export function AppSidebar({ os, user, credits, plan }: AppSidebarProps) {
  const pathname = usePathname();
  const isCmo = os === "cmo";
  const nav = isCmo ? CMO_NAV : CSO_NAV;
  const otherOs = isCmo ? "cso" : "cmo";
  const otherLabel = isCmo ? "Sales OS" : "Marketing OS";
  const otherHref = isCmo ? "/sales-os" : "/marketing-os";
  const osLabel = isCmo ? "CMO" : "CSO";

  const accentFg = `var(--${isCmo ? "emerald" : "violet"}-fg)`;
  const accentSoft = `var(--${isCmo ? "emerald" : "violet"}-soft)`;
  const accentLine = `var(--${isCmo ? "emerald" : "violet"}-line)`;
  const otherFg = `var(--${isCmo ? "violet" : "emerald"}-fg)`;
  const otherSoft = `var(--${isCmo ? "violet" : "emerald"}-soft)`;
  const otherLine = `var(--${isCmo ? "violet" : "emerald"}-line)`;

  const maxCredits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.monthlyCredits ?? 100;
  const creditPct = Math.min(100, Math.round((credits / maxCredits) * 100));
  const alert = getCreditAlert(credits, maxCredits);
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const initials = user.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  function isActive(href: string, id: string) {
    if (id === "dashboard") return pathname === href || pathname === href + "/";
    return pathname.startsWith(href);
  }

  return (
    <div
      className="fixed left-0 top-0 h-screen w-[220px] flex flex-col z-40"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--line)",
      }}
    >
      {/* Logo */}
      <div
        className="h-14 px-4 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center font-display font-bold text-[14px]"
          style={{ background: accentSoft, border: `1px solid ${accentLine}`, color: accentFg }}
        >
          S
        </div>
        <span className="font-display font-bold text-[15px]" style={{ color: "var(--fg)" }}>
          Skalle
        </span>
        <span
          className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded font-mono"
          style={{ background: accentSoft, color: accentFg, border: `1px solid ${accentLine}` }}
        >
          {osLabel}
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = isActive(item.href, item.id);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all"
              style={
                active
                  ? { background: accentSoft, color: accentFg, border: `1px solid ${accentLine}` }
                  : { color: "var(--fg-dim)", border: "1px solid transparent" }
              }
            >
              <Icon
                className="h-[15px] w-[15px] shrink-0"
                style={{ color: active ? accentFg : "var(--fg-mute)" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold leading-tight">{item.name}</p>
                {item.desc && (
                  <p className="text-[10.5px] mt-0.5 leading-tight" style={{ color: "var(--fg-mute)" }}>
                    {item.desc}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Settings + Help */}
      <div className="px-3 pb-2 space-y-0.5">
        <Link
          href={`/${os === "cmo" ? "marketing" : "sales"}-os/settings`}
          className="flex items-center gap-3 px-3 py-2 rounded-[8px] text-[12.5px] transition-all hover:bg-black/[0.04]"
          style={{ color: "var(--fg-mute)" }}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Réglages</span>
        </Link>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-[8px] text-[12.5px] transition-all hover:bg-black/[0.04]"
          style={{ color: "var(--fg-mute)" }}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Aide</span>
        </button>
      </div>

      {/* OS switch + user footer */}
      <div className="px-3 pb-3 pt-2 space-y-3" style={{ borderTop: "1px solid var(--line)" }}>
        {/* Switch OS */}
        <Link
          href={otherHref}
          className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
          style={{ background: otherSoft, border: `1px solid ${otherLine}`, color: otherFg }}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Passer en {otherLabel}</span>
        </Link>

        {/* Credits bar */}
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium" style={{ color: "var(--fg-mute)" }}>
              Crédits
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={
                alert.level === "depleted"
                  ? { background: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" }
                  : alert.level === "critical"
                  ? { background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }
                  : { background: accentSoft, color: accentFg, border: `1px solid ${accentLine}` }
              }
            >
              {planLabel}
            </span>
          </div>
          <div className="w-full rounded-full h-1" style={{ background: "var(--line-strong)" }}>
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${creditPct}%`,
                background:
                  alert.level === "depleted"
                    ? "var(--danger-fg)"
                    : alert.level === "critical"
                    ? "var(--amber-fg)"
                    : accentFg,
              }}
            />
          </div>
          <p className="mt-1 text-[10px]" style={{ color: "var(--fg-mute)" }}>
            {credits.toLocaleString("fr-FR")} / {maxCredits.toLocaleString("fr-FR")}
          </p>
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user.image || undefined} alt={user.name || ""} />
            <AvatarFallback
              className="text-[11px] font-semibold"
              style={{ background: accentSoft, color: accentFg, border: `1px solid ${accentLine}` }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>
              {user.name}
            </p>
            <p className="text-[10px] truncate" style={{ color: "var(--fg-mute)" }}>
              {user.email}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="p-1.5 rounded-md transition-all hover:bg-black/[0.06]"
            style={{ color: "var(--fg-mute)" }}
            title="Déconnexion"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
