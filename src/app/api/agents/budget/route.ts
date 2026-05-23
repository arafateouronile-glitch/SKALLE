/**
 * GET /api/agents/budget
 *
 * Retourne le statut du budget LLM journalier pour le workspace de l'utilisateur.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBudgetStatus } from "@/lib/ai/budget-guard";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Non autorisé", { status: 401 });
  }

  const workspace = await getOrCreateWorkspace(session);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  const status = await getBudgetStatus(workspace.id, user?.plan ?? "AGENCY");

  return Response.json(status);
}
