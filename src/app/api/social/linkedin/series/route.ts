import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

export type SeriesAngle =
  | "founder_journey"
  | "expertise"
  | "thought_leadership"
  | "case_study"
  | "contrarian_take";

const ANGLE_LABELS: Record<SeriesAngle, string> = {
  founder_journey:
    "Parcours fondateur — histoire personnelle, les hauts et bas, les leçons apprises en chemin",
  expertise:
    "Expertise sectorielle — partage de savoir profond, démonstration de maîtrise sur le sujet",
  thought_leadership:
    "Thought leadership — vision du futur, position forte sur l'état de l'industrie",
  case_study:
    "Étude de cas — résultats concrets, avant/après, données mesurables",
  contrarian_take:
    "Point de vue contrarian — opinion impopulaire mais argumentée, brise les idées reçues",
};

const SeriesPostSchema = z.object({
  day: z.number().int().min(1).max(5),
  dayLabel: z.enum(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]),
  theme: z.string().min(5),
  format: z.enum(["storytelling", "listicle", "how_to", "contrarian", "aspiration"]),
  emoji: z.string(),
  post: z.string().min(50),
  firstComment: z.string().min(10),
});

const ResponseSchema = z.object({
  seriesTitle: z.string().min(5),
  posts: z.array(SeriesPostSchema).length(5),
});

export type SeriesPost = z.infer<typeof SeriesPostSchema>;
export type SeriesResponse = z.infer<typeof ResponseSchema>;

// System prompt cached (>1024 tokens for Anthropic prompt caching)
const SYSTEM_PROMPT = `Tu es un ghostwriter LinkedIn de niveau mondial spécialisé dans les séries de contenu cohérentes.

## RÈGLE ZÉRO — SOURCING IMPÉRATIF (s'applique à chacun des 5 posts)

Tout chiffre, statistique, donnée ou affirmation factuelle DOIT être sourcée inline ou remplacée.

Format obligatoire : "selon [Source, année]" | "d'après [Source]" | "[Chiffre] (Source, année)"
Exemples : "selon McKinsey 2024", "d'après HubSpot State of Sales 2023", "une étude LinkedIn de 2023 montre que..."

Si aucune source disponible → 3 alternatives seulement :
1. Observation personnelle directe : "Sur les 20+ cas que j'ai vus..." / "Dans 3 situations sur 4 dans mon expérience..."
2. Anecdote précise sans quantification inventée
3. Formulation qualitative honnête : "la quasi-totalité de..." / "c'est systématique dans ce contexte"

STRICTEMENT INTERDIT : inventer un pourcentage, citer "une étude récente" sans nommer la source, attribuer un chiffre sans référence.
Un post avec une stat inventée dans une série fait perdre la crédibilité de tous les autres posts.

## Principe cardinal : 5 posts qui se lisent seuls mais forment un tout

Chaque post est autonome. Quelqu'un qui lit uniquement le Mercredi doit trouver de la valeur. Mais l'audience qui suit toute la semaine vit une progression narrative.

## Règle anti-générique (s'applique à chaque post de la série)

Ces formulations tuent le reach et la crédibilité — JAMAIS :
- "Il est important de noter que..."
- "Dans un monde où..."
- "La clé du succès réside dans..."
- "Qu'en pensez-vous ?" comme seul CTA
- Listes symétriques avec emojis identiques
- Affirmations sans ancrage (pas de "beaucoup", "souvent", "généralement" non étayés)

## Arc narratif des 5 jours

**Jour 1 — Lundi — Storytelling**
Commence IN MEDIAS RES — directement dans la scène, pas dans le contexte.
RATÉ : "Il y a quelques années, alors que je dirigeais une équipe..."
RÉUSSI : "Mon meilleur commercial a démissionné. Par SMS. Un dimanche soir."
Structure : scène d'ouverture → tension → bascule → leçon non-évidente → question sur l'expérience similaire du lecteur.
Le Jour 1 pose une question implicite à laquelle la semaine va répondre.

**Jour 2 — Mardi — Listicle de valeur**
4-6 points MAX. Le hook est une affirmation provocatrice, pas "X choses que vous ne savez pas sur Y".
Chaque point = titre fort (1 ligne) + explication concrète avec un exemple ou chiffre (1 ligne). Jamais juste le titre.
Le dernier point est le plus surprenant ou contre-intuitif.

**Jour 3 — Mercredi — How-to actionnable**
Résultat précis en hook (pas "améliorer X" mais "réduire X de 30 jours" ou "passer de X à Y").
Chaque étape = verbe d'action concret. Inclure obligatoirement une étape contre-intuitive.
La conclusion est une mise en garde, pas un résumé.

**Jour 4 — Jeudi — Contrarian**
Opinion formulée sans hésitation, sans "je pense que". Une opinion timide n'est pas contrariante.
Progression logique qui rend l'opinion évidente rétrospectivement.
Nuance obligatoire + CTA qui invite au désaccord ("Votre expérience dit le contraire ?").

**Jour 5 — Vendredi — Aspiration + Clôture de série**
Leçon universelle tirée de la semaine — non-évidente, non prévisible depuis le Lundi.
Ferme la boucle ouverte le Lundi sans être redondant.
Invitation à partager ce que CETTE semaine a changé dans leur façon de voir le sujet.

## Cohérence narrative

- Le Jour 1 ouvre une tension. Le Jour 5 la résout d'une façon inattendue.
- Les 5 posts couvrent le sujet sous 5 angles différents — pas 5 variations du même point.
- Variation de ton : Lundi (intime) → Mardi (didactique) → Mercredi (précis) → Jeudi (provocateur) → Vendredi (généreux).

## Règles LinkedIn (non négociables)

- Paragraphes 1-2 lignes MAX, ligne blanche entre chaque
- 150-280 mots par post
- Hook dans les 210 premiers caractères
- 3 hashtags MAX en fin, jamais génériques
- Zéro lien dans le post (premier commentaire)
- ZÉRO lien dans le post — dans le premier commentaire
- CTA final = question ouverte ou invitation à commenter

## Premier commentaire (par post)

- Poster 2-3 min après la publication
- Contient les liens, ressources ou insight bonus
- Commence par un emoji
- Fait le lien avec les autres posts de la série si pertinent

## Règle absolue : zéro statistique inventée

Chiffres sourcés inline ou pas de chiffres. Jamais d'approximations.

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après. Zéro markdown.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    topic: string;
    angle: SeriesAngle;
  };

  const { topic, angle } = body;
  if (!topic?.trim() || !angle) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, domainUrl: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "linkedin_series");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice as Record<string, unknown> | null;
  const model = getClaude();

  const voiceInstruction = linkedInVoice
    ? `\n**PROFIL DE VOIX CALIBRÉ (à imiter fidèlement sur les 5 posts) :**
- Style : ${linkedInVoice.writingStyleDescription ?? ""}
- Hook dominant : ${linkedInVoice.dominantHookType ?? ""}
- Pattern de hook : ${linkedInVoice.hookPattern ?? ""}
- Ton : ${linkedInVoice.tone ?? ""}
- Style de phrase : ${linkedInVoice.sentenceStyle ?? ""}
- Mots signature : ${Array.isArray(linkedInVoice.signatureWords) ? (linkedInVoice.signatureWords as string[]).join(", ") : ""}
INSTRUCTION : tous les posts doivent sonner comme l'auteur lui-même — pas comme un outil IA.`
    : "";

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Génère une série de 5 posts LinkedIn sur ce sujet :

**SUJET / THÈME :** ${topic.trim()}

**ANGLE NARRATIF :** ${ANGLE_LABELS[angle]}

**CONTEXTE MARQUE :**
- Marque : ${workspace.name}${workspace.domainUrl ? ` (${workspace.domainUrl})` : ""}
- Secteur / niche : ${bv?.niche ?? "non défini"}
- Ton de voix : ${bv?.tone ?? "direct et expert"}
- Piliers de contenu : ${Array.isArray(bv?.contentPillars) ? (bv.contentPillars as string[]).join(", ") : "non définis"}
- Proposition de valeur : ${bv?.valueProposition ?? "non définie"}
- Persona cible : ${bv?.targetPersona ?? "non défini"}
${voiceInstruction}

**INSTRUCTIONS :**
1. Génère exactement 5 posts (jours 1 à 5, Lundi à Vendredi)
2. Respecte l'arc narratif : storytelling → listicle → how_to → contrarian → aspiration
3. Chaque post = autonome + cohérent avec la série
4. Format LinkedIn strict : paragraphes courts, ligne blanche, hashtags en fin
5. Premier commentaire stratégique pour chaque post
6. Angle "${ANGLE_LABELS[angle]}" comme fil rouge de la série

Réponds en JSON valide uniquement avec cette structure :
{
  "seriesTitle": "Titre court de la série (5-8 mots)",
  "posts": [
    {
      "day": 1,
      "dayLabel": "Lundi",
      "theme": "Thème du post (5-8 mots)",
      "format": "storytelling",
      "emoji": "🎯",
      "post": "Contenu complet du post LinkedIn",
      "firstComment": "Premier commentaire suggéré (commence par un emoji)"
    },
    {
      "day": 2,
      "dayLabel": "Mardi",
      "theme": "...",
      "format": "listicle",
      "emoji": "📋",
      "post": "...",
      "firstComment": "..."
    },
    {
      "day": 3,
      "dayLabel": "Mercredi",
      "theme": "...",
      "format": "how_to",
      "emoji": "🛠",
      "post": "...",
      "firstComment": "..."
    },
    {
      "day": 4,
      "dayLabel": "Jeudi",
      "theme": "...",
      "format": "contrarian",
      "emoji": "🔥",
      "post": "...",
      "firstComment": "..."
    },
    {
      "day": 5,
      "dayLabel": "Vendredi",
      "theme": "...",
      "format": "aspiration",
      "emoji": "🚀",
      "post": "...",
      "firstComment": "..."
    }
  ]
}

JSON valide uniquement. Aucun texte avant ou après.`),
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

  let parsed: SeriesResponse;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json(
      { error: "Erreur de génération — réessayez" },
      { status: 500 }
    );
  }

  return NextResponse.json(parsed);
}
