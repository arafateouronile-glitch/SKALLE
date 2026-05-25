"use client";

import { useState } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { ArrowLeft, Search, Heart, MessageCircle, Repeat2, Sparkles, Copy, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Network = "linkedin" | "twitter" | "instagram" | "facebook";
type Niche = string;
type EngagementMin = "500" | "1k" | "5k" | "10k" | "50k";
type Period = "7j" | "30j" | "3 mois";
type ContentType = "tous" | "texte" | "image" | "video" | "carrousel";
type RemixFormat = "thread" | "post-court" | "carrousel" | "story" | "email";

interface ViralPost {
  id: number;
  network: Network;
  author: string;
  handle: string;
  company: string;
  avatar: string;
  content: string;
  likes: string;
  comments: string;
  shares: string;
  date: string;
  type: ContentType;
  niche: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NETWORKS: { id: Network; label: string; color: string; bg: string; border: string }[] = [
  { id: "linkedin", label: "LinkedIn", color: "var(--violet-fg)", bg: "var(--violet-soft)", border: "var(--violet-line)" },
  { id: "twitter", label: "Twitter / X", color: "var(--fg)", bg: "var(--line-strong)", border: "var(--line)" },
  { id: "instagram", label: "Instagram", color: "var(--amber-fg)", bg: "var(--amber-soft)", border: "var(--amber-line)" },
  { id: "facebook", label: "Facebook", color: "var(--cold-fg)", bg: "var(--cold-soft)", border: "var(--cold-line)" },
];

const NICHES: Niche[] = ["B2B SaaS", "Marketing", "IA & Tech", "Finance", "RH & Recrutement", "Vente & Outreach", "Growth", "Entrepreneuriat"];

const ENGAGEMENT_OPTIONS: { id: EngagementMin; label: string }[] = [
  { id: "500", label: "500+ likes" },
  { id: "1k", label: "1k+ likes" },
  { id: "5k", label: "5k+ likes" },
  { id: "10k", label: "10k+ likes" },
  { id: "50k", label: "50k+ likes" },
];

const PERIODS: Period[] = ["7j", "30j", "3 mois"];

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "texte", label: "Texte" },
  { id: "image", label: "Image" },
  { id: "carrousel", label: "Carrousel" },
  { id: "video", label: "Vidéo" },
];

const REMIX_FORMATS: { id: RemixFormat; label: string; desc: string; credits: number }[] = [
  { id: "thread", label: "Thread LinkedIn", desc: "5–8 tweets / posts enchaînés", credits: 6 },
  { id: "post-court", label: "Post court", desc: "Format punchy < 300 mots", credits: 3 },
  { id: "carrousel", label: "Carrousel", desc: "5–10 slides avec visuels", credits: 8 },
  { id: "story", label: "Story / Reel", desc: "Script court + textes écrans", credits: 5 },
  { id: "email", label: "Email newsletter", desc: "Adapté pour séquence email", credits: 4 },
];

const MOCK_POSTS: ViralPost[] = [
  {
    id: 1, network: "linkedin", author: "Guillaume Moubeche", handle: "gmoubeche", company: "lemlist",
    avatar: "GM", content: "I cold emailed 50 CEOs in one week. Here's what I learned that changed our entire sales strategy:\n\n1. Subject lines with their name convert 3× more\n2. The best time to send? Tuesday 8–9am\n3. Never pitch in the first email\n4. Follow up exactly 3 times, then move on\n\nWe went from 2% to 22% reply rate. Here's the exact framework we use...",
    likes: "14.2k", comments: "847", shares: "2.1k", date: "il y a 3j", type: "texte", niche: "Vente & Outreach",
  },
  {
    id: 2, network: "linkedin", author: "Thibault Louis", handle: "thibaultlouis", company: "Notion",
    avatar: "TL", content: "Stop building features. Start solving problems.\n\nThe #1 mistake founders make: adding more features when growth slows.\n\nWhat actually works:\n→ Talk to 5 churned customers this week\n→ Map their exact pain point\n→ Build ONE thing that fixes it\n\nWe 3× our retention by removing 12 features and doubling down on 2.",
    likes: "9.8k", comments: "623", shares: "1.4k", date: "il y a 5j", type: "texte", niche: "B2B SaaS",
  },
  {
    id: 3, network: "twitter", author: "Lenny Rachitsky", handle: "lennysan", company: "Lenny's Newsletter",
    avatar: "LR", content: "The best PMs I know all share one trait:\n\nThey obsess over the problem, not the solution.\n\n10 questions they ask before writing a single line of spec:\n\n1. Who exactly has this problem?\n2. How often does it occur?\n3. What do people do today instead?\n4. What's the cost of NOT solving it?\n...",
    likes: "22.4k", comments: "1.2k", shares: "4.8k", date: "il y a 2j", type: "texte", niche: "Marketing",
  },
  {
    id: 4, network: "twitter", author: "Alex Hormozi", handle: "AlexHormozi", company: "Acquisition.com",
    avatar: "AH", content: "I went from $0 to $100M in under 10 years.\n\nThe only playbook you need:\n\n• Sell something people desperately want\n• Make the offer so good they feel stupid saying no\n• Do it consistently for longer than you think\n\nThere's no secret. Just relentless execution on boring fundamentals.",
    likes: "51.7k", comments: "3.2k", shares: "8.9k", date: "il y a 1j", type: "texte", niche: "Entrepreneuriat",
  },
  {
    id: 5, network: "instagram", author: "GrowthHackers", handle: "growthhackers.io", company: "GrowthHackers",
    avatar: "GH", content: "Votre funnel perd 80% des visiteurs entre le 1er clic et l'achat. Voici les 5 points de friction que personne ne vous dit d'optimiser ↓\n\n[Slide 1] Le CTA au-dessus de la ligne de flottaison\n[Slide 2] La preuve sociale visible sans scroll\n[Slide 3] La friction du formulaire\n[Slide 4] La vitesse mobile\n[Slide 5] Le email de relance à J+1",
    likes: "7.3k", comments: "412", shares: "989", date: "il y a 4j", type: "carrousel", niche: "Growth",
  },
  {
    id: 6, network: "linkedin", author: "Camille Tyan", handle: "ctyan", company: "PayFit",
    avatar: "CT", content: "On vient de lever €90M. Voici ce que j'aurais aimé savoir avant de pitcher 200 investisseurs :\n\n1. Les VCs ne financent pas des idées. Ils financent des équipes.\n2. La traction, c'est tout. Le reste c'est du bruit.\n3. Non, ils ne signent pas en 2 semaines.\n4. Le storytelling > les slides.\n5. Le meilleur moment pour lever, c'est quand vous n'en avez pas besoin.",
    likes: "18.9k", comments: "1.4k", shares: "3.2k", date: "il y a 6j", type: "texte", niche: "Finance",
  },
];

const REMIX_RESULTS: Record<RemixFormat, string> = {
  thread: `🧵 Thread — version remixée pour votre audience :

1/ [Hook] La plupart des équipes font ça à l'envers.

2/ Voici ce qu'on a appris après 6 mois d'itération sur notre propre stratégie commerciale :

3/ Le vrai problème n'est pas le volume. C'est la pertinence.

4/ Quand on a arrêté d'envoyer 500 emails génériques et commencé à en envoyer 50 ultra-ciblés, notre taux de réponse a grimpé de 3× en 3 semaines.

5/ La méthode en 4 étapes qu'on utilise maintenant :
→ Identifier le signal d'achat
→ Personnaliser sur l'actualité du prospect
→ Proposer une valeur immédiate
→ Relancer une seule fois, intelligemment

6/ Résultat : €538k de pipeline sur 30 jours. Avec la même équipe, le même budget.

7/ La différence ? L'IA qui fait le travail répétitif pendant que les commerciaux closent. /fin`,

  "post-court": `La plupart des équipes B2B perdent 80% de leur potentiel commercial sur des tâches répétitives.

Résultat : moins de 3h par semaine passées à vraiment vendre.

On a inversé ça. L'IA prospecte, score et relance. Les commerciaux closent.

18.4% de taux de réponse. ×14 ROI outreach. Ce mois.

Vous travaillez encore à l'ancienne ?`,

  carrousel: `[Slide 1] Titre : "Pourquoi votre pipeline stagne (et comment le débloquer)"

[Slide 2] Le problème : 80% du temps commercial est gaspillé en prospection manuelle

[Slide 3] Les 3 signaux d'achat que vous ratez chaque semaine

[Slide 4] La méthode : détecter → scorer → contacter → relancer

[Slide 5] Résultats clients : de 2% à 18% de taux de réponse en 3 semaines

[Slide 6] Avant / Après : 40h/mois de prospection → 3h

[Slide 7] Slide CTA : "Testez gratuitement — lien en bio"`,

  story: `[Écran 1 — 3s] Texte : "Vous prospectez encore manuellement ?"

[Écran 2 — 4s] Stat : "80% du temps commercial = tâches sans valeur"

[Écran 3 — 4s] Transition : "On a résolu ça."

[Écran 4 — 5s] Résultat : "18.4% taux de réponse / ×14 ROI"

[Écran 5 — 4s] CTA : "Swipe up — démo gratuite"`,

  email: `Objet : [Prénom], vous perdez €4 200/mois en prospection manuelle

---

Bonjour [Prénom],

J'ai vu que [Entreprise] recrute des commerciaux en ce moment — signe que vous cherchez à scaler votre pipeline.

Problème que j'entends souvent : les commerciaux passent 80% de leur temps sur des tâches répétitives (prospection, scoring, relances) au lieu de vendre.

On a construit SKALLE exactement pour ça.

Résultats de nos clients ce mois : 18.4% de taux de réponse moyen, ×14 ROI outreach, €538k de pipeline sur 30 jours.

15 minutes pour vous montrer comment ça marche sur votre cas précis ?

→ [Lien calendrier]

Bonne journée,
[Votre nom]`,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemixPage() {
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>(["linkedin"]);
  const [selectedNiches, setSelectedNiches] = useState<Niche[]>([]);
  const [engagement, setEngagement] = useState<EngagementMin>("1k");
  const [period, setPeriod] = useState<Period>("30j");
  const [contentType, setContentType] = useState<ContentType>("tous");

  const [searching, setSearching] = useState(false);
  const [hasResults, setHasResults] = useState(false);

  const [selectedPost, setSelectedPost] = useState<ViralPost | null>(null);
  const [remixFormat, setRemixFormat] = useState<RemixFormat>("thread");
  const [generating, setGenerating] = useState(false);
  const [remixResult, setRemixResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleNetwork(n: Network) {
    setSelectedNetworks((prev) =>
      prev.includes(n) ? (prev.length > 1 ? prev.filter((x) => x !== n) : prev) : [...prev, n]
    );
  }

  function toggleNiche(n: Niche) {
    setSelectedNiches((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function handleSearch() {
    setSearching(true);
    setHasResults(false);
    setSelectedPost(null);
    setRemixResult(null);
    setTimeout(() => {
      setSearching(false);
      setHasResults(true);
    }, 1400);
  }

  function handleSelectPost(post: ViralPost) {
    setSelectedPost(post);
    setRemixResult(null);
    setTimeout(() => document.getElementById("remix-config")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setRemixResult(REMIX_RESULTS[remixFormat]);
      setTimeout(() => document.getElementById("remix-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }, 1100);
  }

  function handleCopy() {
    if (!remixResult) return;
    navigator.clipboard.writeText(remixResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredPosts = MOCK_POSTS.filter((p) => {
    const networkMatch = selectedNetworks.includes(p.network);
    const nicheMatch = selectedNiches.length === 0 || selectedNiches.includes(p.niche);
    const typeMatch = contentType === "tous" || p.type === contentType;
    return networkMatch && nicheMatch && typeMatch;
  });

  const networkLabel: Record<Network, string> = { linkedin: "LI", twitter: "𝕏", instagram: "IG", facebook: "FB" };
  const networkColor: Record<Network, string> = {
    linkedin: "var(--violet-fg)", twitter: "var(--fg)", instagram: "var(--amber-fg)", facebook: "var(--cold-fg)",
  };

  return (
    <>
      <AppTopBar
        title="Remixer un contenu"
        breadcrumb="marketing-os / studio / remix"
        accent="emerald"
      />

      <div className="p-6 space-y-6 max-w-[1100px]">

        {/* Back */}
        <Link
          href="/marketing-os/studio"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-all hover:opacity-70"
          style={{ color: "var(--fg-mute)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au Studio
        </Link>

        {/* ── Step 1 : Filtres ─────────────────────────────────────────────── */}
        <section
          className="rounded-[18px] p-7"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-5" style={{ color: "var(--fg-mute)" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>1</span>
            Choisir la source
          </div>

          <div className="space-y-5">

            {/* Networks */}
            <div>
              <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Réseau social</p>
              <div className="flex flex-wrap gap-2">
                {NETWORKS.map((n) => {
                  const active = selectedNetworks.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => toggleNetwork(n.id)}
                      className="px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all"
                      style={
                        active
                          ? { background: n.bg, color: n.color, border: `2px solid ${n.color}` }
                          : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                      }
                    >
                      {n.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Niches */}
            <div>
              <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Niche <span style={{ color: "var(--fg-mute)" }}>(laisser vide = toutes)</span></p>
              <div className="flex flex-wrap gap-2">
                {NICHES.map((n) => {
                  const active = selectedNiches.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleNiche(n)}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                      style={
                        active
                          ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                          : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row: engagement + period + type */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div>
                <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Engagement minimum</p>
                <div className="flex flex-wrap gap-1.5">
                  {ENGAGEMENT_OPTIONS.map((e) => {
                    const active = engagement === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setEngagement(e.id)}
                        className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                        style={
                          active
                            ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                            : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                        }
                      >
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Période</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERIODS.map((p) => {
                    const active = period === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                        style={
                          active
                            ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                            : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold mb-2.5" style={{ color: "var(--fg-dim)" }}>Type de contenu</p>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TYPES.map((t) => {
                    const active = contentType === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setContentType(t.id)}
                        className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                        style={
                          active
                            ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                            : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 px-6 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 disabled:opacity-70"
              style={{ background: "var(--emerald-fg)", color: "white" }}
            >
              <Search className="h-4 w-4" />
              {searching ? "Recherche en cours…" : "Trouver les posts viraux →"}
            </button>
          </div>
        </section>

        {/* ── Step 2 : Résultats ───────────────────────────────────────────── */}
        {hasResults && (
          <section>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>2</span>
              {filteredPosts.length} posts viraux trouvés — choisissez-en un à remixer
            </div>

            {filteredPosts.length === 0 ? (
              <div
                className="rounded-[14px] p-8 text-center"
                style={{ border: "1px dashed var(--line)" }}
              >
                <p className="text-[13px] mb-3" style={{ color: "var(--fg-mute)" }}>Aucun post pour ces filtres. Essayez d'élargir la sélection.</p>
                <button
                  onClick={() => { setSelectedNiches([]); setContentType("tous"); }}
                  className="text-[12px] font-semibold px-4 py-2 rounded-[8px]"
                  style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredPosts.map((post) => {
                  const isSelected = selectedPost?.id === post.id;
                  return (
                    <div
                      key={post.id}
                      className="rounded-[14px] p-5 flex flex-col gap-3 transition-all"
                      style={{
                        background: "var(--bg-card)",
                        border: isSelected ? `2px solid var(--emerald-fg)` : "1px solid var(--line)",
                        boxShadow: "var(--card-shadow)",
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                            style={{ background: "var(--line-strong)", color: "var(--fg)" }}
                          >
                            {post.avatar}
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{post.author}</p>
                            <p className="text-[10.5px]" style={{ color: "var(--fg-mute)" }}>{post.company} · {post.date}</p>
                          </div>
                        </div>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: "var(--bg)", color: networkColor[post.network], border: "1px solid var(--line)" }}
                        >
                          {networkLabel[post.network]}
                        </span>
                      </div>

                      {/* Content */}
                      <p className="text-[12.5px] leading-relaxed line-clamp-4" style={{ color: "var(--fg-dim)" }}>
                        {post.content}
                      </p>

                      {/* Stats + CTA */}
                      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                        <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--fg-mute)" }}>
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likes}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.comments}</span>
                          <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" />{post.shares}</span>
                        </div>
                        <button
                          onClick={() => handleSelectPost(post)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                          style={
                            isSelected
                              ? { background: "var(--emerald-fg)", color: "white" }
                              : { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {isSelected ? "Sélectionné ✓" : "Remixer ce post →"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Step 3 : Config remix ────────────────────────────────────────── */}
        {selectedPost && (
          <section id="remix-config">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>3</span>
              Choisir le format de remix
            </div>

            {/* Selected post recap */}
            <div
              className="rounded-[12px] p-4 mb-5 flex items-start gap-3"
              style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
            >
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--emerald-fg)" }} />
              <div>
                <p className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--emerald-fg)" }}>
                  Post de {selectedPost.author} sélectionné — {selectedPost.likes} likes
                </p>
                <p className="text-[11.5px] line-clamp-2" style={{ color: "var(--fg-dim)" }}>{selectedPost.content}</p>
              </div>
            </div>

            {/* Format grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              {REMIX_FORMATS.map((f) => {
                const active = remixFormat === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setRemixFormat(f.id); setRemixResult(null); }}
                    className="text-left p-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                    style={
                      active
                        ? { background: "var(--emerald-soft)", border: "2px solid var(--emerald-fg)" }
                        : { background: "var(--bg-card)", border: "1px solid var(--line)" }
                    }
                  >
                    <p className="text-[12px] font-semibold mb-1" style={{ color: active ? "var(--emerald-fg)" : "var(--fg)" }}>{f.label}</p>
                    <p className="text-[10.5px] leading-snug mb-2" style={{ color: "var(--fg-mute)" }}>{f.desc}</p>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: active ? "var(--emerald-fg)" : "var(--bg)", color: active ? "white" : "var(--fg-mute)" }}
                    >
                      {f.credits} cr
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 disabled:opacity-70"
              style={{ background: "var(--emerald-fg)", color: "white" }}
            >
              <Sparkles className="h-4 w-4" />
              {generating ? "Génération en cours…" : `Générer le ${REMIX_FORMATS.find(f => f.id === remixFormat)?.label} →`}
            </button>
          </section>
        )}

        {/* ── Step 4 : Résultat remix ──────────────────────────────────────── */}
        {remixResult && (
          <section id="remix-result">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>4</span>
              Résultat — prêt à publier
            </div>
            <div
              className="rounded-[18px] p-6"
              style={{ background: "var(--bg-card)", border: "1px solid var(--emerald-line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px]"
                  style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                >
                  ✓ {REMIX_FORMATS.find(f => f.id === remixFormat)?.label} généré
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-110"
                    style={
                      copied
                        ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                        : { background: "var(--bg)", color: "var(--fg-mute)", border: "1px solid var(--line)" }
                    }
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copié !" : "Copier"}
                  </button>
                  <Link
                    href="/marketing-os/studio"
                    className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                    style={{ background: "var(--emerald-fg)", color: "white" }}
                  >
                    Enregistrer dans Studio →
                  </Link>
                </div>
              </div>
              <pre
                className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans"
                style={{ color: "var(--fg)" }}
              >
                {remixResult}
              </pre>
            </div>
          </section>
        )}

      </div>
    </>
  );
}
