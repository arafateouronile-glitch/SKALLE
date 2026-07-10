"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe, Users, Puzzle, Rocket, Loader2, CheckCircle2,
  Sparkles, ArrowRight, Copy, Check, Download, X, Plus,
  GitMerge, Mail, Linkedin, Wand2, ChevronDown, ChevronUp,
  CalendarDays, Target, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generateExtensionTokenAction } from "@/actions/facebook-groups";

// ─── Types & Steps ────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: "Votre produit",     desc: "Analyser votre site web",           icon: Globe    },
  { id: 2, title: "Votre ICP",         desc: "Profil client idéal (IA suggérée)", icon: Target   },
  { id: 3, title: "1ère séquence",     desc: "Séquence générée par l'IA",         icon: GitMerge },
  { id: 4, title: "Extension",         desc: "Connecter LinkedIn",                icon: Puzzle   },
  { id: 5, title: "C'est parti !",     desc: "Checklist de lancement",            icon: Rocket   },
] as const;

interface IcpSuggestion {
  industry: string;
  jobTitles: string[];
  companySizes: string[];
  locations: string[];
  keywords: string[];
  painPoints: string[];
  messagingAngle: string;
}

interface SequenceStep {
  stepNumber: number;
  channel: string;
  subject: string | null;
  content: string;
  delayDays: number;
}

// ─── Step 1 — Brand voice ─────────────────────────────────────────────────────

function StepBrandVoice({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: (offer?: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [newF, setNewF] = useState("");
  const [offer, setOffer] = useState("");

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/brand-voice/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, websiteUrl: url.trim() }),
      });
      const json = await res.json() as { error?: string; extracted?: { offer?: string; productFeatures?: string[] } };
      if (!res.ok) throw new Error(json.error);
      setOffer(json.extracted?.offer ?? "");
      setFeatures(json.extracted?.productFeatures ?? []);
      setDone(true);
      toast.success("Produit analysé !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }

  async function saveAndContinue() {
    await fetch("/api/brand-voice/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, features, offer }),
    });
    onDone(offer);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Entrez l&apos;URL de votre site. L&apos;IA analyse votre offre, votre ton et vos
        fonctionnalités pour personnaliser toute la suite.
      </p>

      {!done ? (
        <div className="flex gap-2">
          <Input
            placeholder="https://votre-site.fr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="text-sm"
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />
          <Button onClick={analyze} disabled={loading || !url.trim()} className="bg-violet-600 hover:bg-violet-700 text-white shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyser"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700">Analyse terminée</span>
            </div>
            <p className="text-xs text-emerald-700 mb-3">{offer}</p>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f) => (
                <Badge key={f} className="text-[11px] bg-emerald-100 text-emerald-700 border-emerald-200">
                  {f}
                  <button onClick={() => setFeatures(features.filter((x) => x !== f))} className="ml-1 hover:text-red-500">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  className="h-5 text-[11px] w-28 border-emerald-300"
                  placeholder="+ ajouter"
                  value={newF}
                  onChange={(e) => setNewF(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newF.trim()) {
                      setFeatures([...features, newF.trim()]);
                      setNewF("");
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <Button onClick={saveAndContinue} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
            Confirmer et continuer <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 — ICP IA ──────────────────────────────────────────────────────────

function StepIcpAi({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: (icp: IcpSuggestion) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [industry, setIndustry] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [locations, setLocations] = useState("France");
  const [keywords, setKeywords] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [messagingAngle, setMessagingAngle] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState(false);

  async function suggest() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/onboarding/suggest-icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json() as { success?: boolean; icp?: IcpSuggestion; error?: string };
      if (!res.ok || !data.icp) throw new Error(data.error ?? "Suggestion échouée");
      const icp = data.icp;
      setIndustry(icp.industry);
      setJobTitles(icp.jobTitles.join(", "));
      setLocations(icp.locations.join(", "));
      setKeywords(icp.keywords.join(", "));
      setPainPoints(icp.painPoints.join(", "));
      setMessagingAngle(icp.messagingAngle);
      setSuggested(true);
      toast.success("ICP suggéré par l'IA — ajustez si besoin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    if (!industry.trim() && !jobTitles.trim()) {
      toast.error("Renseignez au moins le secteur ou les titres de poste");
      return;
    }
    setSaving(true);
    try {
      const raw: IcpSuggestion = {
        industry: industry.trim(),
        jobTitles: jobTitles.split(",").map((s) => s.trim()).filter(Boolean),
        companySizes: ["PME", "ETI"],
        locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
        keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
        painPoints: painPoints.split(",").map((s) => s.trim()).filter(Boolean),
        messagingAngle: messagingAngle.trim(),
      };
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name: industry || jobTitles, raw }),
      });
      if (!res.ok) throw new Error("Erreur création persona");
      toast.success("ICP enregistré !");
      onDone(raw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Définissez votre client idéal.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={suggest}
          disabled={suggesting}
          className="gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50 text-xs"
        >
          {suggesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          {suggested ? "Re-suggérer" : "✨ Suggérer avec l'IA"}
        </Button>
      </div>

      {suggested && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
          <p className="text-xs text-violet-700">{messagingAngle || "Angle généré par l'IA"}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Secteur d&apos;activité *</Label>
          <Input
            placeholder="ex: Organismes de formation, EdTech…"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Titres de poste ciblés <span className="text-gray-400">(virgules)</span></Label>
          <Input
            placeholder="ex: Directeur de formation, Responsable RH"
            value={jobTitles}
            onChange={(e) => setJobTitles(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Géographies</Label>
          <Input
            placeholder="France, Belgique…"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Mots-clés ICP <span className="text-gray-400">(virgules)</span></Label>
          <Input
            placeholder="ex: Qualiopi, OPCO, SaaS"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Points de douleur <span className="text-gray-400">(virgules)</span></Label>
          <Input
            placeholder="ex: gestion administrative, conformité, reporting"
            value={painPoints}
            onChange={(e) => setPainPoints(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Enregistrer mon ICP
      </Button>

      <button onClick={() => onDone({ industry: "", jobTitles: [], companySizes: [], locations: [], keywords: [], painPoints: [], messagingAngle: "" })} className="text-xs text-gray-400 hover:text-gray-600 underline block text-center">
        Passer cette étape
      </button>
    </div>
  );
}

// ─── Step 3 — Séquence IA ────────────────────────────────────────────────────

function StepStarterSequence({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: (sequenceId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/starter-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json() as {
        success?: boolean;
        sequenceId?: string;
        steps?: SequenceStep[];
        error?: string;
      };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Génération échouée");
      setSteps(data.steps ?? []);
      setSequenceId(data.sequenceId ?? null);
      setExpanded(1);
      toast.success("Séquence créée dans Sales OS → Séquences");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setLoading(false);
    }
  }

  const channelIcon = (ch: string) =>
    ch === "LINKEDIN" ? <Linkedin className="h-3.5 w-3.5 text-sky-500" /> : <Mail className="h-3.5 w-3.5 text-violet-500" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        L&apos;IA génère une séquence d&apos;outreach 3 étapes (Email J0 → LinkedIn J3 → Email J7)
        adaptée à votre ICP et à votre offre. Vous pourrez la modifier ensuite.
      </p>

      {steps.length === 0 ? (
        <Button
          onClick={generate}
          disabled={loading}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2 py-6 text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Génération en cours…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Générer ma première séquence
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.stepNumber} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === s.stepNumber ? null : s.stepNumber)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
              >
                {channelIcon(s.channel)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">
                      Étape {s.stepNumber} — {s.channel === "LINKEDIN" ? "LinkedIn" : "Email"}
                    </span>
                    <Badge className="text-[10px] bg-gray-200 text-gray-600 border-0">
                      J+{s.delayDays}
                    </Badge>
                  </div>
                  {s.subject && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{s.subject}</p>
                  )}
                </div>
                {expanded === s.stepNumber ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
              </button>
              {expanded === s.stepNumber && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{s.content}</p>
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={loading}
              className="flex-1 text-xs gap-1"
            >
              <Wand2 className="h-3 w-3" />
              Re-générer
            </Button>
            <Button
              size="sm"
              onClick={() => sequenceId && onDone(sequenceId)}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1"
            >
              Utiliser cette séquence <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={() => onDone("")}
        className="text-xs text-gray-400 hover:text-gray-600 underline block text-center"
      >
        Passer cette étape
      </button>
    </div>
  );
}

// ─── Step 4 — Extension ───────────────────────────────────────────────────────

function StepExtension({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const result = await generateExtensionTokenAction(workspaceId);
      if (result.success && result.data?.token) setToken(result.data.token);
      else toast.error(result.error ?? "Erreur génération token");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Connectez l&apos;extension Chrome SKALLE pour importer des groupes Facebook,
        scanner LinkedIn et envoyer des invitations automatisées.
      </p>

      <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">1</span>
          <a
            href="https://chrome.google.com/webstore"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-violet-600 underline hover:text-violet-800 flex items-center gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            Installer l&apos;extension Chrome SKALLE
          </a>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-[11px] font-bold text-gray-500 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center mt-0.5">2</span>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-gray-600">Générer votre token d&apos;authentification</p>
            {!token ? (
              <Button size="sm" onClick={generate} disabled={loading} variant="outline" className="gap-1.5">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Générer le token
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded px-2 py-1.5 truncate">
                  {token}
                </code>
                <Button size="icon" variant="ghost" onClick={copy} className="h-7 w-7 shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-500 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">3</span>
          <p className="text-sm text-gray-600">Collez le token dans les réglages de l&apos;extension</p>
        </div>
      </div>

      <Button onClick={onDone} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
        Continuer <ArrowRight className="h-4 w-4 ml-2" />
      </Button>

      <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600 underline block text-center">
        Passer cette étape
      </button>
    </div>
  );
}

// ─── Step 5 — Launch checklist ────────────────────────────────────────────────

function StepLaunch({
  completedItems,
  onDone,
}: {
  completedItems: { brandVoice: boolean; icp: boolean; sequence: boolean; extension: boolean };
  onDone: () => void;
}) {
  const items = [
    { key: "brandVoice", label: "Produit analysé (Brand Voice)", done: completedItems.brandVoice },
    { key: "icp", label: "ICP défini (Persona client idéal)", done: completedItems.icp },
    { key: "sequence", label: "1ère séquence générée par l'IA", done: completedItems.sequence },
    { key: "extension", label: "Extension LinkedIn connectée", done: completedItems.extension },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Rocket className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {doneCount === 4 ? "Tout est prêt !" : `${doneCount}/4 étapes complètes`}
            </p>
            <p className="text-xs text-gray-500">
              {doneCount === 4
                ? "Votre Sales OS est configuré — place à la prospection."
                : "Vous pouvez compléter les étapes manquantes plus tard."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                item.done
                  ? "bg-emerald-100/60 text-emerald-700"
                  : "bg-white border border-gray-100 text-gray-500"
              )}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
              )}
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex items-start gap-2">
          <Users className="h-3.5 w-3.5 mt-0.5 text-violet-400 shrink-0" />
          <span>Importez vos premiers prospects depuis <strong>Découverte</strong> ou LinkedIn</span>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex items-start gap-2">
          <GitMerge className="h-3.5 w-3.5 mt-0.5 text-violet-400 shrink-0" />
          <span>Assignez votre séquence IA à vos prospects depuis la page <strong>Séquences</strong></span>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex items-start gap-2">
          <CalendarDays className="h-3.5 w-3.5 mt-0.5 text-violet-400 shrink-0" />
          <span>Ajoutez votre lien Calendly dans <strong>Réglages</strong> pour les bookings auto</span>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 text-violet-400 shrink-0" />
          <span>Le <strong>Brain IA</strong> optimise vos séquences chaque lundi automatiquement</span>
        </div>
      </div>

      <Button onClick={onDone} className="w-full py-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold gap-2">
        Accéder à mon Sales OS
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CsoOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspaceId, setWorkspaceId] = useState("");
  const [completed, setCompleted] = useState({
    brandVoice: false,
    icp: false,
    sequence: false,
    extension: false,
  });

  const loadWorkspace = useCallback(async () => {
    const res = await fetch("/api/cso-agent/search-queries");
    const data = await res.json() as { workspaceId?: string };
    if (data.workspaceId) setWorkspaceId(data.workspaceId);
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  // Restore progress from localStorage
  useEffect(() => {
    if (!workspaceId) return;
    const saved = localStorage.getItem(`cso-onboarding-step-${workspaceId}`);
    if (saved) setStep(Math.min(parseInt(saved, 10), STEPS.length));
    const savedDone = localStorage.getItem(`cso-onboarding-done-${workspaceId}`);
    if (savedDone) {
      try { setCompleted(JSON.parse(savedDone) as typeof completed); } catch { /* ignore */ }
    }
  }, [workspaceId]);

  function advanceTo(nextStep: number, doneKey?: keyof typeof completed) {
    const newCompleted = doneKey ? { ...completed, [doneKey]: true } : completed;
    setCompleted(newCompleted);
    setStep(nextStep);
    if (workspaceId) {
      localStorage.setItem(`cso-onboarding-step-${workspaceId}`, String(nextStep));
      localStorage.setItem(`cso-onboarding-done-${workspaceId}`, JSON.stringify(newCompleted));
    }
  }

  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Top bar */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-800">Configuration Sales OS</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    s.id < step ? "w-6 bg-violet-500" :
                    s.id === step ? "w-6 bg-violet-500 animate-pulse" :
                    "w-3 bg-gray-200"
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">{step}/{STEPS.length}</span>
          </div>
        </div>
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-lg px-4 py-10">
        {/* Step header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-100 border border-violet-200 mb-4">
            {(() => {
              const Icon = STEPS[step - 1]?.icon ?? Globe;
              return <Icon className="h-6 w-6 text-violet-600" />;
            })()}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{STEPS[step - 1]?.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{STEPS[step - 1]?.desc}</p>
        </div>

        {/* Step content */}
        <Card className="shadow-sm border-gray-200/60">
          <CardContent className="p-6">
            {step === 1 && (
              <StepBrandVoice
                workspaceId={workspaceId}
                onDone={() => advanceTo(2, "brandVoice")}
              />
            )}
            {step === 2 && (
              <StepIcpAi
                workspaceId={workspaceId}
                onDone={() => advanceTo(3, "icp")}
              />
            )}
            {step === 3 && (
              <StepStarterSequence
                workspaceId={workspaceId}
                onDone={() => advanceTo(4, "sequence")}
              />
            )}
            {step === 4 && (
              <StepExtension
                workspaceId={workspaceId}
                onDone={() => advanceTo(5, "extension")}
              />
            )}
            {step === 5 && (
              <StepLaunch
                completedItems={completed}
                onDone={() => {
                  if (workspaceId) {
                    localStorage.removeItem(`cso-onboarding-step-${workspaceId}`);
                    localStorage.removeItem(`cso-onboarding-done-${workspaceId}`);
                  }
                  router.replace("/sales-os");
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Back nav */}
        {step > 1 && step < 5 && (
          <button
            onClick={() => setStep(step - 1)}
            className="text-xs text-gray-400 hover:text-gray-600 underline block text-center mt-4"
          >
            ← Revenir à l&apos;étape précédente
          </button>
        )}
      </div>
    </div>
  );
}
