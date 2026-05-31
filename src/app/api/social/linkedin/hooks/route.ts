import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

const ResponseSchema = z.object({
  hooks: z.array(z.string().min(10)).length(3),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { post: string; subject?: string };
  const { post, subject } = body;

  if (!post?.trim()) {
    return NextResponse.json({ error: "Contenu du post requis" }, { status: 400 });
  }

  const creditResult = await useCredits(session.user.id, "social_post");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({
      content: `Tu es un spécialiste des hooks LinkedIn — les premières lignes qui arrêtent le scroll.

## Ce qu'est un hook top 1%

Un hook est performant quand le lecteur ne peut PAS ne pas lire la suite. Pas parce que la phrase est belle — parce qu'elle crée une tension que seule la lecture résout.

Test : si on peut ignorer la première ligne et comprendre le post sans rien rater → le hook est nul.

## Les 5 types qui sur-performent

1. **Contre-vérité sans hésitation** — affirmée, pas questionnée
   ✅ "La plupart des bons vendeurs font exactement l'inverse de ce qu'on leur enseigne."
   ❌ "Il est possible que certains vendeurs aient une approche différente..."

2. **Aveu inattendu** — court, concret, sans contexte préalable
   ✅ "J'ai failli perdre mon entreprise à cause d'un spreadsheet."
   ❌ "Je voulais partager une expérience personnelle qui m'a marqué..."

3. **Observation directe avec chiffre** — pas inventé, ancré dans l'expérience
   ✅ "Sur les 40 pitchs que j'ai vus cette année, 37 commençaient exactement pareil. Et 37 ont été refusés."
   ❌ "Selon de nombreuses études, les pitchs doivent être percutants."

4. **Pattern interrupt** — phrase qui rompt totalement le rythme du feed LinkedIn
   ✅ "Stop." / "J'ai eu tort." / "Tout le monde ment sur ce sujet."

5. **Question identitaire** — interpelle directement, crée le groupe in/out
   ✅ "Tu envoies encore des cold emails sans personnalisation ? C'est pour ça que personne ne répond."
   ❌ "Avez-vous pensé à améliorer votre approche de prospection ?"

## Ce qui est INTERDIT

- Commencer par "Je suis ravi / fier / heureux..."
- Questions génériques sans tension
- Commencer par "Dans un monde où..."
- Assertions vagues ("Le leadership est essentiel")
- Plus de 15 mots

Réponds UNIQUEMENT en JSON valide. Aucun texte avant ou après.`,
    }),
    new HumanMessage(`Génère 3 hooks alternatifs pour ce post LinkedIn :

POST EXISTANT :
"""
${post.slice(0, 1000)}
"""

${subject ? `SUJET ORIGINAL : ${subject}` : ""}

Instructions :
- 3 hooks alternatifs (ne pas répéter la première ligne actuelle du post)
- Hook 1 : style contre-vérité ou pattern interrupt
- Hook 2 : style chiffre précis ou confession
- Hook 3 : style question identitaire
- Chaque hook = 1 ligne autonome, max 15 mots
- Ne commencent pas par "Je"

Réponds en JSON :
{"hooks": ["hook1", "hook2", "hook3"]}`),
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
    return NextResponse.json({ error: "Erreur de génération" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
