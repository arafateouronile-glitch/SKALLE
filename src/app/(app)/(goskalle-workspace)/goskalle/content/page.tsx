"use client";

/**
 * Goskalle — Contenu LinkedIn calé sur l'ICP en cours de prospection.
 * 3 étapes : choisir le persona (ICP) → choisir un angle suggéré → générer, prévisualiser, publier.
 * Réutilise intégralement le moteur existant (génération, publication OAuth) — voir plan.
 */

import { useState, useEffect, useCallback } from "react";
import { PenLine, Loader2, Send, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getUserWorkspace } from "@/actions/leads";
import { createPost } from "@/actions/social";
import { publishPostAction } from "@/actions/social-publish";
import type { LinkedInTrigger, LinkedInFormat } from "@/app/api/social/linkedin/generate/route";

interface PersonaOption {
  id: string;
  name: string;
  raw: { painPoints?: string[]; industry?: string };
}

interface Angle {
  subject: string;
  trigger: LinkedInTrigger;
  format: LinkedInFormat;
  reason: string;
}

interface GeneratedPost {
  post: string;
  hooks: string[];
  firstComment: string;
}

const TRIGGER_LABEL: Record<LinkedInTrigger, string> = {
  curiosity_gap: "Curiosity gap",
  identity_validation: "Validation d'identité",
  tribal_belonging: "Appartenance",
  productive_discomfort: "Inconfort productif",
  aspiration: "Aspiration",
  status_signal: "Signal de statut",
};

const FORMAT_LABEL: Record<LinkedInFormat, string> = {
  post_court: "Post court",
  storytelling: "Storytelling",
  listicle: "Listicle",
  how_to: "How-to",
  contrarian: "Contrarian",
};

export default function GoskalleContentPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  const [angles, setAngles] = useState<Angle[]>([]);
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<Angle | null>(null);

  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);

  useEffect(() => {
    (async () => {
      const ws = await getUserWorkspace();
      if (!ws.success || !ws.workspaceId) return;
      setWorkspaceId(ws.workspaceId);
      const res = await fetch(`/api/personas?workspaceId=${ws.workspaceId}`);
      const data = await res.json();
      setPersonas(data.personas ?? []);
    })();
  }, []);

  const loadAngles = useCallback(async (personaId: string) => {
    setLoadingAngles(true);
    setAngles([]);
    setSelectedAngle(null);
    setGenerated(null);
    try {
      const res = await fetch("/api/goskalle/content-angles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de la génération des angles");
        return;
      }
      setAngles(data.angles);
    } finally {
      setLoadingAngles(false);
    }
  }, []);

  function handleSelectPersona(id: string) {
    setSelectedPersonaId(id);
    loadAngles(id);
  }

  async function handleGenerate(angle: Angle) {
    setSelectedAngle(angle);
    setLoadingGenerate(true);
    setGenerated(null);
    try {
      const res = await fetch("/api/social/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: angle.trigger, subject: angle.subject, format: angle.format }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de la génération du post");
        return;
      }
      setGenerated(data);
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handleSave(publish: boolean) {
    if (!workspaceId || !generated) return;
    setSaving(publish ? "publish" : "draft");
    try {
      const created = await createPost(workspaceId, { type: "LINKEDIN", content: generated.post });
      if (!created.success || !created.data) {
        toast.error(created.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      if (!publish) {
        toast.success("Brouillon enregistré");
        return;
      }
      const result = await publishPostAction(created.data.id);
      if (!result.success) {
        toast.error(result.error ?? "Erreur lors de la publication");
        return;
      }
      toast.success("Post publié sur LinkedIn");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
          >
            <PenLine className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
          </div>
          <h1 className="text-[20px] font-display font-bold" style={{ color: "var(--fg)" }}>
            Contenu LinkedIn
          </h1>
        </div>
        <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
          Du contenu calé sur l&apos;ICP en cours de prospection — chauffe l&apos;outbound (les prospects
          reconnaissent le compte) et alimente les leads chauds (les engageurs remontent déjà
          automatiquement en prospect via le pipeline Warm Leads existant).
        </p>
      </div>

      {/* Étape 1 — Persona */}
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
        <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--fg-mute)" }}>
          1. Pour quel ICP ?
        </p>
        {personas.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
            Aucun persona trouvé. Crée d&apos;abord un ICP dans Sales OS → Personas.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPersona(p.id)}
                className="px-3 py-2 rounded-[10px] text-[13px] font-medium transition-all"
                style={
                  selectedPersonaId === p.id
                    ? { background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }
                    : { color: "var(--fg-dim)", border: "1px solid var(--line)" }
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Étape 2 — Angle */}
      {selectedPersonaId && (
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold" style={{ color: "var(--fg-mute)" }}>
              2. Quel angle ?
            </p>
            <button
              onClick={() => selectedPersonaId && loadAngles(selectedPersonaId)}
              className="text-[11px] flex items-center gap-1"
              style={{ color: "var(--fg-mute)" }}
              disabled={loadingAngles}
            >
              <RefreshCw className={`h-3 w-3 ${loadingAngles ? "animate-spin" : ""}`} />
              Régénérer
            </button>
          </div>
          {loadingAngles ? (
            <div className="flex items-center gap-2 text-[13px] py-4" style={{ color: "var(--fg-mute)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyse des painPoints du persona…
            </div>
          ) : (
            <div className="space-y-2">
              {angles.map((angle, i) => (
                <button
                  key={i}
                  onClick={() => handleGenerate(angle)}
                  className="w-full text-left p-3 rounded-[10px] transition-all"
                  style={
                    selectedAngle?.subject === angle.subject
                      ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }
                      : { border: "1px solid var(--line)" }
                  }
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                    >
                      {TRIGGER_LABEL[angle.trigger]}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>
                      {FORMAT_LABEL[angle.format]}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>
                    {angle.subject}
                  </p>
                  <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
                    {angle.reason}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Étape 3 — Génération + publication */}
      {selectedAngle && (
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
          <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--fg-mute)" }}>
            3. Post généré
          </p>
          {loadingGenerate ? (
            <div className="flex items-center gap-2 text-[13px] py-4" style={{ color: "var(--fg-mute)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Rédaction en cours…
            </div>
          ) : generated ? (
            <div className="space-y-4">
              <div
                className="rounded-[10px] p-4 text-[13.5px] whitespace-pre-wrap leading-relaxed"
                style={{ background: "var(--bg-sidebar)", color: "var(--fg)" }}
              >
                {generated.post}
              </div>
              <div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--fg-mute)" }}>
                  Hooks alternatifs
                </p>
                <ul className="space-y-1">
                  {generated.hooks.map((h, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                      · {h}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--fg-mute)" }}>
                  Premier commentaire suggéré
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--fg-dim)" }}>
                  {generated.firstComment}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold"
                  style={{ border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  {saving === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Enregistrer en brouillon
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold"
                  style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
                >
                  {saving === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publier maintenant
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
