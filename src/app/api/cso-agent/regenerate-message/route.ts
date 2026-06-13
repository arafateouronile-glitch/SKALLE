/**
 * POST /api/cso-agent/regenerate-message
 *
 * Régénère les messages d'une décision CSO (postConnectionMessage,
 * emailSubject/body, followup…).
 *
 * Body: { decisionId, workspaceId }
 * Returns: { ok: true, actionData: {...} }
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";
import { researchProspect } from "@/lib/prospection/prospect-researcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as { decisionId?: string; workspaceId?: string };
  const { decisionId, workspaceId } = body;
  if (!decisionId || !workspaceId)
    return NextResponse.json({ error: "decisionId et workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true, name: true, brandVoice: true, signature: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, workspaceId, status: "PENDING" },
  });
  if (!decision) return NextResponse.json({ error: "Décision introuvable ou non-PENDING" }, { status: 404 });

  const data = decision.actionData as Record<string, unknown> & { prospectId: string; prospectName: string };

  const prospect = await prisma.prospect.findUnique({
    where: { id: data.prospectId },
    select: {
      id: true, name: true, company: true, jobTitle: true,
      email: true, linkedInUrl: true, enrichmentData: true,
    },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  const bv = (ws.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(ws.name, bv);

  // Récupère les signaux LinkedIn/Serper pour personnaliser
  const liEnrich = ((prospect.enrichmentData as Record<string, unknown> | null)?.linkedIn ?? null) as {
    headline?: string | null;
    about?: string | null;
    experiences?: Array<{ title: string; company: string; description: string | null }>;
  } | null;

  let research;
  try {
    research = await researchProspect({
      id: prospect.id,
      name: prospect.name,
      company: prospect.company,
      jobTitle: prospect.jobTitle,
      linkedInUrl: prospect.linkedInUrl,
      email: prospect.email,
      enrichmentData: prospect.enrichmentData as Record<string, unknown> | null,
    });
  } catch {
    // Fallback sans Serper
    research = {
      companyTrigger: null,
      hiringSignals: [],
      recentNews: [],
      techStack: [],
      recentLinkedInActivity: null,
      recentJobChange: false,
      linkedInHeadline: liEnrich?.headline ?? prospect.jobTitle ?? null,
      linkedInAbout: liEnrich?.about ?? null,
      linkedInExperiences: liEnrich?.experiences ?? [],
      companyStage: "PME établie",
      topPainPoint: "gestion administrative",
      suggestedAngle: "efficiency" as const,
      urgencySignal: "N/A",
      icebreakerLine: "",
      jobTenure: null,
      confidence: "low" as const,
      researchedAt: new Date().toISOString(),
      serperUsed: false,
    };
  }

  const profile = {
    id: prospect.id,
    name: prospect.name,
    firstName: prospect.name.split(" ")[0],
    company: prospect.company,
    jobTitle: prospect.jobTitle ?? "",
    email: prospect.email ?? undefined,
    linkedInUrl: prospect.linkedInUrl ?? undefined,
  };

  const sig = ws.signature ? `\n\n${ws.signature}` : "";

  let newActionData: Record<string, unknown> = { ...data };

  try {
    if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
      const [msg, followup] = await Promise.all([
        generateCsoMessages(profile, research, brand, "LINKEDIN"),
        generateCsoMessages(profile, research, brand, "FOLLOWUP"),
      ]);
      newActionData = {
        ...data,
        postConnectionMessage: msg.content + sig,
        followupMessage: followup.content + sig,
        _angle: msg.angle,
        _regeneratedAt: new Date().toISOString(),
      };
    } else if (decision.actionType === "CSO_LAUNCH_EMAIL") {
      const msg = await generateCsoMessages(profile, research, brand, "EMAIL");
      newActionData = {
        ...data,
        subject: msg.subject,
        content: msg.content + sig,
        _angle: msg.angle,
        _regeneratedAt: new Date().toISOString(),
      };
    } else if (decision.actionType === "CSO_FOLLOWUP") {
      const channel = (data.channel as string) === "LINKEDIN" ? "LINKEDIN" : "FOLLOWUP";
      const msg = await generateCsoMessages(profile, research, brand, channel as "LINKEDIN" | "FOLLOWUP");
      newActionData = {
        ...data,
        subject: msg.subject,
        content: msg.content + sig,
        _angle: msg.angle,
        _regeneratedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    return NextResponse.json({ error: `Erreur génération : ${String(err)}` }, { status: 500 });
  }

  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { actionData: newActionData as Parameters<typeof prisma.agentDecision.update>[0]["data"]["actionData"] },
  });

  return NextResponse.json({ ok: true, actionData: newActionData });
}
