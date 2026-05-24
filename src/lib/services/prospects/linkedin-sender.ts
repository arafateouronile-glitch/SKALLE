/**
 * LinkedIn Sender — envoie connexions et messages via Apify actors.
 *
 * Actors utilisés (configurables dans LinkedInAutomationConfig) :
 *   connect  → wangzishuo~linkedin-auto-connect
 *   message  → wangzishuo~linkedin-message-sender
 *
 * Nécessite APIFY_API_TOKEN + un cookie li_at valide.
 *
 * Limites recommandées (éviter ban LinkedIn) :
 *   - Connexions  : max 20/jour
 *   - Messages    : max 50/jour
 *   - Délai entre actions : 30–120s (géré par l'actor)
 */

const APIFY_BASE = "https://api.apify.com/v2";

export type LinkedInActionType = "connect" | "message" | "inmail";

export interface LinkedInAction {
  profileUrl: string;
  message?: string;  // note de connexion (max 300 car) ou message direct
  type: LinkedInActionType;
}

export interface LinkedInSendResult {
  profileUrl: string;
  success: boolean;
  error?: string;
}

interface ApifyRunResponse {
  data?: { id?: string; status?: string };
}

interface ApifyDatasetResponse {
  items?: Array<{
    profileUrl?: string;
    url?: string;
    success?: boolean;
    status?: string;
    error?: string;
    message?: string;
  }>;
}

async function runActorSync<T>(
  actorId: string,
  input: unknown,
  timeoutSecs = 120
): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&memory=256&timeout=${timeoutSecs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSecs + 30) * 1_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${actorId} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T[]>;
}

/**
 * Envoie une demande de connexion LinkedIn avec note optionnelle.
 * Utilise wangzishuo~linkedin-auto-connect (configurable).
 */
export async function sendConnectionRequest(
  profileUrl: string,
  note: string | undefined,
  liAt: string,
  actorId = "wangzishuo~linkedin-auto-connect"
): Promise<LinkedInSendResult> {
  try {
    await runActorSync(actorId, {
      sessionCookie: liAt,
      profileUrls: [profileUrl],
      message: note ? note.slice(0, 300) : undefined,
      maxConnections: 1,
      minDelay: 5,
      maxDelay: 15,
    });
    return { profileUrl, success: true };
  } catch (e: unknown) {
    return { profileUrl, success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Envoie un message direct à un contact LinkedIn existant.
 * Utilise wangzishuo~linkedin-message-sender (configurable).
 */
export async function sendDirectMessage(
  profileUrl: string,
  message: string,
  liAt: string,
  actorId = "wangzishuo~linkedin-message-sender"
): Promise<LinkedInSendResult> {
  try {
    await runActorSync(actorId, {
      sessionCookie: liAt,
      conversations: [{ profileUrl, message }],
      minDelay: 5,
      maxDelay: 20,
    });
    return { profileUrl, success: true };
  } catch (e: unknown) {
    return { profileUrl, success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Traite un batch d'actions LinkedIn en respectant les limites quotidiennes.
 * Retourne les résultats par profileUrl.
 */
export async function processBatch(
  actions: LinkedInAction[],
  liAt: string,
  config: { connectActor: string; messageActor: string }
): Promise<LinkedInSendResult[]> {
  const results: LinkedInSendResult[] = [];

  for (const action of actions) {
    let result: LinkedInSendResult;

    if (action.type === "connect") {
      result = await sendConnectionRequest(
        action.profileUrl,
        action.message,
        liAt,
        config.connectActor
      );
    } else {
      // message ou inmail → même actor
      result = await sendDirectMessage(
        action.profileUrl,
        action.message ?? "",
        liAt,
        config.messageActor
      );
    }

    results.push(result);

    // Petite pause humaine entre chaque action (3-8s)
    if (actions.indexOf(action) < actions.length - 1) {
      await new Promise((r) => setTimeout(r, 3_000 + Math.random() * 5_000));
    }
  }

  return results;
}

// Re-export du type pour référence externe
export type { ApifyRunResponse, ApifyDatasetResponse };
