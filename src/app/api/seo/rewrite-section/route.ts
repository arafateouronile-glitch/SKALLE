import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

const RequestSchema = z.object({
  section: z.string().min(20).max(3000),
  keyword: z.string().min(1),
  instruction: z.string().optional(),
});

const SYSTEM_PROMPT = `Tu es un rédacteur SEO expert spécialisé dans l'amélioration de passages d'articles. Tu reçois un extrait d'article et tu le réécris pour le rendre meilleur : plus humain, plus précis, plus engageant, mieux structuré.

RÈGLES DE RÉÉCRITURE :
1. Conserver le sens, le sujet et les informations clés — ne pas inventer de nouveaux faits
2. Améliorer la fluidité et le rythme : varier les longueurs de phrase, supprimer les répétitions
3. Éliminer le style "IA générique" : pas de "Il est important de noter", "Dans le contexte actuel", "De nos jours"
4. Rendre plus concret : transformer les généralités en exemples ou observations précises
5. Si le passage contient des listes, les rendre plus percutantes (items plus courts, formulations actives)
6. Maintenir le format Markdown du passage original (titres, listes, gras)
7. Intégrer naturellement le mot-clé cible si absent ou mal placé
8. Longueur finale : ±15% de la longueur originale (ni trop court, ni trop long)

Tu réponds UNIQUEMENT avec le texte réécrit. Pas de commentaire, pas d'explication, pas de guillemets. Juste le Markdown réécrit.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const { section, keyword, instruction } = body;

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Réécris ce passage pour l'améliorer.

MOT-CLÉ CIBLE : "${keyword}"
${instruction ? `INSTRUCTION SPÉCIFIQUE : ${instruction}` : ""}

PASSAGE ORIGINAL :
---
${section}
---

Réécris maintenant.`),
  ]);

  const rewritten =
    typeof response.content === "string"
      ? response.content.trim()
      : Array.isArray(response.content)
        ? response.content
            .map((b: { type: string; text?: string } | string) =>
              typeof b === "string" ? b : (b.text ?? "")
            )
            .join("")
            .trim()
        : "";

  if (!rewritten) {
    return NextResponse.json({ error: "Erreur de génération" }, { status: 500 });
  }

  return NextResponse.json({ rewritten });
}
