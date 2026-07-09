"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Image as ImageIcon,
  Video,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  RotateCcw,
  Mic,
  FileText,
  Sparkles,
  Play,
  Clapperboard,
  Zap,
  Monitor,
  ScreenShare,
  Layers,
  Wand2,
  Plus,
  Trash2,
  User,
  Camera,
} from "lucide-react";
import {
  UGC_STYLE_META,
  SCRIPT_PLACEHOLDERS,
  SAAS_HOOKS,
  MOVEMENT_PRESETS,
} from "@/lib/services/video/prompt-builder";
import { UGC_FORMATS, UGC_CATEGORIES, buildFormatPrompt } from "@/lib/services/video/ugc-formats";
import { STORYBOARD_TEMPLATES, type StoryboardTemplate } from "@/lib/services/video/storyboard-templates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvatarAsset {
  id: string;
  name: string;
  storagePath: string;
  previewUrl: string | null;
  createdAt: string;
}

interface PersonPhotoLite {
  id: string;
  personId: string;
  formatId: string | null;
  formatLabel: string | null;
  photoUrl: string;
  storagePath: string;
  isBase: boolean;
}

interface PersonLite {
  id: string;
  name: string;
  photos: PersonPhotoLite[];
}

type VideoAdStatus =
  | "PENDING"
  | "UPLOADING"
  | "TRANSCRIBING"
  | "ANIMATING"
  | "LIP_SYNCING"
  | "COMPOSITING"
  | "CAPTIONING"
  | "DONE"
  | "FAILED";

type Phase = "idle" | "uploading" | "ready" | "generating" | "done" | "failed";

const VOICES = [
  { id: "nova", label: "Nova", desc: "Féminine, chaleureuse", emoji: "👩" },
  { id: "alloy", label: "Alloy", desc: "Neutre, professionnelle", emoji: "🎙️" },
  { id: "echo", label: "Echo", desc: "Masculine, claire", emoji: "👨" },
  { id: "onyx", label: "Onyx", desc: "Masculine, profonde", emoji: "🎤" },
  { id: "fable", label: "Fable", desc: "Expressive, narrative", emoji: "📖" },
  { id: "shimmer", label: "Shimmer", desc: "Féminine, douce", emoji: "✨" },
] as const;

type VoiceId = (typeof VOICES)[number]["id"];

const VIDEO_MODELS = [
  {
    id: "KLING",
    label: "Kling AI",
    tag: "Recommandé",
    desc: "Meilleur lip-sync, mouvements naturels, ultra-réaliste",
    logo: "⚡",
  },
  {
    id: "SORA",
    label: "Sora",
    tag: "OpenAI",
    desc: "Cohérence cinématographique, fluidité exceptionnelle",
    logo: "◯",
  },
  {
    id: "VEO",
    label: "Veo 3.1",
    tag: "Google",
    desc: "Qualité production, physique réaliste, haute fidélité",
    logo: "◈",
  },
  {
    id: "SEEDANCE",
    label: "Seedance 1.5",
    tag: "ByteDance",
    desc: "Meilleur mouvement humain · marche · rotation · actions complexes",
    logo: "🎬",
  },
] as const;

type VideoModelId = (typeof VIDEO_MODELS)[number]["id"];

function getModelLabel(model: VideoModelId): string {
  return VIDEO_MODELS.find((m) => m.id === model)?.label ?? model;
}

const BASE_STEPS: { status: VideoAdStatus; label: string }[] = [
  { status: "TRANSCRIBING", label: "Synthèse vocale (OpenAI TTS)" },
  { status: "COMPOSITING", label: "Composite screen recording" },
  { status: "CAPTIONING", label: "Transcription + sous-titres (Whisper)" },
];

const STATUS_STEPS_BY_MODEL: Record<VideoModelId, { status: VideoAdStatus; label: string }[]> = {
  KLING: [
    { status: "TRANSCRIBING", label: "Synthèse vocale (OpenAI TTS)" },
    { status: "ANIMATING", label: "Animation du visage (Kling AI)" },
    { status: "LIP_SYNCING", label: "Synchronisation labiale (Kling AI)" },
    { status: "COMPOSITING", label: "Composite screen recording" },
    { status: "CAPTIONING", label: "Transcription + sous-titres" },
  ],
  SORA: [
    { status: "TRANSCRIBING", label: "Synthèse vocale (OpenAI TTS)" },
    { status: "ANIMATING", label: "Génération vidéo (Sora)" },
    { status: "LIP_SYNCING", label: "Synchronisation labiale (Kling AI)" },
    { status: "COMPOSITING", label: "Composite screen recording" },
    { status: "CAPTIONING", label: "Transcription + sous-titres" },
  ],
  VEO: [
    { status: "TRANSCRIBING", label: "Synthèse vocale (OpenAI TTS)" },
    { status: "ANIMATING", label: "Génération vidéo (Veo 3.1)" },
    { status: "LIP_SYNCING", label: "Synchronisation labiale (Kling AI)" },
    { status: "COMPOSITING", label: "Composite screen recording" },
    { status: "CAPTIONING", label: "Transcription + sous-titres" },
  ],
  SEEDANCE: [
    { status: "TRANSCRIBING", label: "Synthèse vocale (OpenAI TTS)" },
    { status: "ANIMATING", label: "Génération vidéo + audio (Seedance 1.5 Pro)" },
    { status: "LIP_SYNCING", label: "Synchronisation labiale (Kling AI)" },
    { status: "COMPOSITING", label: "Composite screen recording" },
    { status: "CAPTIONING", label: "Transcription + sous-titres" },
  ],
};

void BASE_STEPS; // exported for reference

const STATUS_ORDER: VideoAdStatus[] = [
  "TRANSCRIBING",
  "ANIMATING",
  "LIP_SYNCING",
  "COMPOSITING",
  "CAPTIONING",
  "DONE",
];

// ─── Storyboard plan camera angle diagrams ────────────────────────────────────

function PlanCameraDiagram({ planId }: { planId: string }) {
  const em = "#10b981";
  const gr = "#9ca3af";
  const lg = "#e5e7eb";

  if (planId === "hook") {
    return (
      <svg viewBox="0 0 80 52" width={80} height={52} style={{ display: "block", margin: "0 auto" }}>
        {/* Desk surface */}
        <rect x={0} y={27} width={80} height={2} fill={lg} />
        {/* Person (torso + head above desk) */}
        <circle cx={42} cy={13} r={7} fill={gr} opacity={0.55} />
        <rect x={35} y={20} width={14} height={8} rx={2} fill={gr} opacity={0.45} />
        {/* MacBook on desk */}
        <rect x={54} y={19} width={18} height={11} rx={1} fill={lg} stroke={gr} strokeWidth={0.8} />
        <rect x={54} y={30} width={18} height={2} rx={0.5} fill={gr} opacity={0.3} />
        {/* Camera (bottom-left, tilted upward) */}
        <rect x={4} y={38} width={18} height={11} rx={2} fill={em} />
        <circle cx={13} cy={43.5} r={3.5} fill="white" opacity={0.8} />
        {/* Upward-angle arrow */}
        <line x1={20} y1={37} x2={36} y2={24} stroke={em} strokeWidth={1.5} strokeDasharray="3,2" />
        <polygon points="33,22 38,21 37,26" fill={em} />
        {/* Label */}
        <text x={13} y={52} fontSize={6.5} fill={gr} textAnchor="middle" fontFamily="sans-serif">contre-plongée</text>
      </svg>
    );
  }

  if (planId === "pitch") {
    return (
      <svg viewBox="0 0 80 52" width={80} height={52} style={{ display: "block", margin: "0 auto" }}>
        {/* Person face (distant, small — arm's length) */}
        <circle cx={40} cy={11} r={8} fill={gr} opacity={0.5} />
        {/* Arm */}
        <line x1={40} y1={19} x2={40} y2={31} stroke={gr} strokeWidth={5} strokeLinecap="round" opacity={0.35} />
        {/* Phone held at arm's length */}
        <rect x={29} y={31} width={22} height={16} rx={3} fill={em} opacity={0.9} />
        <rect x={32} y={34} width={16} height={10} rx={1} fill="white" opacity={0.8} />
        {/* Camera lens on phone (facing viewer) */}
        <circle cx={40} cy={29} r={4} fill={em} />
        <circle cx={40} cy={29} r={2.5} fill="white" opacity={0.65} />
        {/* Arrow toward viewer (bottom) */}
        <polygon points="37,51 40,45 43,51" fill={em} opacity={0.7} />
        <line x1={40} y1={45} x2={40} y2={50} stroke={em} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.7} />
        {/* Label */}
        <text x={40} y={52} fontSize={6.5} fill={gr} textAnchor="middle" fontFamily="sans-serif">selfie face caméra</text>
      </svg>
    );
  }

  if (planId === "demo") {
    return (
      <svg viewBox="0 0 80 52" width={80} height={52} style={{ display: "block", margin: "0 auto" }}>
        {/* Camera at top (bird's-eye) */}
        <rect x={30} y={2} width={20} height={11} rx={2} fill={em} />
        <circle cx={40} cy={7.5} r={3.5} fill="white" opacity={0.8} />
        {/* Downward arrow */}
        <line x1={40} y1={13} x2={40} y2={20} stroke={em} strokeWidth={1.5} strokeDasharray="3,2" />
        <polygon points="37,21 40,26 43,21" fill={em} />
        {/* Desk top-down */}
        <rect x={6} y={28} width={68} height={20} rx={3} fill={lg} />
        {/* MacBook screen */}
        <rect x={15} y={31} width={50} height={14} rx={2} fill="white" stroke={gr} strokeWidth={0.8} />
        {/* UI hint on screen */}
        <rect x={20} y={35} width={22} height={2.5} rx={1} fill={em} opacity={0.55} />
        <rect x={20} y={39} width={14} height={1.5} rx={0.5} fill={gr} opacity={0.35} />
        <rect x={37} y={38.5} width={14} height={3} rx={1} fill={em} opacity={0.4} />
        {/* Hands from bottom */}
        <ellipse cx={24} cy={50} rx={9} ry={4} fill={gr} opacity={0.35} />
        <ellipse cx={56} cy={50} rx={9} ry={4} fill={gr} opacity={0.35} />
        {/* Label */}
        <text x={40} y={52} fontSize={6.5} fill={gr} textAnchor="middle" fontFamily="sans-serif">bird's-eye POV</text>
      </svg>
    );
  }

  return <span className="text-xl">{planId}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoAdsPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [screenRecordingName, setScreenRecordingName] = useState<string | null>(null);
  const [screenRecordingUploading, setScreenRecordingUploading] = useState(false);
  const [screenFramePreview, setScreenFramePreview] = useState<string | null>(null);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [visionBadge, setVisionBadge] = useState(false);
  const [script, setScript] = useState("");
  const [animationPrompt, setAnimationPrompt] = useState("");
  const [productContext, setProductContext] = useState("");
  const [voice, setVoice] = useState<VoiceId>("nova");
  const [videoModel, setVideoModel] = useState<VideoModelId>("KLING");
  const [ugcStyle, setUgcStyle] = useState<string>("ugc_app");
  const [jobStatus, setJobStatus] = useState<VideoAdStatus | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [compositeVideoUrl, setCompositeVideoUrl] = useState<string | null>(null);
  const [captionedVideoUrl, setCaptionedVideoUrl] = useState<string | null>(null);
  const [videoTab, setVideoTab] = useState<"captioned" | "raw">("captioned");
  const [subtitlePreset, setSubtitlePreset] = useState<"clean" | "bold" | "minimal">("clean");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [variantJobIds, setVariantJobIds] = useState<string[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [formatCategory, setFormatCategory] = useState<string>("all");
  const [selectedStoryboard, setSelectedStoryboard] = useState<StoryboardTemplate | null>(null);
  const [storyboardProductHeadline, setStoryboardProductHeadline] = useState("");
  const [storyboardProductCTA, setStoryboardProductCTA] = useState("");
  const [hookScore, setHookScore] = useState<{ score: number; level: string; issue: string; tip: string } | null>(null);
  const [isScoringHook, setIsScoringHook] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [resumedFromJob, setResumedFromJob] = useState(false);
  const [avatarLibrary, setAvatarLibrary] = useState<AvatarAsset[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [persons, setPersons] = useState<PersonLite[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [selectedPersonPhotoUrl, setSelectedPersonPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const searchParams = useSearchParams();

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorsRef = useRef(0);
  const pollStartRef = useRef(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const screenRecordingInputRef = useRef<HTMLInputElement>(null);
  const resumeApplied = useRef(false);

  // Load avatar library once on mount
  useEffect(() => {
    fetch("/api/video-ads/avatars")
      .then((r) => r.json())
      .then((data: { avatars?: AvatarAsset[] }) => {
        if (data.avatars) setAvatarLibrary(data.avatars);
      })
      .catch(() => {})
      .finally(() => setLoadingAvatars(false));
  }, []);

  // Pre-fill form when ?resume=jobId is present (from gallery "Réutiliser" button)
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (!resumeId || resumeApplied.current) return;
    resumeApplied.current = true;

    fetch(`/api/video-ads/${resumeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        if (data.script) setScript(data.script);
        if (data.animationPrompt) setAnimationPrompt(data.animationPrompt);
        if (data.voiceName) setVoice(data.voiceName as VoiceId);
        if (data.videoModel) setVideoModel(data.videoModel as VideoModelId);
        if (data.ugcStyle) setUgcStyle(data.ugcStyle as string);
        // Reuse the existing job (its avatarStoragePath stays in DB)
        setJobId(resumeId);
        setAvatarPreview("reused");
        setResumedFromJob(true);
        setPhase("ready");
      })
      .catch(() => {});
  }, [searchParams]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const MAX_POLL_ERRORS = 5;
  const MAX_POLL_MS = 35 * 60 * 1000; // 35 min hard stop

  // Adaptive interval: fast at start, slower as the job drags on.
  // Kling animation alone takes 10-15 min — no point hammering DB every 4s.
  // Reduces DB queries from ~525 to ~120 over a 35-min job.
  function adaptiveInterval(elapsedMs: number): number {
    if (elapsedMs < 60_000) return 4_000;       // 0-1 min  → 4s  (TTS is quick)
    if (elapsedMs < 5 * 60_000) return 8_000;   // 1-5 min  → 8s  (animation starting)
    return 15_000;                               // 5-35 min → 15s (Kling/Veo long poll)
  }

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollErrorsRef.current = 0;
      pollStartRef.current = Date.now();

      const tick = async () => {
        const elapsed = Date.now() - pollStartRef.current;

        if (elapsed > MAX_POLL_MS) {
          stopPolling();
          setError("La génération dépasse 35 minutes. Vérifie l'historique ou relance.");
          setPhase("failed");
          return;
        }

        try {
          const res = await fetch(`/api/video-ads/${id}`);
          if (!res.ok) {
            pollErrorsRef.current += 1;
            if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
              stopPolling();
              setError("Connexion serveur perdue. Actualise la page pour voir l'état du job.");
              setPhase("failed");
            } else {
              pollingRef.current = setTimeout(tick, adaptiveInterval(elapsed));
            }
            return;
          }
          pollErrorsRef.current = 0;
          const data = await res.json();
          const status: VideoAdStatus = data.status;
          setJobStatus(status);
          if (status === "DONE") {
            setFinalVideoUrl(data.finalVideoUrl ?? null);
            setCompositeVideoUrl(data.compositeVideoUrl ?? null);
            const captioned = data.captionedVideoUrl ?? null;
            setCaptionedVideoUrl(captioned);
            setVideoTab(captioned ? "captioned" : "raw");
            setPhase("done");
            stopPolling();
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              new Notification("🎥 Ta vidéo UGC est prête !", {
                body: "Clique pour voir le résultat dans SKALLE.",
                icon: "/favicon.ico",
              });
            }
          } else if (status === "FAILED") {
            setError(data.errorMessage ?? "La génération a échoué.");
            setPhase("failed");
            stopPolling();
          } else {
            pollingRef.current = setTimeout(tick, adaptiveInterval(elapsed));
          }
        } catch {
          pollErrorsRef.current += 1;
          if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
            stopPolling();
            setError("Connexion serveur perdue. Actualise la page pour voir l'état du job.");
            setPhase("failed");
          } else {
            pollingRef.current = setTimeout(tick, adaptiveInterval(elapsed));
          }
        }
      };

      pollingRef.current = setTimeout(tick, adaptiveInterval(0));
    },
    [stopPolling]
  );

  function extractVideoFrame(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      const cleanup = () => URL.revokeObjectURL(url);

      video.addEventListener("error", () => { cleanup(); resolve(null); });

      video.addEventListener("loadeddata", () => {
        // Seek to 10% of duration or 2s, whichever is smaller
        video.currentTime = Math.min(2, video.duration * 0.1 || 2);
      });

      video.addEventListener("seeked", () => {
        try {
          const canvas = document.createElement("canvas");
          // Cap at 1280px wide to keep the image lightweight for the API
          const scale = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) { cleanup(); resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => { cleanup(); resolve(blob); }, "image/jpeg", 0.82);
        } catch { cleanup(); resolve(null); }
      });

      video.load();
    });
  }

  async function analyzeScreenFrame(frameBlob: Blob) {
    setIsAnalyzingScreen(true);
    try {
      const fd = new FormData();
      fd.append("frameFile", frameBlob, "frame.jpg");
      const res = await fetch("/api/video-ads/analyze-screen", { method: "POST", body: fd });
      if (!res.ok) return;
      const data = (await res.json()) as { description?: string };
      if (data.description) {
        // Prepend the vision description to any existing animationPrompt
        setAnimationPrompt((prev) => {
          const clean = prev.trim();
          return clean
            ? `[Interface détectée] ${data.description}\n\n${clean}`
            : `[Interface détectée] ${data.description}`;
        });
        setVisionBadge(true);
      }
    } catch {
      // Silent — vision analysis is non-critical
    } finally {
      setIsAnalyzingScreen(false);
    }
  }

  async function handleScreenRecordingFile(file: File) {
    if (!jobId) {
      setError("Uploadez d'abord une photo avatar pour créer le job.");
      return;
    }
    setError(null);
    setScreenRecordingUploading(true);
    setVisionBadge(false);

    // Extract frame client-side immediately (non-blocking)
    const framePromise = extractVideoFrame(file).then((blob) => {
      if (blob) {
        setScreenFramePreview(URL.createObjectURL(blob));
        analyzeScreenFrame(blob);
      }
    });

    try {
      // 1. Get a presigned upload URL — bypasses Next.js 10MB body limit
      const urlRes = await fetch("/api/video-ads/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, contentType: file.type }),
      });
      const urlData = (await urlRes.json()) as { signedUrl?: string; storagePath?: string; error?: string };
      if (!urlRes.ok) {
        setError(urlData.error ?? "Erreur lors de la préparation de l'upload.");
        setScreenRecordingUploading(false);
        return;
      }

      // 2. Upload directly from browser to Supabase (no Next.js limit)
      const putRes = await fetch(urlData.signedUrl!, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Erreur lors de l'upload vers le stockage.");
        setScreenRecordingUploading(false);
        return;
      }

      // 3. Register the storage path on the job
      const fd = new FormData();
      fd.append("jobId", jobId);
      fd.append("screenRecordingStoragePath", urlData.storagePath!);
      const regRes = await fetch("/api/video-ads/upload", { method: "POST", body: fd });
      const regData = await regRes.json();
      if (!regRes.ok) {
        setError(regData.error ?? "Erreur lors de l'enregistrement du screen recording.");
        setScreenRecordingUploading(false);
        return;
      }

      await framePromise;
      setScreenRecordingName(file.name);
    } catch {
      setError("Erreur réseau lors de l'upload.");
    } finally {
      setScreenRecordingUploading(false);
    }
  }

  async function handleAvatarFile(file: File) {
    setError(null);
    setPhase("uploading");

    // 1. Save to avatar library
    const libFd = new FormData();
    libFd.append("avatarFile", file);
    libFd.append("name", file.name.replace(/\.[^.]+$/, ""));
    const libRes = await fetch("/api/video-ads/avatars", { method: "POST", body: libFd });
    const libData = await libRes.json();

    if (!libRes.ok) {
      setError(libData.error ?? "Erreur lors de l'upload de l'avatar.");
      setPhase("idle");
      return;
    }

    const newAvatar: AvatarAsset = libData.avatar as AvatarAsset;
    setAvatarLibrary((prev) => [newAvatar, ...prev]);
    setSelectedAvatarId(newAvatar.id);

    // 2. Create VideoAdJob using the saved avatar asset
    const uploadFd = new FormData();
    uploadFd.append("avatarAssetId", newAvatar.id);
    if (jobId) uploadFd.append("jobId", jobId);
    const res = await fetch("/api/video-ads/upload", { method: "POST", body: uploadFd });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de la création du job.");
      setPhase("idle");
      return;
    }

    setAvatarPreview(newAvatar.previewUrl ?? URL.createObjectURL(file));
    setJobId(data.jobId as string);
    setResumedFromJob(false);
    setPhase("ready");
  }

  async function handleSelectAvatar(avatar: AvatarAsset) {
    if (selectedAvatarId === avatar.id && avatarPreview) return;
    setError(null);
    setPhase("uploading");

    const fd = new FormData();
    fd.append("avatarAssetId", avatar.id);
    const res = await fetch("/api/video-ads/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de la sélection de l'avatar.");
      setPhase("idle");
      return;
    }

    setSelectedAvatarId(avatar.id);
    setAvatarPreview(avatar.previewUrl ?? "reused");
    setJobId(data.jobId as string);
    setResumedFromJob(false);
    setPhase("ready");
  }

  async function handleDeleteAvatar(avatarId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/video-ads/avatars/${avatarId}`, { method: "DELETE" });
    setAvatarLibrary((prev) => prev.filter((a) => a.id !== avatarId));
    if (selectedAvatarId === avatarId) {
      setSelectedAvatarId(null);
      setAvatarPreview(null);
      setJobId(null);
      setPhase("idle");
    }
  }

  async function handleGenerate() {
    if (!jobId || !script.trim() || !animationPrompt.trim()) return;
    setError(null);
    setPhase("generating");
    setJobStatus("TRANSCRIBING");
    setVariantJobIds([]);
    setCaptions(null);
    // Request notification permission when generation starts
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const res = await fetch("/api/video-ads/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        script,
        animationPrompt: selectedStoryboard
          ? `Storyboard: ${selectedStoryboard.label}` // placeholder — pipeline uses per-plan prompts
          : animationPrompt,
        voiceName: voice,
        videoModel,
        ugcStyle: selectedStoryboard ? selectedStoryboard.ugcStyle : ugcStyle,
        movementType,
        productContext: productContext.trim() || undefined,
        subtitlePreset,
        variantCount,
        storyboardPlans: selectedStoryboard
          ? selectedStoryboard.plans.map((plan) => {
              if (plan.id === "demo" && (storyboardProductHeadline.trim() || storyboardProductCTA.trim())) {
                const headline = storyboardProductHeadline.trim() || productContext.trim() || "SaaS Product";
                const cta = storyboardProductCTA.trim() || "Commencer Gratuitement";
                return {
                  ...plan,
                  contentDirection:
                    plan.contentDirection +
                    `\n\nSCREEN CONTENT (CRITICAL — render this exactly): The MacBook screen shows a clean SaaS landing page. Hero headline in large bold font: "${headline}". Below it, a prominent blue CTA button with text: "${cta}". The text must be perfectly legible and centered on screen. The interface looks modern, clean, professional — white background, sans-serif font.`,
                };
              }
              return plan;
            })
          : undefined,
      }),
    });
    const data = await res.json() as { variants?: { jobId: string }[]; error?: string };

    if (!res.ok) {
      setError(data.error ?? "Erreur lors du lancement.");
      setPhase("ready");
      return;
    }

    const ids = (data.variants ?? [{ jobId }]).map((v) => v.jobId);
    setVariantJobIds(ids);
    startPolling(ids[0]); // Poll primary for progress UI
  }

  async function handleScoreHook() {
    if (!script.trim() || isScoringHook) return;
    setIsScoringHook(true);
    try {
      const res = await fetch("/api/video-ads/score-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, ugcStyle }),
      });
      if (res.ok) {
        const data = await res.json() as { score: number; level: string; issue: string; tip: string };
        setHookScore(data);
      }
    } catch {
      // silent
    } finally {
      setIsScoringHook(false);
    }
  }

  async function handleCancel() {
    if (!jobId || isCancelling) return;
    setIsCancelling(true);
    try {
      await fetch(`/api/video-ads/${jobId}/cancel`, { method: "POST" });
    } catch {
      // ignore
    } finally {
      setIsCancelling(false);
    }
    stopPolling();
    setPhase("failed");
    setError("Génération annulée.");
  }

  function handleReset() {
    stopPolling();
    setPhase("idle");
    setJobId(null);
    setAvatarPreview(null);
    setScreenRecordingName(null);
    setScreenFramePreview(null);
    setIsAnalyzingScreen(false);
    setVisionBadge(false);
    setScript("");
    setAnimationPrompt("");
    setProductContext("");
    setVoice("nova");
    setVideoModel("KLING");
    setUgcStyle("ugc_app");
    setJobStatus(null);
    setFinalVideoUrl(null);
    setCompositeVideoUrl(null);
    setCaptionedVideoUrl(null);
    setVideoTab("captioned");
    setSubtitlePreset("clean");
    setVariantCount(1);
    setVariantJobIds([]);
    setHookScore(null);
    setCaptions(null);
    setResumedFromJob(false);
    setSelectedAvatarId(null);
    setHasBaseVideo(false);
    setBaseVideoName(null);
    setMovementType("statique");
    setSelectedFormatId(null);
    setSelectedStoryboard(null);
    setStoryboardProductHeadline("");
    setStoryboardProductCTA("");
    setError(null);
  }

  async function handlePreviewVoice(voiceId: string) {
    if (previewingVoice) return;
    setPreviewingVoice(voiceId);
    try {
      const res = await fetch("/api/video-ads/preview-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voiceId }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
      audio.onerror = () => { setPreviewingVoice(null); };
      await audio.play();
    } catch {
      setPreviewingVoice(null);
    }
  }

  async function handleGenerateScript() {
    setIsGeneratingScript(true);
    setScript("");
    setError(null);

    try {
      const res = await fetch("/api/video-ads/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ugcStyle,
          productContext: productContext.trim() || undefined,
          currentScript: script.trim() || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Erreur lors de la génération du script.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const evt = JSON.parse(raw) as { text?: string };
            if (evt.text) setScript((prev) => prev + evt.text);
          } catch {
            // skip malformed line
          }
        }
      }
    } catch {
      setError("Erreur réseau lors de la génération du script.");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  const [captions, setCaptions] = useState<{ tiktok: string; instagram: string; linkedin: string } | null>(null);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [captionTab, setCaptionTab] = useState<"tiktok" | "instagram" | "linkedin">("tiktok");
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Avatar generation
  const [avatarTab, setAvatarTab] = useState<"library" | "generate" | "video" | "persons">("library");
  const [avatarGenDesc, setAvatarGenDesc] = useState("");
  const [avatarGenStyle, setAvatarGenStyle] = useState<"studio" | "lifestyle" | "business" | "casual">("studio");
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // Load persons when Personnages tab is opened (placed after avatarTab declaration)
  useEffect(() => {
    if (avatarTab !== "persons" || persons.length > 0) return;
    setLoadingPersons(true);
    fetch("/api/persons")
      .then((r) => r.json())
      .then((data: PersonLite[]) => setPersons(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingPersons(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarTab]);

  // Real selfie video (Level 2 avatar)
  const videoBaseInputRef = useRef<HTMLInputElement>(null);
  const [baseVideoName, setBaseVideoName] = useState<string | null>(null);
  const [hasBaseVideo, setHasBaseVideo] = useState(false);

  // Movement preset
  const [movementType, setMovementType] = useState("statique");

  async function handleGenerateCaption() {
    if (isGeneratingCaption || !script.trim()) return;
    setIsGeneratingCaption(true);
    try {
      const res = await fetch("/api/video-ads/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, ugcStyle, productContext: productContext.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json() as { tiktok: string; instagram: string; linkedin: string };
        setCaptions(data);
      }
    } catch {
      // silent
    } finally {
      setIsGeneratingCaption(false);
    }
  }

  async function handleCopyCaption(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  }

  async function handleGenerateAvatar() {
    if (!avatarGenDesc.trim() || isGeneratingAvatar) return;
    setIsGeneratingAvatar(true);
    setError(null);
    try {
      const res = await fetch("/api/video-ads/generate-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: avatarGenDesc, style: avatarGenStyle }),
      });
      const data = await res.json() as { avatar?: AvatarAsset; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la génération de l'avatar.");
        return;
      }
      const newAvatar = data.avatar!;
      setAvatarLibrary((prev) => [newAvatar, ...prev]);
      // Auto-select and switch to library tab
      setAvatarTab("library");
      await handleSelectAvatar(newAvatar);
    } catch {
      setError("Erreur réseau lors de la génération de l'avatar.");
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  async function handleBaseVideoFile(file: File) {
    setError(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("baseVideoFile", file);
      if (jobId) fd.append("jobId", jobId);
      const res = await fetch("/api/video-ads/upload", { method: "POST", body: fd });
      const data = await res.json() as { jobId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'upload de la vidéo.");
        setPhase("idle");
        return;
      }
      setJobId(data.jobId as string);
      setHasBaseVideo(true);
      setBaseVideoName(file.name);
      setSelectedAvatarId(null);
      setAvatarPreview(null);
      setResumedFromJob(false);
      setPhase("ready");
    } catch {
      setError("Erreur réseau lors de l'upload de la vidéo.");
      setPhase("idle");
    }
  }

  const isSaasStyle = ugcStyle === "ugc_app";
  const isGenerating = phase === "generating";
  const isDone = phase === "done";
  const hasAvatar = !!selectedAvatarId || (resumedFromJob && !!jobId) || !!avatarPreview || hasBaseVideo;
  const canGenerate =
    hasAvatar &&
    script.trim().length > 10 &&
    (!!selectedStoryboard || animationPrompt.trim().length > 5) &&
    !isGenerating;

  const scriptPlaceholder = SCRIPT_PLACEHOLDERS[ugcStyle] ?? SCRIPT_PLACEHOLDERS.ugc_app;

  return (
    <>
      <AppTopBar
        title="Video Ads UGC"
        subtitle="Photo → Voix IA → Vidéo lip-sync ultra-réaliste"
        breadcrumb="marketing-os/studio/video-ads"
        accent="emerald"
      />

      {/* Link to gallery */}
      <div className="px-6 pt-4">
        <Link
          href="/marketing-os/studio/video-ads/history"
          className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)", color: "var(--fg-muted)" }}
        >
          <Video size={12} />
          Voir mes vidéos générées
        </Link>
      </div>

      <div className="p-6 max-w-[960px] space-y-5">
        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-3 rounded-[14px] p-4"
            style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)" }}
          >
            <AlertCircle size={16} style={{ color: "var(--danger-fg)", flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          </div>
        )}

        {/* ─── Result ──────────────────────────────────────────────────────── */}
        {isDone && finalVideoUrl && (
          <div
            className="rounded-[20px] overflow-hidden"
            style={{ border: "1px solid var(--emerald-line)", boxShadow: "var(--card-shadow)" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: "var(--emerald-soft)", borderBottom: "1px solid var(--emerald-line)" }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle size={18} style={{ color: "var(--emerald-fg)" }} />
                <span className="font-semibold text-sm" style={{ color: "var(--emerald-fg)" }}>
                  Vidéo générée avec succès
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={
                    videoTab === "captioned" && captionedVideoUrl
                      ? captionedVideoUrl
                      : compositeVideoUrl ?? finalVideoUrl ?? ""
                  }
                  download="video-ugc.mp4"
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium"
                  style={{ background: "var(--emerald-fg)", color: "#fff" }}
                >
                  <Download size={13} />
                  Télécharger
                </a>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                >
                  <RotateCcw size={13} />
                  Nouvelle vidéo
                </button>
              </div>
            </div>

            {/* Tabs — shown when multiple versions are available */}
            {(captionedVideoUrl || compositeVideoUrl) && (
              <div
                className="flex border-b"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                {captionedVideoUrl && (
                  <button
                    onClick={() => setVideoTab("captioned")}
                    className="inline-flex items-center gap-1.5 px-5 py-3 text-xs font-medium border-b-2 transition-colors"
                    style={{
                      borderBottomColor: videoTab === "captioned" ? "var(--emerald-fg)" : "transparent",
                      color: videoTab === "captioned" ? "var(--emerald-fg)" : "var(--fg-muted)",
                    }}
                  >
                    <FileText size={13} />
                    Avec sous-titres
                    {compositeVideoUrl && <span className="text-[9px] ml-1 opacity-70">+ screen</span>}
                  </button>
                )}
                <button
                  onClick={() => setVideoTab("raw")}
                  className="inline-flex items-center gap-1.5 px-5 py-3 text-xs font-medium border-b-2 transition-colors"
                  style={{
                    borderBottomColor: videoTab === "raw" ? "var(--emerald-fg)" : "transparent",
                    color: videoTab === "raw" ? "var(--emerald-fg)" : "var(--fg-muted)",
                  }}
                >
                  {compositeVideoUrl ? <Layers size={13} /> : <Video size={13} />}
                  {captionedVideoUrl ? "Sans sous-titres" : compositeVideoUrl ? "Avec screen recording" : "Vidéo UGC"}
                </button>
              </div>
            )}

            {/* Video player */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              key={
                videoTab === "captioned" && captionedVideoUrl
                  ? captionedVideoUrl
                  : compositeVideoUrl ?? finalVideoUrl ?? ""
              }
              controls
              autoPlay
              src={
                videoTab === "captioned" && captionedVideoUrl
                  ? captionedVideoUrl
                  : compositeVideoUrl ?? finalVideoUrl ?? ""
              }
              className="w-full max-h-[560px] bg-black"
            />
          </div>
        )}

        {/* ─── Caption IA ──────────────────────────────────────────────────── */}
        {isDone && script.trim() && (
          <div
            className="rounded-[18px] overflow-hidden"
            style={{ border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: "var(--bg)", borderBottom: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📣</span>
                <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                  Copie pour les réseaux
                </span>
              </div>
              {!captions && (
                <button
                  onClick={handleGenerateCaption}
                  disabled={isGeneratingCaption}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--emerald-fg)", color: "#fff", opacity: isGeneratingCaption ? 0.7 : 1 }}
                >
                  {isGeneratingCaption ? (
                    <><Loader2 size={11} className="animate-spin" /> Génération...</>
                  ) : (
                    <><Wand2 size={11} /> Générer</>
                  )}
                </button>
              )}
            </div>

            {captions ? (
              <div style={{ background: "var(--bg)" }}>
                {/* Platform tabs */}
                <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
                  {(["tiktok", "instagram", "linkedin"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCaptionTab(p)}
                      className="px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors capitalize"
                      style={{
                        borderBottomColor: captionTab === p ? "var(--emerald-fg)" : "transparent",
                        color: captionTab === p ? "var(--emerald-fg)" : "var(--fg-muted)",
                      }}
                    >
                      {p === "tiktok" ? "🎵 TikTok" : p === "instagram" ? "📸 Instagram" : "💼 LinkedIn"}
                    </button>
                  ))}
                </div>

                {/* Caption text */}
                <div className="p-4 space-y-3">
                  <pre
                    className="text-sm whitespace-pre-wrap leading-relaxed font-sans"
                    style={{ color: "var(--fg)" }}
                  >
                    {captions[captionTab]}
                  </pre>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      {captions[captionTab].length} caractères
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGenerateCaption}
                        disabled={isGeneratingCaption}
                        className="inline-flex items-center gap-1 text-[10px] rounded-[6px] px-2 py-1"
                        style={{ border: "1px solid var(--line)", color: "var(--fg-muted)", background: "var(--bg-secondary)" }}
                      >
                        <RotateCcw size={9} />
                        Regénérer
                      </button>
                      <button
                        onClick={() => handleCopyCaption(captions[captionTab])}
                        className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-semibold"
                        style={{ background: copiedCaption ? "var(--emerald-fg)" : "var(--bg-secondary)", color: copiedCaption ? "#fff" : "var(--fg)", border: "1px solid var(--line)" }}
                      >
                        {copiedCaption ? <CheckCircle size={11} /> : <FileText size={11} />}
                        {copiedCaption ? "Copié !" : "Copier"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  Génère une légende optimisée pour TikTok, Instagram et LinkedIn depuis ton script.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── Progress ────────────────────────────────────────────────────── */}
        {isGenerating && (
          <div
            className="rounded-[18px] p-6 space-y-5"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--emerald-fg)" }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
                  Génération en cours...
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  ~3 à 6 minutes · ne fermez pas cette page
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {STATUS_STEPS_BY_MODEL[videoModel]
                .filter(({ status }) => status !== "COMPOSITING" || !!screenRecordingName)
                .map(({ status, label }) => {
                const currentIdx = STATUS_ORDER.indexOf(jobStatus ?? "TRANSCRIBING");
                const stepIdx = STATUS_ORDER.indexOf(status);
                const isDoneStep = stepIdx < currentIdx;
                const isActive = stepIdx === currentIdx;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: isDoneStep
                          ? "var(--emerald-fg)"
                          : isActive
                          ? "var(--emerald-soft)"
                          : "var(--bg-secondary)",
                        border: `1px solid ${isDoneStep ? "var(--emerald-fg)" : isActive ? "var(--emerald-line)" : "var(--line)"}`,
                        color: isDoneStep ? "#fff" : isActive ? "var(--emerald-fg)" : "var(--fg-muted)",
                      }}
                    >
                      {isDoneStep ? "✓" : isActive ? <Loader2 size={11} className="animate-spin" /> : stepIdx + 1}
                    </div>
                    <span
                      className="text-sm"
                      style={{
                        color: isDoneStep ? "var(--emerald-fg)" : isActive ? "var(--fg)" : "var(--fg-muted)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--line)",
                color: "var(--fg-muted)",
                cursor: isCancelling ? "not-allowed" : "pointer",
                opacity: isCancelling ? 0.6 : 1,
              }}
            >
              {isCancelling ? "Annulation..." : "Annuler la génération"}
            </button>
          </div>
        )}

        {/* ─── Form ────────────────────────────────────────────────────────── */}
        {!isGenerating && !isDone && (
          <div className="space-y-5">

            {/* Style selector */}
            <div
              className="rounded-[18px] p-5 space-y-3"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center gap-2">
                <Clapperboard size={15} style={{ color: "var(--emerald-fg)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Style UGC</span>
                <span className="text-xs ml-1" style={{ color: "var(--fg-muted)" }}>
                  — définit l&apos;ambiance, le cadrage et l&apos;énergie de la vidéo
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {Object.entries(UGC_STYLE_META).map(([id, meta]) => (
                  <button
                    key={id}
                    onClick={() => setUgcStyle(id)}
                    className="rounded-[12px] p-3 text-left transition-all"
                    style={{
                      background: ugcStyle === id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                      border: `1px solid ${ugcStyle === id ? "var(--emerald-line)" : "var(--line)"}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <span className="text-xl leading-none">{meta.emoji}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5"
                        style={{
                          background: ugcStyle === id ? "var(--emerald-fg)" : "var(--line)",
                          color: ugcStyle === id ? "#fff" : "var(--fg-muted)",
                        }}
                      >
                        {meta.tag}
                      </span>
                    </div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: ugcStyle === id ? "var(--emerald-fg)" : "var(--fg)" }}
                    >
                      {meta.label}
                    </div>
                    <div className="text-[10px] mt-0.5 leading-snug" style={{ color: "var(--fg-muted)" }}>
                      {meta.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* SaaS-specific product context — only when ugc_app selected */}
              {isSaasStyle && (
                <div
                  className="mt-1 rounded-[12px] p-4 space-y-2.5"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--emerald-line)" }}
                >
                  <div className="flex items-center gap-2">
                    <Monitor size={13} style={{ color: "var(--emerald-fg)" }} />
                    <span className="text-xs font-semibold" style={{ color: "var(--emerald-fg)" }}>
                      Contexte produit SaaS
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>optionnel — enrichit le prompt de génération</span>
                  </div>
                  <input
                    type="text"
                    value={productContext}
                    onChange={(e) => setProductContext(e.target.value)}
                    placeholder="Ex: Skalle — plateforme CMO IA qui automatise le contenu marketing et la prospection B2B"
                    className="w-full rounded-[8px] px-3 py-2 text-xs"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--line)",
                      color: "var(--fg)",
                    }}
                  />
                  <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                    Décris ton produit en une phrase. Utilisé pour cohérence visuelle de l&apos;environnement bureau.
                  </p>
                </div>
              )}
            </div>

            {/* ── Storyboard Templates ───────────────────────────────────────── */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel icon={<Layers size={15} />} label="Storyboard — Formats multi-plans" />
                {selectedStoryboard && (
                  <button
                    onClick={() => setSelectedStoryboard(null)}
                    className="text-[10px] px-2 py-1 rounded-[6px] transition-colors"
                    style={{ color: "var(--fg-muted)", border: "1px solid var(--line)" }}
                  >
                    Effacer
                  </button>
                )}
              </div>

              {/* Template cards */}
              <div className="space-y-2">
                {STORYBOARD_TEMPLATES.map((tpl) => {
                  const isSelected = selectedStoryboard?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setSelectedStoryboard(isSelected ? null : tpl);
                        if (!isSelected) {
                          setSelectedFormatId(null);
                          setAnimationPrompt("");
                          setUgcStyle(tpl.ugcStyle);
                        }
                      }}
                      className="w-full rounded-[10px] p-3 text-left transition-all"
                      style={{
                        background: isSelected ? "var(--emerald-soft)" : "var(--bg-secondary)",
                        border: `1.5px solid ${isSelected ? "var(--emerald-line)" : "var(--line)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{tpl.icon}</span>
                        <div>
                          <div className="text-[12px] font-semibold" style={{ color: isSelected ? "var(--emerald-fg)" : "var(--fg)" }}>
                            {tpl.label}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: isSelected ? "var(--emerald-fg)" : "var(--line)", color: isSelected ? "#fff" : "var(--fg-muted)" }}>
                              {tpl.tag}
                            </span>
                            <span className="text-[9px]" style={{ color: "var(--fg-muted)" }}>{tpl.totalDurationSeconds}s · {tpl.plans.length} plans</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed mb-2" style={{ color: "var(--fg-muted)" }}>{tpl.desc}</p>

                      {/* Plan cards — shown when selected */}
                      {isSelected && (
                        <>
                          <div className="grid grid-cols-3 gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--emerald-line)" }}>
                            {tpl.plans.map((plan) => (
                              <div
                                key={plan.id}
                                className="rounded-[8px] p-2.5 text-center"
                                style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--emerald-line)" }}
                              >
                                <div className="mb-2 overflow-hidden rounded-[4px]" style={{ background: "var(--bg)" }}>
                                  <PlanCameraDiagram planId={plan.id} />
                                </div>
                                <div className="text-[10px] font-semibold leading-tight" style={{ color: "var(--emerald-fg)" }}>
                                  {plan.label}
                                </div>
                                <div className="text-[9px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                                  {plan.durationSeconds}s
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Screen content for Plan 3 (POV demo shot) */}
                          {tpl.plans.some((p) => p.id === "demo") && (
                            <div
                              className="mt-3 rounded-[10px] p-3 space-y-2.5"
                              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--emerald-line)" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1.5">
                                <Monitor size={12} style={{ color: "var(--emerald-fg)" }} />
                                <span className="text-[10px] font-semibold" style={{ color: "var(--emerald-fg)" }}>
                                  Écran MacBook — Plan 3 (POV Démo)
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[9px] font-medium mb-1" style={{ color: "var(--fg-muted)" }}>
                                    Headline (texte principal)
                                  </label>
                                  <input
                                    type="text"
                                    value={storyboardProductHeadline}
                                    onChange={(e) => setStoryboardProductHeadline(e.target.value)}
                                    placeholder="Gérez votre formation avec simplicité"
                                    className="w-full rounded-[6px] px-2.5 py-1.5 text-[10px]"
                                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-medium mb-1" style={{ color: "var(--fg-muted)" }}>
                                    Bouton CTA
                                  </label>
                                  <input
                                    type="text"
                                    value={storyboardProductCTA}
                                    onChange={(e) => setStoryboardProductCTA(e.target.value)}
                                    placeholder="Commencer Gratuitement"
                                    className="w-full rounded-[6px] px-2.5 py-1.5 text-[10px]"
                                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                                  />
                                </div>
                              </div>
                              <p className="text-[9px]" style={{ color: "var(--fg-muted)" }}>
                                Ces textes s&apos;affichent sur l&apos;écran du MacBook dans la scène POV. L&apos;IA génère l&apos;interface SaaS avec ces éléments exacts.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* ── Banque de formats UGC ──────────────────────────────────────── */}
            <div style={selectedStoryboard ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel icon={<Clapperboard size={15} />} label="Format de scène" />
                {selectedFormatId && (
                  <button
                    onClick={() => { setSelectedFormatId(null); setAnimationPrompt(""); }}
                    className="text-[10px] px-2 py-1 rounded-[6px] transition-colors"
                    style={{ color: "var(--fg-muted)", border: "1px solid var(--line)" }}
                  >
                    Effacer
                  </button>
                )}
              </div>

              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                {UGC_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFormatCategory(cat.id)}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                    style={{
                      background: formatCategory === cat.id ? "var(--emerald-fg)" : "var(--bg-secondary)",
                      color: formatCategory === cat.id ? "#fff" : "var(--fg-muted)",
                      border: `1px solid ${formatCategory === cat.id ? "var(--emerald-fg)" : "var(--line)"}`,
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Format grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto pr-1">
                {UGC_FORMATS.filter(
                  (f) => formatCategory === "all" || f.category === formatCategory
                ).map((fmt) => {
                  const isSelected = selectedFormatId === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => {
                        setSelectedFormatId(fmt.id);
                        setAnimationPrompt(buildFormatPrompt(fmt));
                        setMovementType(fmt.movement);
                      }}
                      className="rounded-[10px] p-2.5 text-left transition-all"
                      style={{
                        background: isSelected ? "var(--emerald-soft)" : "var(--bg-secondary)",
                        border: `1.5px solid ${isSelected ? "var(--emerald-line)" : "var(--line)"}`,
                      }}
                    >
                      <div className="text-base leading-none mb-1">{fmt.icon}</div>
                      <div
                        className="text-[11px] font-semibold leading-tight"
                        style={{ color: isSelected ? "var(--emerald-fg)" : "var(--fg)" }}
                      >
                        {fmt.label}
                      </div>
                      <div
                        className="text-[9px] mt-0.5 leading-snug line-clamp-2"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {fmt.setting}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedFormatId && (
                <div
                  className="mt-3 p-2.5 rounded-[8px] text-[10px] leading-relaxed"
                  style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }}
                >
                  <span className="font-semibold">Format sélectionné : </span>
                  {UGC_FORMATS.find(f => f.id === selectedFormatId)?.label} — scène + tenue de l&apos;avatar injectées dans les instructions vidéo.
                </div>
              )}
            </Card>
            </div>

            <div className="grid grid-cols-[1fr_1.6fr] gap-5 items-start">
              {/* Left col — Avatar */}
              <div className="space-y-4">
                <Card>
                  {/* Header with tab toggle */}
                  <div className="flex items-center justify-between">
                    <SectionLabel icon={<ImageIcon size={15} />} label="Avatar" />
                    <div className="flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                      <button
                        onClick={() => setAvatarTab("library")}
                        className="px-2.5 py-1 text-[10px] font-semibold transition-colors"
                        style={{
                          background: avatarTab === "library" ? "var(--emerald-fg)" : "var(--bg-secondary)",
                          color: avatarTab === "library" ? "#fff" : "var(--fg-muted)",
                          borderRight: "1px solid var(--line)",
                        }}
                      >
                        Bibliothèque
                      </button>
                      <button
                        onClick={() => setAvatarTab("generate")}
                        className="px-2.5 py-1 text-[10px] font-semibold transition-colors inline-flex items-center gap-1"
                        style={{
                          background: avatarTab === "generate" ? "var(--emerald-fg)" : "var(--bg-secondary)",
                          color: avatarTab === "generate" ? "#fff" : "var(--fg-muted)",
                          borderRight: "1px solid var(--line)",
                        }}
                      >
                        <Wand2 size={9} />
                        IA
                      </button>
                      <button
                        onClick={() => setAvatarTab("video")}
                        className="px-2.5 py-1 text-[10px] font-semibold transition-colors inline-flex items-center gap-1"
                        style={{
                          background: avatarTab === "video" ? "var(--emerald-fg)" : "var(--bg-secondary)",
                          color: avatarTab === "video" ? "#fff" : "var(--fg-muted)",
                          borderRight: "1px solid var(--line)",
                        }}
                      >
                        <Camera size={9} />
                        Vidéo réelle
                      </button>
                      <button
                        onClick={() => setAvatarTab("persons")}
                        className="px-2.5 py-1 text-[10px] font-semibold transition-colors inline-flex items-center gap-1"
                        style={{
                          background: avatarTab === "persons" ? "var(--emerald-fg)" : "var(--bg-secondary)",
                          color: avatarTab === "persons" ? "#fff" : "var(--fg-muted)",
                        }}
                      >
                        👤 Personnages
                      </button>
                    </div>
                  </div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatarFile(f);
                    }}
                  />
                  <input
                    ref={videoBaseInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBaseVideoFile(f);
                    }}
                  />

                  {avatarTab === "library" ? (
                    <>
                      {/* Avatar library grid */}
                      {loadingAvatars ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-muted)" }} />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {/* Upload new tile */}
                          <button
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={phase === "uploading"}
                            className="aspect-[3/4] rounded-[10px] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors"
                            style={{ borderColor: "var(--line)", background: "var(--bg-secondary)" }}
                          >
                            {phase === "uploading" && !selectedAvatarId ? (
                              <Loader2 size={18} className="animate-spin" style={{ color: "var(--emerald-fg)" }} />
                            ) : (
                              <>
                                <Plus size={18} style={{ color: "var(--fg-muted)" }} />
                                <span className="text-[9px] font-medium" style={{ color: "var(--fg-muted)" }}>
                                  Nouveau
                                </span>
                              </>
                            )}
                          </button>

                          {/* Saved avatars */}
                          {avatarLibrary.map((avatar) => {
                            const isSelected = selectedAvatarId === avatar.id;
                            return (
                              <div key={avatar.id} className="relative group">
                                <button
                                  onClick={() => handleSelectAvatar(avatar)}
                                  className="w-full aspect-[3/4] rounded-[10px] overflow-hidden transition-all"
                                  style={{
                                    border: `2px solid ${isSelected ? "var(--emerald-fg)" : "var(--line)"}`,
                                    outline: isSelected ? "2px solid var(--emerald-fg)" : "none",
                                    outlineOffset: "1px",
                                  }}
                                >
                                  {avatar.previewUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={avatar.previewUrl}
                                      alt={avatar.name || "Avatar"}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--bg-secondary)" }}>
                                      <User size={20} style={{ color: "var(--fg-muted)" }} />
                                    </div>
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 flex items-end justify-center pb-1.5 pointer-events-none">
                                      <span
                                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={{ background: "var(--emerald-fg)", color: "#fff" }}
                                      >
                                        ✓
                                      </span>
                                    </div>
                                  )}
                                </button>
                                {/* Delete button — visible on hover */}
                                <button
                                  onClick={(e) => handleDeleteAvatar(avatar.id, e)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: "rgba(0,0,0,0.6)" }}
                                  title="Supprimer"
                                >
                                  <Trash2 size={9} style={{ color: "#fff" }} />
                                </button>
                              </div>
                            );
                          })}

                          {/* Resumed-from-job placeholder (no library entry) */}
                          {resumedFromJob && !selectedAvatarId && (
                            <div
                              className="aspect-[3/4] rounded-[10px] flex flex-col items-center justify-center gap-1"
                              style={{ background: "var(--emerald-soft)", border: "2px solid var(--emerald-line)" }}
                            >
                              <CheckCircle size={18} style={{ color: "var(--emerald-fg)" }} />
                              <span className="text-[8px] font-semibold text-center px-1" style={{ color: "var(--emerald-fg)" }}>
                                Conservé
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {avatarLibrary.length === 0 && !loadingAvatars && (
                        <p className="text-[10px] text-center mt-1" style={{ color: "var(--fg-muted)" }}>
                          {isSaasStyle ? "Portrait en buste · fond sobre · éclairage front" : "Portrait ou visage de face recommandé"}
                        </p>
                      )}
                    </>
                  ) : avatarTab === "generate" ? (
                    /* ── Generate AI avatar ── */
                    <div className="space-y-3">
                      {/* Style selector */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            { id: "studio", label: "Studio", desc: "Fond blanc épuré" },
                            { id: "lifestyle", label: "Lifestyle", desc: "Lumière naturelle" },
                            { id: "business", label: "Business", desc: "Ambiance bureau" },
                            { id: "casual", label: "Casual", desc: "Fond neutre décontracté" },
                          ] as const
                        ).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setAvatarGenStyle(s.id)}
                            className="rounded-[8px] p-2 text-left transition-all"
                            style={{
                              background: avatarGenStyle === s.id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                              border: `1px solid ${avatarGenStyle === s.id ? "var(--emerald-line)" : "var(--line)"}`,
                            }}
                          >
                            <div
                              className="text-[10px] font-semibold"
                              style={{ color: avatarGenStyle === s.id ? "var(--emerald-fg)" : "var(--fg)" }}
                            >
                              {s.label}
                            </div>
                            <div className="text-[9px]" style={{ color: "var(--fg-muted)" }}>
                              {s.desc}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Description input */}
                      <textarea
                        value={avatarGenDesc}
                        onChange={(e) => setAvatarGenDesc(e.target.value)}
                        rows={3}
                        placeholder="Ex: femme 30 ans, sourire naturel, cheveux bruns, regard confiant"
                        className="w-full rounded-[10px] px-3 py-2.5 text-xs resize-none"
                        style={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--line)",
                          color: "var(--fg)",
                        }}
                      />

                      <button
                        onClick={handleGenerateAvatar}
                        disabled={!avatarGenDesc.trim() || isGeneratingAvatar}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] py-2.5 text-xs font-semibold transition-all"
                        style={{
                          background:
                            avatarGenDesc.trim() && !isGeneratingAvatar
                              ? "var(--emerald-fg)"
                              : "var(--line)",
                          color:
                            avatarGenDesc.trim() && !isGeneratingAvatar
                              ? "#fff"
                              : "var(--fg-muted)",
                          cursor:
                            avatarGenDesc.trim() && !isGeneratingAvatar ? "pointer" : "not-allowed",
                        }}
                      >
                        {isGeneratingAvatar ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Wand2 size={12} />
                        )}
                        {isGeneratingAvatar ? "Génération (~20s)..." : "Générer · 5 crédits"}
                      </button>

                      <p className="text-[9px] text-center" style={{ color: "var(--fg-muted)" }}>
                        DALL-E 3 HD · Portrait face caméra · Ajouté à la bibliothèque automatiquement
                      </p>
                    </div>
                  ) : avatarTab === "persons" ? (
                    /* ── Persons library ── */
                    <div className="space-y-2">
                      {loadingPersons && (
                        <div className="flex justify-center py-6">
                          <span className="animate-spin w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                        </div>
                      )}
                      {!loadingPersons && persons.length === 0 && (
                        <div className="py-6 text-center">
                          <p className="text-[10px] mb-2" style={{ color: "var(--fg-muted)" }}>
                            Aucun personnage créé. Créez Jean ou Noellie depuis la bibliothèque.
                          </p>
                          <a
                            href="/marketing-os/studio/persons"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-3 py-1.5 rounded-[8px]"
                            style={{ background: "var(--accent)", color: "white" }}
                          >
                            Gérer les personnages →
                          </a>
                        </div>
                      )}
                      {!loadingPersons && persons.map((p) => {
                        const cover = p.photos[0];
                        return (
                          <div key={p.id}>
                            <p className="text-[9px] font-semibold uppercase mb-1.5" style={{ color: "var(--fg-muted)" }}>
                              {p.name} · {p.photos.length} photo{p.photos.length !== 1 ? "s" : ""}
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                              {p.photos.map((ph) => {
                                const isChosen = selectedPersonPhotoUrl === ph.photoUrl;
                                return (
                                  <button
                                    key={ph.id}
                                    onClick={async () => {
                                      setSelectedPersonPhotoUrl(ph.photoUrl);
                                      // Reuse the person photo's storage path (already in Supabase)
                                      // by passing it as personAvatarStoragePath to the upload route
                                      try {
                                        const form = new FormData();
                                        form.append("personAvatarStoragePath", ph.storagePath);
                                        if (jobId) form.append("jobId", jobId);
                                        const res = await fetch("/api/video-ads/upload", { method: "POST", body: form });
                                        const d = await res.json() as { jobId?: string };
                                        if (d.jobId) setJobId(d.jobId);
                                        setAvatarPreview(ph.photoUrl);
                                        setSelectedAvatarId(null);
                                      } catch { /* ignore */ }
                                    }}
                                    className="relative shrink-0 rounded-[8px] overflow-hidden transition-all"
                                    style={{
                                      width: 52,
                                      height: 70,
                                      border: `2px solid ${isChosen ? "var(--accent)" : "var(--line)"}`,
                                    }}
                                    title={ph.formatLabel ?? (ph.isBase ? "Photo de base" : "Photo")}
                                  >
                                    {ph.photoUrl && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={ph.photoUrl} alt="" className="w-full h-full object-cover" />
                                    )}
                                    {isChosen && (
                                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="white"/><path d="M4 7l2 2 4-4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </div>
                                    )}
                                    <div
                                      className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 text-[7px] text-center leading-tight"
                                      style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                                    >
                                      {ph.isBase ? "Base" : (ph.formatLabel?.split(" ")[0] ?? "Scène")}
                                    </div>
                                  </button>
                                );
                              })}
                              {/* Add more button */}
                              {cover && (
                                <a
                                  href={`/marketing-os/studio/persons`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 flex flex-col items-center justify-center rounded-[8px] gap-1"
                                  style={{ width: 52, height: 70, border: "2px dashed var(--line)", background: "var(--bg-secondary)" }}
                                  title="Ajouter des scènes"
                                >
                                  <span className="text-lg leading-none">+</span>
                                  <span className="text-[7px]" style={{ color: "var(--fg-muted)" }}>Scènes</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Real selfie video (Level 2) ── */
                    <div className="space-y-3">
                      <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                        Filmez-vous <strong style={{ color: "var(--fg)" }}>15-30 secondes</strong> face caméra, en regardant l&apos;objectif. Le lip-sync Kling AI remplacera votre voix.
                      </p>
                      {hasBaseVideo && baseVideoName ? (
                        <div
                          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
                          style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
                        >
                          <CheckCircle size={14} style={{ color: "var(--emerald-fg)", flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold truncate" style={{ color: "var(--emerald-fg)" }}>
                              {baseVideoName}
                            </p>
                            <p className="text-[9px]" style={{ color: "var(--fg-muted)" }}>Vidéo prête · lip-sync direct</p>
                          </div>
                          <button
                            onClick={() => videoBaseInputRef.current?.click()}
                            className="ml-auto text-[9px] font-medium px-2 py-1 rounded-[6px] transition-colors"
                            style={{ background: "var(--line)", color: "var(--fg-muted)" }}
                          >
                            Changer
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => videoBaseInputRef.current?.click()}
                          disabled={phase === "uploading"}
                          className="w-full rounded-[10px] border-2 border-dashed py-6 flex flex-col items-center justify-center gap-2 transition-colors"
                          style={{ borderColor: "var(--line)", background: "var(--bg-secondary)" }}
                        >
                          {phase === "uploading" && avatarTab === "video" ? (
                            <Loader2 size={20} className="animate-spin" style={{ color: "var(--emerald-fg)" }} />
                          ) : (
                            <>
                              <Camera size={20} style={{ color: "var(--fg-muted)" }} />
                              <span className="text-[10px] font-medium" style={{ color: "var(--fg-muted)" }}>
                                Choisir une vidéo (MP4, MOV, WebM · max 200 Mo)
                              </span>
                            </>
                          )}
                        </button>
                      )}
                      <p className="text-[9px]" style={{ color: "var(--fg-muted)" }}>
                        Qualité 8-9/10 · même modèle que HeyGen &amp; Arcads · aucun crédit IA pour l&apos;animation
                      </p>
                    </div>
                  )}
                </Card>

                {/* Screen recording — SaaS only */}
                {isSaasStyle && (
                  <Card>
                    <SectionLabel icon={<ScreenShare size={15} />} label="Screen recording (optionnel)" />
                    <input
                      ref={screenRecordingInputRef}
                      id="screen-recording-input"
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                      className="hidden"
                      disabled={!hasAvatar}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleScreenRecordingFile(f);
                      }}
                    />
                    {screenRecordingName ? (
                      <div className="space-y-2">
                        {/* Frame preview + vision badge */}
                        <div className="relative">
                          {screenFramePreview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={screenFramePreview}
                              alt="Frame extraite"
                              className="w-full rounded-[10px] object-cover"
                              style={{ maxHeight: 100, border: "1px solid var(--line)" }}
                            />
                          )}
                          {/* Vision status badge */}
                          <div
                            className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                            style={{
                              background: isAnalyzingScreen ? "var(--bg)" : visionBadge ? "var(--emerald-fg)" : "var(--bg)",
                              border: `1px solid ${visionBadge ? "var(--emerald-fg)" : "var(--line)"}`,
                              color: visionBadge ? "#fff" : "var(--fg-muted)",
                            }}
                          >
                            {isAnalyzingScreen ? (
                              <><Loader2 size={8} className="animate-spin" /> Analyse IA...</>
                            ) : visionBadge ? (
                              <><Sparkles size={8} /> Vision IA</>
                            ) : null}
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2 rounded-[10px] px-3 py-2"
                          style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
                        >
                          <CheckCircle size={12} style={{ color: "var(--emerald-fg)", flexShrink: 0 }} />
                          <span className="text-[11px] font-medium truncate" style={{ color: "var(--emerald-fg)" }}>
                            {screenRecordingName}
                          </span>
                        </div>
                        <button
                          onClick={() => screenRecordingInputRef.current?.click()}
                          className="w-full text-center text-xs py-1.5 rounded-[8px]"
                          style={{
                            border: "1px solid var(--line)",
                            color: "var(--fg-muted)",
                            background: "var(--bg-secondary)",
                          }}
                        >
                          Changer la vidéo
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor={hasAvatar ? "screen-recording-input" : undefined}
                        className="w-full rounded-[12px] border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 transition-colors"
                        style={{
                          borderColor: hasAvatar ? "var(--emerald-line)" : "var(--line)",
                          background: hasAvatar ? "var(--emerald-soft)" : "var(--bg-secondary)",
                          cursor: hasAvatar && !screenRecordingUploading ? "pointer" : "not-allowed",
                          opacity: screenRecordingUploading ? 0.6 : 1,
                        }}
                      >
                        {screenRecordingUploading ? (
                          <Loader2 size={20} className="animate-spin" style={{ color: "var(--emerald-fg)" }} />
                        ) : (
                          <ScreenShare size={20} style={{ color: "var(--emerald-fg)" }} />
                        )}
                        <span className="text-xs font-medium" style={{ color: "var(--emerald-fg)" }}>
                          {screenRecordingUploading ? "Upload..." : "Démo de votre app"}
                        </span>
                        <span className="text-[10px] text-center px-3" style={{ color: "var(--fg-muted)" }}>
                          MP4 · MOV · WebM · max 200 Mo
                        </span>
                        {!hasAvatar && (
                          <span className="text-[9px]" style={{ color: "var(--fg-muted)" }}>
                            Sélectionnez d&apos;abord un avatar
                          </span>
                        )}
                        {hasAvatar && (
                          <span
                            className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "var(--emerald-fg)", color: "#fff" }}
                          >
                            Composé sur l&apos;écran de l&apos;ordinateur
                          </span>
                        )}
                      </label>
                    )}
                    <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      La vidéo sera superposée sur l&apos;écran du laptop visible dans la scène UGC
                    </p>
                  </Card>
                )}

                {/* Voice selector */}
                <Card>
                  <SectionLabel icon={<Mic size={15} />} label="Voix" />
                  <div className="grid grid-cols-2 gap-2">
                    {VOICES.map((v) => (
                      <div key={v.id} className="relative">
                        <button
                          onClick={() => setVoice(v.id)}
                          className="w-full rounded-[10px] p-2.5 text-left transition-all"
                          style={{
                            background: voice === v.id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                            border: `1px solid ${voice === v.id ? "var(--emerald-line)" : "var(--line)"}`,
                          }}
                        >
                          <div className="text-base leading-none">{v.emoji}</div>
                          <div
                            className="text-xs font-semibold mt-1"
                            style={{ color: voice === v.id ? "var(--emerald-fg)" : "var(--fg)" }}
                          >
                            {v.label}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                            {v.desc}
                          </div>
                        </button>
                        {/* Preview button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.id); }}
                          disabled={!!previewingVoice}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-opacity"
                          style={{
                            background: previewingVoice === v.id ? "var(--emerald-fg)" : "var(--bg)",
                            border: "1px solid var(--line)",
                          }}
                          title="Écouter la voix"
                        >
                          {previewingVoice === v.id ? (
                            <Loader2 size={9} className="animate-spin" style={{ color: "#fff" }} />
                          ) : (
                            <Play size={8} fill="currentColor" style={{ color: "var(--fg-muted)" }} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Subtitle preset selector */}
                <Card>
                  <SectionLabel icon={<FileText size={15} />} label="Style sous-titres" />
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "clean", label: "Clean", desc: "Blanc · Contour net", preview: "Aa" },
                        { id: "bold", label: "TikTok", desc: "Jaune · Impact", preview: "Aa" },
                        { id: "minimal", label: "Minimal", desc: "Petit · Discret", preview: "Aa" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSubtitlePreset(p.id)}
                        className="rounded-[10px] p-2.5 text-center transition-all"
                        style={{
                          background: subtitlePreset === p.id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                          border: `1px solid ${subtitlePreset === p.id ? "var(--emerald-line)" : "var(--line)"}`,
                        }}
                      >
                        <div
                          className="text-sm font-bold leading-none mb-1.5"
                          style={{
                            color:
                              p.id === "bold"
                                ? "#f5c842"
                                : subtitlePreset === p.id
                                ? "var(--emerald-fg)"
                                : "var(--fg)",
                            fontSize: p.id === "bold" ? 16 : p.id === "minimal" ? 11 : 14,
                            textShadow: p.id === "bold" ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
                          }}
                        >
                          {p.preview}
                        </div>
                        <div
                          className="text-[10px] font-semibold"
                          style={{ color: subtitlePreset === p.id ? "var(--emerald-fg)" : "var(--fg)" }}
                        >
                          {p.label}
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                          {p.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>

              </div>

              {/* Right col — Model picker + Script + prompt + CTA */}
              <div className="space-y-4">

                {/* Video model selector — prominent, first thing seen before script */}
                <Card>
                  <SectionLabel icon={<Video size={15} />} label="Modèle vidéo" />
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setVideoModel(m.id)}
                        className="rounded-[10px] p-3 text-left transition-all flex items-start gap-2.5"
                        style={{
                          background: videoModel === m.id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                          border: `1px solid ${videoModel === m.id ? "var(--emerald-line)" : "var(--line)"}`,
                        }}
                      >
                        <span className="text-lg leading-none flex-shrink-0 mt-0.5">{m.logo}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: videoModel === m.id ? "var(--emerald-fg)" : "var(--fg)" }}
                            >
                              {m.label}
                            </span>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{
                                background: videoModel === m.id ? "var(--emerald-fg)" : "var(--bg)",
                                color: videoModel === m.id ? "#fff" : "var(--fg-muted)",
                                border: `1px solid ${videoModel === m.id ? "var(--emerald-fg)" : "var(--line)"}`,
                              }}
                            >
                              {m.tag}
                            </span>
                          </div>
                          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: "var(--fg-muted)" }}>
                            {m.desc}
                          </p>
                        </div>
                        {videoModel === m.id && (
                          <CheckCircle size={13} style={{ color: "var(--emerald-fg)", flexShrink: 0, marginTop: 2 }} />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                    Lip-sync final appliqué par Kling AI quel que soit le modèle
                  </p>
                </Card>

                <Card>
                  <div className="flex items-center justify-between">
                    <SectionLabel icon={<FileText size={15} />} label="Script — ce que dit le personnage" />
                    <button
                      onClick={handleGenerateScript}
                      disabled={isGeneratingScript || isGenerating}
                      className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-all"
                      style={{
                        background: isGeneratingScript ? "var(--bg-secondary)" : "var(--emerald-soft)",
                        border: `1px solid ${isGeneratingScript ? "var(--line)" : "var(--emerald-line)"}`,
                        color: isGeneratingScript ? "var(--fg-muted)" : "var(--emerald-fg)",
                        cursor: isGeneratingScript || isGenerating ? "not-allowed" : "pointer",
                        opacity: isGenerating ? 0.5 : 1,
                      }}
                    >
                      {isGeneratingScript ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Wand2 size={12} />
                      )}
                      {isGeneratingScript ? "Génération..." : script.trim() ? "Réécrire avec l'IA" : "Générer avec l'IA"}
                    </button>
                  </div>

                  {/* SaaS hooks quick-insert — only when ugc_app */}
                  {isSaasStyle && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Zap size={11} style={{ color: "var(--emerald-fg)" }} />
                        <span className="text-[10px] font-semibold" style={{ color: "var(--emerald-fg)" }}>
                          Hooks SaaS rapides
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                          — cliquez pour insérer au début
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {SAAS_HOOKS.map((hook) => (
                          <button
                            key={hook.label}
                            onClick={() => setScript((prev) => hook.text + (prev ? "\n\n" + prev : ""))}
                            className="text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors"
                            style={{
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--line)",
                              color: "var(--fg-muted)",
                            }}
                          >
                            + {hook.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    rows={9}
                    placeholder={scriptPlaceholder}
                    className="w-full rounded-[10px] px-3 py-2.5 text-sm resize-none leading-relaxed"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--line)",
                      color: "var(--fg)",
                    }}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                      Converti en voix par OpenAI TTS
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: script.length > 4000 ? "var(--danger-fg)" : "var(--fg-muted)" }}
                    >
                      {script.length} / 4000 car.
                    </span>
                  </div>

                  {/* Hook Score widget */}
                  {script.trim().length >= 20 && (
                    <div
                      className="rounded-[10px] p-3 space-y-2"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold" style={{ color: "var(--fg)" }}>
                          🎯 Hook Score
                        </span>
                        <button
                          onClick={handleScoreHook}
                          disabled={isScoringHook}
                          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] font-semibold"
                          style={{ background: "var(--emerald-fg)", color: "#fff", opacity: isScoringHook ? 0.6 : 1 }}
                        >
                          {isScoringHook ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                          {isScoringHook ? "Analyse..." : "Analyser"}
                        </button>
                      </div>
                      {hookScore && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {/* Score bar */}
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${hookScore.score * 10}%`,
                                  background:
                                    hookScore.level === "weak" ? "var(--danger-fg)" :
                                    hookScore.level === "good" ? "#f5a623" :
                                    "var(--emerald-fg)",
                                }}
                              />
                            </div>
                            <span
                              className="text-xs font-bold flex-shrink-0 w-8 text-right"
                              style={{
                                color:
                                  hookScore.level === "weak" ? "var(--danger-fg)" :
                                  hookScore.level === "good" ? "#f5a623" :
                                  "var(--emerald-fg)",
                              }}
                            >
                              {hookScore.score}/10
                            </span>
                          </div>
                          {hookScore.issue && (
                            <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                              ⚠️ {hookScore.issue}
                            </p>
                          )}
                          {hookScore.tip && (
                            <p className="text-[10px]" style={{ color: "var(--emerald-fg)" }}>
                              💡 {hookScore.tip}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* Movement preset selector */}
                <Card>
                  <SectionLabel icon={<Clapperboard size={15} />} label="Mouvement de l&apos;avatar" />
                  <div className="grid grid-cols-3 gap-1.5">
                    {MOVEMENT_PRESETS.map((m) => {
                      const active = movementType === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setMovementType(m.id)}
                          className="rounded-[8px] p-2 text-left transition-all"
                          style={{
                            background: active ? "var(--emerald-soft)" : "var(--bg-secondary)",
                            border: `1px solid ${active ? "var(--emerald-line)" : "var(--line)"}`,
                          }}
                        >
                          <div className="text-base leading-none mb-0.5">{m.icon}</div>
                          <div
                            className="text-[10px] font-semibold leading-tight"
                            style={{ color: active ? "var(--emerald-fg)" : "var(--fg)" }}
                          >
                            {m.label}
                          </div>
                          <div className="text-[8px] leading-tight mt-0.5" style={{ color: "var(--fg-muted)" }}>
                            {m.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between">
                    <SectionLabel icon={<Sparkles size={15} />} label="Instructions vidéo" />
                    {isAnalyzingScreen && (
                      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--fg-muted)" }}>
                        <Loader2 size={10} className="animate-spin" />
                        Analyse interface...
                      </span>
                    )}
                    {visionBadge && !isAnalyzingScreen && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                        style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
                      >
                        <Sparkles size={8} />
                        Enrichi par Vision IA
                      </span>
                    )}
                  </div>
                  <textarea
                    value={animationPrompt}
                    onChange={(e) => setAnimationPrompt(e.target.value)}
                    rows={isSaasStyle ? 5 : 4}
                    placeholder={
                      isSaasStyle
                        ? `Ex:\n« Personne assise à son bureau, MacBook visible en arrière-plan avec un dashboard allumé. Screen glow bleuté sur le visage. Regard confiant vers la caméra, sourire discret. Éclairage annulaire + lumière de l'écran. Énergie "je te montre ce que j'ai trouvé". »`
                        : `Ex:\n« Présente le produit avec enthousiasme en souriant. Parle avec confiance, regarde la caméra. Ambiance lumineuse et moderne. »`
                    }
                    className="w-full rounded-[10px] px-3 py-2.5 text-sm resize-none leading-relaxed"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--line)",
                      color: "var(--fg)",
                    }}
                  />
                  <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                    {isSaasStyle
                      ? "Décris ton setup bureau idéal. Le screen glow, la posture, l'énergie. Le reste est automatique."
                      : "Décris le ton, l'émotion, l'ambiance. Le réalisme humain est appliqué automatiquement."}
                  </p>
                </Card>

                {/* Pipeline preview + CTA */}
                <div
                  className="rounded-[16px] p-4 space-y-3"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
                >
                  <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--fg-muted)" }}>
                    <span>📸 Photo</span>
                    <span style={{ color: "var(--line)" }}>→</span>
                    <span>🎙️ TTS</span>
                    <span style={{ color: "var(--line)" }}>→</span>
                    <span>🎬 {getModelLabel(videoModel)}</span>
                    <span style={{ color: "var(--line)" }}>→</span>
                    <span>👄 Lip-sync</span>
                    {isSaasStyle && screenRecordingName && (
                      <>
                        <span style={{ color: "var(--line)" }}>→</span>
                        <span style={{ color: "var(--emerald-fg)" }}>🖥️ Composite</span>
                      </>
                    )}
                    <span style={{ color: "var(--line)" }}>→</span>
                    <span style={{ color: "var(--emerald-fg)" }}>💬 Sous-titres</span>
                    <span style={{ color: "var(--line)" }}>→</span>
                    <span style={{ color: "var(--emerald-fg)", fontWeight: 600 }}>🎥 Vidéo</span>
                  </div>
                  {/* Variant count selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium" style={{ color: "var(--fg-muted)" }}>
                      Variantes :
                    </span>
                    <div className="flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                      {([1, 2, 3] as const).map((n) => (
                        <button
                          key={n}
                          onClick={() => setVariantCount(n)}
                          className="px-3 py-1 text-xs font-semibold transition-colors"
                          style={{
                            background: variantCount === n ? "var(--emerald-fg)" : "var(--bg-secondary)",
                            color: variantCount === n ? "#fff" : "var(--fg-muted)",
                            borderRight: n < 3 ? "1px solid var(--line)" : "none",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      · {variantCount * 20} crédits
                    </span>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-[12px] px-5 py-3.5 text-sm font-semibold transition-opacity"
                    style={{
                      background: canGenerate ? "var(--emerald-fg)" : "var(--line)",
                      color: canGenerate ? "#fff" : "var(--fg-muted)",
                      cursor: canGenerate ? "pointer" : "not-allowed",
                      opacity: canGenerate ? 1 : 0.65,
                    }}
                  >
                    {canGenerate ? <Play size={16} /> : <Video size={16} />}
                    {!hasAvatar
                      ? "Sélectionnez un avatar pour commencer"
                      : !script.trim()
                      ? "Écrivez le script"
                      : !animationPrompt.trim()
                      ? "Décrivez le style d'animation"
                      : variantCount === 1
                      ? "Générer la vidéo · 20 crédits"
                      : `Générer ${variantCount} variantes · ${variantCount * 20} crédits`}
                  </button>

                  {variantCount > 1 && canGenerate && (
                    <p className="text-[10px] text-center" style={{ color: "var(--fg-muted)" }}>
                      {variantCount} vidéos générées en parallèle · retrouvez-les dans la galerie
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[18px] p-5 space-y-3"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "var(--emerald-fg)" }}>{icon}</span>
      <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
        {label}
      </span>
    </div>
  );
}
