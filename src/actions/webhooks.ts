"use server";

/**
 * Actions pour les Webhooks Outbound (notifications client).
 */

import { auth } from "@/lib/auth";

/** Options d’événements pour la configuration des webhooks (export pour la page settings). */
export const WEBHOOK_EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "webhook.ping", label: "Test / Ping" },
  { value: "seo.article.completed", label: "Article SEO publié" },
  { value: "prospect.replied", label: "Réponse prospect" },
  { value: "prospect.converted", label: "Prospect converti" },
];
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/services/webhooks/dispatcher";
import { randomBytes } from "crypto";

async function getWorkspaceId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const ws = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return ws?.id ?? null;
}

export async function listWebhookEndpointsAction(): Promise<{
  success: boolean;
  endpoints?: Array<{
    id: string;
    url: string;
    secretMasked: string;
    isActive: boolean;
    events: string[];
    createdAt: Date;
  }>;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non autorisé" };

  const list = await prisma.webhookEndpoint.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    endpoints: list.map((e) => ({
      id: e.id,
      url: e.url,
      secretMasked: e.secret.slice(0, 8) + "…" + e.secret.slice(-4),
      isActive: e.isActive,
      events: e.events,
      createdAt: e.createdAt,
    })),
  };
}

export async function getWebhookSecretAction(endpointId: string): Promise<{
  success: boolean;
  secret?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non autorisé" };

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: endpointId,
      workspace: { userId: session.user.id },
    },
    select: { secret: true },
  });

  if (!endpoint) return { success: false, error: "Endpoint introuvable" };
  return { success: true, secret: endpoint.secret };
}

export async function createWebhookEndpointAction(
  url: string,
  events: string[]
): Promise<{
  success: boolean;
  id?: string;
  secret?: string;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non autorisé" };

  const trimmed = url.trim();
  if (!trimmed) return { success: false, error: "URL requise" };
  try {
    new URL(trimmed);
  } catch {
    return { success: false, error: "URL invalide" };
  }
  if (!events.length) return { success: false, error: "Sélectionnez au moins un événement" };

  const secret = randomBytes(32).toString("hex");

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      url: trimmed,
      secret,
      events,
      workspaceId,
    },
  });

  return {
    success: true,
    id: endpoint.id,
    secret: endpoint.secret,
  };
}

export async function updateWebhookEndpointAction(
  id: string,
  data: { isActive?: boolean; events?: string[] }
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non autorisé" };

  await prisma.webhookEndpoint.updateMany({
    where: { id, workspaceId },
    data,
  });
  return { success: true };
}

export async function deleteWebhookEndpointAction(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non autorisé" };

  await prisma.webhookEndpoint.deleteMany({
    where: { id, workspaceId },
  });
  return { success: true };
}

/** Envoie un événement ping de test vers tous les endpoints du workspace abonnés à webhook.ping */
export async function sendWebhookTestAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non autorisé" };

  try {
    await dispatchWebhook(workspaceId, "webhook.ping", {
      message: "Test from Skalle — votre webhook fonctionne.",
      timestamp: new Date().toISOString(),
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Échec de l'envoi du test",
    };
  }
}
