/**
 * 📈 Google Search Console Integration
 *
 * Fournit des données SEO réelles (positions, clics, impressions) pour
 * enrichir l'Agent Brain et le ROI Dashboard CMO.
 *
 * Flow OAuth2 :
 *   1. Utilisateur clique "Connecter GSC" → getAuthUrl()
 *   2. Google redirige vers /api/integrations/gsc/callback?code=&state=workspaceId
 *   3. exchangeCodeForTokens() → sauvegarde dans GoogleSearchConsoleConfig
 *   4. Cron quotidien syncGSCData() → cache topPages + topKeywords
 */

import { prisma } from "@/lib/prisma";

const GSC_OAUTH_SCOPES = "https://www.googleapis.com/auth/webmasters.readonly";
const GSC_API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface PageMetric {
  page: string;
  clicks: number;
  impressions: number;
  avgPosition: number;
  ctr: number;
}

export interface KeywordMetric {
  keyword: string;
  clicks: number;
  impressions: number;
  avgPosition: number;
  ctr: number;
}

export interface DecliningPage {
  page: string;
  currentAvgPosition: number;
  clicks: number;
  impressions: number;
  keyword: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTH — URL OAuth2 et échange de code
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère l'URL de redirection OAuth2 Google pour connecter GSC.
 */
export function getGSCAuthUrl(workspaceId: string): string {
  const clientId = process.env.GOOGLE_GSC_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/gsc/callback`;

  if (!clientId) {
    throw new Error("GOOGLE_GSC_CLIENT_ID manquant dans les variables d'environnement");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: workspaceId,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Échange le code d'autorisation contre des tokens OAuth2.
 */
export async function exchangeGSCCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_GSC_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/gsc/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_GSC_CLIENT_ID ou GOOGLE_GSC_CLIENT_SECRET manquant");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Échange code GSC échoué: ${err}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

/**
 * Rafraîchit l'access token via le refresh token.
 */
async function refreshGSCToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_GSC_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Credentials GSC manquants pour le refresh");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Refresh token GSC échoué: ${err}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  return { accessToken: data.access_token, expiresAt };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. API CALLS — Search Analytics
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retourne un access token valide (rafraîchit si expiré).
 */
async function getValidAccessToken(workspaceId: string): Promise<string> {
  const config = await prisma.googleSearchConsoleConfig.findUnique({
    where: { workspaceId },
  });

  if (!config || !config.isConnected) {
    throw new Error("GSC non connecté pour ce workspace");
  }

  // Si expiré ou expire dans moins de 5 minutes, rafraîchir
  const isExpiring =
    !config.tokenExpiry || config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpiring) {
    const { accessToken, expiresAt } = await refreshGSCToken(config.refreshToken);
    await prisma.googleSearchConsoleConfig.update({
      where: { workspaceId },
      data: { accessToken, tokenExpiry: expiresAt },
    });
    return accessToken;
  }

  return config.accessToken;
}

/**
 * Appelle l'API Search Analytics de GSC.
 */
async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<{ rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }> {
  const encodedUrl = encodeURIComponent(siteUrl);
  const res = await fetch(`${GSC_API_BASE}/sites/${encodedUrl}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC API error: ${res.status} — ${err}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SYNC — Mise à jour du cache GSC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Synchronise les données GSC et met à jour le cache dans la DB.
 * Appelé par le cron quotidien à 6h (avant l'Agent Brain à 7h).
 */
export async function syncGSCData(workspaceId: string): Promise<void> {
  const config = await prisma.googleSearchConsoleConfig.findUnique({
    where: { workspaceId },
  });

  if (!config || !config.isConnected) return;

  try {
    const accessToken = await getValidAccessToken(workspaceId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    // Top pages par clics
    const pagesData = await fetchSearchAnalytics(accessToken, config.siteUrl, {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 25,
      orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
    });

    const topPages: PageMetric[] = (pagesData.rows ?? []).map((row) => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      avgPosition: Math.round(row.position * 10) / 10,
      ctr: Math.round(row.ctr * 1000) / 10, // en %
    }));

    // Top keywords
    const keywordsData = await fetchSearchAnalytics(accessToken, config.siteUrl, {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 50,
      orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
    });

    const topKeywords: KeywordMetric[] = (keywordsData.rows ?? []).map((row) => ({
      keyword: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      avgPosition: Math.round(row.position * 10) / 10,
      ctr: Math.round(row.ctr * 1000) / 10,
    }));

    await prisma.googleSearchConsoleConfig.update({
      where: { workspaceId },
      data: {
        topPages: JSON.parse(JSON.stringify(topPages)),
        topKeywords: JSON.parse(JSON.stringify(topKeywords)),
        lastSyncedAt: new Date(),
      },
    });

    console.log(`[GSC] Sync OK pour workspace ${workspaceId}: ${topPages.length} pages, ${topKeywords.length} keywords`);
  } catch (error) {
    console.error(`[GSC] Erreur sync workspace ${workspaceId}:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LECTURE — Données pour l'Agent Brain et le Dashboard
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retourne les top pages depuis le cache (synchro à 6h chaque matin).
 */
export async function getTopPages(workspaceId: string): Promise<PageMetric[]> {
  const config = await prisma.googleSearchConsoleConfig.findUnique({
    where: { workspaceId },
    select: { topPages: true, isConnected: true },
  });

  if (!config?.isConnected || !config.topPages) return [];
  return config.topPages as unknown as PageMetric[];
}

/**
 * Détecte les pages avec une position moyenne > 20 (au-delà de la page 2).
 * Ces pages sont des cibles prioritaires pour régénération ou optimisation.
 */
export async function getDecliningPages(workspaceId: string): Promise<DecliningPage[]> {
  const topKeywords = await getTopKeywords(workspaceId);
  const topPages = await getTopPages(workspaceId);

  // Pages avec beaucoup d'impressions mais mauvaise position → opportunité
  return topPages
    .filter((p) => p.avgPosition > 15 && p.impressions > 50)
    .slice(0, 10)
    .map((p) => {
      // Trouver le keyword le plus associé à cette page
      const matchingKeyword = topKeywords.find((k) =>
        p.page.toLowerCase().includes(k.keyword.toLowerCase().split(" ")[0])
      );
      return {
        page: p.page,
        currentAvgPosition: p.avgPosition,
        clicks: p.clicks,
        impressions: p.impressions,
        keyword: matchingKeyword?.keyword ?? "keyword inconnu",
      };
    });
}

/**
 * Retourne les top keywords depuis le cache.
 */
export async function getTopKeywords(workspaceId: string): Promise<KeywordMetric[]> {
  const config = await prisma.googleSearchConsoleConfig.findUnique({
    where: { workspaceId },
    select: { topKeywords: true, isConnected: true },
  });

  if (!config?.isConnected || !config.topKeywords) return [];
  return config.topKeywords as unknown as KeywordMetric[];
}

/**
 * Vérifie les positions GSC pour une liste de keywords spécifiques.
 */
export async function getKeywordPositions(
  workspaceId: string,
  keywords: string[]
): Promise<KeywordMetric[]> {
  const allKeywords = await getTopKeywords(workspaceId);
  return allKeywords.filter((k) =>
    keywords.some((kw) => k.keyword.toLowerCase().includes(kw.toLowerCase()))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DÉCONNEXION
// ═══════════════════════════════════════════════════════════════════════════

export async function disconnectGSC(workspaceId: string): Promise<void> {
  await prisma.googleSearchConsoleConfig.deleteMany({ where: { workspaceId } });
}
