/**
 * LinkedIn Sender — envoie connexions et messages via Apify actors.
 *
 * Sécurité anti-ban :
 *   1. Warm-up progressif : 25 % → 40 % → 60 % → 80 % → 100 % sur 21 jours
 *   2. Détection des erreurs LinkedIn (challenge, rate-limit, cookie expiré)
 *      → abortBatch immédiat, steps restants laissés PENDING
 *   3. Proxy résidentiel Apify (opt-in via APIFY_PROXY_ENABLED=true)
 *      → même pays que l'utilisateur pour éviter les logins suspects
 *   4. Cookie validity check avant chaque batch (fail-open si réseau KO)
 *   5. Délai humain 3–8 s entre chaque action
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
  abortCode?: LinkedInAbortCode;
}

export interface BatchResult {
  results: LinkedInSendResult[];
  aborted: boolean;
  abortCode?: LinkedInAbortCode;
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

// ─── Cookie validity check ────────────────────────────────────────────────────

/**
 * Vérifie que le cookie li_at est encore valide via l'API Voyager LinkedIn.
 * Fail-open : si le réseau échoue, on considère le cookie valide pour ne pas
 * bloquer l'automation sur une erreur transitoire.
 */
export async function checkLinkedInCookie(liAt: string): Promise<{ valid: boolean }> {
  if (!liAt) return { valid: false };
  try {
    const res = await fetch("https://www.linkedin.com/voyager/api/identity/profiles/me", {
      headers: {
        Cookie: `li_at=${liAt}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "X-Li-Lang": "fr_FR",
        "X-Restli-Protocol-Version": "2.0.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    // 401 / 403 = session expirée ; 200 / 302 = OK
    return { valid: res.status !== 401 && res.status !== 403 };
  } catch {
    // Réseau KO → fail-open, on laisse l'actor décider
    return { valid: true };
  }
}

// ─── Proxy résidentiel ────────────────────────────────────────────────────────

/**
 * Construit la config proxy Apify résidentiel.
 * Activé uniquement si APIFY_PROXY_ENABLED=true dans les variables d'env.
 * Utilise le même pays que l'utilisateur pour éviter les connexions suspectes.
 */
function buildProxyConfig(country: string): object | undefined {
  if (process.env.APIFY_PROXY_ENABLED !== "true") return undefined;
  return {
    useApifyProxy: true,
    apifyProxyGroups: ["RESIDENTIAL"],
    apifyProxyCountry: country.toUpperCase(),
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
  input: object,
  options: { timeoutSecs?: number; proxyCountry?: string } = {}
): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const { timeoutSecs = 120, proxyCountry } = options;
  const proxyConfig = proxyCountry ? buildProxyConfig(proxyCountry) : undefined;
  const enrichedInput = proxyConfig ? { ...input, proxyConfiguration: proxyConfig } : input;

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&memory=256&timeout=${timeoutSecs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedInput),
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
  actorId = "wangzishuo~linkedin-auto-connect",
  proxyCountry?: string
): Promise<LinkedInSendResult> {
  try {
    await runActorSync(
      actorId,
      {
        sessionCookie: liAt,
        profileUrls: [profileUrl],
        message: note ? note.slice(0, 300) : undefined,
        maxConnections: 1,
        minDelay: 5,
        maxDelay: 15,
      },
      { proxyCountry }
    );
    return { profileUrl, success: true };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { profileUrl, success: false, error: errMsg, abortCode: classifyLinkedInError(errMsg) };
  }
}

export async function sendDirectMessage(
  profileUrl: string,
  message: string,
  liAt: string,
  actorId = "wangzishuo~linkedin-message-sender",
  proxyCountry?: string
): Promise<LinkedInSendResult> {
  try {
    await runActorSync(
      actorId,
      {
        sessionCookie: liAt,
        conversations: [{ profileUrl, message }],
        minDelay: 5,
        maxDelay: 20,
      },
      { proxyCountry }
    );
    return { profileUrl, success: true };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { profileUrl, success: false, error: errMsg, abortCode: classifyLinkedInError(errMsg) };
  }
}

// ─── Batch processor ──────────────────────────────────────────────────────────

/**
 * Traite un sous-batch en s'arrêtant au premier signe de blocage LinkedIn.
 * Les items non traités restent PENDING (pas FAILED).
 */
export async function processBatch(
  actions: LinkedInAction[],
  liAt: string,
  config: { connectActor: string; messageActor: string; proxyCountry?: string }
): Promise<BatchResult> {
  const results: LinkedInSendResult[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result =
      action.type === "connect"
        ? await sendConnectionRequest(
            action.profileUrl,
            action.message,
            liAt,
            config.connectActor,
            config.proxyCountry
          )
        : await sendDirectMessage(
            action.profileUrl,
            action.message ?? "",
            liAt,
            config.messageActor,
            config.proxyCountry
          );

    results.push(result);

    if (result.abortCode) {
      return { results, aborted: true, abortCode: result.abortCode };
    }

    // Pause humaine entre actions (3–8 s)
    if (i < actions.length - 1) {
      await new Promise((r) => setTimeout(r, 3_000 + Math.random() * 5_000));
    }
  }

  return { results, aborted: false };
}

export type { ApifyRunResponse, ApifyDatasetResponse };
