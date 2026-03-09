/**
 * 🔔 Webhook & Custom CRM Integration
 *
 * - WEBHOOK: envoie un POST JSON signé à l'URL stockée dans ExternalIntegration.
 * - CUSTOM_CRM: même mécanique, avec header Authorization si un token est fourni.
 *
 * La clé stockée peut être:
 *   - Pour WEBHOOK: "https://hooks.zapier.com/..."  (juste l'URL)
 *   - Pour CUSTOM_CRM: JSON {"url":"...", "token":"Bearer xxx"}
 */

import { getExternalIntegrationKey } from "./external";
import { createHmac } from "crypto";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Envoie un événement à l'URL webhook configurée (provider: WEBHOOK).
 * Le payload est signé HMAC-SHA256 avec un secret optionnel.
 */
export async function dispatchToWebhook(
  workspaceId: string,
  event: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; status?: number; error?: string }> {
  const raw = await getExternalIntegrationKey(workspaceId, "WEBHOOK");
  if (!raw) return { success: false, error: "Webhook non configuré pour ce workspace" };

  // Supporte format JSON {"url":"...","secret":"..."} ou URL simple
  let url: string;
  let secret: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { url: string; secret?: string };
    url = parsed.url;
    secret = parsed.secret;
  } catch {
    url = raw.trim();
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Skalle-Webhook/1.0",
  };

  if (secret) {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Skalle-Signature"] = `sha256=${signature}`;
  }

  try {
    const res = await fetch(url, { method: "POST", headers, body });
    return { success: res.ok, status: res.status };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Envoie un lead/contact à un CRM custom via HTTP (provider: CUSTOM_CRM).
 * La clé peut être: JSON {"url":"...","token":"Bearer xxx"} ou URL simple.
 */
export async function sendToCRM(
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; status?: number; error?: string }> {
  const raw = await getExternalIntegrationKey(workspaceId, "CUSTOM_CRM");
  if (!raw) return { success: false, error: "CRM non configuré pour ce workspace" };

  let url: string;
  let token: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { url: string; token?: string };
    url = parsed.url;
    token = parsed.token;
  } catch {
    url = raw.trim();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Skalle-CRM/1.0",
  };
  if (token) headers["Authorization"] = token;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    return { success: res.ok, status: res.status };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
