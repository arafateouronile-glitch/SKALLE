import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";
import type { LinkedInExperience } from "@/lib/prospection/prospect-researcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProfilePayload {
  workspaceId: string;
  linkedInUrl: string;
  name: string;
  firstName?: string;
  jobTitle?: string;
  company?: string;
  headline?: string;
  about?: string;
  experiences?: LinkedInExperience[];
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    if (ext) {
      const ws = await prisma.workspace.findUnique({
        where: { id: ext.workspaceId },
        select: { userId: true },
      });
      return ws?.userId ?? null;
    }
  }
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as ProfilePayload;
  const { workspaceId, linkedInUrl, name, jobTitle, company, headline, about, experiences } = body;

  if (!workspaceId || !linkedInUrl || !name) {
    return NextResponse.json({ error: "workspaceId, linkedInUrl et name requis" }, { status: 400 });
  }

  // Vérifier accès workspace
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: {
      id: true,
      name: true,
      brandVoice: true,
      linkedInAutomationConfig: { select: { sendWithoutNote: true } },
    },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  // Trouver la persona active pour lier le prospect
  const persona = await prisma.persona.findFirst({
    where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
    select: { id: true },
  });

  // Normaliser l'URL LinkedIn
  const usernameMatch = linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  const normalizedUrl = usernameMatch
    ? `https://www.linkedin.com/in/${usernameMatch[1]}`
    : linkedInUrl;

  // Créer ou mettre à jour le prospect
  const existing = await prisma.prospect.findFirst({
    where: { workspaceId, linkedInUrl: { contains: usernameMatch?.[1] ?? linkedInUrl } },
    select: { id: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichmentData: any = {
    linkedIn: {
      headline: headline ?? null,
      about: about ?? null,
      experiences: experiences ?? [],
      capturedAt: new Date().toISOString(),
      source: "autonomous_search",
    },
  };

  let prospect;
  if (existing) {
    prospect = await prisma.prospect.update({
      where: { id: existing.id },
      data: {
        jobTitle: jobTitle ?? undefined,
        company: company ?? undefined,
        enrichmentData,
        ...(about ? { aiSummary: about.slice(0, 500) } : {}),
      },
      select: { id: true },
    });
  } else {
    prospect = await prisma.prospect.create({
      data: {
        workspaceId,
        linkedInUrl: normalizedUrl,
        name,
        company: company ?? "LinkedIn",
        jobTitle: jobTitle ?? headline ?? null,
        email: `serper+li_${usernameMatch?.[1] ?? Date.now()}@discovery.skalle`,
        enrichmentData,
        aiSummary: about?.slice(0, 500) ?? null,
        ...(persona ? { personaId: persona.id } : {}),
        status: "NEW",
        score: 0,
      },
      select: { id: true },
    });
  }

  // Générer le message personnalisé
  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace.name, bv);

  const expSummary = (experiences ?? [])
    .slice(0, 3)
    .map((e) => `${e.title} @ ${e.company}${e.description ? ` — "${e.description.slice(0, 100)}"` : ""}`)
    .join(" | ");

  const research = {
    companyTrigger: null,
    companyStage: "PME établie",
    hiringSignals: [],
    recentNews: [],
    techStack: [],
    linkedInHeadline: headline ?? jobTitle ?? null,
    linkedInAbout: about ?? null,
    linkedInExperiences: experiences ?? [],
    recentLinkedInActivity: null,
    jobTenure: null,
    recentJobChange: false,
    topPainPoint: about
      ? `Déduit du profil : ${about.slice(0, 150)}`
      : "gestion administrative chronophage",
    urgencySignal: "N/A",
    icebreakerLine: expSummary ? `J'ai vu votre parcours : ${expSummary.slice(0, 100)}` : "",
    suggestedAngle: "pain" as const,
    researchedAt: new Date().toISOString(),
    confidence: about ? ("medium" as const) : ("low" as const),
    serperUsed: false,
  };

  const firstName = body.firstName ?? name.split(" ")[0];
  const profile = {
    id: prospect.id,
    name,
    firstName,
    company: company ?? "",
    jobTitle: jobTitle ?? headline ?? "",
    linkedInUrl: normalizedUrl,
  };

  const sendWithoutNote = workspace.linkedInAutomationConfig?.sendWithoutNote ?? true;
  let connectNote: string | null = null;
  let postConnectionMessage = "";

  try {
    const msg = await generateCsoMessages(profile, research, brand, "LINKEDIN");
    connectNote = sendWithoutNote ? null : (msg.connectNote ?? msg.content.slice(0, 280));
    postConnectionMessage = msg.content;
  } catch {
    connectNote = sendWithoutNote ? null : `Bonjour ${firstName}, votre profil m'a beaucoup intéressé. J'aimerais échanger avec vous.`;
    postConnectionMessage = `Bonjour ${firstName}, merci pour la connexion ! J'ai découvert votre profil et je pense qu'on a des sujets en commun. Seriez-vous disponible pour un échange de 10 min ?`;
  }

  // Stocker le message post-connexion dans enrichmentData pour l'envoyer quand la connexion est acceptée
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      enrichmentData: {
        ...(enrichmentData as object),
        pendingMessage: postConnectionMessage,
        invitedAt: new Date().toISOString(),
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      lastInteractionAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    prospectId: prospect.id,
    connectNote,
    postConnectionMessage,
  });
}
