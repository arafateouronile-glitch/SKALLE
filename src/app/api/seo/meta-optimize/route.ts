import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

const RequestSchema = z.object({
  content: z.string().min(100),
  keyword: z.string().min(1),
  title: z.string().optional(),
});

const ResponseSchema = z.object({
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(50).max(170),
});

export type MetaOptimizeResponse = z.infer<typeof ResponseSchema>;

const SYSTEM_PROMPT = `Tu es un expert en SEO et copywriting de snippets Google. Tu génères des balises meta title et meta description qui maximisent le CTR (taux de clic) dans les SERP tout en étant parfaitement optimisées pour le référencement.

RÈGLES META TITLE (non négociables) :
- Longueur : 50-60 caractères exactement (ni plus, ni moins)
- Le mot-clé principal doit apparaître en PREMIER ou dans les 3 premiers mots
- Format qui performe : [Mot-clé] : [Bénéfice concret] | [Marque optionnelle]
- Éviter : "Guide complet", "Tout savoir sur", "Comment" en début de titre
- Inclure un chiffre quand pertinent (augmente le CTR de 36% selon une analyse Backlinko)
- Pas de majuscules à chaque mot (sauf le premier et les noms propres)

RÈGLES META DESCRIPTION (non négociables) :
- Longueur : 140-155 caractères exactement
- Le mot-clé doit apparaître naturellement dans les 50 premiers caractères
- Structure : [Problème/situation du lecteur] + [Ce qu'il va trouver] + [CTA implicite ou question]
- Un bénéfice concret et mesurable si possible
- Finir par une action ou une question qui donne envie de cliquer
- Jamais "Dans cet article, nous allons voir..."

Réponds UNIQUEMENT en JSON valide :
{"metaTitle": "...", "metaDescription": "..."}`;

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

  const { content, keyword, title } = body;

  // Extraire un extrait représentatif de l'article (intro + quelques H2)
  const lines = content.split("\n").filter((l) => l.trim());
  const intro = lines.slice(0, 8).join("\n");
  const h2s = lines.filter((l) => l.startsWith("## ")).slice(0, 6).join("\n");

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Génère le meta title et la meta description optimisés pour cet article.

MOT-CLÉ PRINCIPAL : "${keyword}"
TITRE H1 (si disponible) : "${title ?? "(non fourni)"}"

INTRODUCTION DE L'ARTICLE :
${intro}

SECTIONS PRINCIPALES (H2) :
${h2s || "(non disponibles)"}

Génère les metas maintenant. JSON valide uniquement.`),
  ]);

  const raw =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .map((b: { type: string; text?: string } | string) =>
              typeof b === "string" ? b : (b.text ?? "")
            )
            .join("")
        : "";

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = ResponseSchema.parse(JSON.parse(cleaned));
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Erreur de génération" }, { status: 500 });
  }
}
