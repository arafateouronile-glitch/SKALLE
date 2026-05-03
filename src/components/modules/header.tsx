"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Menu, Search } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { SalesSidebar } from "./sales-sidebar";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  workspace?: "cmo" | "cso";
  credits?: number;
  plan?: string;
}

export function Header({ user, workspace = "cmo", credits = 0, plan = "FREE" }: HeaderProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isCso = workspace === "cso";

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-x-3 px-4 backdrop-blur-xl sm:px-6"
        style={!isCso ? {
          background: "oklch(0.14 0.018 260 / 0.85)",
          borderBottom: "1px solid oklch(0.98 0.01 260 / 0.08)",
        } : undefined}
        data-theme={!isCso ? "dark" : undefined}
      >
        {isCso && (
          <style>{`.header-light { border-bottom: 1px solid rgba(229,231,235,0.7); background: rgba(255,255,255,0.8); }`}</style>
        )}
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className={cn("lg:hidden h-8 w-8", !isCso ? "text-slate-400 hover:text-white hover:bg-white/10" : "text-gray-500")}>
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[15rem] p-0 bg-[#0f1117] border-white/[0.06]">
            {isCso ? (
              <SalesSidebar user={user} credits={credits} plan={plan} className="flex w-full h-full flex-col" />
            ) : (
              <Sidebar user={user} credits={credits} plan={plan} className="flex w-full h-full flex-col" />
            )}
          </SheetContent>
        </Sheet>

        {/* Command Palette trigger */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "flex flex-1 max-w-sm items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[13px] transition-all focus:outline-none focus:ring-1",
            isCso
              ? "bg-gray-50/80 border-gray-200/80 text-gray-400 hover:bg-gray-100/80 focus:border-violet-400/50 focus:ring-violet-400/20"
              : "border-white/[0.08] text-slate-500 hover:border-white/[0.14] hover:text-slate-300 focus:ring-emerald-400/20"
          )}
          style={!isCso ? { background: "oklch(1 0 0 / 0.04)" } : undefined}
        >
          <Search className={cn("h-3.5 w-3.5 shrink-0", isCso ? "text-violet-400" : "text-emerald-500")} />
          <span className="flex-1 truncate">Demandez n&apos;importe quoi à l&apos;Agent Skalle...</span>
          <kbd
            className={cn("hidden sm:inline-flex h-4 items-center rounded border px-1 font-mono text-[9px]", !isCso ? "border-white/[0.08] text-slate-500" : "border-gray-200 text-gray-400")}
          >
            ⌘K
          </kbd>
        </button>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-x-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", !isCso ? "text-slate-400 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-700")}
          >
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <CommandPalette workspace={workspace} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
