/**
 * 🔔 Webhook Outbound — Dispatcher
 *
 * Envoie les événements Skalle vers les URLs configurées par le client (Zapier, Make, CRM).
 * Signature HMAC SHA-256 dans le header X-Skalle-Signature pour authentifier l'origine.
 *
 * Appelé depuis Inngest pour bénéficier des retries automatiques en cas d'échec (5xx).
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const SIGNATURE_HEADER = "x-skalle-signature";

/**
 * Calcule la signature HMAC SHA-256 du payload avec le secret de l'endpoint.
 */
function computeSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Envoie un événement à tous les webhooks du workspace abonnés à cet événement.
 * Chaque requête est signée avec le secret de l'endpoint.
 * Lance une erreur si au moins un envoi échoue (pour que Inngest réessaie).
 */
export async function dispatchWebhook(
  workspaceId: string,
  eventName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      workspaceId,
      isActive: true,
      events: { has: eventName },
    },
  });

  if (endpoints.length === 0) {
    return;
  }

  const body = JSON.stringify({
    event: eventName,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    const signature = computeSignature(body, endpoint.secret);

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SIGNATURE_HEADER]: signature,
        },
        body,
      });

      if (!res.ok) {
        errors.push(
          `${endpoint.url}: ${res.status} ${res.statusText}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${endpoint.url}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Webhook delivery failed: ${errors.join("; ")}`);
  }
}
