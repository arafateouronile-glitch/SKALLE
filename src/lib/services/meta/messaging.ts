/**
 * 💬 Meta Messaging Service
 *
 * Gère l'envoi de DM via les APIs officielles Meta :
 * - Private Reply API : Répondre en privé à un commentaire (IG/FB)
 * - Instagram Send API : Envoyer un message direct (nécessite une conversation ouverte)
 *
 * IMPORTANT : L'API Meta NE PERMET PAS d'envoyer des DM "à froid" à des utilisateurs
 * qui n'ont pas interagi avec votre page/compte dans les 24h/7j.
 */

import { metaPost, metaGet, MetaGraphApiError } from "./graph-api";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
  requiresManual?: boolean; // true si l'envoi API est impossible
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ PRIVATE REPLY (Commentaires → DM)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envoie un message privé en réponse à un commentaire Instagram ou Facebook.
 * C'est le moyen le plus fiable d'initier une conversation.
 *
 * Endpoint: POST /{comment-id}/private_replies
 * Prérequis: Le commentaire doit être sur un post de votre Page/IG Business.
 */
export async function sendPrivateReply(
  commentId: string,
  message: string,
  pageAccessToken: string
): Promise<SendResult> {
  try {
    const result = await metaPost<{ id?: string; success?: boolean }>(
      `/${commentId}/private_replies`,
      pageAccessToken,
      { message }
    );

    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    if (error instanceof MetaGraphApiError) {
      // Code 10 = Permission denied (commentaire trop ancien, ou déjà répondu)
      // Code 100 = Invalid parameter (commentaire supprimé)
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        requiresManual: error.code === 10 || error.code === 100,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ INSTAGRAM SEND API (Messages directs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envoie un message direct Instagram via la Send API.
 * UNIQUEMENT si le destinataire a une conversation ouverte :
 * - Standard : l'utilisateur a envoyé un message dans les dernières 24h
 * - Human Agent tag : étend la fenêtre à 7 jours
 *
 * Endpoint: POST /{ig-account-id}/messages
 */
export async function sendInstagramMessage(
  igAccountId: string,
  recipientIgsid: string,
  message: string,
  pageAccessToken: string,
  tag?: "human_agent"
): Promise<SendResult> {
  try {
    const body: Record<string, unknown> = {
      recipient: { id: recipientIgsid },
      message: { text: message },
    };

    if (tag) {
      body.messaging_type = "MESSAGE_TAG";
      body.tag = tag;
    }

    const result = await metaPost<{ recipient_id?: string; message_id?: string }>(
      `/${igAccountId}/messages`,
      pageAccessToken,
      body
    );

    return {
      success: true,
      messageId: result.message_id,
    };
  } catch (error) {
    if (error instanceof MetaGraphApiError) {
      // Code 551 = User not available for messaging (pas de conversation ouverte)
      // Code 10 = Permission denied
      const requiresManual = error.code === 551 || error.code === 10;
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        requiresManual,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

/**
 * Envoie un message via la Facebook Page Messaging API.
 * Mêmes contraintes de fenêtre de conversation.
 *
 * Endpoint: POST /{page-id}/messages
 */
export async function sendFacebookMessage(
  pageId: string,
  recipientPsid: string,
  message: string,
  pageAccessToken: string,
  tag?: "human_agent"
): Promise<SendResult> {
  try {
    const body: Record<string, unknown> = {
      recipient: { id: recipientPsid },
      message: { text: message },
    };

    if (tag) {
      body.messaging_type = "MESSAGE_TAG";
      body.tag = tag;
    }

    const result = await metaPost<{ recipient_id?: string; message_id?: string }>(
      `/${pageId}/messages`,
      pageAccessToken,
      body
    );

    return {
      success: true,
      messageId: result.message_id,
    };
  } catch (error) {
    if (error instanceof MetaGraphApiError) {
      const requiresManual = error.code === 551 || error.code === 10;
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        requiresManual,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ VÉRIFICATION CONVERSATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si une fenêtre de conversation est ouverte avec un utilisateur.
 * Tente d'accéder aux conversations de la page pour voir si l'utilisateur en fait partie.
 */
export async function hasOpenConversation(
  igAccountId: string,
  userIgsid: string,
  pageAccessToken: string
): Promise<boolean> {
  try {
    // L'API conversations ne permet pas de filtrer par user_id directement.
    // On tente de récupérer les conversations récentes et de chercher l'utilisateur.
    const result = await metaGet<{
      data: Array<{ id: string; participants: { data: Array<{ id: string }> } }>;
    }>(
      `/${igAccountId}/conversations`,
      pageAccessToken,
      {
        fields: "id,participants",
        platform: "instagram",
      }
    );

    // Chercher si l'utilisateur apparaît dans une conversation récente
    for (const conversation of result.data || []) {
      const participantIds = conversation.participants?.data?.map((p) => p.id) || [];
      if (participantIds.includes(userIgsid)) {
        return true;
      }
    }

    return false;
  } catch {
    // En cas d'erreur, on suppose pas de conversation ouverte
    return false;
  }
}
