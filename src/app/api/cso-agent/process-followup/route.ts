import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const body = (await req.json()) as {
    prospectId: string;
    workspaceId: string;
    name: string;
    jobTitle?: string;
    company?: string;
    headline?: string;
    about?: string;
    originalMessage?: string; // Premier message envoyé — pour générer un angle différent
  };

  const { prospectId, workspaceId, name, jobTitle, company, headline, about, originalMessage } = body;
  if (!prospectId || !workspaceId) {
    return NextResponse.json({ error: "prospectId et workspaceId requis" }, { status: 400 });
  }

  // Vérifier accès
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true, name: true, brandVoice: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace.name, bv);

  const firstName = name.split(" ")[0];

  const research = {
    companyTrigger: null,
    companyStage: "PME établie",
    hiringSignals: [],
    recentNews: [],
    techStack: [],
    linkedInHeadline: headline ?? jobTitle ?? null,
    linkedInAbout: about ?? null,
    linkedInExperiences: [],
    recentLinkedInActivity: null,
    jobTenure: null,
    recentJobChange: false,
    topPainPoint: about
      ? `Profil : ${about.slice(0, 100)}`
      : "gestion administrative chronophage",
    urgencySignal: "N/A",
    icebreakerLine: "",
    suggestedAngle: "pain" as const,
    researchedAt: new Date().toISOString(),
    confidence: "low" as const,
    serperUsed: false,
  };

  const profile = {
    id: prospectId,
    name,
    firstName,
    company: company ?? "",
    jobTitle: jobTitle ?? headline ?? "",
    linkedInUrl: "",
  };

  let followupMessage = "";
  try {
    const msg = await generateCsoMessages(
      profile,
      research,
      brand,
      "FOLLOWUP",
      originalMessage ?? undefined
    );
    followupMessage = msg.content;
  } catch {
    // Fallback sobre si Claude échoue
    followupMessage = `Bonjour ${firstName}, je voulais faire un point rapide suite à mon message. Avez-vous eu l'occasion d'y jeter un œil ? Je suis disponible pour un échange de 10 min cette semaine si vous le souhaitez.`;
  }

  return NextResponse.json({ ok: true, followupMessage });
}
