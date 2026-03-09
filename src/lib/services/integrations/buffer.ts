/**
 * 📅 Buffer Integration
 *
 * Planifie des posts sociaux via l'API Buffer v1.
 * L'access token est stocké dans ExternalIntegration (provider: BUFFER).
 *
 * Docs : https://buffer.com/developers/api
 */

import { getExternalIntegrationKey } from "./external";

const BUFFER_API = "https://api.bufferapp.com/1";

export interface BufferPost {
  text: string;
  profileIds?: string[]; // si vide, publie sur tous les profils connectés
  scheduledAt?: Date;    // si vide, ajoute à la file d'attente
  media?: {
    link?: string;
    picture?: string;
    thumbnail?: string;
    description?: string;
    title?: string;
  };
}

export interface BufferProfile {
  id: string;
  service: string; // twitter, facebook, instagram, linkedin...
  serviceUsername: string;
}

/**
 * Liste les profils connectés au compte Buffer.
 */
export async function getBufferProfiles(
  workspaceId: string
): Promise<{ success: boolean; profiles?: BufferProfile[]; error?: string }> {
  const token = await getExternalIntegrationKey(workspaceId, "BUFFER");
  if (!token) return { success: false, error: "Buffer non configuré pour ce workspace" };

  const res = await fetch(`${BUFFER_API}/profiles.json?access_token=${token}`);
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Buffer API error: ${err}` };
  }

  const data = await res.json() as Array<{
    id: string;
    service: string;
    service_username: string;
  }>;

  return {
    success: true,
    profiles: data.map((p) => ({
      id: p.id,
      service: p.service,
      serviceUsername: p.service_username,
    })),
  };
}

/**
 * Crée un post Buffer (ajout à la file d'attente ou planifié).
 */
export async function scheduleBufferPost(
  workspaceId: string,
  post: BufferPost
): Promise<{ success: boolean; updates?: Array<{ id: string; profileId: string }>; error?: string }> {
  const token = await getExternalIntegrationKey(workspaceId, "BUFFER");
  if (!token) return { success: false, error: "Buffer non configuré pour ce workspace" };

  // Si pas de profils spécifiés, récupère tous les profils connectés
  let profileIds = post.profileIds;
  if (!profileIds || profileIds.length === 0) {
    const profilesRes = await getBufferProfiles(workspaceId);
    if (!profilesRes.success || !profilesRes.profiles?.length) {
      return { success: false, error: "Aucun profil Buffer trouvé" };
    }
    profileIds = profilesRes.profiles.map((p) => p.id);
  }

  const body = new URLSearchParams();
  body.append("access_token", token);
  body.append("text", post.text);
  profileIds.forEach((id) => body.append("profile_ids[]", id));

  if (post.scheduledAt) {
    body.append("scheduled_at", post.scheduledAt.toISOString());
  }
  if (post.media?.link) body.append("media[link]", post.media.link);
  if (post.media?.picture) body.append("media[picture]", post.media.picture);
  if (post.media?.description) body.append("media[description]", post.media.description);
  if (post.media?.title) body.append("media[title]", post.media.title);

  const res = await fetch(`${BUFFER_API}/updates/create.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Buffer API error: ${err}` };
  }

  const data = await res.json() as {
    success: boolean;
    updates: Array<{ id: string; profile_id: string }>;
  };

  return {
    success: data.success,
    updates: data.updates?.map((u) => ({ id: u.id, profileId: u.profile_id })),
  };
}

/**
 * Vérifie la connexion Buffer (récupère les profils).
 */
export async function testBufferConnection(
  workspaceId: string
): Promise<{ success: boolean; profileCount?: number; error?: string }> {
  const result = await getBufferProfiles(workspaceId);
  if (!result.success) return result;
  return { success: true, profileCount: result.profiles?.length ?? 0 };
}
