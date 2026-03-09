"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  workspace: "cmo" | "cso";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ workspace, open = false, onOpenChange }: CommandPaletteProps) {
  useEffect(() => {
    if (!onOpenChange) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange?.(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onOpenChange, open]);

  const isCso = workspace === "cso";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl rounded-2xl border border-white/20 bg-white/95 p-0 gap-0 overflow-hidden shadow-2xl shadow-black/5 backdrop-blur-xl"
        onPointerDownOutside={() => onOpenChange?.(false)}
      >
        <DialogTitle className="sr-only">
          Command Palette — Demandez n&apos;importe quoi à l&apos;Agent Skalle
        </DialogTitle>
        <div className="flex items-center gap-3 border-b border-gray-200/60 px-4 py-3">
          <Search className={cn("h-5 w-5 shrink-0", isCso ? "text-violet-500" : "text-emerald-500")} />
          <input
            type="text"
            placeholder="Demandez n'importe quoi à l'Agent Skalle..."
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
            autoFocus
            onKeyDown={(e) => e.key === "Escape" && onOpenChange?.(false)}
          />
          <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-gray-200 px-2 font-mono text-[10px] font-medium text-gray-400">
            ⌘K
          </kbd>
        </div>
        <div className="px-4 py-3 text-xs text-gray-500">
          Tapez votre demande et appuyez sur Entrée. L&apos;Agent Brain vous répondra.
        </div>
      </DialogContent>
    </Dialog>
  );
}
