/**
 * LinkedIn Sender — envoie connexions et messages via Apify actors.
 *
 * Sécurité anti-ban :
 *   - Warm-up progressif : 25 % → 40 % → 60 % → 80 % → 100 % sur 21 jours
 *   - Détection des erreurs LinkedIn (challenge, rate-limit, cookie expiré)
 *     → abortBatch=true sur le premier résultat critique → stop immédiat du batch
 *   - Délai humain 3–8 s entre chaque action
 */

const APIFY_BASE = "https://api.apify.com/v2";

export type LinkedInActionType = "connect" | "message" | "inmail";

export type LinkedInAbortCode =
  | "RATE_LIMITED"
  | "CHALLENGE"
  | "EXPIRED_COOKIE"
  | "RESTRICTED";

export interface LinkedInAction {
  profileUrl: string;
  message?: string;
  type: LinkedInActionType;
}

export interface LinkedInSendResult {
  profileUrl: string;
  success: boolean;
  error?: string;
  abortCode?: LinkedInAbortCode; // présent → arrêter le batch immédiatement
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

// ─── Warm-up ──────────────────────────────────────────────────────────────────

/**
 * Retourne les limites effectives en fonction du jour de warm-up.
 * Jours 0-4 : 25 %, 5-9 : 40 %, 10-14 : 60 %, 15-20 : 80 %, 21+ : 100 %
 */
export function getEffectiveLimits(
  warmupDay: number,
  connectLimit: number,
  messageLimit: number
): { effectiveConnect: number; effectiveMessage: number; warmupPct: number } {
  const pct =
    warmupDay >= 21 ? 1.0
    : warmupDay >= 15 ? 0.8
    : warmupDay >= 10 ? 0.6
    : warmupDay >= 5  ? 0.4
    : 0.25;

  return {
    effectiveConnect: Math.max(2, Math.floor(connectLimit * pct)),
    effectiveMessage: Math.max(3, Math.floor(messageLimit * pct)),
    warmupPct: Math.round(pct * 100),
  };
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyLinkedInError(msg: string): LinkedInAbortCode | undefined {
  const m = msg.toLowerCase();
  if (m.includes("429") || m.includes("rate limit") || m.includes("too many"))
    return "RATE_LIMITED";
  if (m.includes("challenge") || m.includes("captcha") || m.includes("verification"))
    return "CHALLENGE";
  if (
    m.includes("login") ||
    m.includes("sign in") ||
    m.includes("session") ||
    m.includes("expired") ||
    m.includes("cookie")
  )
    return "EXPIRED_COOKIE";
  if (m.includes("restricted") || m.includes("blocked") || m.includes("banned"))
    return "RESTRICTED";
  return undefined;
}

// ─── Apify runner ─────────────────────────────────────────────────────────────

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

// ─── Individual senders ───────────────────────────────────────────────────────

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
    const errMsg = e instanceof Error ? e.message : String(e);
    const abortCode = classifyLinkedInError(errMsg);
    return { profileUrl, success: false, error: errMsg, abortCode };
  }
}

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
    const errMsg = e instanceof Error ? e.message : String(e);
    const abortCode = classifyLinkedInError(errMsg);
    return { profileUrl, success: false, error: errMsg, abortCode };
  }
}

// ─── Batch processor ──────────────────────────────────────────────────────────

export interface BatchResult {
  results: LinkedInSendResult[];
  aborted: boolean;         // true si le batch a été interrompu
  abortCode?: LinkedInAbortCode;
}

/**
 * Traite un batch en s'arrêtant au premier signe de blocage LinkedIn.
 * Les items non traités restent PENDING (pas FAILED).
 */
export async function processBatch(
  actions: LinkedInAction[],
  liAt: string,
  config: { connectActor: string; messageActor: string }
): Promise<BatchResult> {
  const results: LinkedInSendResult[] = [];
  let aborted = false;
  let abortCode: LinkedInAbortCode | undefined;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let result: LinkedInSendResult;

    if (action.type === "connect") {
      result = await sendConnectionRequest(
        action.profileUrl,
        action.message,
        liAt,
        config.connectActor
      );
    } else {
      result = await sendDirectMessage(
        action.profileUrl,
        action.message ?? "",
        liAt,
        config.messageActor
      );
    }

    results.push(result);

    if (result.abortCode) {
      aborted = true;
      abortCode = result.abortCode;
      break; // arrêt immédiat
    }

    // Petite pause humaine entre chaque action (3–8 s)
    if (i < actions.length - 1) {
      await new Promise((r) => setTimeout(r, 3_000 + Math.random() * 5_000));
    }
  }

  return { results, aborted, abortCode };
}

export type { ApifyRunResponse, ApifyDatasetResponse };
