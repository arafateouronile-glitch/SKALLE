/**
 * 🔑 Meta Token Manager
 *
 * Gère l'échange de tokens Meta :
 * - Short-lived → Long-lived (~60 jours)
 * - User token → Page Access Token (permanent)
 * - Rafraîchissement automatique avant expiration
 */

import { prisma } from "@/lib/prisma";
import { metaGet } from "./graph-api";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // secondes
}

interface PageData {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  instagram_business_account?: {
    id: string;
  };
}

interface PagesListResponse {
  data: PageData[];
  paging?: { cursors: { before: string; after: string }; next?: string };
}

interface IGAccountResponse {
  instagram_business_account?: {
    id: string;
    username?: string;
  };
}

export interface PageInfo {
  id: string;
  name: string;
  category?: string;
  accessToken: string;
  instagramAccountId?: string;
  instagramUsername?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ TOKEN EXCHANGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Échange un short-lived token (~1h) contre un long-lived token (~60 jours).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ token: string; expiresIn: number }> {
  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("FACEBOOK_CLIENT_ID ou FACEBOOK_CLIENT_SECRET non configuré");
  }

  const result = await metaGet<TokenExchangeResponse>(
    "/oauth/access_token",
    shortLivedToken,
    {
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLivedToken,
    }
  );

  return {
    token: result.access_token,
    expiresIn: result.expires_in,
  };
}

/**
 * Récupère le Page Access Token (permanent quand dérivé d'un long-lived user token).
 */
export async function getPageAccessToken(
  userAccessToken: string,
  pageId: string
): Promise<string> {
  const result = await metaGet<{ access_token: string }>(
    `/${pageId}`,
    userAccessToken,
    { fields: "access_token" }
  );

  return result.access_token;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ PAGE & INSTAGRAM DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Liste les Pages Facebook gérées par l'utilisateur.
 */
export async function listUserPages(
  userAccessToken: string
): Promise<PageInfo[]> {
  const result = await metaGet<PagesListResponse>(
    "/me/accounts",
    userAccessToken,
    { fields: "id,name,category,access_token,instagram_business_account" }
  );

  const pages: PageInfo[] = [];

  for (const page of result.data) {
    let igUsername: string | undefined;
    const igId = page.instagram_business_account?.id;

    // Fetch IG username if business account is linked
    if (igId) {
      try {
        const igData = await metaGet<{ username?: string }>(
          `/${igId}`,
          userAccessToken,
          { fields: "username" }
        );
        igUsername = igData.username;
      } catch {
        // IG account exists but can't fetch username
      }
    }

    pages.push({
      id: page.id,
      name: page.name,
      category: page.category,
      accessToken: page.access_token,
      instagramAccountId: igId,
      instagramUsername: igUsername,
    });
  }

  return pages;
}

/**
 * Récupère les infos du compte IG Business lié à une Page.
 */
export async function getInstagramBusinessAccount(
  pageId: string,
  pageAccessToken: string
): Promise<{ id: string; username: string } | null> {
  try {
    const result = await metaGet<IGAccountResponse>(
      `/${pageId}`,
      pageAccessToken,
      { fields: "instagram_business_account" }
    );

    if (!result.instagram_business_account?.id) return null;

    const igData = await metaGet<{ username: string }>(
      `/${result.instagram_business_account.id}`,
      pageAccessToken,
      { fields: "username" }
    );

    return {
      id: result.instagram_business_account.id,
      username: igData.username,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ TOKEN REFRESH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si le token d'un MetaSocialAccount doit être rafraîchi
 * et le rafraîchit si nécessaire (< 7 jours avant expiration).
 * Retourne le pageAccessToken valide.
 */
export async function refreshTokenIfNeeded(
  metaAccountId: string
): Promise<string> {
  const account = await prisma.metaSocialAccount.findUnique({
    where: { id: metaAccountId },
  });

  if (!account) throw new Error("MetaSocialAccount non trouvé");

  // Si le token n'expire pas (page token permanent), retourner directement
  if (!account.tokenExpiresAt) {
    return account.pageAccessToken;
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Vérifier si le user token expire dans moins de 7 jours
  if (account.tokenExpiresAt > sevenDaysFromNow) {
    return account.pageAccessToken;
  }

  // Rafraîchir le user token
  try {
    const { token: newUserToken, expiresIn } = await exchangeForLongLivedToken(
      account.userAccessToken
    );

    // Récupérer un nouveau page token
    const newPageToken = await getPageAccessToken(
      newUserToken,
      account.facebookPageId
    );

    // Mettre à jour en DB
    await prisma.metaSocialAccount.update({
      where: { id: metaAccountId },
      data: {
        userAccessToken: newUserToken,
        pageAccessToken: newPageToken,
        tokenExpiresAt: new Date(now.getTime() + expiresIn * 1000),
      },
    });

    return newPageToken;
  } catch (error) {
    console.error("Token refresh failed for MetaSocialAccount:", metaAccountId, error);
    // Retourner l'ancien token en espérant qu'il fonctionne encore
    return account.pageAccessToken;
  }
}
