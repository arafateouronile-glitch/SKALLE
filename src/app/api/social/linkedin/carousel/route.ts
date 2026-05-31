import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CarouselAngle =
  | "listicle"
  | "how_to"
  | "case_study"
  | "mistakes"
  | "framework";

export type SlideType = "cover" | "content" | "summary" | "cta";

const CoverSlideSchema = z.object({
  type: z.literal("cover"),
  number: z.literal(1),
  title: z.string(),
  subtitle: z.string().optional(),
  hook: z.string(),
  visualSuggestion: z.string(),
  palette: z.enum(["dark", "light", "gradient_blue", "gradient_purple"]),
});

const ContentSlideSchema = z.object({
  type: z.literal("content"),
  number: z.number().int().min(2),
  headline: z.string().optional(),
  title: z.string(),
  body: z.string(),
  keyInsight: z.string().optional(),
  visualSuggestion: z.string(),
});

const SummarySlideSchema = z.object({
  type: z.literal("summary"),
  number: z.number().int(),
  title: z.string(),
  points: z.array(z.string()).min(3).max(7),
  visualSuggestion: z.string(),
});

const CtaSlideSchema = z.object({
  type: z.literal("cta"),
  number: z.number().int(),
  title: z.string(),
  cta: z.string(),
  authorNote: z.string().optional(),
  visualSuggestion: z.string(),
});

const SlideSchema = z.discriminatedUnion("type", [
  CoverSlideSchema,
  ContentSlideSchema,
  SummarySlideSchema,
  CtaSlideSchema,
]);

const ResponseSchema = z.object({
  carouselTitle: z.string(),
  captionPost: z.string(),
  slides: z.array(SlideSchema).min(4).max(14),
});

export type CarouselSlide = z.infer<typeof SlideSchema>;
export type CarouselResponse = z.infer<typeof ResponseSchema>;

// ─── System prompt (static, cached) ──────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en création de carousels LinkedIn viraux.

## RÈGLE ZÉRO — SOURCING IMPÉRATIF (s'applique à chaque slide)

Tout chiffre, statistique ou affirmation factuelle dans n'importe quelle slide DOIT être sourcé.

Format inline sur la slide : "(Source, année)" en fin de ligne ou de point
Exemples : "40% de réduction du turnover (étude Owl Labs, 2023)" | "selon McKinsey 2024"

Si aucune source disponible pour une affirmation chiffrée :
→ Utiliser une observation directe : "dans 4 cas sur 5 dans notre expérience"
→ Ou formuler sans chiffre : "la majorité des équipes que nous accompagnons"
→ Jamais inventer un pourcentage, même "pour illustrer"

Les carousels sont des formats haute-crédibilité (les lecteurs les sauvegardent et les référencent). Une stat inventée dans un carousel cause plus de dommages qu'ailleurs.

Un carousel LinkedIn top 1% a ces caractéristiques :
- Format : PDF uploadé sur LinkedIn (swipeable)
- Chaque slide doit être autonome — compréhensible sans lire les précédents
- La slide 1 (cover) = 80% du succès : elle doit arrêter le scroll dans le feed
- Le lecteur moyen regarde 3-4 slides avant de décider de swiper jusqu'à la fin
- Chaque slide = 1 seule idée, 1 seul point — pas de surcharge
- Les visuels renforcent le message : chaque slide doit avoir une suggestion visuelle précise

## Anatomie d'un carousel performant

**Slide 1 — Cover**
- Titre : le bénéfice ou la promesse en 5-8 mots max
- Hook : 1 ligne qui force le swipe ("Slide 2 →" ou "Swipe si tu veux...")
- Visuel : contraste élevé, texte lisible même en miniature
- Ne pas mettre : le nom de l'auteur (c'est visible dans le post)

**Slides de contenu (2 à N-2)**
- Headline : numéro ou catégorie ("Erreur #1", "Étape 2", "Principe clé")
- Titre : l'insight en 4-6 mots
- Body : explication en 2-3 lignes MAX — dense, sans rembourrage
- Key insight : 1 formule mémorable en 1 ligne (optionnel)
- Visuel : illustration ou métaphore visuelle précise

**Slide avant-dernière — Summary (récap)**
- Liste des points clés (bullets) — scannables, 5 mots max par point
- Titre : "À retenir", "Les X clés", "En résumé"

**Dernière slide — CTA**
- Titre court : question ou invitation
- CTA : action précise (suivre, DM, commenter)
- Note auteur : valeur ajoutée pour le lecteur (pas "contactez-moi")

## Règles des suggestions visuelles

Chaque suggestion doit être :
- Suffisamment précise pour qu'un designer Canva puisse l'exécuter
- En lien direct avec le contenu de la slide
- Éviter les suggestions vagues ("image illustrative", "photo générique")
- Format : "[élément principal] + [contexte/style] + [couleurs suggérées]"

## Caption LinkedIn du post

Le post qui accompagne le carousel est crucial :
- Hook en première ligne (arrête le scroll)
- 2-3 lignes max de contexte
- "Slide 1/N → ... → Slide N/N" (résumé en emojis)
- 3-5 hashtags en fin

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    topic: string;
    angle: CarouselAngle;
    nSlides: number;
  };

  const { topic, angle, nSlides = 8 } = body;
  if (!topic?.trim() || !angle) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const clampedSlides = Math.min(Math.max(nSlides, 6), 12);

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "repurpose_multi");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice as Record<string, unknown> | null;
  const contentSlides = clampedSlides - 2; // cover + cta, summary is separate

  const ANGLE_INSTRUCTIONS: Record<CarouselAngle, string> = {
    listicle: `Structure : Cover → ${contentSlides} items numérotés ("Item #1", "Item #2"...) → Summary → CTA. Chaque item = 1 point de la liste.`,
    how_to: `Structure : Cover → ${contentSlides} étapes ("Étape 1", "Étape 2"...) → Summary → CTA. Chaque étape = 1 action concrète.`,
    case_study: `Structure : Cover → Contexte → Problème → Solution en ${contentSlides - 2} slides → Résultats → Summary → CTA.`,
    mistakes: `Structure : Cover → ${contentSlides} erreurs courantes ("Erreur #1"...) → Summary → CTA. Chaque erreur = problème + solution.`,
    framework: `Structure : Cover → Introduction du framework → ${contentSlides} composants du framework → Summary → CTA.`,
  };

  const voiceInstruction = linkedInVoice
    ? `\nTon de voix calibré : ${linkedInVoice.writingStyleDescription ?? "direct et expert"}`
    : "";

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Crée un carousel LinkedIn de ${clampedSlides} slides sur ce sujet :

**SUJET :** ${topic.trim()}
**ANGLE :** ${ANGLE_INSTRUCTIONS[angle]}
**MARQUE :** ${workspace.name}
**NICHE :** ${bv?.niche ?? "non définie"}${voiceInstruction}

Structure exacte attendue :
- Slide 1 : cover (obligatoire)
- Slides 2 à ${clampedSlides - 1} : contenu (${clampedSlides - 2} slides)
  → dont 1 slide "summary" en avant-dernière position (slide ${clampedSlides - 1})
- Slide ${clampedSlides} : cta (obligatoire)

Total : exactement ${clampedSlides} slides.

Génère aussi :
- carouselTitle : titre court de la série (5-8 mots)
- captionPost : le post LinkedIn qui accompagnera le carousel (hook + 2-3 lignes + emojis slides + hashtags)

JSON attendu :
{
  "carouselTitle": "...",
  "captionPost": "Post LinkedIn complet avec hook, contexte, navigation slides, hashtags",
  "slides": [
    {
      "type": "cover",
      "number": 1,
      "title": "Titre principal (5-8 mots)",
      "subtitle": "Sous-titre optionnel",
      "hook": "Swipe pour découvrir →",
      "visualSuggestion": "Description précise pour un designer Canva",
      "palette": "dark | light | gradient_blue | gradient_purple"
    },
    {
      "type": "content",
      "number": 2,
      "headline": "Erreur #1 / Étape 1 / etc.",
      "title": "Titre court (4-6 mots)",
      "body": "Explication en 2-3 lignes denses",
      "keyInsight": "Formule mémorable en 1 ligne (optionnel)",
      "visualSuggestion": "..."
    },
    ...autres slides de contenu...,
    {
      "type": "summary",
      "number": ${clampedSlides - 1},
      "title": "À retenir",
      "points": ["Point 1", "Point 2", "..."],
      "visualSuggestion": "..."
    },
    {
      "type": "cta",
      "number": ${clampedSlides},
      "title": "Titre court",
      "cta": "Action précise",
      "authorNote": "Valeur ajoutée pour le lecteur (optionnel)",
      "visualSuggestion": "..."
    }
  ]
}

JSON valide uniquement. Exactement ${clampedSlides} slides dans le tableau.`),
  ]);

  const raw = Array.isArray(response.content)
    ? response.content
        .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
        .join("")
    : String(response.content);

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: CarouselResponse;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur de génération — réessayez" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
