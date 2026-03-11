/**
 * GET /api/agents/budget
 *
 * Retourne le statut du budget LLM journalier pour le workspace de l'utilisateur.
 * Utilisé par le dashboard pour afficher la consommation AI du jour.
 *
 * Response :
 *   200 { spentCents, limitCents, remainingCents, spentUsd, limitUsd }
 *   401 Non autorisé
 *   404 Workspace introuvable
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBudgetStatus } from "@/lib/ai/budget-guard";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Non autorisé", { status: 401 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!workspace) {
    return new Response("Workspace introuvable", { status: 404 });
  }

  // Récupère le plan depuis l'utilisateur pour calculer la limite correcte
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  const status = await getBudgetStatus(workspace.id, user?.plan ?? "AGENCY");

  return Response.json(status);
}
