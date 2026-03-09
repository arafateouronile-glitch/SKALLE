"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Zap,
  LayoutDashboard,
  Search,
  FileText,
  Calendar,
  Users,
  Settings,
  TrendingUp,
  Image,
  Plug,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Discovery", href: "/dashboard/discovery", icon: Search },
  { name: "SEO Factory", href: "/dashboard/seo-factory", icon: FileText },
  { name: "Calendrier", href: "/dashboard/social", icon: Calendar },
  { name: "Prospection", href: "/dashboard/prospection", icon: Users },
  { name: "Images", href: "/dashboard/images", icon: Image },
  { name: "Analytics", href: "/dashboard/analytics", icon: TrendingUp },
  { name: "Intégrations", href: "/dashboard/integrations", icon: Plug },
  { name: "Paramètres", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
      <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-slate-900 border-r border-slate-800 px-6 pb-4">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Skalle</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {navigation.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href));
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex gap-x-3 rounded-lg p-3 text-sm font-medium leading-6 transition-all duration-200",
                          isActive
                            ? "bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-white border border-purple-500/30"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors",
                            isActive
                              ? "text-purple-400"
                              : "text-slate-500 group-hover:text-slate-300"
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
            <li className="mt-auto">
              <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400">
                    Crédits restants
                  </span>
                  <span className="text-xs font-bold text-purple-400">
                    Plan Free
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                    style={{ width: "75%" }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  75 / 100 crédits utilisés
                </p>
              </div>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
