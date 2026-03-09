"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, LogOut, Settings, User, Menu, Search } from "lucide-react";
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
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || user.email?.[0]?.toUpperCase() || "U";

  const isCso = workspace === "cso";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200/60 bg-white/70 px-4 shadow-sm backdrop-blur-xl sm:gap-x-6 sm:px-6 lg:px-8">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden text-gray-500">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-white/90 backdrop-blur-xl border-gray-200/60">
            {isCso ? <SalesSidebar /> : <Sidebar credits={credits} plan={plan} />}
          </SheetContent>
        </Sheet>

        <div className="h-6 w-px bg-gray-200 lg:hidden" />

        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          {/* Command Palette trigger — visible "Demandez n'importe quoi à l'Agent Skalle" */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "flex flex-1 max-w-md items-center gap-3 rounded-xl border border-gray-200/60 bg-white/80 px-4 py-2.5 text-left text-sm text-gray-500 placeholder:text-gray-400 transition-all hover:opacity-90 focus:outline-none focus:ring-1",
              isCso
                ? "focus:border-violet-500/50 focus:ring-violet-500/20"
                : "focus:border-emerald-500/50 focus:ring-emerald-500/20"
            )}
          >
            <Search className={cn("h-4 w-4 shrink-0", isCso ? "text-violet-500" : "text-emerald-500")} />
            <span className="flex-1 truncate">
              Demandez n&apos;importe quoi à l&apos;Agent Skalle...
            </span>
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-gray-200 px-1.5 font-mono text-[10px] text-gray-400">
              ⌘K
            </kbd>
          </button>

          <div className="flex flex-1 justify-end items-center gap-x-4 lg:gap-x-6">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-700">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className={cn("h-9 w-9 border-2", isCso ? "border-violet-500/30" : "border-emerald-500/30")}>
                    <AvatarImage src={user.image || undefined} alt={user.name || ""} />
                    <AvatarFallback className={cn("font-semibold text-white", isCso ? "bg-gradient-to-br from-violet-500 to-purple-600" : "bg-gradient-to-br from-emerald-500 to-teal-500")}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 bg-white/90 shadow-lg backdrop-blur-xl border-gray-200/60"
                align="end"
                forceMount
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-200/60" />
                <DropdownMenuItem className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profil
                </DropdownMenuItem>
                <DropdownMenuItem className="text-gray-700 focus:bg-gray-100 focus:text-gray-900 cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Paramètres
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-200/60" />
                <DropdownMenuItem
                  className="text-red-500 focus:bg-red-50 focus:text-red-600 cursor-pointer"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <CommandPalette workspace={workspace} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
