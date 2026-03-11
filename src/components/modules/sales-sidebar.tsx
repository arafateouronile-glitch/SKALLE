"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Zap,
  LayoutDashboard,
  Users,
  MessageCircle,
  Settings,
  ArrowRight,
  GitMerge,
  Target,
  LayoutGrid,
  BarChart3,
  Radio,
  MapPin,
  Building2,
  Handshake,
} from "lucide-react";

const navigation = [
  { name: "Sales OS", href: "/sales-os", icon: LayoutDashboard },
  { name: "Radar à Signaux", href: "/sales-os/signals-radar", icon: Radio },
  { name: "Local Radar", href: "/sales-os/local-radar", icon: MapPin },
  { name: "Newborn Radar", href: "/sales-os/newborn-radar", icon: Building2 },
  { name: "Pipeline Analytics", href: "/sales-os/analytics", icon: BarChart3 },
  { name: "CRM Pipeline", href: "/sales-os/crm", icon: LayoutGrid },
  { name: "Lead Scoring", href: "/sales-os/dashboard", icon: Target },
  { name: "Reply Assistant", href: "/sales-os/reply-assistant", icon: MessageCircle },
  { name: "Prospection", href: "/sales-os/prospection", icon: Users },
  {
    name: "Social Prospector",
    href: "/sales-os/social-prospector",
    icon: MessageCircle,
  },
  {
    name: "Séquences",
    href: "/sales-os/prospection?tab=sequences",
    icon: GitMerge,
    matchHref: "/sales-os/prospection",
  },
  {
    name: "Découverte",
    href: "/sales-os/prospection?tab=leads",
    icon: Target,
    matchHref: "/sales-os/prospection",
  },
  { name: "Partnership Hub", href: "/sales-os/partnerships", icon: Handshake },
  { name: "Paramètres", href: "/sales-os/settings", icon: Settings },
];

export function SalesSidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-72 lg:flex-col lg:pt-4 lg:pb-4 lg:pl-4">
      <div className="flex w-full grow flex-col gap-y-5 overflow-y-auto rounded-2xl border border-white/20 bg-white/60 shadow-2xl shadow-black/5 backdrop-blur-xl px-6 pb-4">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold text-gray-900">Skalle</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">
              CSO
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {navigation.map((item) => {
                  const matchPath = item.matchHref ?? item.href;
                  const isActive =
                    pathname === matchPath ||
                    (matchPath !== "/sales-os" &&
                      pathname.startsWith(matchPath));
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex gap-x-3 rounded-xl p-3 text-sm font-medium leading-6 transition-all duration-200",
                          isActive
                            ? "bg-violet-50 text-violet-700 border border-violet-200/60 shadow-sm"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-100/80"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors",
                            isActive
                              ? "text-violet-600"
                              : "text-gray-400 group-hover:text-gray-600"
                          )}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {/* Credits indicator */}
            <li className="mt-auto space-y-3">
              <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/40 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">
                    Crédits restants
                  </span>
                  <span className="text-xs font-bold text-violet-600">
                    Sales OS
                  </span>
                </div>
                <div className="w-full bg-violet-100 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-purple-600 h-2 rounded-full transition-all"
                    style={{ width: "60%" }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Crédits disponibles
                </p>
              </div>

              {/* Switch to CMO */}
              <Link
                href="/marketing-os"
                className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200/40 text-sm font-medium text-emerald-700 hover:bg-emerald-100/80 transition-all"
              >
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                Passer au Marketing OS
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
