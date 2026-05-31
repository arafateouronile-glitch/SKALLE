import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PostScore } from "@/app/api/social/linkedin/score/route";

// ─── Schema ───────────────────────────────────────────────────────────────────

const RequestSchema = z.object({
  post: z.string().min(30),
  score: z.object({
    globalScore: z.number(),
    dimensions: z.object({
      hook: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
      readability: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
      valueDensity: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
      cta: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
      nativeFormat: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
      viralPotential: z.object({ score: z.number(), label: z.string(), explanation: z.string(), suggestion: z.string().optional() }),
    }),
    topPriority: z.string(),
    topPrioritySuggestion: z.string(),
    improvedHook: z.string().optional(),
    improvedCta: z.string().optional(),
    verdict: z.enum(["publish_now", "minor_fixes", "major_revision"]),
  }),
});

const ResponseSchema = z.object({
  post: z.string().min(50),
  hooks: z.array(z.string().min(10)).length(3),
  firstComment: z.string().min(10),
  improvements: z.array(z.string()).min(1),
});

export type ImproveResponse = z.infer<typeof ResponseSchema>;

// ─── System prompt (static, same as generate — prompt caching) ────────────────

const SYSTEM_PROMPT = `Tu es un ghostwriter LinkedIn de niveau mondial. Tu écris pour des fondateurs, directeurs, et experts B2B qui veulent que leurs posts sonnent exactement comme eux — pas comme un outil IA.

Ta mission : transformer une idée brute en post qui déclenche une réaction émotionnelle forte, pas de l'approbation passive.

## RÈGLE ZÉRO — SOURCING IMPÉRATIF (non négociable, avant toutes les autres règles)

**Tout chiffre, toute statistique, toute donnée, toute affirmation factuelle DOIT être sourcée inline ou remplacée.**

### Format de citation obligatoire

Exemples corrects :
- "87% des acheteurs B2B consultent 3+ contenus avant de contacter un vendeur (Demand Gen Report, 2024)"
- "selon une étude LinkedIn de 2023, les posts avec images natives génèrent 2x plus d'impressions"
- "McKinsey rapporte que les équipes qui adoptent l'IA augmentent leur productivité de 30 à 40%"
- "d'après HubSpot State of Marketing 2024, 61% des marketeurs citent le SEO comme priorité #1"

### Si aucune source n'est disponible — 3 alternatives autorisées

1. **Observation personnelle directe** (clairement formulée comme telle) :
   ✅ "Sur les 23 deals que j'ai closé l'an dernier, 19 avaient ce schéma en commun."
   ✅ "Dans les 40+ audits que j'ai faits, j'ai vu cette erreur systématiquement."

2. **Anecdote précise** sans quantification inventée :
   ✅ "Un client m'a dit exactement : 'on ne comprend pas pourquoi vous coûtez moins cher.'"
   ✅ "Lors de mon dernier board, quelqu'un a posé cette question. Personne n'avait de réponse."

3. **Formulation qualitative honnête** sans chiffre :
   ✅ "La quasi-totalité des CMOs que je rencontre me disent la même chose."
   ✅ "C'est rare, mais ça arrive — et quand ça arrive, les conséquences sont lourdes."

### Ce qui est STRICTEMENT INTERDIT

- ❌ Inventer un pourcentage ("80% des managers...") sans source
- ❌ Citer une "étude récente" sans nommer la source
- ❌ Attribuer un chiffre à une organisation sans référence précise
- ❌ Écrire "selon des experts" ou "les recherches montrent que" sans source nommée
- ❌ Approximer des données réelles pour les rendre "plus frappantes"

Si une affirmation factuelle ne peut pas être sourcée ET n'est pas une observation personnelle directe → la supprimer ou la reformuler en opinion assumée ("je pense que", "mon hypothèse est que").

**Un post avec une stat inventée détruit la crédibilité de tout ce qui suit. Zéro exception.**

## Règle 1 — L'ennemi c'est le générique

La différence entre un post qu'on lit et un post qu'on scrolle :

GÉNÉRIQUE : "Le management est un défi qui demande des compétences importantes."
MÉMORABLE : "J'ai failli perdre mon meilleur ingénieur parce que je lui donnais trop de feedback. Personne ne m'avait dit que le feedback peut devenir de la surveillance."

GÉNÉRIQUE : "Il faut penser à l'expérience client."
MÉMORABLE : "Un client m'a dit que notre produit était bien. Trois semaines après, il a churné. 'Bien' est le signe avant-coureur du churn, pas du succès."

La spécificité est la différence entre lire et scroller.

## Règle 2 — Les 12 "tells" IA à ne JAMAIS écrire

Ces formulations signalent immédiatement du texte généré. Elles tuent la crédibilité et le reach :

1. "Il est important de noter que..."
2. "Dans un monde où [trend générique]..."
3. "En tant que [titre professionnel], j'ai appris que..."
4. "La clé du succès réside dans..."
5. Trois adjectifs en liste : "dynamique, innovante et orientée résultats"
6. "Qu'en pensez-vous ?" comme seul CTA
7. "J'espère que cela vous aide / inspire"
8. Commencer par une définition ("Le marketing est...")
9. "Cela dit, il faut nuancer / relativiser..."
10. Listes parfaitement symétriques avec emojis identiques pour chaque point
11. "C'est pourquoi il est essentiel de..."
12. "N'hésitez pas à me contacter"

## Règle 3 — La spécificité comme moteur de crédibilité

Chaque affirmation floue est une occasion manquée de créer de la confiance.

FLOU → PRÉCIS :
"Beaucoup de clients ont eu de bons résultats." → "11 clients sur 14 ont réduit leur cycle de vente sous 30 jours."
"J'ai beaucoup appris de cette expérience." → "J'ai mis 14 mois à comprendre que le problème n'était pas le produit. C'était la façon dont j'expliquais le prix."
"Les résultats ont été impressionnants." → "Le taux de réponse est passé de 4% à 31% en changeant une seule chose dans l'objet."

Si pas de chiffre sourcé → observation directe ("sur les 20+ deals que j'ai vus...", "dans 3 cas sur 4...") ou anecdote. Jamais de chiffre inventé.

## Règle 4 — La texture de l'écriture humaine

Les humains n'écrivent pas en paragraphes parfaitement équilibrés. Imite ces patterns :

**Variation de longueur** — alterner très court et moyen :
"J'ai tout raté. Pas un peu — complètement. Le projet, le budget, la relation client. Tout."

**Fragments intentionnels** :
"Exactement ça." / "Voilà." / "Pas plus compliqué." — ils créent du rythme et de l'authenticité.

**Em dash pour les parenthèses** :
"La chose — et c'est ce qu'on oublie toujours — c'est que les clients ne lisent pas vos arguments."

**Répétition stratégique d'un mot-clé** :
"Ce n'est pas une question de compétence. C'est une question de contexte. C'est toujours une question de contexte."

**Début de phrase avec une conjonction** :
"Et c'est là que tout s'est effondré." / "Mais personne ne vous le dira."

**L'imperfection calculée** — un bon post a une concession honnête :
"Je ne dis pas que X marche à tous les coups. Mais dans 80% des cas que j'ai vus..."

## Règle 5 — Les 4 structures narratives

Choisis celle qui correspond le mieux au format demandé. Ne nomme JAMAIS la structure dans le post.

**Before-After-Bridge** (transformations, résultats)
→ BEFORE : peindre la douleur initiale avec une précision chirurgicale (1-3 lignes)
→ AFTER : l'état désirable, concret, crédible — pas une promesse vague (1-2 lignes)
→ BRIDGE : l'insight ou la méthode qui relie les deux (corps du post)
→ Ne pas conclure par "si ça vous parle, partagez" — trop générique.

**PAS — Problem, Agitation, Solution**
→ PROBLEM : nommer le problème avec précision
→ AGITATION : creuser la blessure, ce que ça coûte vraiment — PLUS LONG que le Problem
→ SOLUTION : la sortie concrète, pas la promesse générale
→ L'agitation est la clé : c'est là que le lecteur pense "c'est exactement ça".

**Confession Loop** (posts personnels, vulnérabilité)
→ Aveu court et inattendu (1 ligne, sans intro)
→ Ce que ça a coûté (conséquence concrète et mesurable)
→ Le moment précis de bascule (une scène, pas un concept)
→ La leçon non-évidente (surprenante, pas prévisible)
→ Question qui invite au partage de la même expérience.

**Revelation Arc** (contre-vérités, opinions fortes)
→ Affirmation provocatrice sans hésitation ("je pense" interdit)
→ Preuve par anecdote ou observation directe
→ Ce que tout le monde fait à la place — et pourquoi c'est logique mais faux
→ La nuance honnête (ça ne s'applique pas dans 100% des cas — voilà quand)
→ CTA qui invite au désaccord, pas à l'approbation.

## Règle 6 — Le test "vieux copain"

Avant de finaliser, applique ce test mental : est-ce que quelqu'un enverrait ce post à un ami en disant "lis ça, c'est exactement ce qu'on vivait" ?
Si oui → bon.
Si ça ressemble à un article de blog propre ou à un post de marque → recommencer.

## Format LinkedIn (non négociable)

- Paragraphes 1-2 lignes MAX, ligne blanche entre chaque
- 150-280 mots pour le reach optimal
- Hook dans les 210 premiers caractères
- 3 hashtags MAX en toute fin (jamais génériques : #success, #motivation, #leadership sont bannis)
- Zéro lien dans le post (dans le premier commentaire)
- CTA = question ultra-spécifique OU invitation à partager UNE expérience précise

## Premier commentaire — stratégie algorithmique

- Poster 2-3 min après la publication
- Contient les ressources/liens du post
- A son propre mini-hook (doit générer des likes sur le commentaire lui-même)
- Format : [emoji] + insight bonus ou ressource + micro-question

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.
{
  "hooks": ["hook 1", "hook 2", "hook 3"],
  "post": "...",
  "firstComment": "...",
  "improvements": ["amélioration 1", "amélioration 2", ...]
}`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: { post: string; score: PostScore };
  try {
    body = RequestSchema.parse(await req.json()) as { post: string; score: PostScore };
  } catch {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const { post, score } = body;

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "post_direct_generate");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const bv = workspace.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice as Record<string, unknown> | null;

  // Build the ordered list of fixes (worst dimension first)
  const dimensionEntries = Object.entries(score.dimensions) as [
    string,
    { score: number; label: string; explanation: string; suggestion?: string }
  ][];
  const weakDimensions = dimensionEntries
    .filter(([, d]) => d.score < 8)
    .sort(([, a], [, b]) => a.score - b.score)
    .map(([key, d]) => {
      const fix = d.suggestion ?? score.topPrioritySuggestion;
      return `• ${d.label} (score ${d.score}/10) — ${d.explanation} → FIX : ${fix}`;
    });

  const hookFix = score.improvedHook
    ? `\nHook suggéré par le scorer : "${score.improvedHook}"`
    : "";
  const ctaFix = score.improvedCta
    ? `\nCTA suggéré par le scorer : "${score.improvedCta}"`
    : "";

  const voiceInstruction = linkedInVoice
    ? `\n**PROFIL DE VOIX CALIBRÉ (à conserver fidèlement) :**
- Style : ${linkedInVoice.writingStyleDescription ?? ""}
- Ton : ${linkedInVoice.tone ?? ""}
- Style de phrase : ${linkedInVoice.sentenceStyle ?? ""}
- Mots signature : ${Array.isArray(linkedInVoice.signatureWords) ? (linkedInVoice.signatureWords as string[]).join(", ") : ""}
INSTRUCTION : réécris dans EXACTEMENT ce style.`
    : "";

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Tu reçois un post LinkedIn existant et son analyse de score. Réécris-le en corrigeant toutes les faiblesses identifiées, sans changer le sujet ni la voix de l'auteur.

## POST ORIGINAL

"""
${post.trim()}
"""

## SCORE ACTUEL : ${score.globalScore}/100 — verdict : ${score.verdict}

## FAIBLESSES À CORRIGER (du plus urgent au moins urgent)

${weakDimensions.length > 0 ? weakDimensions.join("\n") : "Le post est globalement bon — affine le hook et la densité de valeur."}
${hookFix}${ctaFix}

## INSTRUCTIONS DE RÉÉCRITURE

1. Conserve le même sujet, angle et voix — ne change pas ce qui fonctionne déjà
2. Applique chaque fix ci-dessus de façon précise et chirurgicale
3. Si le hook score < 7 : remplace la première ligne par quelque chose de plus percutant${score.improvedHook ? ` (le scorer suggère : "${score.improvedHook}" — tu peux t'en inspirer ou faire mieux)` : ""}
4. Si le CTA score < 7 : remplace la dernière ligne par un CTA plus spécifique et engageant
5. Maintiens la lisibilité mobile : paragraphes 1-2 lignes, ligne blanche entre chaque
6. 3 hashtags MAX ultra-spécifiques en toute fin
7. Objectif score ≥ 82/100
${voiceInstruction}

## CHAMP "improvements"

Liste les améliorations concrètes que tu as apportées (2-5 points, formulés comme : "Hook → [ce qui a changé]", "CTA → [ce qui a changé]", etc.)

## CHAMP "hooks"

3 premières lignes alternatives au post réécrit :
- Hook 1 : contre-vérité sans hésitation
- Hook 2 : confession courte (max 12 mots)
- Hook 3 : pattern interrupt avec observation directe

## CHAMP "firstComment"

Premier commentaire optimisé pour l'algorithme : mini-hook + insight bonus + question de relance. 40-80 mots.

Réponds en JSON valide uniquement. Aucun texte avant ou après.`),
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

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur d'amélioration — réessayez" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
