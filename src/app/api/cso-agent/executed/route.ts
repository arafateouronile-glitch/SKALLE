import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onConnectionAccepted, FAR_FUTURE } from "@/lib/services/smart-sequence-processor";

export const dynamic = "force-dynamic";

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
    decisionId: string;
    ok: boolean;
    action?: string;   // "connection_request" | "message_sent"
    username?: string;
    error?: string;
  };

  const { decisionId, ok, action, username, error } = body;
  if (!decisionId) return NextResponse.json({ error: "decisionId requis" }, { status: 400 });

  // Vérifier que la décision appartient à un workspace de cet utilisateur
  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, workspaceId: { in: workspaceIds } },
  });
  if (!decision) return NextResponse.json({ error: "Décision introuvable" }, { status: 404 });

  const data = decision.actionData as Record<string, unknown>;
  const prospectId = data.prospectId as string | undefined;
  const now = new Date();

  if (ok) {
    // Marquer la décision comme exécutée
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: {
        status: "EXECUTED",
        executedAt: now,
        result: { ok, action, username },
      },
    });

    // Mettre à jour le prospect + créer la séquence smart
    if (prospectId) {
      if (action === "connection_request" && decision.actionType === "CSO_LAUNCH_LINKEDIN") {
        // Demande envoyée — créer l'OutreachSequence avec les étapes conditionnelles
        await prisma.prospect.update({
          where: { id: prospectId },
          data: { lastInteractionAt: now },
        });

        const actionData = data as Record<string, unknown>;
        const sequence = await prisma.outreachSequence.create({
          data: {
            workspaceId: decision.workspaceId,
            prospectId,
            name: `LinkedIn CSO — ${(actionData.prospectName as string) ?? username ?? ""}`,
            isActive: true,
          },
        });

        // Step 1 : déjà exécuté par l'extension
        await prisma.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 1,
            channel: "LINKEDIN",
            linkedInAction: "CONNECTION_REQUEST",
            content: (actionData.connectNote as string) ?? "",
            status: "SENT",
            sentAt: now,
          },
        });

        // Step 2 : message post-connexion (déclenché quand connexion acceptée)
        await prisma.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 2,
            channel: "LINKEDIN",
            linkedInAction: "POST_CONNECTION_MESSAGE",
            content: (actionData.postConnectionMessage as string) ?? "",
            status: "PENDING",
            scheduledAt: FAR_FUTURE,
            metadata: { smartBranch: true, waitingFor: "CONNECTION_ACCEPTED" },
          },
        });

        // Step 3 : fallback email si connexion non acceptée après 7 jours
        const notAcceptedAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
        await prisma.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 3,
            channel: "EMAIL",
            content: "",
            status: "PENDING",
            scheduledAt: notAcceptedAt,
            metadata: { smartBranch: true, waitingFor: "NOT_ACCEPTED", daysThreshold: 7 },
          },
        });

        // Step 4 : relance si pas de réponse après 5j (activé par onConnectionAccepted)
        await prisma.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 4,
            channel: "LINKEDIN",
            linkedInAction: "FOLLOWUP_MESSAGE",
            content: (actionData.followupMessage as string) ?? "",
            status: "PENDING",
            scheduledAt: FAR_FUTURE,
            metadata: { smartBranch: true, waitingFor: "NO_REPLY", daysThreshold: 5 },
          },
        });
      } else if (action === "message_sent") {
        // Prospect déjà connecté (DISTANCE_1) — message envoyé directement
        await prisma.prospect.update({
          where: { id: prospectId },
          data: { status: "CONTACTED", lastInteractionAt: now },
        });
        await onConnectionAccepted(prospectId).catch(() => {});
      }
    }
  } else {
    // Échec — marquer FAILED sans bloquer le prospect
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: {
        status: "FAILED",
        result: { ok: false, error, action, username },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
