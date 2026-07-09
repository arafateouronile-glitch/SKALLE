import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `Tu analyses un screenshot d'une interface logicielle (SaaS, app web ou desktop).
Génère une description courte et précise en 2-3 phrases, en français, qui sera injectée dans un prompt de génération vidéo IA.

Ta description doit couvrir :
1. Les éléments UI visibles : type d'écran (dashboard, formulaire, tableau, analytics, éditeur…), couleurs dominantes, disposition générale
2. L'ambiance de l'interface : moderne / minimaliste / data-heavy / colorée / sobre
3. Ce que l'utilisateur fait ou voit : consulter des métriques, éditer du contenu, naviguer dans un CRM, etc.

Format attendu : 2-3 phrases courtes, factuel, visuel. Commence directement par la description, pas d'intro.
Exemple : "Dashboard analytique avec graphes en barres bleues, sidebar de navigation gauche, et 4 KPIs affichés en haut. Interface épurée sur fond blanc. L'utilisateur consulte des données de performance marketing."`;

export async function POST(request: Request) {
  const session = (await auth()) as Session | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.startsWith("sk-")) {
    return NextResponse.json({ error: "OPENAI_API_KEY non configurée." }, { status: 503 });
  }

  let base64Image: string;
  let mimeType = "image/jpeg";

  try {
    const formData = await request.formData();
    const frameFile = formData.get("frameFile") as File | null;

    if (!frameFile) {
      return NextResponse.json({ error: "frameFile requis." }, { status: 400 });
    }

    if (frameFile.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Frame trop volumineuse (max 4 Mo)." }, { status: 400 });
    }

    mimeType = frameFile.type || "image/jpeg";
    const buffer = Buffer.from(await frameFile.arrayBuffer());
    base64Image = buffer.toString("base64");
  } catch {
    return NextResponse.json({ error: "Erreur lecture fichier." }, { status: 400 });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 180,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: SYSTEM_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[analyze-screen] GPT-4o error:", err);
    return NextResponse.json({ error: "Erreur analyse Vision IA." }, { status: 502 });
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const description = data.choices?.[0]?.message?.content?.trim() ?? "";
  return NextResponse.json({ description });
}
