"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  listUserPages,
  getPageAccessToken,
  getInstagramBusinessAccount,
  type PageInfo,
} from "@/lib/services/meta/token-manager";

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) throw new Error("Workspace non trouvé");
  return workspace;
}

/**
 * Récupère le Facebook access token du Account NextAuth de l'utilisateur.
 */
async function getFacebookToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "facebook" },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 LISTER LES PAGES FACEBOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Liste les Pages Facebook que l'utilisateur gère.
 * Nécessite une connexion Facebook OAuth au préalable.
 */
export async function listUserPagesAction(): Promise<{
  success: boolean;
  data?: PageInfo[];
  error?: string;
}> {
  try {
    const session = await requireAuth();
    const token = await getFacebookToken(session.user!.id!);

    if (!token) {
      return {
        success: false,
        error: "Connectez-vous d'abord avec Facebook pour accéder à vos Pages.",
      };
    }

    const pages = await listUserPages(token);
    return { success: true, data: pages };
  } catch (error) {
    console.error("listUserPagesAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la récupération des Pages",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 CONNECTER UNE PAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connecte une Page Facebook (+ compte IG Business lié) à un workspace.
 */
export async function connectPageAction(
  workspaceId: string,
  pageId: string,
  pageName: string
): Promise<{
  success: boolean;
  data?: { id: string; instagramUsername?: string };
  error?: string;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const userToken = await getFacebookToken(session.user!.id!);
    if (!userToken) {
      return { success: false, error: "Token Facebook non disponible. Reconnectez-vous." };
    }

    // Vérifier si déjà connecté
    const existing = await prisma.metaSocialAccount.findFirst({
      where: { workspaceId, facebookPageId: pageId },
    });
    if (existing) {
      return { success: false, error: "Cette Page est déjà connectée à ce workspace." };
    }

    // Obtenir le Page Access Token (permanent)
    const pageToken = await getPageAccessToken(userToken, pageId);

    // Chercher le compte IG Business lié
    const igAccount = await getInstagramBusinessAccount(pageId, pageToken);

    // Créer l'enregistrement
    const metaAccount = await prisma.metaSocialAccount.create({
      data: {
        workspaceId,
        facebookPageId: pageId,
        facebookPageName: pageName,
        pageAccessToken: pageToken,
        instagramAccountId: igAccount?.id,
        instagramUsername: igAccount?.username,
        userAccessToken: userToken,
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // ~60 jours
        scopes: "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_manage_messages,instagram_manage_comments,instagram_content_publishing,pages_messaging",
      },
    });

    return {
      success: true,
      data: {
        id: metaAccount.id,
        instagramUsername: igAccount?.username,
      },
    };
  } catch (error) {
    console.error("connectPageAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la connexion",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ❌ DÉCONNECTER UNE PAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Déconnecte une Page Facebook d'un workspace.
 */
export async function disconnectPageAction(
  workspaceId: string,
  metaAccountId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    // Vérifier que le MetaSocialAccount appartient bien au workspace
    const account = await prisma.metaSocialAccount.findFirst({
      where: { id: metaAccountId, workspaceId },
    });
    if (!account) {
      return { success: false, error: "Compte non trouvé" };
    }

    await prisma.metaSocialAccount.delete({
      where: { id: metaAccountId },
    });

    return { success: true };
  } catch (error) {
    console.error("disconnectPageAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la déconnexion",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 STATUT DE CONNEXION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si un workspace a un compte Meta connecté.
 */
export async function getMetaConnectionStatus(workspaceId: string): Promise<{
  success: boolean;
  data?: {
    connected: boolean;
    accounts: Array<{
      id: string;
      facebookPageName: string;
      instagramUsername: string | null;
      isActive: boolean;
      autoGenerateDMs: boolean;
      tokenExpiresAt: Date | null;
    }>;
    hasFacebookLogin: boolean;
  };
  error?: string;
}> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    // Vérifier si l'utilisateur a un Account Facebook dans NextAuth
    const fbAccount = await prisma.account.findFirst({
      where: { userId: session.user!.id!, provider: "facebook" },
      select: { access_token: true },
    });

    const accounts = await prisma.metaSocialAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        facebookPageName: true,
        instagramUsername: true,
        isActive: true,
        autoGenerateDMs: true,
        tokenExpiresAt: true,
      },
    });

    return {
      success: true,
      data: {
        connected: accounts.length > 0,
        accounts,
        hasFacebookLogin: !!fbAccount?.access_token,
      },
    };
  } catch (error) {
    console.error("getMetaConnectionStatus:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Toggle auto-generate DMs pour un compte Meta.
 */
export async function toggleAutoGenerateAction(
  workspaceId: string,
  metaAccountId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.metaSocialAccount.update({
      where: { id: metaAccountId },
      data: { autoGenerateDMs: enabled },
    });

    return { success: true };
  } catch (error) {
    console.error("toggleAutoGenerateAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}
