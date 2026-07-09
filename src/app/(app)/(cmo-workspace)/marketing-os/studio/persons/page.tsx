"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, X, ChevronLeft, Wand2, Check, ImagePlus, User, Video, Loader2, Sparkles } from "lucide-react";
import { UGC_FORMATS, UGC_CATEGORIES } from "@/lib/services/video/ugc-formats";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonPhoto {
  id: string;
  personId: string;
  formatId: string | null;
  formatLabel: string | null;
  photoUrl: string;
  storagePath: string;
  isBase: boolean;
  generatedWithAI: boolean;
  createdAt: string;
}

interface Person {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  photos: PersonPhoto[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] p-5 ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
    >
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const base = "inline-flex items-center gap-1.5 font-medium rounded-[10px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-[var(--accent)] text-white hover:opacity-90",
    secondary: "border text-[var(--fg)] hover:bg-[var(--bg-secondary)]",
    danger: "border border-red-200 text-red-600 hover:bg-red-50",
    ghost: "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-secondary)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={variant === "secondary" ? { borderColor: "var(--line)" } : {}}
    >
      {children}
    </button>
  );
}

// ─── Create Person Modal ─────────────────────────────────────────────────────

function CreatePersonModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Person) => void }) {
  const [name, setName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!name.trim()) return setError("Le prénom est requis.");
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      if (photoFile) form.append("photo", photoFile);

      const res = await fetch("/api/persons", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      onCreated(data as Person);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-[16px] p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>Nouveau personnage</h2>
          <button onClick={onClose} style={{ color: "var(--fg-muted)" }}><X size={18} /></button>
        </div>

        {/* Photo upload zone */}
        <div
          className="relative flex items-center justify-center mb-4 rounded-[12px] overflow-hidden cursor-pointer"
          style={{ height: 180, background: "var(--bg-secondary)", border: "2px dashed var(--line)" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          {photoPreview ? (
            <Image src={photoPreview} alt="preview" fill className="object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <User size={32} />
              <span className="text-xs">Importer une photo (optionnel)</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--fg-muted)" }}>Prénom / nom</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jean, Noellie, Sofia…"
            className="w-full rounded-[10px] px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--line)",
              color: "var(--fg)",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Btn variant="secondary" onClick={onClose} size="sm">Annuler</Btn>
          <Btn onClick={handleSubmit} disabled={loading || !name.trim()} size="sm">
            {loading ? "Création…" : "Créer le personnage"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Remix Scene Modal ────────────────────────────────────────────────────────

function RemixSceneModal({
  person: initialPerson,
  onClose,
  onDone,
  onPersonUpdated,
}: {
  person: Person;
  onClose: () => void;
  onDone: (photo: PersonPhoto) => void;
  onPersonUpdated?: (description: string) => void;
}) {
  const [person, setPerson] = useState(initialPerson);
  const [category, setCategory] = useState("all");
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [refPreview, setRefPreview] = useState<string | null>(
    initialPerson.photos.find((p) => p.isBase)?.photoUrl ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const refFileRef = useRef<HTMLInputElement>(null);

  const existingFormatIds = new Set(person.photos.filter((p) => p.formatId).map((p) => p.formatId));
  const hasDescription = !!person.description;

  // Upload reference photo → extracts description automatically
  async function handleRefPhoto(file: File) {
    setUploadingRef(true);
    setError(null);
    setRefPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("isBase", "true");
      const res = await fetch(`/api/persons/${person.id}/photos`, { method: "POST", body: form });
      const data = await res.json() as { photoUrl?: string; personDescription?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur upload");

      // Update local person state with the new description
      const updatedPerson: Person = {
        ...person,
        description: data.personDescription ?? person.description,
        photos: [
          ...person.photos,
          { ...data, id: (data as PersonPhoto).id, isBase: true, generatedWithAI: false } as PersonPhoto,
        ],
      };
      setPerson(updatedPerson);
      if (data.personDescription) onPersonUpdated?.(data.personDescription);
      if (data.photoUrl) setRefPreview(data.photoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload");
      setRefPreview(null);
    } finally {
      setUploadingRef(false);
    }
  }

  async function handleGenerate() {
    if (!selectedFormatId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/persons/${person.id}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatId: selectedFormatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de génération");
      onDone(data as PersonPhoto);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const filtered = UGC_FORMATS.filter(
    (f) => (category === "all" || f.category === category)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-2xl rounded-[16px] p-6 flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
              Remixer {person.name} dans une scène
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
              Génère une photo de {person.name} placé(e) dans le décor choisi
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--fg-muted)" }}><X size={18} /></button>
        </div>

        {/* ── Reference photo upload (shown when no description yet) ── */}
        {!hasDescription && (
          <div className="mb-4 shrink-0">
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--fg)" }}>
              1 — Photo de référence
              <span className="ml-1 font-normal" style={{ color: "var(--fg-muted)" }}>
                (nécessaire pour générer)
              </span>
            </p>
            <input
              ref={refFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRefPhoto(f); }}
            />
            <div
              className="flex items-center gap-4 p-3 rounded-[12px] cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ border: "2px dashed var(--line)", background: "var(--bg-secondary)" }}
              onClick={() => refFileRef.current?.click()}
            >
              {/* Preview thumbnail */}
              <div
                className="relative shrink-0 rounded-[8px] overflow-hidden"
                style={{ width: 56, height: 74, background: "var(--bg-card)", border: "1px solid var(--line)" }}
              >
                {refPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={refPreview} alt="ref" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <User size={20} style={{ color: "var(--fg-muted)" }} />
                  </div>
                )}
                {uploadingRef && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: "white" }} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {uploadingRef ? (
                  <p className="text-xs font-medium" style={{ color: "var(--fg)" }}>
                    Analyse en cours… (GPT-4o Vision)
                  </p>
                ) : refPreview ? (
                  <p className="text-xs font-medium" style={{ color: "var(--fg)" }}>
                    ✓ Photo chargée — description extraite
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-medium" style={{ color: "var(--fg)" }}>
                      Importer une photo de {person.name}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                      JPG, PNG, WebP · L&apos;IA en extrait automatiquement l&apos;apparence
                    </p>
                  </>
                )}
              </div>
              {!uploadingRef && (
                <Upload size={16} style={{ color: "var(--fg-muted)", flexShrink: 0 }} />
              )}
            </div>
          </div>
        )}

        {/* Reference photo already set — compact indicator */}
        {hasDescription && (
          <div className="flex items-center gap-2 mb-4 shrink-0">
            {refPreview && (
              <div className="relative rounded-[6px] overflow-hidden shrink-0" style={{ width: 32, height: 42, border: "1px solid var(--line)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refPreview} alt="ref" className="w-full h-full object-cover" />
              </div>
            )}
            <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
              ✓ Photo de référence · description IA disponible
            </p>
          </div>
        )}

        {/* ── Scene selector label ── */}
        {!hasDescription && (
          <p className="text-xs font-semibold mb-2 shrink-0" style={{ color: "var(--fg-muted)" }}>
            2 — Choisir une scène
          </p>
        )}

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 shrink-0" style={{ scrollbarWidth: "none" }}>
          {UGC_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: category === cat.id ? "var(--accent)" : "var(--bg-secondary)",
                color: category === cat.id ? "white" : "var(--fg-muted)",
                border: `1px solid ${category === cat.id ? "var(--accent)" : "var(--line)"}`,
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Scene grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto flex-1 pr-1">
          {filtered.map((fmt) => {
            const already = existingFormatIds.has(fmt.id);
            const isSelected = selectedFormatId === fmt.id;
            return (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormatId(fmt.id)}
                className="relative rounded-[10px] p-2.5 text-left transition-all"
                style={{
                  background: isSelected ? "var(--emerald-soft)" : "var(--bg-secondary)",
                  border: `1.5px solid ${isSelected ? "var(--emerald-line)" : "var(--line)"}`,
                }}
              >
                {already && (
                  <span
                    className="absolute top-1.5 right-1.5 rounded-full p-0.5"
                    style={{ background: "var(--accent)", color: "white" }}
                    title="Déjà généré"
                  >
                    <Check size={10} />
                  </span>
                )}
                <div className="text-sm leading-none mb-1">{fmt.icon}</div>
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

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex gap-2 justify-end mt-4 shrink-0">
          <Btn variant="secondary" onClick={onClose} size="sm" disabled={loading || uploadingRef}>Annuler</Btn>
          <Btn
            onClick={handleGenerate}
            disabled={!selectedFormatId || loading || uploadingRef}
            size="sm"
          >
            {uploadingRef ? (
              <><Loader2 size={13} className="animate-spin" /> Analyse de la photo…</>
            ) : loading ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Génération (~20s)…</>
            ) : (
              <><Wand2 size={14} /> Remixer dans cette scène</>
            )}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Add Photo Modal ──────────────────────────────────────────────────────────

function AddPhotoModal({
  person,
  onClose,
  onDone,
}: {
  person: Person;
  onClose: () => void;
  onDone: (photo: PersonPhoto) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return setError("Choisissez une photo.");
    setLoading(true);
    setError(null);
    try {
      const selectedFormat = UGC_FORMATS.find((f) => f.id === formatId);
      const form = new FormData();
      form.append("photo", file);
      if (formatId) form.append("formatId", formatId);
      if (selectedFormat) form.append("formatLabel", selectedFormat.label);
      form.append("isBase", person.photos.length === 0 ? "true" : "false");

      const res = await fetch(`/api/persons/${person.id}/photos`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      onDone(data as PersonPhoto);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-[16px] p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>Ajouter une photo</h2>
          <button onClick={onClose} style={{ color: "var(--fg-muted)" }}><X size={18} /></button>
        </div>

        <div
          className="relative flex items-center justify-center mb-4 rounded-[12px] overflow-hidden cursor-pointer"
          style={{ height: 180, background: "var(--bg-secondary)", border: "2px dashed var(--line)" }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
          }}
        >
          {preview ? (
            <Image src={preview} alt="preview" fill className="object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <Upload size={28} />
              <span className="text-xs">Déposez une photo ici</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
            }}
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--fg-muted)" }}>Scène (optionnel)</label>
          <select
            value={formatId ?? ""}
            onChange={(e) => setFormatId(e.target.value || null)}
            className="w-full rounded-[10px] px-3 py-2 text-xs outline-none"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)", color: "var(--fg)" }}
          >
            <option value="">Photo de base</option>
            {UGC_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.icon} {f.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Btn variant="secondary" onClick={onClose} size="sm">Annuler</Btn>
          <Btn onClick={handleUpload} disabled={!file || loading} size="sm">
            {loading ? "Upload…" : "Ajouter"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Person Detail View ───────────────────────────────────────────────────────

function PersonDetail({
  person,
  onBack,
  onDeleted,
  onUpdated,
}: {
  person: Person;
  onBack: () => void;
  onDeleted: () => void;
  onUpdated: (p: Person) => void;
}) {
  const router = useRouter();
  const [showRemix, setShowRemix] = useState(false);
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usingPhotoId, setUsingPhotoId] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Supprimer ${person.name} et toutes ses photos ?`)) return;
    setDeleting(true);
    await fetch(`/api/persons/${person.id}`, { method: "DELETE" });
    onDeleted();
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm("Supprimer cette photo ?")) return;
    await fetch(`/api/persons/${person.id}/photos?photoId=${photoId}`, { method: "DELETE" });
    onUpdated({ ...person, photos: person.photos.filter((p) => p.id !== photoId) });
  }

  function handleNewPhoto(photo: PersonPhoto) {
    onUpdated({ ...person, photos: [...person.photos, photo] });
  }

  // Creates a VideoAdJob with this photo as avatar and redirects to the studio
  async function handleUseInVideo(ph: PersonPhoto) {
    setUsingPhotoId(ph.id);
    try {
      const form = new FormData();
      form.append("personAvatarStoragePath", ph.storagePath);
      const res = await fetch("/api/video-ads/upload", { method: "POST", body: form });
      const data = await res.json() as { jobId?: string };
      if (data.jobId) {
        router.push(`/marketing-os/studio/video-ads?resume=${data.jobId}`);
      }
    } catch {
      // ignore, just navigate
      router.push("/marketing-os/studio/video-ads");
    } finally {
      setUsingPhotoId(null);
    }
  }

  const basePhoto = person.photos.find((p) => p.isBase);
  const scenePhotos = person.photos.filter((p) => !p.isBase);
  const allPhotos = person.photos;

  return (
    <div>
      {showRemix && (
        <RemixSceneModal
          person={person}
          onClose={() => setShowRemix(false)}
          onDone={handleNewPhoto}
          onPersonUpdated={(description) =>
            onUpdated({ ...person, description })
          }
        />
      )}
      {showAddPhoto && (
        <AddPhotoModal
          person={person}
          onClose={() => setShowAddPhoto(false)}
          onDone={handleNewPhoto}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1.5 rounded-[8px] hover:bg-[var(--bg-secondary)]">
          <ChevronLeft size={18} style={{ color: "var(--fg-muted)" }} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: "var(--fg)" }}>{person.name}</h1>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {allPhotos.length} photo{allPhotos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Btn size="sm" variant="secondary" onClick={() => setShowAddPhoto(true)}>
            <ImagePlus size={14} /> Importer une photo
          </Btn>
          <Btn size="sm" onClick={() => setShowRemix(true)}>
            <Wand2 size={14} /> Remixer dans une scène
          </Btn>
          <Btn size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={14} />
          </Btn>
        </div>
      </div>

      {/* No description warning + how-to */}
      {!person.description && (
        <div
          className="mb-5 p-4 rounded-[12px] text-xs"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--line)" }}
        >
          <p className="font-semibold mb-1" style={{ color: "var(--fg)" }}>
            Importez une photo de référence pour débloquer la génération IA
          </p>
          <p style={{ color: "var(--fg-muted)" }}>
            Cliquez sur &ldquo;Importer une photo&rdquo; → la photo est analysée automatiquement → vous pourrez ensuite remixer {person.name} dans n&apos;importe quelle scène.
          </p>
          <button
            onClick={() => setShowAddPhoto(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <ImagePlus size={13} /> Importer une photo maintenant
          </button>
        </div>
      )}

      {/* All photos grid */}
      {allPhotos.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold mb-3" style={{ color: "var(--fg-muted)" }}>
            PHOTOS ({allPhotos.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {allPhotos.map((ph) => {
              const fmt = ph.formatId ? UGC_FORMATS.find((f) => f.id === ph.formatId) : null;
              const isUsing = usingPhotoId === ph.id;
              return (
                <div
                  key={ph.id}
                  className="relative group rounded-[12px] overflow-hidden"
                  style={{ border: "1px solid var(--line)" }}
                >
                  {/* Image */}
                  <div className="relative w-full" style={{ paddingBottom: "177.78%" }}>
                    <Image src={ph.photoUrl} alt={ph.formatLabel ?? "photo"} fill className="object-cover" />
                  </div>

                  {/* Bottom label */}
                  <div
                    className="absolute bottom-0 left-0 right-0 px-2 py-2 text-[10px] font-medium"
                    style={{
                      background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
                      color: "white",
                    }}
                  >
                    <div className="leading-tight">
                      {ph.isBase ? "📌 Photo de base" : (fmt ? `${fmt.icon} ${fmt.label}` : (ph.formatLabel ?? "Scène"))}
                    </div>
                    {ph.generatedWithAI && (
                      <div className="opacity-70 text-[9px]">IA</div>
                    )}
                  </div>

                  {/* Hover overlay with actions */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.55)" }}
                  >
                    <button
                      onClick={() => handleUseInVideo(ph)}
                      disabled={isUsing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      {isUsing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Video size={12} />
                      )}
                      {isUsing ? "Chargement…" : "Utiliser en vidéo"}
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(ph.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[10px] font-medium"
                      style={{ background: "rgba(239,68,68,0.9)", color: "white" }}
                    >
                      <X size={11} /> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add more scene — always visible */}
            <button
              onClick={() => setShowRemix(true)}
              className="relative flex flex-col items-center justify-center rounded-[12px] transition-all hover:bg-[var(--bg-secondary)]"
              style={{
                minHeight: 160,
                border: "2px dashed var(--line)",
                background: "transparent",
              }}
            >
              <Wand2 size={22} style={{ color: "var(--fg-muted)" }} />
              <span className="text-[11px] mt-2 text-center px-2" style={{ color: "var(--fg-muted)" }}>
                + Nouvelle scène
              </span>
            </button>

            <button
              onClick={() => setShowAddPhoto(true)}
              className="relative flex flex-col items-center justify-center rounded-[12px] transition-all hover:bg-[var(--bg-secondary)]"
              style={{
                minHeight: 160,
                border: "2px dashed var(--line)",
                background: "transparent",
              }}
            >
              <ImagePlus size={22} style={{ color: "var(--fg-muted)" }} />
              <span className="text-[11px] mt-2 text-center px-2" style={{ color: "var(--fg-muted)" }}>
                + Importer
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no photos at all */}
      {allPhotos.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setShowRemix(true)}
            className="relative flex flex-col items-center justify-center rounded-[12px] transition-all hover:bg-[var(--bg-secondary)]"
            style={{ minHeight: 200, border: "2px dashed var(--line)", background: "transparent" }}
          >
            <Wand2 size={22} style={{ color: "var(--fg-muted)" }} />
            <span className="text-[11px] mt-2 text-center px-2" style={{ color: "var(--fg-muted)" }}>
              Générer dans une scène
            </span>
          </button>
          <button
            onClick={() => setShowAddPhoto(true)}
            className="relative flex flex-col items-center justify-center rounded-[12px] transition-all hover:bg-[var(--bg-secondary)]"
            style={{ minHeight: 200, border: "2px dashed var(--line)", background: "transparent" }}
          >
            <ImagePlus size={22} style={{ color: "var(--fg-muted)" }} />
            <span className="text-[11px] mt-2 text-center px-2" style={{ color: "var(--fg-muted)" }}>
              Importer une photo
            </span>
          </button>
        </div>
      )}

      {/* Description */}
      {person.description && (
        <details className="mt-2">
          <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--fg-muted)" }}>
            DESCRIPTION IA ›
          </summary>
          <p className="text-xs leading-relaxed p-3 mt-2 rounded-[10px]" style={{ background: "var(--bg-secondary)", color: "var(--fg-muted)", border: "1px solid var(--line)" }}>
            {person.description}
          </p>
        </details>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  const fetchPersons = useCallback(async () => {
    try {
      const res = await fetch("/api/persons");
      if (res.ok) setPersons(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPersons(); }, [fetchPersons]);

  function handleCreated(p: Person) {
    setPersons((prev) => [p, ...prev]);
  }

  function handleUpdated(p: Person) {
    setPersons((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setSelectedPerson(p);
  }

  function handleDeleted() {
    setPersons((prev) => prev.filter((x) => x.id !== selectedPerson?.id));
    setSelectedPerson(null);
  }

  if (selectedPerson) {
    const fresh = persons.find((p) => p.id === selectedPerson.id) ?? selectedPerson;
    return (
      <div className="p-6 max-w-4xl">
        <PersonDetail
          person={fresh}
          onBack={() => setSelectedPerson(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {showCreate && (
        <CreatePersonModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--fg)" }}>Mes personnages</h1>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
            Créez des avatars réutilisables et placez-les dans n&apos;importe quelle scène UGC
          </p>
        </div>
        <Btn onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Nouveau personnage
        </Btn>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <span className="animate-spin w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && persons.length === 0 && (
        <Card className="flex flex-col items-center py-16 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "var(--bg-secondary)" }}
          >
            <User size={28} style={{ color: "var(--fg-muted)" }} />
          </div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--fg)" }}>Aucun personnage</h2>
          <p className="text-xs mb-5 max-w-xs" style={{ color: "var(--fg-muted)" }}>
            Créez Jean, Noellie ou n&apos;importe quel avatar. Importez une photo ou laissez l&apos;IA le générer dans les scènes de votre choix.
          </p>
          <Btn onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Créer mon premier personnage
          </Btn>
        </Card>
      )}

      {/* Grid */}
      {!loading && persons.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {persons.map((p) => {
            const cover = p.photos[0];
            return (
              <div
                key={p.id}
                className="rounded-[14px] overflow-hidden group transition-all hover:shadow-md"
                style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}
              >
                {/* Cover photo — clickable for detail */}
                <button
                  onClick={() => setSelectedPerson(p)}
                  className="relative w-full text-left block"
                  style={{ paddingBottom: "133%", background: "var(--bg-secondary)" }}
                >
                  {cover ? (
                    <Image src={cover.photoUrl} alt={p.name} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <User size={36} style={{ color: "var(--fg-muted)" }} />
                    </div>
                  )}
                  {/* Scene count badge */}
                  <div
                    className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: "rgba(0,0,0,0.6)", color: "white" }}
                  >
                    {p.photos.length} photo{p.photos.length !== 1 ? "s" : ""}
                  </div>
                </button>
                {/* Name + quick action buttons */}
                <div className="p-3">
                  <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{p.name}</p>
                  <p className="text-[10px] mt-0.5 mb-2.5" style={{ color: "var(--fg-muted)" }}>
                    {p.photos.length} photo{p.photos.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setSelectedPerson(p)}
                      className="flex-1 text-[10px] font-semibold py-1 rounded-[7px] transition-colors"
                      style={{ background: "var(--bg-secondary)", color: "var(--fg)", border: "1px solid var(--line)" }}
                    >
                      Voir
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedPerson(p); }}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded-[7px] transition-colors"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      <Wand2 size={10} /> Remix
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add new card */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center justify-center rounded-[14px] transition-all hover:bg-[var(--bg-secondary)]"
            style={{
              minHeight: 200,
              border: "2px dashed var(--line)",
              background: "transparent",
            }}
          >
            <Plus size={24} style={{ color: "var(--fg-muted)" }} />
            <span className="text-xs mt-2" style={{ color: "var(--fg-muted)" }}>Nouveau</span>
          </button>
        </div>
      )}

      {/* Explanation */}
      {!loading && (
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: <User size={16} />, title: "Créer un personnage", desc: "Import photo ou génération IA" },
            { icon: <Sparkles size={16} />, title: "Remixer dans une scène", desc: "Café, bureau, plage, studio…" },
            { icon: <Check size={16} />, title: "Utiliser en vidéo", desc: "Sélectionner depuis la bibliothèque lors de la génération" },
          ].map((item, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-[10px]" style={{ background: "var(--bg-secondary)" }}>
              <div
                className="mt-0.5 p-1.5 rounded-[8px] shrink-0"
                style={{ background: "var(--accent-soft, var(--bg-card))", color: "var(--accent)" }}
              >
                {item.icon}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--fg)" }}>{item.title}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
