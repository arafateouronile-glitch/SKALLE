/**
 * 📢 Meta Publishing Service
 *
 * Publication directe sur Facebook Pages et Instagram Business
 * via l'API Graph. Requiert les scopes :
 *   - pages_manage_posts (Facebook)
 *   - instagram_content_publishing (Instagram)
 */

import { metaPost, metaGet } from "./graph-api";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PublishResult {
  platformPostId: string;
  permalink?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACEBOOK PAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Publie un post sur une Page Facebook.
 * Supporte texte seul ou texte + image.
 */
export async function publishToFacebookPage(
  pageAccessToken: string,
  pageId: string,
  content: string,
  imageUrl?: string | null
): Promise<PublishResult> {
  if (imageUrl) {
    // Post avec image : publier via /photos
    const result = await metaPost<{ id: string; post_id?: string }>(
      `/${pageId}/photos`,
      pageAccessToken,
      {
        url: imageUrl,
        caption: content,
        published: true,
      }
    );
    return { platformPostId: result.post_id ?? result.id };
  }

  // Post texte seul : publier via /feed
  const result = await metaPost<{ id: string }>(
    `/${pageId}/feed`,
    pageAccessToken,
    { message: content }
  );

  return { platformPostId: result.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTAGRAM BUSINESS (2 étapes)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Publie un post sur un compte Instagram Business.
 * Flux obligatoire en 2 étapes :
 *   1. Créer un media container (image ou carrousel)
 *   2. Publier le container
 *
 * Note: Instagram exige une image publiquement accessible pour les posts feed.
 * Pour les posts texte seul, on utilise le type REELS ou on rejette.
 */
export async function publishToInstagram(
  pageAccessToken: string,
  igAccountId: string,
  content: string,
  imageUrl?: string | null
): Promise<PublishResult> {
  if (!imageUrl) {
    throw new Error(
      "Instagram nécessite une image pour les posts feed. Ajoutez une image au post."
    );
  }

  // Étape 1 : Créer le media container
  const container = await metaPost<{ id: string }>(
    `/${igAccountId}/media`,
    pageAccessToken,
    {
      image_url: imageUrl,
      caption: content,
    }
  );

  const creationId = container.id;

  // Attendre que le container soit prêt (polling jusqu'à FINISHED)
  await waitForIgContainer(pageAccessToken, creationId);

  // Étape 2 : Publier le container
  const published = await metaPost<{ id: string }>(
    `/${igAccountId}/media_publish`,
    pageAccessToken,
    { creation_id: creationId }
  );

  // Récupérer le permalink
  let permalink: string | undefined;
  try {
    const media = await metaGet<{ permalink?: string }>(
      `/${published.id}`,
      pageAccessToken,
      { fields: "permalink" }
    );
    permalink = media.permalink;
  } catch {
    // permalink non critique
  }

  return { platformPostId: published.id, permalink };
}

/**
 * Polling du statut d'un container IG jusqu'à FINISHED ou ERROR.
 * Timeout après 30 secondes (6 tentatives × 5s).
 */
async function waitForIgContainer(
  accessToken: string,
  containerId: string,
  maxAttempts = 6,
  delayMs = 5000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await metaGet<{ status_code: string; status?: string }>(
      `/${containerId}`,
      accessToken,
      { fields: "status_code" }
    );

    if (result.status_code === "FINISHED") return;
    if (result.status_code === "ERROR" || result.status_code === "EXPIRED") {
      throw new Error(`Container Instagram en erreur : ${result.status_code}`);
    }

    // IN_PROGRESS ou PUBLISHED — attendre
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Timeout : le container Instagram n'est pas prêt après 30 secondes");
}
