"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Revoke all active sessions for the current user by incrementing tokenVersion.
 * Every JWT issued before this call will fail the tokenVersion check on next request.
 *
 * Use cases: password change, account compromise, "logout everywhere" button.
 */
export async function revokeAllSessions(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Admin-only: revoke all sessions for a specific user (account suspension/takeover).
 */
export async function adminRevokeUserSessions(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    const caller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    });
    if (!caller?.isAdmin) return { success: false, error: "Réservé aux admins" };

    await prisma.user.update({
      where: { id: targetUserId },
      data: { tokenVersion: { increment: 1 } },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
