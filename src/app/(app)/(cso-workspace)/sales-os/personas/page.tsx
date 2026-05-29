"use client";

import { useState, useEffect, useCallback } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { getUserWorkspace } from "@/actions/leads";
import {
  Users, Plus, Loader2, Play, Pause, Trash2, RefreshCw,
  Sparkles, Target, Mail, Linkedin, BarChart3, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPersona {
  industry: string;
  jobTitles: string[];
  companySizes: string[];
  locations: string[];
  keywords: string[];
  painPoints: string[];
}

interface Persona {
  id: string;
  name: string;
  raw: RawPersona;
  enhanced: unknown;
  status: "DRAFT" | "RUNNING" | "ACTIVE" | "PAUSED";
  lastRunAt: string | null;
  leadsFound: number;
  enriched: number;
  sequences: number;
  createdAt: string;
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

function TagInput({
  tags, onChange, placeholder,
}: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [val, setVal] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2.5 rounded-[8px] min-h-[44px] cursor-text"
      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
      onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
    >
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11.5px] font-medium"
          style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }}>
          {t}
          <button onClick={(e) => { e.stopPropagation(); onChange(tags.filter((x) => x !== t)); }}
            className="opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(val); }
          if (e.key === "Backspace" && !val && tags.length > 0) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (val.trim()) add(val); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent text-[12px] outline-none placeholder:opacity-40"
        style={{ color: "var(--fg)" }}
      />
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  DRAFT:   { label: "Brouillon", color: "var(--fg-mute)",    bg: "var(--bg-2)" },
  RUNNING: { label: "En cours",  color: "var(--amber-fg)",   bg: "var(--amber-soft)" },
  ACTIVE:  { label: "Actif",     color: "var(--emerald-fg)", bg: "var(--emerald-soft)" },
  PAUSED:  { label: "Pausé",     color: "var(--fg-mute)",    bg: "var(--bg-2)" },
} as const;

function StatusBadge({ status }: { status: Persona["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      {status === "RUNNING" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {cfg.label}
    </span>
  );
}

// ─── Persona Card ─────────────────────────────────────────────────────────────

function PersonaCard({
  persona, onRun, onPause, onDelete,
}: {
  persona: Persona;
  onRun: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const raw = persona.raw;
  return (
    <div className="rounded-[14px] p-5 flex flex-col gap-4"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: "var(--fg)" }}>{persona.name}</p>
          <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--fg-mute)" }}>{raw.industry}</p>
        </div>
        <StatusBadge status={persona.status} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {raw.jobTitles.slice(0, 3).map((t) => (
          <span key={t} className="px-2 py-0.5 rounded-[5px] text-[11px]"
            style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>{t}</span>
        ))}
        {raw.locations.slice(0, 2).map((l) => (
          <span key={l} className="px-2 py-0.5 rounded-[5px] text-[11px]"
            style={{ background: "var(--bg-2)", color: "var(--fg-mute)" }}>{l}</span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Target, label: "Leads", value: persona.leadsFound },
          { icon: Sparkles, label: "Enrichis", value: persona.enriched },
          { icon: Mail, label: "Séquences", value: persona.sequences },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-[8px] p-2.5 flex flex-col items-center gap-0.5"
            style={{ background: "var(--bg-2)" }}>
            <Icon className="h-3.5 w-3.5 mb-0.5" style={{ color: "var(--fg-mute)" }} />
            <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{value}</p>
            <p className="text-[10px]" style={{ color: "var(--fg-mute)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--line)" }}>
        {persona.status !== "RUNNING" ? (
          <button
            onClick={() => onRun(persona.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
            <Play className="h-3 w-3" /> Lancer
          </button>
        ) : (
          <button
            onClick={() => onPause(persona.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}>
            <Pause className="h-3 w-3" /> Pause
          </button>
        )}
        <button
          onClick={() => onDelete(persona.id)}
          className="p-1.5 rounded-[8px] transition-opacity hover:opacity-80"
          style={{ background: "var(--bg-2)", color: "var(--fg-mute)" }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {persona.lastRunAt && (
        <p className="text-[10.5px] -mt-2" style={{ color: "var(--fg-mute)" }}>
          Dernier run : {new Date(persona.lastRunAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

const EMPTY_RAW: RawPersona = {
  industry: "",
  jobTitles: [],
  companySizes: [],
  locations: [],
  keywords: [],
  painPoints: [],
};

const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "500+"];

function CreateDialog({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, raw: RawPersona) => void;
}) {
  const [name, setName] = useState("");
  const [raw, setRaw] = useState<RawPersona>(EMPTY_RAW);
  const [loading, setLoading] = useState(false);

  function reset() { setName(""); setRaw(EMPTY_RAW); }
  function close() { reset(); onClose(); }

  async function submit() {
    if (!name.trim() || !raw.industry.trim() || raw.jobTitles.length === 0) return;
    setLoading(true);
    await onCreate(name.trim(), raw);
    reset();
    setLoading(false);
    onClose();
  }

  function toggleSize(s: string) {
    setRaw((r) => ({
      ...r,
      companySizes: r.companySizes.includes(s)
        ? r.companySizes.filter((x) => x !== s)
        : [...r.companySizes, s],
    }));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-[16px] p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Nouveau persona</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
              L'IA va optimiser ce persona avant de lancer les canaux
            </p>
          </div>
          <button onClick={close} className="p-1.5 rounded-[8px] hover:opacity-70"
            style={{ color: "var(--fg-mute)" }}><X className="h-4 w-4" /></button>
        </div>

        {/* Nom */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Nom du persona</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: CMO SaaS B2B 50-200"
            className="w-full px-3 py-2 rounded-[8px] text-[13px] outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
          />
        </div>

        {/* Secteur */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Secteur / Industrie</p>
          <input
            value={raw.industry}
            onChange={(e) => setRaw((r) => ({ ...r, industry: e.target.value }))}
            placeholder="ex: SaaS B2B, E-commerce, Restauration…"
            className="w-full px-3 py-2 rounded-[8px] text-[13px] outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
          />
        </div>

        {/* Titres de poste */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Titres de poste cibles</p>
          <TagInput
            tags={raw.jobTitles}
            onChange={(t) => setRaw((r) => ({ ...r, jobTitles: t }))}
            placeholder="CMO, VP Marketing, Responsable Growth…"
          />
        </div>

        {/* Taille entreprise */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Taille d'entreprise</p>
          <div className="flex flex-wrap gap-1.5">
            {COMPANY_SIZE_OPTIONS.map((s) => {
              const active = raw.companySizes.includes(s);
              return (
                <button key={s} onClick={() => toggleSize(s)}
                  className="px-3 py-1 rounded-[7px] text-[12px] font-medium transition-all"
                  style={{
                    background: active ? "var(--emerald-soft)" : "var(--bg-2)",
                    color: active ? "var(--emerald-fg)" : "var(--fg-mute)",
                    border: `1px solid ${active ? "var(--emerald-line)" : "var(--line)"}`,
                  }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Localisations */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Localisations</p>
          <TagInput
            tags={raw.locations}
            onChange={(t) => setRaw((r) => ({ ...r, locations: t }))}
            placeholder="Paris, Lyon, Bordeaux, France…"
          />
        </div>

        {/* Mots-clés */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Mots-clés métier</p>
          <TagInput
            tags={raw.keywords}
            onChange={(t) => setRaw((r) => ({ ...r, keywords: t }))}
            placeholder="growth, SEO, automation, lead generation…"
          />
        </div>

        {/* Pain points */}
        <div>
          <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>Douleurs principales</p>
          <TagInput
            tags={raw.painPoints}
            onChange={(t) => setRaw((r) => ({ ...r, painPoints: t }))}
            placeholder="manque de leads, pipeline vide, taux de conversion faible…"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-2 pt-1">
          <button onClick={close} className="flex-1 py-2 rounded-[10px] text-[13px] font-medium"
            style={{ background: "var(--bg-2)", color: "var(--fg-mute)" }}>
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={loading || !name.trim() || !raw.industry.trim() || raw.jobTitles.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-[10px] text-[13px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Créer & lancer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const load = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/personas?workspaceId=${wsId}`);
    if (res.ok) {
      const data = await res.json() as { personas: Persona[] };
      setPersonas(data.personas);
    }
  }, []);

  useEffect(() => {
    getUserWorkspace().then(async (r) => {
      const wsId = r.workspaceId ?? null;
      setWorkspaceId(wsId);
      if (wsId) await load(wsId);
      setLoading(false);
    });
  }, [load]);

  // Poll running personas
  useEffect(() => {
    const running = personas.some((p) => p.status === "RUNNING");
    if (!running || !workspaceId) return;
    const t = setTimeout(() => load(workspaceId), 5000);
    return () => clearTimeout(t);
  }, [personas, workspaceId, load]);

  async function handleCreate(name: string, raw: RawPersona) {
    if (!workspaceId) return;
    const res = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, name, raw }),
    });
    if (res.ok) {
      const data = await res.json() as { persona: Persona };
      setPersonas((prev) => [data.persona, ...prev]);
    }
  }

  async function handleRun(id: string) {
    await fetch(`/api/personas/${id}/run`, { method: "POST" });
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "RUNNING" } : p))
    );
  }

  async function handlePause(id: string) {
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED" }),
    });
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "PAUSED" } : p))
    );
  }

  async function handleDelete(id: string) {
    await fetch(`/api/personas/${id}`, { method: "DELETE" });
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  }

  const running = personas.filter((p) => p.status === "RUNNING").length;
  const totalLeads = personas.reduce((acc, p) => acc + p.leadsFound, 0);
  const totalSeq = personas.reduce((acc, p) => acc + p.sequences, 0);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppTopBar title="Personas" subtitle="Prospection pilotée par l'IA" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats header */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Users, label: "Personas actifs", value: personas.filter(p => p.status === "ACTIVE").length },
            { icon: Target, label: "Leads générés", value: totalLeads },
            { icon: Linkedin, label: "Séquences déclenchées", value: totalSeq },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-[12px] p-4 flex items-center gap-3"
              style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
              <div className="p-2 rounded-[8px]" style={{ background: "var(--bg-2)" }}>
                <Icon className="h-4 w-4" style={{ color: "var(--fg-mute)" }} />
              </div>
              <div>
                <p className="text-[20px] font-bold" style={{ color: "var(--fg)" }}>{value}</p>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Running banner */}
        {running > 0 && (
          <div className="flex items-center gap-3 rounded-[10px] px-4 py-3"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--amber-fg)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--amber-fg)" }}>
              {running} pipeline{running > 1 ? "s" : ""} en cours — enrichissement et séquences en préparation…
            </p>
            <button onClick={() => workspaceId && load(workspaceId)} className="ml-auto">
              <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--amber-fg)" }} />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>Mes personas</p>
            <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
              Chaque persona déclenche les 4 canaux (Apify, Job Board, INSEE, Google Maps)
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-semibold"
            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
            <Plus className="h-4 w-4" /> Nouveau persona
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--fg-mute)" }} />
          </div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="p-4 rounded-full" style={{ background: "var(--bg-2)" }}>
              <Users className="h-8 w-8" style={{ color: "var(--fg-mute)" }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Aucun persona configuré</p>
            <p className="text-[13px] text-center max-w-sm" style={{ color: "var(--fg-mute)" }}>
              Créez votre premier persona pour lancer la prospection automatique sur tous les canaux
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[13px] font-semibold mt-2"
              style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
              <Plus className="h-4 w-4" /> Créer un persona
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onRun={handleRun}
                onPause={handlePause}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Channel explainer */}
        <div className="rounded-[14px] p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
          <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--fg)" }}>
            <BarChart3 className="inline h-4 w-4 mr-1.5 -mt-0.5" style={{ color: "var(--fg-mute)" }} />
            Canaux activés par persona
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Apify Direct", desc: "Leads avec email + LinkedIn", icon: "🎯" },
              { label: "Job Board",    desc: "Signaux d'intention via offres", icon: "💼" },
              { label: "INSEE",        desc: "Entreprises nouvellement créées", icon: "🏢" },
              { label: "Local Maps",  desc: "Commerces locaux Google Maps", icon: "📍" },
            ].map(({ label, desc, icon }) => (
              <div key={label} className="rounded-[10px] p-3 text-center"
                style={{ background: "var(--bg-2)" }}>
                <p className="text-lg mb-1">{icon}</p>
                <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{label}</p>
                <p className="text-[10.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={handleCreate} />
    </div>
  );
}
