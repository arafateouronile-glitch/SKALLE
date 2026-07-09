"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Video,
  Plus,
  Download,
  Trash2,
  Play,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { UGC_STYLE_META } from "@/lib/services/video/prompt-builder";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoAdStatus =
  | "PENDING" | "UPLOADING" | "TRANSCRIBING" | "ANIMATING"
  | "LIP_SYNCING" | "COMPOSITING" | "CAPTIONING" | "DONE" | "FAILED";

interface VideoAdJob {
  id: string;
  status: VideoAdStatus;
  errorMessage: string | null;
  script: string;
  ugcStyle: string;
  videoModel: string;
  voiceName: string;
  finalVideoUrl: string | null;
  compositeVideoUrl: string | null;
  captionedVideoUrl: string | null;
  creditsUsed: number;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestVideoUrl(job: VideoAdJob): string | null {
  return job.captionedVideoUrl ?? job.compositeVideoUrl ?? job.finalVideoUrl;
}

function StatusBadge({ status }: { status: VideoAdStatus }) {
  if (status === "DONE") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
        style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
      >
        <CheckCircle size={8} /> Terminée
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
        style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}
      >
        <AlertCircle size={8} /> Échec
      </span>
    );
  }
  const labels: Partial<Record<VideoAdStatus, string>> = {
    PENDING: "En attente",
    UPLOADING: "Upload...",
    TRANSCRIBING: "TTS...",
    ANIMATING: "Animation...",
    LIP_SYNCING: "Lip-sync...",
    COMPOSITING: "Composite...",
    CAPTIONING: "Sous-titres...",
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)", color: "var(--fg-muted)" }}
    >
      <Loader2 size={8} className="animate-spin" />
      {labels[status] ?? status}
    </span>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({
  job,
  onPlay,
  onDelete,
  onReuse,
  onCancel,
}: {
  job: VideoAdJob;
  onPlay: (job: VideoAdJob) => void;
  onDelete: (id: string) => void;
  onReuse: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const videoUrl = bestVideoUrl(job);
  const styleMeta = UGC_STYLE_META[job.ugcStyle];
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isInProgress = !["DONE", "FAILED"].includes(job.status);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer cette vidéo ?")) return;
    setDeleting(true);
    await fetch(`/api/video-ads/${job.id}`, { method: "DELETE" });
    onDelete(job.id);
  }

  async function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Annuler et rembourser les crédits ?")) return;
    setCancelling(true);
    await fetch(`/api/video-ads/${job.id}/cancel`, { method: "POST" }).catch(() => {});
    onCancel(job.id);
    setCancelling(false);
  }

  const timeAgo = formatDistanceToNow(new Date(job.createdAt), { addSuffix: true, locale: fr });

  return (
    <div
      className="rounded-[16px] overflow-hidden flex flex-col"
      style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
    >
      {/* Thumbnail */}
      <div
        className="relative bg-black overflow-hidden cursor-pointer"
        style={{ aspectRatio: "9/16", maxHeight: 240 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => job.status === "DONE" && videoUrl && onPlay(job)}
      >
        {videoUrl && job.status === "DONE" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={videoUrl}
            preload="metadata"
            className="w-full h-full object-cover"
            style={{ display: "block" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {job.status === "FAILED" ? (
              <AlertCircle size={28} style={{ color: "var(--danger-fg)" }} />
            ) : (
              <Loader2 size={28} className="animate-spin" style={{ color: "var(--fg-muted)" }} />
            )}
          </div>
        )}

        {/* Hover overlay */}
        {videoUrl && job.status === "DONE" && (
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity"
            style={{
              background: "rgba(0,0,0,0.45)",
              opacity: hovered ? 1 : 0,
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
            >
              <Play size={22} style={{ color: "#fff" }} fill="#fff" />
            </div>
          </div>
        )}

        {/* Badges — top row */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
          <StatusBadge status={job.status} />
          {job.captionedVideoUrl && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
              style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
            >
              <Sparkles size={7} /> CC
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Style + model */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: "var(--fg)" }}>
            {styleMeta?.emoji ?? "🎬"} {styleMeta?.label ?? job.ugcStyle}
          </span>
          <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
            {job.videoModel}
          </span>
        </div>

        {/* Script preview */}
        {job.script && (
          <p
            className="text-[11px] leading-snug line-clamp-2"
            style={{ color: "var(--fg-muted)" }}
          >
            {job.script}
          </p>
        )}

        {/* Error message */}
        {job.status === "FAILED" && job.errorMessage && (
          <p className="text-[10px] leading-snug" style={{ color: "var(--danger-fg)" }}>
            {job.errorMessage}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
            <Clock size={9} className="inline mr-1" />
            {timeAgo}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onReuse(job.id); }}
              className="w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
              title="Réutiliser les settings"
            >
              <RotateCcw size={11} style={{ color: "var(--fg-muted)" }} />
            </button>
            {videoUrl && job.status === "DONE" && (
              <a
                href={videoUrl}
                download
                onClick={(e) => e.stopPropagation()}
                className="w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
                title="Télécharger"
              >
                <Download size={11} style={{ color: "var(--fg-muted)" }} />
              </a>
            )}
            {isInProgress && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)" }}
                title="Annuler et rembourser"
              >
                {cancelling ? (
                  <Loader2 size={11} className="animate-spin" style={{ color: "var(--danger-fg)" }} />
                ) : (
                  <X size={11} style={{ color: "var(--danger-fg)" }} />
                )}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
              title="Supprimer"
            >
              {deleting ? (
                <Loader2 size={11} className="animate-spin" style={{ color: "var(--fg-muted)" }} />
              ) : (
                <Trash2 size={11} style={{ color: "var(--fg-muted)" }} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Video modal ──────────────────────────────────────────────────────────────

function VideoModal({ job, onClose }: { job: VideoAdJob; onClose: () => void }) {
  const videoUrl = bestVideoUrl(job);
  const [activeTab, setActiveTab] = useState<"captioned" | "composite" | "final">(
    job.captionedVideoUrl ? "captioned" : job.compositeVideoUrl ? "composite" : "final"
  );
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const tabs = [
    ...(job.captionedVideoUrl ? [{ id: "captioned" as const, label: "Sous-titres", url: job.captionedVideoUrl }] : []),
    ...(job.compositeVideoUrl ? [{ id: "composite" as const, label: "Avec screen", url: job.compositeVideoUrl }] : []),
    { id: "final" as const, label: "UGC brut", url: job.finalVideoUrl ?? "" },
  ].filter((t) => t.url);

  const currentUrl =
    activeTab === "captioned" ? job.captionedVideoUrl :
    activeTab === "composite" ? job.compositeVideoUrl :
    job.finalVideoUrl;

  void videoUrl;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="relative rounded-[20px] overflow-hidden flex flex-col"
        style={{
          background: "var(--bg)",
          width: "min(480px, 95vw)",
          maxHeight: "92vh",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--fg)" }}>
              {UGC_STYLE_META[job.ugcStyle]?.emoji} {UGC_STYLE_META[job.ugcStyle]?.label ?? job.ugcStyle}
            </p>
            {job.script && (
              <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--fg-muted)" }}>
                {job.script.slice(0, 80)}…
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
          >
            <X size={14} style={{ color: "var(--fg-muted)" }} />
          </button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
                style={{
                  borderBottomColor: activeTab === tab.id ? "var(--emerald-fg)" : "transparent",
                  color: activeTab === tab.id ? "var(--emerald-fg)" : "var(--fg-muted)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Video */}
        {currentUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={currentUrl}
            controls
            autoPlay
            src={currentUrl}
            className="w-full bg-black"
            style={{ maxHeight: "65vh" }}
          />
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
            {job.creditsUsed > 0 && `${job.creditsUsed} crédits · `}
            {job.videoModel} · {job.voiceName}
          </span>
          {currentUrl && (
            <a
              href={currentUrl}
              download
              className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--emerald-fg)", color: "#fff" }}
            >
              <Download size={12} /> Télécharger
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoAdsHistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<VideoAdJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingJob, setPlayingJob] = useState<VideoAdJob | null>(null);
  const jobsRef = useRef<VideoAdJob[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/video-ads");
      if (res.ok) {
        const data = (await res.json()) as { jobs: VideoAdJob[] };
        jobsRef.current = data.jobs;
        setJobs(data.jobs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Poll every 8s — reads jobsRef (not jobs state) to avoid re-creating the interval on each update
    const interval = setInterval(() => {
      const hasInProgress = jobsRef.current.some(
        (j) => !["DONE", "FAILED"].includes(j.status)
      );
      if (hasInProgress) fetchJobs();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  function handleDelete(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (playingJob?.id === id) setPlayingJob(null);
  }

  function handleReuse(id: string) {
    router.push(`/marketing-os/studio/video-ads?resume=${id}`);
  }

  function handleCancelJob(id: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "FAILED" as VideoAdStatus, errorMessage: "Annulé manuellement." } : j))
    );
  }

  const done = jobs.filter((j) => j.status === "DONE").length;
  const inProgress = jobs.filter((j) => !["DONE", "FAILED"].includes(j.status)).length;
  const totalCredits = jobs.reduce((acc, j) => acc + j.creditsUsed, 0);

  return (
    <>
      <AppTopBar
        title="Galerie vidéos"
        subtitle="Toutes vos vidéos UGC générées"
        breadcrumb="marketing-os/studio/video-ads/history"
        accent="emerald"
      />

      <div className="p-6 max-w-[1100px]">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Stats */}
            {[
              { label: "Terminées", value: done, color: "var(--emerald-fg)" },
              { label: "En cours", value: inProgress, color: "var(--fg-muted)" },
              { label: "Crédits", value: totalCredits, color: "var(--fg-muted)" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
          <Link
            href="/marketing-os/studio/video-ads"
            className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--emerald-fg)", color: "#fff" }}
          >
            <Plus size={15} />
            Nouvelle vidéo
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--emerald-fg)" }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && jobs.length === 0 && (
          <div
            className="rounded-[20px] flex flex-col items-center justify-center gap-4 py-20"
            style={{ border: "2px dashed var(--line)", color: "var(--fg-muted)" }}
          >
            <Video size={36} style={{ opacity: 0.35 }} />
            <div className="text-center">
              <p className="font-semibold text-sm">Aucune vidéo générée</p>
              <p className="text-xs mt-1">Créez votre première vidéo UGC</p>
            </div>
            <Link
              href="/marketing-os/studio/video-ads"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--emerald-fg)", color: "#fff" }}
            >
              <Plus size={14} />
              Générer une vidéo
            </Link>
          </div>
        )}

        {/* Grid */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {jobs.map((job) => (
              <VideoCard
                key={job.id}
                job={job}
                onPlay={setPlayingJob}
                onDelete={handleDelete}
                onReuse={handleReuse}
                onCancel={handleCancelJob}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        {!loading && jobs.length > 0 && (
          <div className="mt-6 flex items-center gap-4 flex-wrap">
            <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
              <Sparkles size={9} className="inline mr-1" />
              CC = sous-titres auto-générés
            </span>
            <span className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
              <FileText size={9} className="inline mr-1" />
              Cliquez sur une carte pour lire la vidéo
            </span>
          </div>
        )}
      </div>

      {/* Inline player modal */}
      {playingJob && (
        <VideoModal job={playingJob} onClose={() => setPlayingJob(null)} />
      )}
    </>
  );
}
