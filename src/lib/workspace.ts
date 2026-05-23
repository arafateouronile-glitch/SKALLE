/**
 * getOrCreateWorkspace — récupère ou provisionne le workspace d'un utilisateur.
 *
 * Cas d'usage : l'utilisateur a un JWT valide mais son workspace a été supprimé
 * ou la DB a été réinitialisée. Plutôt que de retourner 404, on re-crée
 * silencieusement le user + workspace pour lui éviter une déconnexion forcée.
 */

import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export async function getOrCreateWorkspace(
  session: Session
): Promise<{ id: string }> {
  const userId = session.user.id;

  const existing = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing;

  // Provisionne user + workspace si absents (DB wiped, migration, etc.)
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: session.user.email ?? `user-${userId}@skalle.app`,
      name: session.user.name ?? "Utilisateur",
    },
    update: {},
  });

  return prisma.workspace.create({
    data: {
      name: "Mon Workspace",
      domainUrl: "",
      userId,
      hasCmoAccess: true,
      hasCsoAccess: true,
    },
    select: { id: true },
  });
}
