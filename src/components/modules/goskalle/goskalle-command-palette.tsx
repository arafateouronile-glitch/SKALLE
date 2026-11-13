"use client";

/**
 * Palette de commandes Goskalle (⌘K / Ctrl+K) — navigation instantanée +
 * actions rapides, sans dépendance nouvelle (Dialog + liste filtrée).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getUserWorkspace } from "@/actions/leads";
import { getProspectsForCrm } from "@/actions/crm";
import {
  Radar,
  MessageCircle,
  Target,
  PenLine,
  BarChart3,
  Settings,
  CheckCircle2,
  Rocket,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Radar;
  section: "Navigation" | "Actions" | "Prospects";
  run: () => void;
}

export function GoskalleCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<{ id: string; name: string; company: string }[]>([]);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Charge les prospects une fois, à la première ouverture
  useEffect(() => {
    if (!open || !workspaceId || prospects.length > 0) return;
    getProspectsForCrm(workspaceId, "all").then((r) => {
      if (r.success && r.data) {
        setProspects(r.data.map((p) => ({ id: p.id, name: p.name, company: p.company })));
      }
    });
  }, [open, workspaceId, prospects.length]);

  const approveTopDecision = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/cso-agent?workspaceId=${workspaceId}`);
    const data = await res.json();
    const top = data?.decisions?.find((d: { status: string }) => d.status === "PENDING");
    if (!top) {
      toast.info("Aucune décision en attente");
      return;
    }
    const patchRes = await fetch("/api/cso-agent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId: top.id, workspaceId, action: "approve" }),
    });
    if (patchRes.ok) {
      toast.success("Décision approuvée");
    } else {
      toast.error("Erreur lors de l'approbation");
    }
  }, [workspaceId]);

  const navItems: PaletteItem[] = useMemo(
    () => [
      { id: "nav-today", label: "Aujourd'hui", hint: "Score & décisions", icon: Radar, section: "Navigation", run: () => router.push("/goskalle") },
      { id: "nav-prospects", label: "Prospects", hint: "Sourcer & Pipeline", icon: Target, section: "Navigation", run: () => router.push("/goskalle/prospects") },
      { id: "nav-conversations", label: "Conversations", hint: "Inbox & Séquences", icon: MessageCircle, section: "Navigation", run: () => router.push("/goskalle/conversations") },
      { id: "nav-content", label: "Contenu", hint: "LinkedIn calé ICP", icon: PenLine, section: "Navigation", run: () => router.push("/goskalle/content") },
      { id: "nav-analytics", label: "Analytics", hint: "Métriques & pipeline", icon: BarChart3, section: "Navigation", run: () => router.push("/goskalle/analytics") },
      { id: "nav-settings", label: "Réglages", hint: "Personas & Email", icon: Settings, section: "Navigation", run: () => router.push("/goskalle/settings") },
    ],
    [router]
  );

  const actionItems: PaletteItem[] = useMemo(
    () => [
      { id: "act-approve", label: "Approuver la décision prioritaire", icon: CheckCircle2, section: "Actions", run: approveTopDecision },
      { id: "act-new-sequence", label: "Créer une séquence", icon: Rocket, section: "Actions", run: () => router.push("/goskalle/conversations?tab=builder") },
      { id: "act-scan-hunt", label: "Scanner Hunt (Signals/Local/Newborn)", icon: SearchIcon, section: "Actions", run: () => router.push("/goskalle/prospects?tab=sourcer") },
      { id: "act-new-post", label: "Nouveau post LinkedIn", icon: Sparkles, section: "Actions", run: () => router.push("/goskalle/content") },
    ],
    [router, approveTopDecision]
  );

  const prospectItems: PaletteItem[] = useMemo(
    () =>
      prospects.slice(0, 200).map((p) => ({
        id: `prospect-${p.id}`,
        label: p.name,
        hint: p.company,
        icon: Target,
        section: "Prospects" as const,
        run: () => router.push("/goskalle/prospects?tab=pipeline"),
      })),
    [prospects, router]
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const all = [...navItems, ...actionItems, ...prospectItems];
    if (!q) return [...navItems, ...actionItems];
    return all.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint?.toLowerCase().includes(q)
    );
  }, [q, navItems, actionItems, prospectItems]);

  function runItem(item: PaletteItem) {
    item.run();
    setOpen(false);
    setQuery("");
  }

  let lastSection: string | null = null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">Palette de commandes Goskalle</DialogTitle>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <SearchIcon className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aller à… ou lancer une action"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Aucun résultat</p>
          )}
          {filtered.map((item) => {
            const showHeader = item.section !== lastSection;
            lastSection = item.section;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showHeader && (
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {item.section}
                  </p>
                )}
                <button
                  onClick={() => runItem(item)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-amber-50 transition-colors"
                >
                  <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="flex-1 text-gray-900">{item.label}</span>
                  {item.hint && <span className="text-xs text-gray-400">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
