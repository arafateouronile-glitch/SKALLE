/**
 * POST /api/onboarding/starter-sequence
 *
 * Génère une séquence d'outreach personnalisée 3-steps
 * basée sur l'ICP du workspace (brand voice + persona).
 *
 * Crée un ProspectTemplate (prospect placeholder) et la séquence
 * dans la DB prête à être clonée vers de vrais prospects.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

export const maxDuration = 45;

const StepSchema = z.object({
  channel: z.enum(["EMAIL", "LINKEDIN", "EMAIL"]),
  subject: z.string().nullable().optional(),
  content: z.string().min(20),
  delayDays: z.number().int().min(0).max(21),
});

const SequenceSchema = z.object({
  name: z.string(),
  steps: z.array(StepSchema).min(2).max(5),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    workspaceId: string;
    icpSummary?: string;
  };
  if (!body.workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: body.workspaceId, userId: session.user.id },
    include: {
      personas: { take: 1, orderBy: { createdAt: "desc" }, select: { name: true, raw: true } },
    },
  });
  if (!ws) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const bv = ws.brandVoice as Record<string, unknown> | null ?? {};
  const persona = ws.personas[0];
  const raw = persona?.raw as Record<string, unknown> | null ?? {};

  const context = [
    `Entreprise : ${ws.name}`,
    bv.offer ? `Offre : ${bv.offer}` : "",
    bv.valueProposition ? `Proposition de valeur : ${bv.valueProposition}` : "",
    raw.industry ? `Secteur cible : ${raw.industry}` : body.icpSummary ? `ICP : ${body.icpSummary}` : "",
    raw.jobTitles && Array.isArray(raw.jobTitles)
      ? `Titres ciblés : ${(raw.jobTitles as string[]).join(", ")}`
      : "",
    raw.painPoints && Array.isArray(raw.painPoints)
      ? `Points de douleur : ${(raw.painPoints as string[]).join(", ")}`
      : "",
    raw.messagingAngle ? `Angle message : ${raw.messagingAngle}` : "",
    ws.calendarLink ? `Lien calendrier : ${ws.calendarLink}` : "",
  ].filter(Boolean).join("\n");

  const claude = getClaude();
  const response = await claude.invoke([
    new SystemMessage(`Tu es un expert en copywriting cold email B2B.
Tu génères des séquences d'outreach personnalisées, naturelles, non-spammy.
Style : court, direct, centré sur la valeur pour le prospect. Jamais de superlatifs.
Utilise {{prénom}} et {{entreprise}} comme variables de personnalisation.
Réponds UNIQUEMENT avec un JSON valide, sans markdown.`),
    new HumanMessage(`Génère une séquence d'outreach B2B 3 steps pour cette entreprise :

${context}

Structure : EMAIL (J0) → LINKEDIN (J3) → EMAIL (J7)

Réponds avec ce JSON exact :
{
  "name": "Séquence de démarrage — [secteur cible]",
  "steps": [
    {
      "channel": "EMAIL",
      "subject": "objet email court et accrocheur",
      "content": "corps email J0 (5-7 lignes max, CTA clair)",
      "delayDays": 0
    },
    {
      "channel": "LINKEDIN",
      "subject": null,
      "content": "message LinkedIn court J3 (3-4 lignes max, référence à l'email)",
      "delayDays": 3
    },
    {
      "channel": "EMAIL",
      "subject": "objet relance",
      "content": "relance email J7 (3-4 lignes, angle différent, simple breakup si pas de réponse)",
      "delayDays": 7
    }
  ]
}`),
  ]);

  const raw2 = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const cleaned = raw2.replace(/^```[\w]*\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  let parsed: z.infer<typeof SequenceSchema>;
  try {
    parsed = SequenceSchema.parse(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ error: "Parsing séquence échoué", raw: raw2 }, { status: 500 });
  }

  // Create a template prospect (placeholder) for this sequence
  const templateEmail = `template@${ws.domainUrl?.replace(/^https?:\/\//, "").split("/")[0] ?? "example.com"}`;
  let templateProspect = await prisma.prospect.findUnique({
    where: { email_workspaceId: { email: templateEmail, workspaceId: body.workspaceId } },
    select: { id: true },
  });
  if (!templateProspect) {
    templateProspect = await prisma.prospect.create({
      data: {
        workspaceId: body.workspaceId,
        name: "Prospect type",
        company: String(raw.industry ?? "Votre secteur cible"),
        email: templateEmail,
        linkedInUrl: "",
      },
      select: { id: true },
    });
  }

  // Create the sequence in DB
  const sequence = await prisma.outreachSequence.create({
    data: {
      workspaceId: body.workspaceId,
      prospectId: templateProspect.id,
      name: parsed.name,
      isActive: false,
      steps: {
        create: parsed.steps.map((s, i) => ({
          stepNumber: i + 1,
          channel: s.channel,
          subject: s.subject ?? null,
          content: s.content,
          delayDays: s.delayDays,
          status: "PENDING",
        })),
      },
    },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  });

  return NextResponse.json({
    success: true,
    sequenceId: sequence.id,
    sequenceName: sequence.name,
    steps: sequence.steps.map((s) => ({
      stepNumber: s.stepNumber,
      channel: s.channel,
      subject: s.subject,
      content: s.content,
      delayDays: s.delayDays,
    })),
  });
}
