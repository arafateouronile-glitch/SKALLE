"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Youtube,
  Loader2,
  TrendingUp,
  Users,
  Play,
  Lightbulb,
  Target,
  ChevronRight,
  ExternalLink,
  Sparkles,
  BarChart3,
  Zap,
  Globe,
  Copy,
  Check,
  Mail,
  MessageCircle,
  Handshake,
  RefreshCw,
  AtSign,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  NicheResearchResult,
  TopCreator,
  TopVideo,
  SubNiche,
  NicheBlog,
} from "@/lib/services/social/youtube-niche-research";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function gradeColor(grade: string) {
  if (grade === "A") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (grade === "B") return "text-blue-600 bg-blue-50 border-blue-200";
  if (grade === "C") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function competitionColor(c: string) {
  if (c === "FAIBLE") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (c === "MODÉRÉE") return "text-amber-600 bg-amber-50 border-amber-200";
  if (c === "ÉLEVÉE") return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function potentialDot(p: SubNiche["potential"]) {
  if (p === "HIGH") return "bg-emerald-500";
  if (p === "MEDIUM") return "bg-amber-400";
  return "bg-gray-300";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-blue-500" : score >= 35 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── Contact dialog ───────────────────────────────────────────────────────────

type ContactTarget =
  | { kind: "creator"; creator: TopCreator }
  | { kind: "blog"; blog: NicheBlog };

const DEFAULT_CREATOR_TEMPLATE = (name: string, niche: string) =>
  `Bonjour ${name} 👋

J'ai découvert ta chaîne sur ${niche} et j'apprécie vraiment la qualité de ton contenu !

Je travaille sur Skalle, une plateforme Sales & Marketing IA pour les équipes B2B, et je pense qu'il y aurait une belle synergie avec ton audience.

Serais-tu intéressé(e) par un partenariat affilié ? On propose 30% de commission récurrente sur chaque vente générée via ton lien.

Au plaisir d'en discuter !`;

const DEFAULT_BLOG_TEMPLATE = (name: string, niche: string) =>
  `Bonjour,

J'ai lu votre contenu sur ${niche} — vraiment excellent !

Je vous contacte au sujet d'une opportunité de partenariat : intégrer Skalle (plateforme Sales & Marketing IA B2B) dans votre contenu avec un lien affilié à 30 % de commission récurrente.

Votre audience correspond parfaitement à nos utilisateurs cibles, et nous serions ravis de vous proposer un accès en avant-première.

Seriez-vous disponible pour en discuter brièvement ?

Cordialement`;

function ContactDialog({
  target,
  niche,
  open,
  onClose,
}: {
  target: ContactTarget | null;
  niche: string;
  open: boolean;
  onClose: () => void;
}) {
  const name = target?.kind === "creator" ? target.creator.name : (target?.blog.domain ?? "");
  const defaultMsg =
    target?.kind === "creator"
      ? DEFAULT_CREATOR_TEMPLATE(name, niche)
      : DEFAULT_BLOG_TEMPLATE(name, niche);

  const [message, setMessage] = useState(defaultMsg);
  const [format, setFormat] = useState<"dm" | "email" | "collab">(
    target?.kind === "creator" ? "dm" : "email"
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset message when target changes
  const reset = () => {
    setMessage(
      target?.kind === "creator"
        ? DEFAULT_CREATOR_TEMPLATE(name, niche)
        : DEFAULT_BLOG_TEMPLATE(name, niche)
    );
    setCopied(false);
  };

  async function generateAI() {
    if (!target) return;
    setGenerating(true);
    try {
      const body =
        target.kind === "creator"
          ? {
              type: "creator",
              name: target.creator.name,
              url: target.creator.channelUrl,
              niche,
              bio: target.creator.description,
              subscribers: target.creator.subscribers,
              format,
            }
          : {
              type: "blog",
              name: target.blog.title,
              url: target.blog.url,
              niche,
              bio: target.blog.snippet,
              format,
            };

      const res = await fetch("/api/social/niche-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { pitch?: string; error?: string };
      if (!res.ok || !data.pitch) { toast.error(data.error ?? "Erreur génération"); return; }
      setMessage(data.pitch);
      toast.success("Message personnalisé généré !");
    } catch { toast.error("Erreur réseau"); }
    finally { setGenerating(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Message copié !");
    setTimeout(() => setCopied(false), 2500);
  }

  if (!target) return null;

  const contactUrl =
    target.kind === "creator" ? target.creator.channelUrl : target.blog.url;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            {target.kind === "creator" ? (
              <Youtube className="h-4 w-4 text-red-500" />
            ) : (
              <Globe className="h-4 w-4 text-blue-500" />
            )}
            Contacter — {name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Format selector */}
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-gray-500 whitespace-nowrap">Format :</p>
            <div className="flex gap-1.5">
              {(target.kind === "creator"
                ? [
                    { value: "dm", label: "DM direct", icon: MessageCircle },
                    { value: "collab", label: "Collab vidéo", icon: Youtube },
                    { value: "email", label: "Email", icon: Mail },
                  ]
                : [{ value: "email", label: "Email affilié", icon: Mail }]
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setFormat(value as "dm" | "email" | "collab")}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all",
                    format === value
                      ? "bg-violet-50 border-violet-300 text-violet-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Message editable */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[12px] font-medium text-gray-600">Message</p>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 border-violet-300 text-violet-600 hover:bg-violet-50"
                onClick={generateAI}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {generating ? "Génération…" : "Personnaliser avec Claude"}
              </Button>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="text-[12px] resize-none leading-relaxed"
            />
            <p className="text-[10px] text-gray-400 mt-1">{message.length} caractères</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              className={cn(
                "flex-1 h-9 gap-2 text-[13px] transition-all",
                copied ? "bg-emerald-600 hover:bg-emerald-600" : "bg-gray-900 hover:bg-gray-800"
              )}
              onClick={copy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié !" : "Copier le message"}
            </Button>
            <a
              href={contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-gray-400 hover:text-gray-600"
              onClick={reset}
              title="Réinitialiser"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmailChip({ email, confidence }: { email: string; confidence: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const chipColor =
    confidence === "HIGH"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : confidence === "MEDIUM"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-gray-50 border-gray-200 text-gray-600";
  return (
    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono", chipColor)}>
      <AtSign className="h-2.5 w-2.5 flex-shrink-0" />
      <a href={`mailto:${email}`} className="hover:underline truncate max-w-[140px]" onClick={(e) => e.stopPropagation()}>
        {email}
      </a>
      <button onClick={copy} className="ml-0.5 flex-shrink-0">
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5 opacity-60" />}
      </button>
    </div>
  );
}

function CreatorCard({
  creator,
  onContact,
}: {
  creator: TopCreator;
  onContact: () => void;
}) {
  const [emailData, setEmailData] = useState<{ email: string; confidence: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  async function findEmail(e: React.MouseEvent) {
    e.stopPropagation();
    setEmailLoading(true);
    try {
      const res = await fetch("/api/social/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "youtube", name: creator.name, bio: creator.description }),
      });
      const data = await res.json() as { email: string | null; confidence: string };
      if (data.email) {
        setEmailData({ email: data.email, confidence: data.confidence });
        toast.success("Email trouvé !");
      } else {
        toast.error("Email introuvable pour ce créateur");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setEmailLoading(false); }
  }

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0 group">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
        {creator.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={creator.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-semibold text-gray-800 hover:text-red-600 truncate flex items-center gap-1"
        >
          {creator.name}
          <ExternalLink className="h-2.5 w-2.5 text-gray-300 flex-shrink-0" />
        </a>
        <p className="text-[11px] text-gray-400 truncate">{creator.description || "—"}</p>
        {emailData && (
          <div className="mt-1">
            <EmailChip email={emailData.email} confidence={emailData.confidence} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[12px] font-bold text-gray-700">{fmt(creator.subscribers)}</span>
          <span className="text-[10px] text-gray-400">{creator.engagementRate}% eng.</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!emailData && (
            <button
              onClick={findEmail}
              disabled={emailLoading}
              className="h-7 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-[11px] flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50"
            >
              {emailLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <AtSign className="h-3 w-3" />}
              Email
            </button>
          )}
          <button
            onClick={onContact}
            className="h-7 px-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-600 text-[11px] flex items-center gap-1 hover:bg-violet-100"
          >
            <Handshake className="h-3 w-3" />
            Pitcher
          </button>
        </div>
      </div>
    </div>
  );
}

function BlogCard({
  blog,
  onContact,
}: {
  blog: NicheBlog;
  onContact: () => void;
}) {
  const favicon = `https://www.google.com/s2/favicons?domain=${blog.domain}&sz=32`;
  const [emailData, setEmailData] = useState<{ email: string; confidence: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  async function findEmail(e: React.MouseEvent) {
    e.stopPropagation();
    setEmailLoading(true);
    try {
      const res = await fetch("/api/social/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "blog", name: blog.title, bio: blog.snippet, domain: blog.domain }),
      });
      const data = await res.json() as { email: string | null; confidence: string };
      if (data.email) {
        setEmailData({ email: data.email, confidence: data.confidence });
        toast.success("Email trouvé !");
      } else {
        toast.error("Email introuvable pour ce blog");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setEmailLoading(false); }
  }

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0 group">
      <div className="w-7 h-7 rounded border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon} alt={blog.domain} className="h-4 w-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-200 text-blue-600">
            #{blog.position}
          </Badge>
          <p className="text-[11px] font-medium text-blue-600 truncate">{blog.domain}</p>
        </div>
        <a
          href={blog.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-gray-700 hover:text-blue-600 line-clamp-1 transition-colors"
        >
          {blog.title}
        </a>
        <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">{blog.snippet}</p>
        {emailData && (
          <div className="mt-1.5">
            <EmailChip email={emailData.email} confidence={emailData.confidence} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!emailData && (
          <button
            onClick={findEmail}
            disabled={emailLoading}
            className="h-7 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-[11px] flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50"
          >
            {emailLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <AtSign className="h-3 w-3" />}
            Email
          </button>
        )}
        <button
          onClick={onContact}
          className="h-7 px-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 text-[11px] flex items-center gap-1 hover:bg-blue-100"
        >
          <Mail className="h-3 w-3" />
          Contacter
        </button>
      </div>
    </div>
  );
}

function VideoRow({ video }: { video: TopVideo }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        {video.isShort ? (
          <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-200 px-1 py-0">SHORT</Badge>
        ) : (
          <Play className="h-3.5 w-3.5 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-gray-700 hover:text-red-600 line-clamp-2 leading-tight">
          {video.title}
        </a>
        <p className="text-[10px] text-gray-400 mt-0.5">{video.channelTitle}</p>
      </div>
      <span className="text-[12px] font-semibold text-gray-600 flex-shrink-0">{fmt(video.views)}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const REGIONS = [
  { value: "FR", label: "🇫🇷 France" },
  { value: "US", label: "🇺🇸 États-Unis" },
  { value: "GB", label: "🇬🇧 Royaume-Uni" },
  { value: "CA", label: "🇨🇦 Canada" },
  { value: "BE", label: "🇧🇪 Belgique" },
  { value: "CH", label: "🇨🇭 Suisse" },
];

export function YoutubeNicheRadar() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("FR");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NicheResearchResult | null>(null);
  const [contactTarget, setContactTarget] = useState<ContactTarget | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

  function openContact(target: ContactTarget) {
    setContactTarget(target);
    setContactOpen(true);
  }

  async function analyze() {
    if (!topic.trim()) { toast.error("Entre une niche à analyser"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/social/niche-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), region }),
      });
      const data = await res.json() as NicheResearchResult & { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Erreur"); return; }
      setResult(data);
      toast.success(`Analyse terminée · ${data.topCreators.length} créateurs · ${data.topBlogs.length} blogs`);
    } catch { toast.error("Erreur réseau"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {/* Contact dialog */}
      <ContactDialog
        target={contactTarget}
        niche={result?.topic ?? topic}
        open={contactOpen}
        onClose={() => setContactOpen(false)}
      />

      {/* Search bar */}
      <Card className="bg-white/80 border-gray-200/60">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Youtube className="h-5 w-5 text-red-500" />
              <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap">Niche à analyser</span>
            </div>
            <Input
              placeholder="ex: finance personnelle, productivité, marketing digital…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && void analyze()}
              className="flex-1 h-9 text-[13px]"
            />
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-36 h-9 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-[12px]">{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={analyze}
              disabled={loading || !topic.trim()}
              className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white whitespace-nowrap"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {loading ? "Analyse…" : "Analyser"}
            </Button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Analyse les top créateurs YouTube, vidéos et blogs pour valider la viabilité d'une niche.
          </p>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Youtube className="h-10 w-10 text-red-500 animate-pulse" />
          <p className="text-[13px] text-gray-500">Scan YouTube + blogs en cours…</p>
          <p className="text-[11px] text-gray-400">Environ 10-15 secondes</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5">

          {/* Score cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-white/80 border-gray-200/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] text-gray-500 font-medium">Score viabilité</p>
                  <span className={cn("text-xl font-black px-2.5 py-0.5 rounded-lg border", gradeColor(result.viabilityGrade))}>
                    {result.viabilityGrade}
                  </span>
                </div>
                <p className="text-3xl font-black text-gray-900 mb-2">
                  {result.viabilityScore}<span className="text-lg text-gray-400">/100</span>
                </p>
                <ScoreBar score={result.viabilityScore} />
              </CardContent>
            </Card>

            <Card className="bg-white/80 border-gray-200/60 sm:col-span-2">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <p className="text-[12px] font-medium text-gray-500">Analyse Claude</p>
                  <Badge className={cn("ml-auto text-[10px] border", competitionColor(result.competition))}>
                    Compétition {result.competition}
                  </Badge>
                </div>
                <p className="text-[13px] text-gray-700 leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-gray-400">
                  <span>{result.topCreators.length} créateurs</span>
                  <span>·</span>
                  <span>{result.topVideos.length} vidéos</span>
                  <span>·</span>
                  <span>{result.topBlogs.length} blogs</span>
                  <span>·</span>
                  <span>Région {result.region}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left column — insights */}
            <div className="lg:col-span-2 space-y-4">

              {result.subNiches.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Target className="h-4 w-4 text-violet-500" />
                      Sous-niches détectées
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2.5">
                    {result.subNiches.map((sn, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", potentialDot(sn.potential))} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-gray-800">{sn.name}</p>
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border",
                              sn.potential === "HIGH" ? "text-emerald-600 border-emerald-200" :
                              sn.potential === "MEDIUM" ? "text-amber-600 border-amber-200" : "text-gray-400 border-gray-200"
                            )}>
                              {sn.potential}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">{sn.reason}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {result.keyInsights.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Insights clés
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {result.keyInsights.map((ins, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight className="h-3.5 w-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[12px] text-gray-700">{ins}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {result.bestFormats.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Zap className="h-4 w-4 text-blue-500" />
                      Formats qui performent
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {result.bestFormats.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Badge variant="outline" className="text-[10px] mt-0.5 flex-shrink-0 border-blue-200 text-blue-600">{f.format}</Badge>
                        <p className="text-[12px] text-gray-600">{f.why}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {result.entryStrategy && (
                <Card className="bg-violet-50/60 border-violet-200/60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-violet-700 mb-1">Stratégie d'entrée recommandée</p>
                      <p className="text-[13px] text-violet-800">{result.entryStrategy}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column — creators, videos, blogs */}
            <div className="space-y-4">

              {/* Top creators */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                    <Users className="h-4 w-4 text-red-500" />
                    Top créateurs ({result.topCreators.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  {result.topCreators.slice(0, 8).map((c) => (
                    <CreatorCard
                      key={c.channelId}
                      creator={c}
                      onContact={() => openContact({ kind: "creator", creator: c })}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Top blogs */}
              {result.topBlogs.length > 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                      <Globe className="h-4 w-4 text-blue-500" />
                      Top blogs ({result.topBlogs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-2">
                    {result.topBlogs.map((b, i) => (
                      <BlogCard
                        key={i}
                        blog={b}
                        onContact={() => openContact({ kind: "blog", blog: b })}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Top videos */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-[13px] flex items-center gap-2 text-gray-800">
                    <Play className="h-4 w-4 text-red-500" />
                    Top vidéos ({result.topVideos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-2">
                  {result.topVideos.slice(0, 8).map((v) => (
                    <VideoRow key={v.videoId} video={v} />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
