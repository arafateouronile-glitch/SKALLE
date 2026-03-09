/**
 * 🌐 Ayrshare Integration
 *
 * Publie sur plusieurs réseaux sociaux via l'API Ayrshare.
 * La clé API est stockée dans ExternalIntegration (provider: AYRSHARE).
 *
 * Docs : https://docs.ayrshare.com
 */

import { getExternalIntegrationKey } from "./external";

const AYRSHARE_API = "https://app.ayrshare.com/api";

export type AyrshareNetwork =
  | "twitter"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "youtube"
  | "gmb"; // Google My Business

export interface AyrsharePost {
  post: string;
  platforms: AyrshareNetwork[];
  mediaUrls?: string[];
  scheduleDate?: Date; // si vide, publie immédiatement
  shortenLinks?: boolean;
  instagramOptions?: {
    reelVideoUrl?: string;
    shareReelFeed?: boolean;
    location?: { name: string; id?: string };
  };
}

export interface AyrsharePostResult {
  id: string;
  platform: string;
  status: string;
  postUrl?: string;
  errors?: string[];
}

/**
 * Publie un post sur les réseaux connectés via Ayrshare.
 */
export async function publishAyrsharePost(
  workspaceId: string,
  post: AyrsharePost
): Promise<{ success: boolean; results?: AyrsharePostResult[]; error?: string }> {
  const apiKey = await getExternalIntegrationKey(workspaceId, "AYRSHARE");
  if (!apiKey) return { success: false, error: "Ayrshare non configuré pour ce workspace" };

  const payload: Record<string, unknown> = {
    post: post.post,
    platforms: post.platforms,
  };

  if (post.mediaUrls?.length) payload.mediaUrls = post.mediaUrls;
  if (post.scheduleDate) payload.scheduleDate = post.scheduleDate.toISOString();
  if (post.shortenLinks !== undefined) payload.shortenLinks = post.shortenLinks;
  if (post.instagramOptions) payload.instagramOptions = post.instagramOptions;

  const res = await fetch(`${AYRSHARE_API}/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as {
    status: string;
    id?: string;
    postIds?: Array<{
      id: string;
      platform: string;
      status: string;
      postUrl?: string;
      errors?: string[];
    }>;
    errors?: Array<{ platform: string; message: string }>;
  };

  if (!res.ok || data.status === "error") {
    const errMsg = data.errors?.map((e) => `${e.platform}: ${e.message}`).join(", ")
      ?? `Ayrshare API error ${res.status}`;
    return { success: false, error: errMsg };
  }

  return {
    success: true,
    results: data.postIds?.map((p) => ({
      id: p.id,
      platform: p.platform,
      status: p.status,
      postUrl: p.postUrl,
      errors: p.errors,
    })),
  };
}

/**
 * Récupère les réseaux sociaux connectés au compte Ayrshare.
 */
export async function getAyrshareProfiles(
  workspaceId: string
): Promise<{ success: boolean; platforms?: string[]; error?: string }> {
  const apiKey = await getExternalIntegrationKey(workspaceId, "AYRSHARE");
  if (!apiKey) return { success: false, error: "Ayrshare non configuré pour ce workspace" };

  const res = await fetch(`${AYRSHARE_API}/user`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return { success: false, error: `Ayrshare API error: ${res.status}` };
  }

  const data = await res.json() as {
    activeSocialAccounts?: string[];
  };

  return {
    success: true,
    platforms: data.activeSocialAccounts ?? [],
  };
}

/**
 * Vérifie la connexion Ayrshare et retourne les réseaux connectés.
 */
export async function testAyrshareConnection(
  workspaceId: string
): Promise<{ success: boolean; platforms?: string[]; error?: string }> {
  return getAyrshareProfiles(workspaceId);
}
