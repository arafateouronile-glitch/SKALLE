"use client";

/**
 * Actions rapides — raccourcis de navigation vers les 4 destinations
 * principales de Goskalle (hors "Aujourd'hui", page courante). Duplique
 * volontairement icône/libellé/description de GOSKALLE_NAV (app-sidebar.tsx)
 * plutôt que de l'exporter pour un seul consommateur — à resynchroniser
 * manuellement si la nav gagne une destination.
 */

import Link from "next/link";
import { Target, MessageCircle, PenLine, TrendingUp, type LucideIcon } from "lucide-react";

const QUICK_ACTIONS: { eyebrow: string; title: string; desc: string; href: string; icon: LucideIcon }[] = [
  { eyebrow: "Sourcer", title: "Prospects", desc: "Trouver & qualifier", href: "/goskalle/prospects", icon: Target },
  { eyebrow: "Répondre", title: "Conversations", desc: "Inbox & séquences", href: "/goskalle/conversations", icon: MessageCircle },
  { eyebrow: "Publier", title: "Contenu", desc: "LinkedIn calé ICP", href: "/goskalle/content", icon: PenLine },
  { eyebrow: "Analyser", title: "Analytics", desc: "Métriques & pipeline", href: "/goskalle/analytics", icon: TrendingUp },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-stagger">
      {QUICK_ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="gk-card-hover rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
        >
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
          >
            <action.icon className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--amber-fg)" }}>
              {action.eyebrow}
            </p>
            <p className="font-display font-bold text-[15px]" style={{ color: "var(--fg)" }}>
              {action.title}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{action.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
