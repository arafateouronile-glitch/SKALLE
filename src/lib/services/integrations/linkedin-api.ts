/**
 * LinkedIn Direct Publishing
 *
 * Publie des posts sur LinkedIn via l'API officielle (UGC Posts v2).
 * Les tokens OAuth sont stockés dans ExternalIntegration (provider: "LINKEDIN_OAUTH")
 * sous forme de JSON chiffré : { accessToken, expiresAt, personUrn, name }
 *
 * Scopes requis : openid profile w_member_social
 * Docs : https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
 */

import { getExternalIntegrationKey } from "./external";

const LINKEDIN_API = "https://api.linkedin.com/v2";

interface LinkedInTokenData {
  accessToken: string;
  expiresAt?: string;
  personUrn: string; // urn:li:person:xxxxx
  name?: string;
}

async function getLinkedInToken(workspaceId: string): Promise<LinkedInTokenData | null> {
  const raw = await getExternalIntegrationKey(workspaceId, "LINKEDIN_OAUTH");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LinkedInTokenData;
  } catch {
    return null;
  }
}

/**
 * Publie un post texte (+ image optionnelle) sur LinkedIn.
 */
export async function publishLinkedInPost(
  workspaceId: string,
  content: string,
  imageUrl?: string | null
): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string }> {
  const token = await getLinkedInToken(workspaceId);
  if (!token) return { success: false, error: "LinkedIn non connecté pour ce workspace" };

  const author = token.personUrn;

  // Si une image est fournie, l'uploader d'abord via l'API Assets
  let mediaAsset: string | null = null;
  if (imageUrl) {
    const uploadRes = await uploadLinkedInImage(token.accessToken, author, imageUrl);
    if (uploadRes.success && uploadRes.assetUrn) {
      mediaAsset = uploadRes.assetUrn;
    }
    // Si l'upload échoue, on poste quand même en texte seul
  }

  const body = mediaAsset
    ? buildMediaPost(author, content, mediaAsset)
    : buildTextPost(author, content);

  const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[LinkedIn] ugcPosts error:", err);
    return { success: false, error: `LinkedIn API ${res.status}: ${err}` };
  }

  const postId = res.headers.get("x-restli-id") ?? undefined;
  const postUrl = postId
    ? `https://www.linkedin.com/feed/update/${postId}/`
    : undefined;

  return { success: true, postId, postUrl };
}

/**
 * Retourne le statut de connexion LinkedIn pour un workspace.
 */
export async function getLinkedInStatus(workspaceId: string): Promise<{
  connected: boolean;
  name?: string;
  personUrn?: string;
}> {
  const token = await getLinkedInToken(workspaceId);
  if (!token) return { connected: false };
  return { connected: true, name: token.name, personUrn: token.personUrn };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildTextPost(author: string, text: string) {
  return {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

function buildMediaPost(author: string, text: string, assetUrn: string) {
  return {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            description: { text: "" },
            media: assetUrn,
            title: { text: "" },
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };
}

/**
 * Upload une image depuis une URL vers LinkedIn Assets.
 */
async function uploadLinkedInImage(
  accessToken: string,
  owner: string,
  imageUrl: string
): Promise<{ success: boolean; assetUrn?: string }> {
  try {
    // 1. Enregistrer l'upload
    const registerRes = await fetch(`${LINKEDIN_API}/assets?action=registerUpload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    });

    if (!registerRes.ok) return { success: false };
    const registerData = await registerRes.json() as {
      value: {
        asset: string;
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: string;
          };
        };
      };
    };

    const uploadUrl = registerData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
    const assetUrn = registerData.value.asset;

    // 2. Télécharger l'image source
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return { success: false };
    const imgBuffer = await imgRes.arrayBuffer();

    // 3. Uploader l'image vers LinkedIn
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": imgRes.headers.get("content-type") ?? "image/jpeg",
      },
      body: imgBuffer,
    });

    if (!uploadRes.ok) return { success: false };
    return { success: true, assetUrn };
  } catch {
    return { success: false };
  }
}
