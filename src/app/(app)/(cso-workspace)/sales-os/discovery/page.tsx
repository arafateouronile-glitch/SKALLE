"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Loader2, ScanLine, MapPin, Building2, Radar } from "lucide-react";
import { HuntTab } from "@/app/(app)/(cso-workspace)/sales-os/hunt/page";
import { SignalsRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/signals-radar/page";
import { NewbornRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/newborn-radar/page";
import { LocalRadarTab } from "@/app/(app)/(cso-workspace)/sales-os/local-radar/page";

type Tab = "hunt" | "signals" | "newborn" | "local";

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "hunt",    label: "Hunt",           icon: ScanLine,  desc: "Leads chauds LinkedIn" },
  { id: "signals", label: "Signaux",         icon: Radar,     desc: "Intent signals & job posts" },
  { id: "newborn", label: "Newborn",         icon: Building2, desc: "Entreprises naissantes" },
  { id: "local",   label: "Local",           icon: MapPin,    desc: "Chalutier Google Maps" },
];

function DiscoveryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<Tab>(
    (searchParams.get("tab") as Tab) ?? "hunt"
  );

  function switchTab(tab: Tab) {
    setActive(tab);
    router.replace(`/sales-os/discovery?tab=${tab}`, { scroll: false });
  }

  return (
    <>
      <AppTopBar title="Discovery" breadcrumb="sales-os / discovery" accent="amber" />

      {/* Tab bar */}
      <div className="px-6 pt-4 pb-0 flex items-center gap-1 border-b"
        style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold rounded-t-lg transition-colors relative"
              style={{
                color: isActive ? "var(--fg)" : "var(--fg-mute)",
                background: isActive ? "var(--bg-card)" : "transparent",
                borderBottom: isActive ? "2px solid var(--amber-fg)" : "2px solid transparent",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {active === "hunt"    && <HuntTab />}
        {active === "signals" && <SignalsRadarTab />}
        {active === "newborn" && <NewbornRadarTab />}
        {active === "local"   && <LocalRadarTab />}
      </div>
    </>
  );
}

export default function DiscoveryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-2 text-sm" style={{ color: "var(--fg-mute)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    }>
      <DiscoveryClient />
    </Suspense>
  );
}
