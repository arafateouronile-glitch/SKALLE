"use client";

import { cn } from "@/lib/utils";

interface ThinkingGlowProps {
  active: boolean;
  color?: "emerald" | "indigo" | "rose" | "amber";
  children: React.ReactNode;
  className?: string;
}

const colorVariants = {
  emerald: "border-emerald-500/50 shadow-[0_0_15px_-3px_rgba(16,185,129,0.4)]",
  indigo: "border-indigo-500/50 shadow-[0_0_15px_-3px_rgba(99,102,241,0.4)]",
  rose: "border-rose-500/50 shadow-[0_0_15px_-3px_rgba(244,63,94,0.4)]",
  amber: "border-amber-500/50 shadow-[0_0_15px_-3px_rgba(245,158,11,0.4)]",
};

export function ThinkingGlow({
  active,
  color = "emerald",
  children,
  className,
}: ThinkingGlowProps) {
  return (
    <div className={cn("relative rounded-xl transition-all duration-500", className)}>
      {active && (
        <div
          className={cn(
            "absolute -inset-px rounded-xl border z-0 pointer-events-none animate-thinking-glow",
            colorVariants[color]
          )}
        />
      )}
      <div className="relative z-10 bg-card rounded-xl overflow-hidden h-full">
        {children}
      </div>
    </div>
  );
}
