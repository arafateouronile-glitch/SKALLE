import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { RawPersona } from "@/lib/ai/persona-enhancer";
import type { LinkedInTrigger, LinkedInFormat } from "@/app/api/social/linkedin/generate/route";

const TRIGGERS: LinkedInTrigger[] = [
  "curiosity_gap",
  "identity_validation",
  "tribal_belonging",
  "productive_discomfort",
  "aspiration",
  "status_signal",
];
const FORMATS: LinkedInFormat[] = ["post_court", "storytelling", "listicle", "how_to", "contrarian"];

const AngleSchema = z.object({
  subject: z.string().min(10),
  trigger: z.enum(TRIGGERS as [LinkedInTrigger, ...LinkedInTrigger[]]),
  format: z.enum(FORMATS as [LinkedInFormat, ...LinkedInFormat[]]),
  reason: z.string().min(5),
});

const ResponseSchema = z.object({ angles: z.array(AngleSchema).min(3).max(5) });

const SYSTEM_PROMPT = `Tu es un stratège de contenu LinkedIn spécialisé en prospection B2B. On te donne un persona cible (ICP) réellement utilisé pour de la prospection commerciale — pas un persona marketing générique.

Ta mission : proposer 3 à 5 angles de posts LinkedIn qui parleront directement aux douleurs (painPoints) de CE persona précis. Le but n'est pas de "faire du contenu" — c'est d'attirer et de faire réagir les gens qui correspondent exactement à ce profil, pour chauffer l'outbound et générer de l'inbound sur ce segment.

Règles :
- Chaque angle doit être ancré sur UN painPoint ou UNE réalité concrète du persona (jobTitles/industry/keywords), jamais une généralité applicable à n'importe qui
- "subject" = l'angle précis à donner au générateur de post (une phrase actionnable, pas un titre vague)
- "trigger" = un des 6 déclencheurs émotionnels disponibles : curiosity_gap, identity_validation, tribal_belonging, productive_discomfort, aspiration, status_signal
- "format" = un des 5 formats disponibles : post_court, storytelling, listicle, how_to, contrarian
- "reason" = une phrase expliquant pourquoi CE persona réagira à cet angle précisément
- Varie les triggers et formats entre les suggestions — ne propose pas 5 fois le même

Réponds UNIQUEMENT en JSON valide : { "angles": [{ "subject": "...", "trigger": "...", "format": "...", "reason": "..." }] }`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = (await req.json()) as { personaId?: string };
  if (!body.personaId) return NextResponse.json({ error: "personaId requis" }, { status: 400 });

  const persona = await prisma.persona.findFirst({
    where: { id: body.personaId, workspace: { userId: session.user.id } },
    select: { name: true, raw: true },
  });
  if (!persona) return NextResponse.json({ error: "Persona introuvable" }, { status: 404 });

  // eslint-disable-next-line react-hooks/rules-of-hooks -- useCredits n'est pas un hook React, juste un nom préfixé "use"
  const creditResult = await useCredits(session.user.id, "content_angle_suggest");
  if (!creditResult.success) {
    return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
  }

  const raw = persona.raw as unknown as RawPersona;
  const model = getClaude();

  const response = await model.invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(`Persona cible (ICP) : ${persona.name}
Secteur : ${raw.industry ?? "non défini"}
Intitulés de poste ciblés : ${raw.jobTitles?.join(", ") || "non définis"}
Douleurs (painPoints) : ${raw.painPoints?.join(" | ") || "non définies"}
Mots-clés : ${raw.keywords?.join(", ") || "non définis"}

Propose 3 à 5 angles de posts LinkedIn ancrés sur ces douleurs précises. Réponds en JSON valide uniquement.`),
  ]);

  const raw_ = Array.isArray(response.content)
    ? response.content.map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? "")).join("")
    : String(response.content);
  const cleaned = raw_.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Erreur de génération — réessayez" }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
