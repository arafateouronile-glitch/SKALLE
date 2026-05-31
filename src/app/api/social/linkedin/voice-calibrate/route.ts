import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

const LinkedInVoiceSchema = z.object({
  dominantHookType: z.enum([
    "curiosity_gap",
    "storytelling",
    "contrarian",
    "how_to",
    "confession",
    "stat_choc",
    "question_identitaire",
  ]),
  tone: z.enum([
    "direct_expert",
    "storytelling_personnel",
    "contrarian_assume",
    "educational_didactique",
    "inspirationnel",
  ]),
  sentenceStyle: z.enum(["court_percutant", "moyen_fluide", "long_nuance"]),
  vulnerabilityLevel: z.enum(["low", "medium", "high"]),
  ctaStyle: z.enum(["question_ouverte", "invitation_commenter", "challenge", "aucun"]),
  signatureWords: z.array(z.string()).min(1).max(10),
  writingStyleDescription: z.string().min(30),
  hookPattern: z.string().min(20),
  bestHookExample: z.string().min(10),
  calibratedAt: z.string(),
});

export type LinkedInVoice = z.infer<typeof LinkedInVoiceSchema>;

const SYSTEM_PROMPT = `Tu es un expert en analyse de style d'écriture LinkedIn. Tu analyses des posts LinkedIn pour extraire la signature stylistique unique de leur auteur.

## Ce que tu dois extraire

**dominantHookType** — le type de hook que l'auteur utilise le plus naturellement :
- curiosity_gap : tension entre ce qu'on sait et ce qu'on veut savoir
- storytelling : commence par une situation personnelle ou narrative
- contrarian : ouvre avec une opinion contre-intuitive
- how_to : commence par une promesse de résultat ou d'apprentissage
- confession : ouvre par une vulnérabilité ou aveu
- stat_choc : ouvre par un chiffre ou donnée surprenante
- question_identitaire : question qui interpelle directement l'identité du lecteur

**tone** — le ton dominant dans l'écriture :
- direct_expert : affirmations courtes, pas d'hésitation, autorité assumée
- storytelling_personnel : narration à la première personne, partage d'expériences
- contrarian_assume : position forte, n'hésite pas à contre-dire les idées reçues
- educational_didactique : pédagogie, explique clairement, structure visible
- inspirationnel : élève la cible, vocabulaire d'aspiration et de possibilité

**sentenceStyle** :
- court_percutant : phrases < 10 mots, beaucoup de sauts de ligne, rythme saccadé
- moyen_fluide : phrases 10-20 mots, équilibre entre lisibilité et substance
- long_nuance : phrases complexes, nuances nombreuses, paragraphes denses

**vulnerabilityLevel** — à quel point l'auteur se révèle personnellement :
- low : parle de concepts, rarement de soi, ton professionnel distant
- medium : partage des expériences mais reste dans le rôle d'expert
- high : parle d'échecs, de doutes, montre sa vulnérabilité humaine

**ctaStyle** — comment l'auteur conclut :
- question_ouverte : "Et vous, qu'en pensez-vous ?"
- invitation_commenter : "Dites-moi en commentaire..."
- challenge : "Essayez cette semaine et revenez me dire..."
- aucun : pas de CTA explicite, conclusion naturelle

**signatureWords** — liste de 3-8 mots ou expressions récurrents dans l'écriture de cet auteur (pas des mots génériques)

**writingStyleDescription** — description précise du style en 2-3 phrases, utilisable comme instruction pour imiter ce style

**hookPattern** — description du pattern de hook typique de cet auteur (comment il ouvre ses posts)

**bestHookExample** — copiez mot pour mot la meilleure première ligne parmi les posts fournis

Tu réponds UNIQUEMENT en JSON valide. Zéro texte avant. Zéro texte après.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { posts: string[] };
  const { posts } = body;

  if (!Array.isArray(posts) || posts.length < 2) {
    return NextResponse.json(
      { error: "Minimum 2 posts requis pour calibrer votre voix" },
      { status: 400 }
    );
  }

  const cleanedPosts = posts.map((p) => p.trim()).filter((p) => p.length > 30);
  if (cleanedPosts.length < 2) {
    return NextResponse.json(
      { error: "Les posts fournis sont trop courts — collez vos vrais posts LinkedIn" },
      { status: 400 }
    );
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const creditResult = await useCredits(session.user.id, "social_post");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Analyse le style d'écriture LinkedIn de cet auteur à partir de ses ${cleanedPosts.length} posts :

${cleanedPosts.map((p, i) => `--- POST ${i + 1} ---\n${p}`).join("\n\n")}

Extrais sa signature stylistique unique et réponds en JSON :
{
  "dominantHookType": "...",
  "tone": "...",
  "sentenceStyle": "...",
  "vulnerabilityLevel": "...",
  "ctaStyle": "...",
  "signatureWords": ["...", "..."],
  "writingStyleDescription": "Description précise du style en 2-3 phrases qui permettrait à quelqu'un de l'imiter parfaitement.",
  "hookPattern": "Comment cet auteur ouvre typiquement ses posts — pattern précis.",
  "bestHookExample": "La meilleure première ligne copiée mot pour mot d'un des posts fournis.",
  "calibratedAt": "${new Date().toISOString()}"
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

  let voice: LinkedInVoice;
  try {
    voice = LinkedInVoiceSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur d'analyse — réessayez" }, { status: 500 });
  }

  // Merge into existing brandVoice
  const existingBv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      brandVoice: { ...existingBv, linkedInVoice: voice } as object,
    },
  });

  return NextResponse.json({ voice, postsAnalyzed: cleanedPosts.length });
}

// GET — return current voice profile
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const linkedInVoice = bv?.linkedInVoice ?? null;

  return NextResponse.json({ voice: linkedInVoice });
}
