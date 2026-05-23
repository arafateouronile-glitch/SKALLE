"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, GripVertical, Linkedin, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Slide {
  title: string;
  body: string;
  emoji?: string;
}

const THEMES = [
  { id: "violet", label: "Violet", bg: "#6d28d9", text: "#ffffff", accent: "#a78bfa" },
  { id: "blue", label: "Blue", bg: "#1d4ed8", text: "#ffffff", accent: "#93c5fd" },
  { id: "dark", label: "Dark", bg: "#111827", text: "#f9fafb", accent: "#8b5cf6" },
  { id: "white", label: "Blanc", bg: "#ffffff", text: "#111827", accent: "#6d28d9" },
  { id: "orange", label: "Orange", bg: "#ea580c", text: "#ffffff", accent: "#fed7aa" },
] as const;

type ThemeId = typeof THEMES[number]["id"];

const SLIDE_MIN = 3;
const SLIDE_MAX = 10;

function defaultSlide(index: number): Slide {
  return {
    title: index === 0 ? "Titre principal" : `Point clé ${index}`,
    body: index === 0 ? "Sous-titre ou promesse" : "Développe ton idée en 1-2 lignes max.",
  };
}

interface CarouselEditorProps {
  initialCaption?: string;
  onPublished?: (postUrl: string) => void;
  onDraftSaved?: (postId: string) => void;
}

export function CarouselEditor({ initialCaption = "", onPublished, onDraftSaved }: CarouselEditorProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [slides, setSlides] = useState<Slide[]>([
    defaultSlide(0),
    defaultSlide(1),
    defaultSlide(2),
  ]);
  const [theme, setTheme] = useState<ThemeId>("violet");
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(false);

  const activeTheme = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  function addSlide() {
    if (slides.length >= SLIDE_MAX) return;
    const newSlides = [...slides, defaultSlide(slides.length)];
    setSlides(newSlides);
    setActiveSlide(newSlides.length - 1);
  }

  function removeSlide(i: number) {
    if (slides.length <= SLIDE_MIN) return;
    const next = slides.filter((_, idx) => idx !== i);
    setSlides(next);
    setActiveSlide(Math.min(activeSlide, next.length - 1));
  }

  function updateSlide(i: number, field: keyof Slide, value: string) {
    setSlides(slides.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  function moveSlide(from: number, to: number) {
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSlides(next);
    setActiveSlide(to);
  }

  async function generateAndPublish(publishNow: boolean) {
    if (!caption.trim()) {
      toast.error("Ajoute un texte de post (caption) avant de continuer.");
      return;
    }

    setLoading(true);
    try {
      // Dynamic import for browser-only jspdf
      const { jsPDF } = await import("jspdf");

      const PAGE_W = 210; // A4 mm
      const PAGE_H = 210; // carré
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_W, PAGE_H] });

      slides.forEach((slide, idx) => {
        if (idx > 0) doc.addPage([PAGE_W, PAGE_H], "landscape");

        // Background
        doc.setFillColor(activeTheme.bg);
        doc.rect(0, 0, PAGE_W, PAGE_H, "F");

        // Slide number
        doc.setTextColor(activeTheme.accent);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(`${idx + 1} / ${slides.length}`, PAGE_W - 15, 12, { align: "right" });

        // Title
        doc.setTextColor(activeTheme.text);
        doc.setFontSize(idx === 0 ? 28 : 22);
        doc.setFont("helvetica", "bold");
        const titleLines = doc.splitTextToSize(slide.emoji ? `${slide.emoji} ${slide.title}` : slide.title, PAGE_W - 30);
        doc.text(titleLines, PAGE_W / 2, PAGE_H / 2 - 18, { align: "center" });

        // Body
        if (slide.body) {
          doc.setFontSize(13);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(activeTheme.accent);
          const bodyLines = doc.splitTextToSize(slide.body, PAGE_W - 40);
          doc.text(bodyLines, PAGE_W / 2, PAGE_H / 2 + 10, { align: "center" });
        }

        // Accent bar at bottom
        doc.setFillColor(activeTheme.accent);
        doc.rect(0, PAGE_H - 4, PAGE_W, 4, "F");
      });

      const pdfBlob = doc.output("blob");

      const formData = new FormData();
      formData.append("pdf", pdfBlob, "carousel.pdf");
      formData.append("caption", caption);
      formData.append("title", slides[0]?.title ?? "Carrousel");
      formData.append("slides", JSON.stringify(slides));
      formData.append("publishNow", publishNow ? "true" : "false");

      const res = await fetch("/api/social/carousel", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? "Erreur API");
      }

      const data = await res.json() as { postId: string; postUrl?: string; status: string };

      if (publishNow && data.postUrl) {
        setPublished(true);
        toast.success("Carrousel publié sur LinkedIn !");
        onPublished?.(data.postUrl);
      } else {
        toast.success("Carrousel enregistré en brouillon.");
        onDraftSaved?.(data.postId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Theme picker */}
      <div>
        <p className="text-[12px] font-medium text-gray-600 mb-2">Thème couleur</p>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setTheme(t.id)}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-all",
                theme === t.id ? "border-gray-900 scale-110" : "border-transparent"
              )}
              style={{ background: t.bg }}
            />
          ))}
        </div>
      </div>

      {/* Slides list + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: slide list */}
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-gray-600">
            Slides ({slides.length}/{SLIDE_MAX})
          </p>
          {slides.map((slide, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-all",
                activeSlide === i
                  ? "border-violet-400 bg-violet-50"
                  : "border-gray-200 bg-white hover:border-violet-200"
              )}
              onClick={() => setActiveSlide(i)}
            >
              <GripVertical className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
              <div
                className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: activeTheme.bg }}
              >
                {i + 1}
              </div>
              <p className="text-[12px] text-gray-700 truncate flex-1">
                {slide.title || <span className="text-gray-300">Sans titre</span>}
              </p>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); moveSlide(i, i - 1); }}
                  disabled={i === 0}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveSlide(i, i + 1); }}
                  disabled={i === slides.length - 1}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSlide(i); }}
                  disabled={slides.length <= SLIDE_MIN}
                  className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-20"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[11px] gap-1 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50"
            onClick={addSlide}
            disabled={slides.length >= SLIDE_MAX}
          >
            <Plus className="h-3 w-3" />
            Ajouter une slide
          </Button>
        </div>

        {/* Right: slide editor + preview */}
        <div className="space-y-3">
          <p className="text-[12px] font-medium text-gray-600">
            Slide {activeSlide + 1}
            {activeSlide === 0 && (
              <Badge variant="outline" className="ml-2 text-[10px] text-violet-600 border-violet-300">
                Couverture
              </Badge>
            )}
          </p>
          <Input
            placeholder="Titre de la slide"
            value={slides[activeSlide]?.title ?? ""}
            onChange={(e) => updateSlide(activeSlide, "title", e.target.value)}
            className="text-[13px] h-8"
          />
          <Textarea
            placeholder="Corps de la slide (1-2 lignes)"
            value={slides[activeSlide]?.body ?? ""}
            onChange={(e) => updateSlide(activeSlide, "body", e.target.value)}
            rows={3}
            className="text-[13px] resize-none"
          />
          <Input
            placeholder="Emoji (optionnel)"
            value={slides[activeSlide]?.emoji ?? ""}
            onChange={(e) => updateSlide(activeSlide, "emoji", e.target.value)}
            className="text-[13px] h-8 w-24"
          />

          {/* Mini preview */}
          <div
            className="rounded-lg p-4 flex flex-col items-center justify-center gap-2 aspect-square max-h-40"
            style={{ background: activeTheme.bg }}
          >
            <p
              className="text-center font-bold leading-tight text-[13px]"
              style={{ color: activeTheme.text }}
            >
              {slides[activeSlide]?.emoji} {slides[activeSlide]?.title || "Titre"}
            </p>
            <p
              className="text-center text-[10px] leading-tight"
              style={{ color: activeTheme.accent }}
            >
              {slides[activeSlide]?.body || "Corps du texte"}
            </p>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div>
        <p className="text-[12px] font-medium text-gray-600 mb-1.5">
          Texte du post LinkedIn (caption)
        </p>
        <Textarea
          placeholder="Écris le texte qui accompagne le carrousel…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          className="text-[13px] resize-none"
        />
        <p className="text-[10px] text-gray-400 mt-1">{caption.length} caractères</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {published ? (
          <div className="flex-1 flex items-center gap-2 text-emerald-600 text-[13px] font-medium">
            <Check className="h-4 w-4" />
            Carrousel publié sur LinkedIn
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1 h-9 text-[13px] gap-2"
              onClick={() => generateAndPublish(false)}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Enregistrer en brouillon
            </Button>
            <Button
              className="flex-1 h-9 text-[13px] gap-2 bg-[#0a66c2] hover:bg-[#004182] text-white"
              onClick={() => generateAndPublish(true)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Linkedin className="h-3.5 w-3.5" />
              )}
              Publier sur LinkedIn
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
