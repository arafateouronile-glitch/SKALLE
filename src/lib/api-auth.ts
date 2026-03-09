/**
 * 🔐 API Authentication Middleware
 *
 * Vérifie l'authentification pour les routes API REST.
 * Supporte l'auth par session (NextAuth) et par Bearer token.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/credits";

interface AuthResult {
  userId: string;
  workspaceId: string;
}

interface AuthError {
  error: string;
  status: number;
}

export async function authenticateApiRequest(
  req: Request
): Promise<AuthResult | AuthError> {
  // 1. Essayer l'auth par session (NextAuth)
  const session = await auth();
  if (session?.user?.id) {
    // Récupérer le premier workspace de l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!workspace) {
      return { error: "Aucun workspace trouvé", status: 404 };
    }

    // Vérifier si le plan permet l'accès API
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });

    if (!user) {
      return { error: "Utilisateur non trouvé", status: 404 };
    }

    const planLimits = PLAN_LIMITS[user.plan];
    if (!planLimits.apiAccess) {
      return {
        error: "L'accès API nécessite un plan AGENCY ou supérieur",
        status: 403,
      };
    }

    return { userId: session.user.id, workspaceId: workspace.id };
  }

  // 2. Essayer l'auth par Bearer token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Pour l'instant, on utilise le session token comme Bearer token
    // Dans le futur, on pourrait avoir un modèle ApiKey dédié
    const sessionRecord = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: { select: { id: true, plan: true } } },
    });

    if (!sessionRecord || sessionRecord.expires < new Date()) {
      return { error: "Token invalide ou expiré", status: 401 };
    }

    const planLimits = PLAN_LIMITS[sessionRecord.user.plan];
    if (!planLimits.apiAccess) {
      return {
        error: "L'accès API nécessite un plan AGENCY ou supérieur",
        status: 403,
      };
    }

    const workspace = await prisma.workspace.findFirst({
      where: { userId: sessionRecord.user.id },
      select: { id: true },
    });

    if (!workspace) {
      return { error: "Aucun workspace trouvé", status: 404 };
    }

    return { userId: sessionRecord.user.id, workspaceId: workspace.id };
  }

  return { error: "Non autorisé", status: 401 };
}

/**
 * Helper pour extraire un workspaceId spécifique de la requête
 */
export function getWorkspaceIdFromRequest(req: Request, fallback: string): string {
  const url = new URL(req.url);
  return url.searchParams.get("workspaceId") || fallback;
}
