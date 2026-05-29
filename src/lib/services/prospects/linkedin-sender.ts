/**
 * LinkedIn Sender — Voyager API (direct, sans Apify)
 *
 * Sécurité anti-ban :
 *   1. Warm-up progressif : 25 % → 40 % → 60 % → 80 % → 100 % sur 21 jours
 *   2. Détection des erreurs LinkedIn (challenge, rate-limit, cookie expiré)
 *      → abortBatch immédiat, steps restants laissés PENDING
 *   3. Session Voyager : li_at + JSESSIONID (CSRF) obtenus dynamiquement sur /me
 *   4. Résolution URL LinkedIn → profileId avant chaque envoi
 *   5. Délai humain 3–8 s entre chaque action
 */

const LI_BASE = "https://www.linkedin.com/voyager/api";
const LI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

interface VoyagerSession {
  cookie: string;
  csrfToken: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⏫ WARM-UP
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 ERROR CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

function classifyLinkedInError(msg: string): LinkedInAbortCode | undefined {
  const m = msg.toLowerCase();
  if (m.includes("429") || m.includes("rate limit") || m.includes("too many"))
    return "RATE_LIMITED";
  if (m.includes("challenge") || m.includes("captcha") || m.includes("verification"))
    return "CHALLENGE";
  // 403 sur /messaging = "non connecté" (pas une erreur d'auth) → pas d'abort
  // 401 uniquement = cookie vraiment expiré
  if (
    m.includes("login") ||
    m.includes("sign in") ||
    m.includes("session") ||
    m.includes("expired") ||
    m.includes("cookie") ||
    m.includes("expired_cookie") ||
    m.includes("401")
  )
    return "EXPIRED_COOKIE";
  if (m.includes("restricted") || m.includes("blocked") || m.includes("banned"))
    return "RESTRICTED";
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 VOYAGER SESSION (li_at + JSESSIONID)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit la session Voyager.
 *
 * Si jsessionId est fourni (stocké en DB) → utilisé directement, zéro HTTP.
 * Sinon → tentative via la homepage LinkedIn (redirect:manual).
 */
async function getVoyagerSession(liAt: string, jsessionId?: string | null): Promise<VoyagerSession> {
  if (jsessionId) {
    return {
      cookie: `li_at=${liAt}; JSESSIONID="${jsessionId}"`,
      csrfToken: jsessionId,
    };
  }

  // Fallback : homepage LinkedIn envoie toujours JSESSIONID en Set-Cookie (pages HTML)
  const res = await fetch("https://www.linkedin.com/", {
    headers: {
      Cookie: `li_at=${liAt}`,
      "User-Agent": LI_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  const location = res.headers.get("location") ?? "";
  if (
    location.includes("/login") ||
    location.includes("/uas/") ||
    location.includes("authwall") ||
    res.status === 401 ||
    res.status === 403
  ) {
    throw Object.assign(new Error("EXPIRED_COOKIE"), {
      abortCode: "EXPIRED_COOKIE" as LinkedInAbortCode,
    });
  }

  const sid = extractSetCookieValue(res, "JSESSIONID");
  if (!sid) {
    throw Object.assign(
      new Error(
        "JSESSIONID introuvable — collez aussi le cookie JSESSIONID dans les paramètres LinkedIn"
      ),
      { abortCode: "EXPIRED_COOKIE" as LinkedInAbortCode }
    );
  }

  return {
    cookie: `li_at=${liAt}; JSESSIONID="${sid}"`,
    csrfToken: sid,
  };
}

function extractSetCookieValue(res: Response, name: string): string | null {
  type H = Headers & { getSetCookie?: () => string[] };
  const cookies =
    (res.headers as H).getSetCookie?.() ??
    (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=[^;]+)/).map((s) => s.trim());
  for (const c of cookies) {
    const match = c.match(new RegExp(`${name}=(?:"([^"]+)"|([^;,\\s]+))`, "i"));
    if (match) return match[1] ?? match[2];
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔎 PROFILE RESOLUTION (URL → memberId)
// ═══════════════════════════════════════════════════════════════════════════

function extractPublicId(linkedInUrl: string): string {
  const match = linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) throw new Error(`URL LinkedIn invalide: ${linkedInUrl}`);
  return match[1].replace(/\/+$/, "");
}

async function resolveProfileId(publicId: string, session: VoyagerSession): Promise<string> {
  const url = `${LI_BASE}/identity/profiles/${encodeURIComponent(publicId)}?projection=(entityUrn,miniProfile~(entityUrn,objectUrn))`;
  const res = await fetch(url, {
    headers: {
      Cookie: session.cookie,
      "Csrf-Token": session.csrfToken,
      "User-Agent": LI_UA,
      "X-Li-Lang": "fr_FR",
      "X-Restli-Protocol-Version": "2.0.0",
      Accept: "application/vnd.linkedin.normalized+json+2.1",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Profil "${publicId}" introuvable (HTTP ${res.status})`);
  }

  // LinkedIn Voyager renvoie plusieurs formats selon la version négociée.
  // On cherche entityUrn (urn:li:fsd_profile:XXX) qui est requis pour le messaging.
  const data = (await res.json()) as Record<string, unknown>;

  const urn =
    (data.entityUrn as string | undefined) ??
    (data.miniProfile as Record<string, unknown> | undefined)?.entityUrn as string | undefined ??
    // Format normalisé : wrapped dans "data" ou "included[0]"
    (data.data as Record<string, unknown> | undefined)?.entityUrn as string | undefined;

  if (urn?.includes("fsd_profile")) {
    const profileId = urn.split(":").pop()!;
    return profileId;
  }

  // Dernier recours : objectUrn = urn:li:member:12345678 — LinkedIn accepte
  // ce format comme recipient dans les messages mais moins fiable
  const objectUrn =
    (data.objectUrn as string | undefined) ??
    (data.miniProfile as Record<string, unknown> | undefined)?.objectUrn as string | undefined;

  if (objectUrn) {
    const memberId = objectUrn.split(":").pop()!;
    return memberId;
  }

  throw new Error(`Impossible de résoudre le profileId pour "${publicId}" — réponse: ${JSON.stringify(data).slice(0, 200)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ✉️ VOYAGER SENDERS
// ═══════════════════════════════════════════════════════════════════════════

async function voyagerSendMessage(
  profileId: string,
  message: string,
  session: VoyagerSession
): Promise<void> {
  const body = {
    keyVersion: "LEGACY_INBOX",
    conversationCreate: {
      eventCreate: {
        value: {
          "com.linkedin.voyager.messaging.create.MessageCreate": {
            attributedBody: { text: message, attributes: [] },
            attachments: [],
          },
        },
      },
      recipients: [`urn:li:fsd_profile:${profileId}`],
      subtype: "MEMBER_TO_MEMBER",
    },
  };

  const res = await fetch(`${LI_BASE}/messaging/conversations`, {
    method: "POST",
    headers: {
      Cookie: session.cookie,
      "Csrf-Token": session.csrfToken,
      "User-Agent": LI_UA,
      "Content-Type": "application/json",
      "X-Li-Lang": "fr_FR",
      "X-Restli-Protocol-Version": "2.0.0",
      Accept: "application/vnd.linkedin.normalized+json+2.1",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DM LinkedIn HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function voyagerSendConnection(
  profileId: string,
  note: string | undefined,
  session: VoyagerSession
): Promise<void> {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const trackingId = Buffer.from(randomBytes).toString("base64");

  const body = {
    trackingId,
    message: note?.slice(0, 300) ?? "",
    invitee: {
      "com.linkedin.voyager.growth.invitation.InviteeProfile": { profileId },
    },
  };

  const res = await fetch(`${LI_BASE}/growth/normInvitations`, {
    method: "POST",
    headers: {
      Cookie: session.cookie,
      "Csrf-Token": session.csrfToken,
      "User-Agent": LI_UA,
      "Content-Type": "application/json",
      "X-Li-Lang": "fr_FR",
      "X-Restli-Protocol-Version": "2.0.0",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Connect LinkedIn HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ COOKIE VALIDITY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export async function checkLinkedInCookie(liAt: string): Promise<{ valid: boolean }> {
  if (!liAt) return { valid: false };
  try {
    const res = await fetch(`${LI_BASE}/identity/profiles/me`, {
      headers: {
        Cookie: `li_at=${liAt}`,
        "User-Agent": LI_UA,
        "X-Li-Lang": "fr_FR",
        "X-Restli-Protocol-Version": "2.0.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return { valid: res.status !== 401 && res.status !== 403 };
  } catch {
    return { valid: true }; // fail-open sur erreur réseau
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export async function sendConnectionRequest(
  profileUrl: string,
  note: string | undefined,
  liAt: string,
  jsessionId?: string | null
): Promise<LinkedInSendResult> {
  try {
    const session = await getVoyagerSession(liAt, jsessionId);
    const profileId = await resolveProfileId(extractPublicId(profileUrl), session);
    await voyagerSendConnection(profileId, note, session);
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
  jsessionId?: string | null
): Promise<LinkedInSendResult> {
  try {
    const session = await getVoyagerSession(liAt, jsessionId);
    const profileId = await resolveProfileId(extractPublicId(profileUrl), session);
    await voyagerSendMessage(profileId, message, session);
    return { profileUrl, success: true };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { profileUrl, success: false, error: errMsg, abortCode: classifyLinkedInError(errMsg) };
  }
}

/**
 * Traite un sous-batch en s'arrêtant au premier signe de blocage LinkedIn.
 * Réutilise la même session Voyager pour tout le batch (1 appel /me ou zéro si jsessionId fourni).
 * Les items non traités restent PENDING (pas FAILED).
 */
export async function processBatch(
  actions: LinkedInAction[],
  liAt: string,
  jsessionId?: string | null
): Promise<BatchResult> {
  let session: VoyagerSession;
  try {
    session = await getVoyagerSession(liAt, jsessionId);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const abortCode: LinkedInAbortCode = classifyLinkedInError(errMsg) ?? "EXPIRED_COOKIE";
    return {
      results: actions.map((a) => ({ profileUrl: a.profileUrl, success: false, error: errMsg, abortCode })),
      aborted: true,
      abortCode,
    };
  }

  const results: LinkedInSendResult[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let result: LinkedInSendResult;

    try {
      const profileId = await resolveProfileId(extractPublicId(action.profileUrl), session);
      if (action.type === "connect") {
        await voyagerSendConnection(profileId, action.message, session);
      } else {
        await voyagerSendMessage(profileId, action.message ?? "", session);
      }
      result = { profileUrl: action.profileUrl, success: true };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      result = {
        profileUrl: action.profileUrl,
        success: false,
        error: errMsg,
        abortCode: classifyLinkedInError(errMsg),
      };
    }

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
