"use client";

import { cn } from "@/lib/utils";

type Accent = "emerald" | "violet" | "amber" | "danger";

interface AppTopBarProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  cta?: string;
  ctaIcon?: React.ReactNode;
  onCta?: () => void;
  accent?: Accent;
  children?: React.ReactNode;
}

export function AppTopBar({
  title,
  subtitle,
  breadcrumb,
  cta,
  ctaIcon,
  onCta,
  accent = "emerald",
  children,
}: AppTopBarProps) {
  return (
    <header
      className="h-14 shrink-0 px-7 flex items-center gap-4 sticky top-0 z-30"
      style={{
        background: "oklch(from var(--bg-card) l c h / 0.9)",
        borderBottom: "1px solid var(--line)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <p
            className="text-[10.5px] font-mono uppercase tracking-[0.15em] mb-0.5"
            style={{ color: "var(--fg-mute)" }}
          >
            {breadcrumb}
          </p>
        )}
        <h1
          className="font-display text-[18px] font-semibold leading-tight truncate"
          style={{ color: "var(--fg)" }}
        >
          {title}
        </h1>
      </div>

      {subtitle && (
        <p className="text-[12px] hidden md:block shrink-0" style={{ color: "var(--fg-dim)" }}>
          {subtitle}
        </p>
      )}

      {children}

      {cta && (
        <button
          onClick={onCta}
          className="px-4 py-2 rounded-lg font-semibold text-[12.5px] flex items-center gap-2 transition-all hover:brightness-110 shrink-0"
          style={{
            background: `var(--${accent}-fg)`,
            color: "white",
          }}
        >
          {ctaIcon ?? <span className="font-mono">+</span>}
          {cta}
        </button>
      )}
    </header>
  );
}
