"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Globe, Users, Puzzle, Rocket, Loader2, CheckCircle2,
  Sparkles, ArrowRight, Copy, Check, Download, X, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { generateExtensionTokenAction } from "@/actions/facebook-groups";

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: "Votre produit",   desc: "Analyser votre site web",         icon: Globe   },
  { id: 2, title: "Votre ICP",       desc: "Définir votre client idéal",      icon: Users   },
  { id: 3, title: "Extension",       desc: "Connecter LinkedIn",               icon: Puzzle  },
  { id: 4, title: "C'est parti !",   desc: "Lancer votre premier cycle CSO",  icon: Rocket  },
];

// ─── Step 1 — Brand voice ─────────────────────────────────────────────────────

function StepBrandVoice({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
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
      const json = await res.json();
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
    // Save features edits
    await fetch("/api/brand-voice/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, productFeatures: features }),
    });
    onDone();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Entrez l'URL de votre site — Claude l'analyse et extrait automatiquement
        votre offre, vos fonctionnalités clés et votre audience cible.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="https://votresite.fr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
        />
        <Button
          onClick={analyze}
          disabled={loading || !url.trim()}
          className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-1.5">{loading ? "Analyse…" : "Analyser"}</span>
        </Button>
      </div>

      {done && (
        <div className="space-y-4 rounded-xl bg-violet-50 border border-violet-100 p-4">
          {offer && (
            <div>
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">Offre détectée</p>
              <p className="text-sm text-gray-700">{offer}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">
              Fonctionnalités clés
              <span className="text-gray-400 font-normal ml-1">(citées dans les messages)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {features.map((f) => (
                <Badge key={f} className="bg-violet-100 text-violet-700 border-0 text-xs pr-1 flex items-center gap-1">
                  {f}
                  <button onClick={() => setFeatures(features.filter((x) => x !== f))}>
                    <X className="h-2.5 w-2.5 hover:text-red-500" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ajouter une fonctionnalité…"
                value={newF}
                onChange={(e) => setNewF(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newF.trim()) {
                    setFeatures([...features, newF.trim()]);
                    setNewF("");
                  }
                }}
                className="text-xs h-8"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                disabled={!newF.trim()}
                onClick={() => { setFeatures([...features, newF.trim()]); setNewF(""); }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Button onClick={saveAndContinue} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
            Continuer <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}

      {!done && (
        <button
          onClick={onDone}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Passer cette étape
        </button>
      )}
    </div>
  );
}

// ─── Step 2 — Persona ICP ─────────────────────────────────────────────────────

function StepPersona({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const [industry, setIndustry] = useState("");
  const [jobTitles, setJobTitles] = useState("");
  const [locations, setLocations] = useState("France");
  const [keywords, setKeywords] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!industry.trim() && !jobTitles.trim()) {
      toast.error("Renseignez au moins le secteur ou les titres de poste");
      return;
    }
    setLoading(true);
    try {
      const raw = {
        industry: industry.trim(),
        jobTitles: jobTitles.split(",").map((s) => s.trim()).filter(Boolean),
        companySizes: ["PME", "ETI"],
        locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
        keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
        painPoints: painPoints.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name: industry || jobTitles, raw }),
      });
      if (!res.ok) throw new Error("Erreur création persona");
      toast.success("Persona créé !");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Décrivez votre client idéal. Ces critères servent à cibler les recherches
        LinkedIn et à prioriser vos prospects.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Secteur d'activité *</Label>
          <Input
            placeholder="ex: Organismes de formation, EdTech…"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Titres de poste ciblés <span className="text-gray-400">(séparés par des virgules)</span></Label>
          <Input
            placeholder="ex: Directeur de formation, Responsable pédagogique"
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
            placeholder="ex: Qualiopi, OPCO, formation pro"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Points de douleur <span className="text-gray-400">(virgules)</span></Label>
          <Input
            placeholder="ex: gestion administrative, suivi émargement, conformité BPF"
            value={painPoints}
            onChange={(e) => setPainPoints(e.target.value)}
            className="mt-1 text-sm"
          />
        </div>
      </div>

      <Button
        onClick={create}
        disabled={loading}
        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Créer mon persona
      </Button>

      <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600 underline block text-center">
        Passer cette étape
      </button>
    </div>
  );
}

// ─── Step 3 — Extension ───────────────────────────────────────────────────────

function StepExtension({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    const res = await generateExtensionTokenAction(workspaceId);
    setLoading(false);
    if (res.success && res.data?.token) {
      setToken(res.data.token);
      toast.success("Token généré !");
    } else {
      toast.error("Erreur lors de la génération du token");
    }
  }

  function copy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        L'extension Chrome enrichit automatiquement vos prospects LinkedIn et exécute
        les décisions approuvées par le CSO Agent.
      </p>

      <ol className="space-y-2 text-xs text-gray-600">
        {[
          "Téléchargez et décompressez l'extension (.zip)",
          "Ouvrez chrome://extensions → activez le Mode développeur",
          "Cliquez « Charger l'extension non empaquetée » → sélectionnez le dossier",
          "Collez votre token dans le popup de l'extension",
          "Renseignez l'URL de votre instance SKALLE dans le popup",
        ].map((s, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold text-[10px] mt-0.5">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <a
        href="/api/extension/download"
        download="skalle-extension.zip"
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
      >
        <Download className="h-4 w-4" />
        Télécharger l'extension (.zip)
      </a>

      {!token ? (
        <Button onClick={generate} disabled={loading} variant="outline" className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Générer mon token
        </Button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">Votre token — à coller dans le popup de l'extension</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono truncate text-gray-700">
              {token}
            </code>
            <Button variant="outline" size="sm" onClick={copy} className="h-8 w-8 p-0 shrink-0">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      <Button
        onClick={onDone}
        disabled={!token}
        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
      >
        Continuer <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>

      <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600 underline block text-center">
        Passer cette étape
      </button>
    </div>
  );
}

// ─── Step 4 — Launch ──────────────────────────────────────────────────────────

function StepLaunch({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto">
        <Rocket className="h-8 w-8 text-white" />
      </div>

      <div>
        <p className="font-semibold text-gray-900 text-lg">Vous êtes prêt !</p>
        <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
          Votre pipeline CSO est configuré. Le CSO Agent va analyser vos prospects
          et générer des décisions d'outreach à approuver en un clic.
        </p>
      </div>

      <div className="text-left space-y-2 rounded-xl bg-gray-50 border border-gray-100 p-4">
        {[
          { label: "Prochaine étape", value: "Approuver les décisions CSO dans le dashboard" },
          { label: "L'extension", value: "Enrichit les profils quand vous naviguez sur LinkedIn" },
          { label: "Chaque semaine", value: "Le persona s'affine automatiquement selon les résultats" },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 items-start">
            <CheckCircle2 className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-medium text-gray-700">{item.label} — </span>
              <span className="text-xs text-gray-500">{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={onDone} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
        Accéder au dashboard <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function CsoOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);

  useEffect(() => {
    fetch("/api/cso-agent/search-queries")
      .then((r) => r.json())
      .then((d) => { if (d.workspaceId) setWorkspaceId(d.workspaceId); })
      .finally(() => setLoadingWs(false));
  }, []);

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  function next() {
    if (step < STEPS.length) setStep(step + 1);
    else router.replace("/sales-os");
  }

  if (loadingWs) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500">
        Workspace introuvable.{" "}
        <button onClick={() => router.push("/sales-os")} className="underline ml-1">
          Retourner au dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Configuration Sales OS — {step}/{STEPS.length}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bienvenue sur le Sales OS</h1>
          <p className="text-gray-500 mt-1 text-sm">
            3 minutes pour activer votre pipeline de prospection IA.
          </p>
        </div>

        {/* Progress */}
        <Progress value={progress} className="h-2" />

        {/* Step indicators */}
        <div className="flex justify-between">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className={`flex flex-col items-center gap-1 text-xs ${active ? "text-violet-700 font-medium" : done ? "text-emerald-600" : "text-gray-400"}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${done ? "bg-emerald-500 text-white" : active ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-400"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="hidden sm:block">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {(() => { const S = STEPS[step - 1]; const I = S.icon; return <><I className="h-5 w-5 text-violet-600" />{S.title}</>; })()}
            </CardTitle>
            <CardDescription>{STEPS[step - 1].desc}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && <StepBrandVoice workspaceId={workspaceId} onDone={next} />}
            {step === 2 && <StepPersona workspaceId={workspaceId} onDone={next} />}
            {step === 3 && <StepExtension workspaceId={workspaceId} onDone={next} />}
            {step === 4 && <StepLaunch onDone={() => router.replace("/sales-os")} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
