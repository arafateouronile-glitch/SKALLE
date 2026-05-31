import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

const DimensionSchema = z.object({
  score: z.number().int().min(0).max(10),
  label: z.string(),
  explanation: z.string(),
  suggestion: z.string().optional(),
});

const ScoreSchema = z.object({
  globalScore: z.number().int().min(0).max(100),
  dimensions: z.object({
    hook: DimensionSchema,
    readability: DimensionSchema,
    valueDensity: DimensionSchema,
    cta: DimensionSchema,
    nativeFormat: DimensionSchema,
    viralPotential: DimensionSchema,
  }),
  topPriority: z.string(),
  topPrioritySuggestion: z.string(),
  improvedHook: z.string().optional(),
  improvedCta: z.string().optional(),
  verdict: z.enum(["publish_now", "minor_fixes", "major_revision"]),
});

export type PostScore = z.infer<typeof ScoreSchema>;

// ─── System prompt (static, cached) ──────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en performance LinkedIn qui analyse des posts et donne un score précis avec des recommandations actionnables.

## Les 6 dimensions d'un post LinkedIn performant

**1. Hook (0-10) — poids 25%**
La première ligne est la seule chose qui compte pour décider si le lecteur va lire ou scroller.
- 9-10 : Arrête le scroll immédiatement. Crée une tension irrésistible. Techniquement parfait (pas de question générique, pas de "je suis ravi").
- 7-8 : Bon hook, quelques mots à affiner.
- 5-6 : Hook présent mais trop générique ou trop long.
- 0-4 : Commence par "Je", "Nous", un emoji seul, ou une banalité.

**2. Lisibilité (0-10) — poids 20%**
LinkedIn est lu sur mobile, en scrollant vite.
- 9-10 : Paragraphes 1-2 lignes, ligne blanche entre chaque, texte aéré, facile à scanner.
- 7-8 : Bonne structure, quelques paragraphes un peu longs.
- 5-6 : Quelques murs de texte. Lisible mais non optimal.
- 0-4 : Gros blocs de texte, sans respiration. Peu de chances d'être lu en entier.

**3. Valeur dense (0-10) — poids 20%**
Le post délivre-t-il un insight réel, actionnable ou surprenant ?
- 9-10 : Insight unique, non-évident, actionnable ou surprenant. Le lecteur apprend quelque chose.
- 7-8 : Bonne valeur, quelques points génériques.
- 5-6 : Valeur présente mais diluée. Beaucoup de généralités.
- 0-4 : Post vague, creux, rien de nouveau sous le soleil.

**4. CTA (0-10) — poids 15%**
Le CTA déclenche-t-il une action précise ?
- 9-10 : CTA spécifique et engageant. Invite à une action concrète (partager un avis précis, tagger quelqu'un, répondre à une question spécifique).
- 7-8 : Bon CTA, légèrement trop générique.
- 5-6 : CTA présent mais standard ("Qu'en pensez-vous ?").
- 0-4 : Pas de CTA, ou CTA passif ("Likez si vous êtes d'accord").

**5. Format natif (0-10) — poids 10%**
Le post respecte-t-il les règles techniques de LinkedIn ?
- 9-10 : 3-5 hashtags en fin, aucun lien dans le corps, longueur 150-300 mots, pas d'emojis excessifs.
- 7-8 : Un ou deux points à corriger.
- 5-6 : Hashtags dans le corps, ou lien dans le post, ou longueur sous-optimale.
- 0-4 : Plusieurs infractions aux règles LinkedIn.

**6. Potentiel viral (0-10) — poids 10%**
Le post a-t-il les ingrédients pour déclencher des commentaires et des partages ?
- 9-10 : Opinion forte, tension émotionnelle, question clivante. Impossible de ne pas réagir.
- 7-8 : Bon potentiel, quelque chose manque pour déclencher le débat.
- 5-6 : Post safe. Ni heurte, ni inspire.
- 0-4 : Post consensuel, sans aucun relief.

## Score global

Score global = (hook × 2.5) + (readability × 2) + (valueDensity × 2) + (cta × 1.5) + (nativeFormat × 1) + (viralPotential × 1)
Arrondi à l'entier.

## Verdict

- publish_now : score ≥ 75 — prêt à publier
- minor_fixes : score 55-74 — quelques ajustements rapides
- major_revision : score < 55 — révision substantielle nécessaire

## Format de réponse

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.
Pour chaque dimension : score (0-10), label (court, 2-4 mots), explanation (1-2 phrases précises sur ce qui marche ou pas), suggestion (1 phrase actionnable si score < 8).
topPriority : nom de la dimension la plus urgente à corriger.
topPrioritySuggestion : action concrète et précise (pas vague).
improvedHook : si hook < 7, propose une meilleure première ligne (même longueur, même sujet).
improvedCta : si cta < 7, propose un meilleur CTA.`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { post: string };
  const { post } = body;

  if (!post?.trim() || post.trim().length < 30) {
    return NextResponse.json({ error: "Post trop court pour être analysé" }, { status: 400 });
  }

  const creditResult = await useCredits(session.user.id, "social_post");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Analyse ce post LinkedIn et donne un score détaillé :

POST À ANALYSER :
"""
${post.trim()}
"""

Statistiques brutes (calcule-les) :
- Nombre de caractères : ${post.length}
- Nombre de mots : ${post.trim().split(/\s+/).filter(Boolean).length}
- Première ligne : "${post.trim().split("\n")[0]}"
- Nombre de hashtags : ${(post.match(/#\w+/g) ?? []).length}
- Liens dans le corps : ${(post.match(/https?:\/\//g) ?? []).length > 0 ? "oui" : "non"}

Réponds en JSON :
{
  "globalScore": <0-100>,
  "dimensions": {
    "hook": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." },
    "readability": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." },
    "valueDensity": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." },
    "cta": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." },
    "nativeFormat": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." },
    "viralPotential": { "score": <0-10>, "label": "...", "explanation": "...", "suggestion": "..." }
  },
  "topPriority": "nom de la dimension",
  "topPrioritySuggestion": "action concrète et précise",
  "improvedHook": "meilleure première ligne si hook < 7, sinon omis",
  "improvedCta": "meilleur CTA si cta < 7, sinon omis",
  "verdict": "publish_now | minor_fixes | major_revision"
}

JSON valide uniquement.`),
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

  let parsed: PostScore;
  try {
    parsed = ScoreSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur d'analyse — réessayez" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
