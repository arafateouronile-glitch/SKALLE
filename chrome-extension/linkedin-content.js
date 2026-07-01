/**
 * SKALLE - LinkedIn Profile Enricher (mode passif)
 *
 * S'exécute automatiquement quand l'utilisateur visite un profil LinkedIn.
 * Capture : headline, section "À propos", expériences (5 max).
 * Envoie vers POST /api/prospects/linkedin-profile → stocké dans enrichmentData du prospect.
 *
 * Stratégies (dans l'ordre) :
 * 1. Appel Voyager API direct avec le cookie JSESSIONID comme CSRF token
 * 2. Extraction DOM en dernier recours
 */

// ── Config ────────────────────────────────────────────────────────────────────

// ── Session fingerprint ───────────────────────────────────────────────────────
// Générés une fois par chargement de page, réutilisés pour tous les appels Voyager.
// Même format que LinkedIn web : UUID stable sur la durée d'une session page.

const _LI_UUID = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
const _LI_PAGE_INST = (() => {
  const id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))))
    .replace(/[+/=]/g, "").slice(0, 24);
  return `urn:li:page:d_flagship3_profile_view_base;${id}`;
})();

function voyagerHeaders(csrf) {
  return {
    "csrf-token": csrf,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "fr_FR",
    "x-li-uuid": _LI_UUID,
    "x-li-page-instance": _LI_PAGE_INST,
    accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

function getApiBase() {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) return resolve("https://skalle.vercel.app");
    chrome.storage.sync.get({ skalleApiBase: "" }, (r) => {
      resolve(r.skalleApiBase?.trim() || "https://skalle.vercel.app");
    });
  });
}

function getToken() {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) return resolve("");
    chrome.storage.sync.get(["skalleToken"], (r) => resolve(r.skalleToken || ""));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wrapper fetch Voyager avec détection automatique des signaux de ban.
 * Retourne { res, abortCode } — abortCode est null si tout va bien.
 *
 * Codes retournés :
 *   RATE_LIMITED  → HTTP 429 (LinkedIn rate limit)
 *   CHALLENGE     → HTTP 999, ou URL /checkpoint/, ou body "challenge"
 *   RESTRICTED    → HTTP 403 avec "restricted" / "blocked" / "banned"
 */
async function voyagerFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { credentials: "include", ...options });
  } catch (err) {
    return { res: null, abortCode: "NETWORK_ERROR", error: String(err) };
  }

  // LinkedIn renvoie 999 pour les bots détectés (non-standard)
  if (res.status === 999) return { res, abortCode: "CHALLENGE" };

  if (res.status === 429) return { res, abortCode: "RATE_LIMITED" };

  // Redirect vers page challenge (LinkedIn ne suit pas toujours avec 302)
  if (res.url && (
    res.url.includes("/checkpoint/challenge") ||
    res.url.includes("/authwall") ||
    res.url.includes("/uas/login")
  )) {
    return { res, abortCode: "CHALLENGE" };
  }

  if (res.status === 403) {
    // Lire le body pour distinguer ban confirmé / challenge / erreur normale
    // Un 403 générique (profil privé, non connecté) NE doit PAS bloquer l'automation
    try {
      const text = await res.clone().text();
      if (/challenge|captcha|verification/i.test(text)) {
        return { res, abortCode: "CHALLENGE" };
      }
      // Seulement si LinkedIn confirme explicitement une restriction de compte
      if (/your account has been restricted|account restricted|member has been blocked/i.test(text)) {
        return { res, abortCode: "RESTRICTED" };
      }
    } catch { /* ignore */ }
    // 403 générique = échec silencieux, pas d'arrêt de l'automation
    return { res, abortCode: null };
  }

  return { res, abortCode: null };
}

function getUsername() {
  return window.location.pathname.match(/\/in\/([^/?]+)/)?.[1] ?? null;
}

function getCsrfToken() {
  // JSESSIONID n'est pas HttpOnly sur LinkedIn — lisible en JS
  return document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1] ?? null;
}

function normalizeLinkedInUrl(pathname) {
  return "https://www.linkedin.com" + pathname.split("?")[0].replace(/\/$/, "");
}

// ── Stratégie 1 : Voyager API direct ─────────────────────────────────────────

async function fetchVoyager(username, csrf) {
  const [profRes, posRes] = await Promise.allSettled([
    fetch(`/voyager/api/identity/profiles/${username}`, {
      headers: voyagerHeaders(csrf),
      credentials: "include",
    }),
    fetch(
      `/voyager/api/identity/profiles/${username}/positions?count=5`,
      { headers: voyagerHeaders(csrf), credentials: "include" }
    ),
  ]);

  let headline = null;
  let about = null;
  let experiences = [];

  if (profRes.status === "fulfilled" && profRes.value.ok) {
    try {
      const d = await profRes.value.json();
      headline = d.headline ?? null;
      about = d.summary ?? null;
    } catch {}
  }

  if (posRes.status === "fulfilled" && posRes.value.ok) {
    try {
      const d = await posRes.value.json();
      experiences = (d.elements ?? [])
        .slice(0, 5)
        .map((p) => ({
          title: p.title ?? "",
          company: p.companyName ?? "",
          description: p.description ?? null,
        }))
        .filter((e) => e.title);
    } catch {}
  }

  return { headline, about, experiences };
}

// ── Stratégie 2 : extraction DOM ─────────────────────────────────────────────

function extractDOM() {
  const result = { headline: null, about: null, experiences: [] };

  try {
    // Headline (div sous le h1)
    const h1 = document.querySelector("h1");
    const headlineEl = h1?.nextElementSibling;
    if (headlineEl?.textContent?.trim().length > 3) {
      result.headline = headlineEl.textContent.trim().slice(0, 200);
    }

    // About
    const aboutAnchor = document.getElementById("about");
    if (aboutAnchor) {
      const section = aboutAnchor.closest("section");
      if (section) {
        const spans = section.querySelectorAll('span[aria-hidden="true"]');
        const text = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean)
          .join(" ");
        if (text.length > 30) result.about = text.slice(0, 2000);
      }
    }

    // Experience (5 max)
    const expAnchor = document.getElementById("experience");
    if (expAnchor) {
      const section = expAnchor.closest("section");
      if (section) {
        const items = section.querySelectorAll("li");
        result.experiences = Array.from(items)
          .slice(0, 5)
          .map((li) => {
            const spans = li.querySelectorAll('span[aria-hidden="true"]');
            const texts = Array.from(spans)
              .map((s) => s.textContent?.trim())
              .filter(Boolean);
            return {
              title: texts[0] ?? "",
              company: texts[1] ?? "",
              description: texts[3] ?? null,
            };
          })
          .filter((e) => e.title.length > 1);
      }
    }
  } catch {}

  return result;
}

// ── Envoi vers SKALLE ─────────────────────────────────────────────────────────

async function send(enrichment) {
  const hasData =
    enrichment.headline || enrichment.about || enrichment.experiences?.length;
  if (!hasData) return false;

  const token = await getToken();
  if (!token) {
    console.debug("[SKALLE] Token non configuré — configurez-le dans le popup de l'extension");
    return false;
  }

  const apiBase = await getApiBase();
  const linkedInUrl = normalizeLinkedInUrl(window.location.pathname);

  try {
    const res = await fetch(`${apiBase}/api/prospects/linkedin-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        linkedInUrl,
        ...enrichment,
        capturedAt: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.updated > 0) {
        console.log(
          `[SKALLE] ✓ ${json.updated} prospect(s) enrichi(s) : ${linkedInUrl}`
        );
      }
      return true;
    }
  } catch (err) {
    console.debug("[SKALLE] Envoi échoué :", err.message);
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const username = getUsername();
  if (!username) return;

  // Stratégie 1 : Voyager direct (attend 2s pour que la page soit chargée)
  await new Promise((r) => setTimeout(r, 2000));
  const csrf = getCsrfToken();
  if (csrf) {
    try {
      const enrichment = await fetchVoyager(username, csrf);
      if (enrichment.headline || enrichment.about) {
        await send(enrichment);
        return;
      }
    } catch {}
  }

  // Stratégie 2 : DOM (après 4s supplémentaires si React n'a pas encore rendu)
  await new Promise((r) => setTimeout(r, 4000));
  const domData = extractDOM();
  await send(domData);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATION — Listener pour les commandes du background service worker
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Résout un username LinkedIn → entityUrn + distance de connexion
 * distance: "DISTANCE_1" (connecté), "DISTANCE_2", "DISTANCE_3", "OUT_OF_NETWORK"
 */
async function resolveLinkedInProfile(username, csrf) {
  try {
    const res = await fetch(
      `/voyager/api/identity/profiles/${username}`,
      { headers: voyagerHeaders(csrf), credentials: "include" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      entityUrn: data.entityUrn ?? null,
      distance: data.distance?.value ?? "DISTANCE_2",
      firstName: data.firstName ?? "",
    };
  } catch {
    return null;
  }
}

// ── DOM helpers pour la simulation de clic ───────────────────────────────────

function waitForElement(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}

function findConnectButton() {
  // Aria-label = le sélecteur le plus stable (pas dépendant des class names)
  const byAria = document.querySelector(
    'button[aria-label*="Se connecter avec"], button[aria-label*="Connect with"]'
  );
  if (byAria && !byAria.disabled) return byAria;

  // Texte exact du bouton (fallback si aria-label absent)
  return Array.from(document.querySelectorAll("button")).find((b) => {
    const text = b.textContent.trim();
    return (text === "Se connecter" || text === "Connect") && !b.disabled;
  }) ?? null;
}

/**
 * Clique sur le bouton "Se connecter" via le DOM.
 * LinkedIn génère lui-même la requête normInvitations → headers natifs + timing naturel.
 */
async function sendConnectionRequestDOM(connectNote) {
  const btn = findConnectButton();
  if (!btn) return { ok: false, reason: "button_not_found" };

  btn.click();

  const modal = await waitForElement('[role="dialog"]', 3000);
  if (!modal) return { ok: false, reason: "modal_timeout" };

  if (connectNote?.trim()) {
    const addNoteBtn =
      modal.querySelector('button[aria-label*="note" i]') ??
      Array.from(modal.querySelectorAll("button")).find((b) =>
        b.textContent.trim().toLowerCase().includes("note")
      );

    if (addNoteBtn) {
      addNoteBtn.click();
      await new Promise((r) => setTimeout(r, 600));

      const textarea = await waitForElement("textarea", 1500);
      if (textarea) {
        // Contournement React : setter natif pour déclencher le state update
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(textarea, connectNote.slice(0, 300));
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  const sendBtn =
    modal.querySelector('button[aria-label*="Envoyer"]') ??
    modal.querySelector('button[aria-label*="Send"]') ??
    Array.from(modal.querySelectorAll("button")).find(
      (b) =>
        b.textContent.trim().toLowerCase().startsWith("envoyer") ||
        b.textContent.trim().toLowerCase() === "send"
    );

  if (!sendBtn) return { ok: false, reason: "send_button_not_found" };

  sendBtn.click();
  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
}

/**
 * Envoie une demande de connexion LinkedIn avec une note personnalisée.
 * Stratégie 1 : clic DOM sur la page du profil (requête générée par LinkedIn lui-même).
 * Stratégie 2 : Voyager API direct (fallback — mode queue hors page profil).
 */
async function sendConnectionRequest(username, connectNote, csrf) {
  // DOM click si on est sur la page du profil cible
  if (window.location.pathname.includes(`/in/${username}`)) {
    const domResult = await sendConnectionRequestDOM(connectNote);
    if (domResult.ok) return { ok: true };
    console.debug("[SKALLE] DOM click échoué:", domResult.reason, "→ fallback Voyager");
  }

  // Fallback : Voyager API direct
  const headers = { ...voyagerHeaders(csrf), "content-type": "application/json" };

  const { res, abortCode } = await voyagerFetch("/voyager/api/growth/normInvitations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      invitee: {
        "com.linkedin.voyager.growth.invitation.InviteeProfile": { profileId: username },
      },
      trackingId: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))),
      message: (connectNote ?? "").slice(0, 300),
    }),
  });

  if (abortCode) return { ok: false, abortCode };
  if (res?.ok) return { ok: true };

  // Fallback format plus récent
  const { res: res2, abortCode: ab2 } = await voyagerFetch(
    "/voyager/api/voyagerRelationships/dash/invitations?action=verifyQuotaAndCreateV2",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        inviteeProfileUrn: `urn:li:fsd_profile:${username}`,
        customMessage: (connectNote ?? "").slice(0, 300),
      }),
    }
  );

  if (ab2) return { ok: false, abortCode: ab2 };
  return { ok: res2?.ok ?? false, status: res2?.status };
}

/**
 * Envoie un message à une connexion 1er degré
 */
async function sendLinkedInMessage(entityUrn, messageText, csrf) {
  const { res, abortCode } = await voyagerFetch(
    "/voyager/api/messaging/conversations?action=create",
    {
      method: "POST",
      headers: { ...voyagerHeaders(csrf), "content-type": "application/json" },
      body: JSON.stringify({
        keyVersion: "LEGACY_INBOX",
        conversationCreate: {
          recipients: [entityUrn],
          message: { body: messageText, originToken: crypto.randomUUID() },
        },
      }),
    }
  );
  if (abortCode) return { ok: false, abortCode };
  return { ok: res?.ok ?? false, status: res?.status };
}

/**
 * Handler principal — exécute une décision CSO
 */
// Vérifie que le nom du profil LinkedIn affiché dans le DOM correspond
// au prospect attendu. Normalise accents + casse + ponctuation.
// Retourne true si tous les tokens du nom attendu sont présents dans le nom DOM.
function profileNameMatches(expectedName, domName) {
  if (!expectedName || !domName) return true; // pas de donnée → pas de blocage
  const norm = (s) => s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
  const exp = norm(expectedName);
  const dom = norm(domName);
  // Tous les tokens du nom attendu doivent apparaître dans le nom DOM
  return exp.split(" ").every((tok) => dom.includes(tok));
}

async function executeDecision(decision) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf — non connecté à LinkedIn" };

  const data = decision.actionData ?? {};
  const linkedInUrl = data.linkedInUrl ?? "";

  if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
    const usernameMatch = linkedInUrl.match(/\/in\/([^/?#]+)/);
    if (!usernameMatch) return { ok: false, error: "invalid_linkedin_url" };
    const username = usernameMatch[1];

    // ── Vérification DOM : s'assurer qu'on est sur le bon profil ──────────
    // Le background.js navigue vers l'URL du prospect avant d'appeler SKALLE_EXECUTE,
    // donc window.location.pathname doit matcher /in/${username}.
    if (window.location.pathname.includes(`/in/${username}`)) {
      const domName = document.querySelector("h1")?.textContent?.trim() ?? "";
      const expectedName = (data.prospectName as string) ?? "";
      if (!profileNameMatches(expectedName, domName)) {
        console.warn(`[SKALLE] profile_mismatch: attendu "${expectedName}", trouvé "${domName}" — action annulée`);
        return { ok: false, error: `profile_mismatch: attendu "${expectedName}", trouvé "${domName}"` };
      }
    }

    // Résoudre le profil (URN + distance)
    const profile = await resolveLinkedInProfile(username, csrf);
    if (!profile) return { ok: false, error: "profile_not_found" };

    if (profile.distance === "DISTANCE_1") {
      // Déjà connecté → envoyer le message post-connexion
      const message = data.postConnectionMessage ?? data.connectNote ?? "";
      if (!message) return { ok: false, error: "no_message" };
      const result = await sendLinkedInMessage(profile.entityUrn, message, csrf);
      return { ...result, action: "message_sent", username };
    } else {
      // Pas encore connecté → envoyer la demande de connexion
      const result = await sendConnectionRequest(username, data.connectNote, csrf);
      return { ...result, action: "connection_request", username };
    }
  }

  return { ok: false, error: `action_type_non_supportée: ${decision.actionType}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE AUTONOME — Recherche LinkedIn + Enrichissement + Connexion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recherche des profils LinkedIn via l'API Voyager (sans navigation)
 * Retourne une liste de profils filtrés (distance ≠ DISTANCE_1)
 */
async function voyagerSearch(keywords, csrf, count = 15) {
  const params = new URLSearchParams({
    keywords,
    origin: "GLOBAL_SEARCH_HEADER",
    q: "all",
    start: "0",
    count: String(count),
  });

  try {
    const { res, abortCode } = await voyagerFetch(
      `/voyager/api/search/blended?${params.toString()}&filters=List((key:resultType,value:List(PEOPLE)))`,
      { headers: voyagerHeaders(csrf) }
    );
    // Propager l'abort code pour que le caller puisse stopper
    if (abortCode) return { abortCode, profiles: [] };
    if (!res?.ok) return { abortCode: null, profiles: [] };
    const data = await res.json();
    return { abortCode: null, profiles: extractProfilesFromSearch(data) };
  } catch {
    return { abortCode: null, profiles: [] };
  }
}

function extractProfilesFromSearch(data) {
  const profiles = [];
  const elements = data.elements ?? data.data?.elements ?? [];

  for (const cluster of elements) {
    const items = cluster.elements ?? cluster.items ?? [];
    for (const item of items) {
      // LinkedIn change souvent la structure — on cherche dans plusieurs chemins
      const hit =
        item["com.linkedin.voyager.search.SearchProfile"] ??
        item.hitInfo?.["com.linkedin.voyager.search.SearchProfile"] ??
        item.targetProfile ??
        null;

      if (!hit?.publicIdentifier) continue;

      const distance = hit.distance?.value ?? item.distance?.value ?? "DISTANCE_2";
      // Ignorer les connexions existantes et son propre profil
      if (distance === "DISTANCE_1") continue;

      profiles.push({
        username: hit.publicIdentifier,
        name: [hit.firstName, hit.lastName].filter(Boolean).join(" "),
        firstName: hit.firstName ?? "",
        headline: hit.headline ?? "",
        linkedInUrl: `https://www.linkedin.com/in/${hit.publicIdentifier}`,
        distance,
      });
    }
  }

  return profiles;
}

/**
 * Récupère le profil complet (About + Expériences) via Voyager
 */
async function fetchFullProfile(username, csrf) {
  try {
    const [profRes, posRes] = await Promise.allSettled([
      fetch(`/voyager/api/identity/profiles/${username}`, {
        headers: voyagerHeaders(csrf),
        credentials: "include",
      }),
      fetch(`/voyager/api/identity/profiles/${username}/positions?count=5`, {
        headers: voyagerHeaders(csrf),
        credentials: "include",
      }),
    ]);

    let about = null;
    let company = "";
    const experiences = [];

    if (profRes.status === "fulfilled" && profRes.value.ok) {
      const d = await profRes.value.json();
      about = d.summary ?? null;
      company = d.positions?.elements?.[0]?.companyName ?? "";
    }

    if (posRes.status === "fulfilled" && posRes.value.ok) {
      const d = await posRes.value.json();
      for (const p of (d.elements ?? []).slice(0, 5)) {
        experiences.push({
          title: p.title ?? "",
          company: p.companyName ?? "",
          description: p.description ?? null,
        });
      }
      if (!company && experiences[0]?.company) company = experiences[0].company;
    }

    return { about, company, experiences };
  } catch {
    return { about: null, company: "", experiences: [] };
  }
}

/**
 * Envoie le profil au backend pour créer le prospect + générer le message
 */
async function processProfileOnBackend(payload, token) {
  const apiBase = await getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/cso-agent/process-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * SKALLE_SEARCH_PROFILES — cherche des profils via Voyager (sans navigation)
 * Appelé par le background worker avant de naviguer vers chaque profil
 */
async function handleSearchProfiles(queries, maxProfiles) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf", list: [] };

  const list = [];
  const seen = new Set();

  for (const query of queries) {
    if (list.length >= maxProfiles) break;
    const { abortCode, profiles } = await voyagerSearch(query, csrf, 15);
    if (abortCode) return { ok: false, abortCode, list };
    for (const p of profiles) {
      if (list.length >= maxProfiles) break;
      if (!seen.has(p.username)) {
        seen.add(p.username);
        list.push(p);
      }
    }
    // Petite pause entre les requêtes de recherche
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1500));
  }

  return { ok: true, list };
}

/**
 * SKALLE_PROCESS_AND_CONNECT — appelé depuis la page du profil après navigation
 * La page est déjà chargée → page view réel → on enrichit + connecte
 */
async function handleProcessAndConnect(profile, workspaceId) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf" };

  const token = await getToken();
  if (!token) return { ok: false, error: "no_token" };

  // Vérifier la distance depuis la page du profil (on est dessus)
  const username = getUsername() ?? profile.username;
  const profileData = await resolveLinkedInProfile(username, csrf);
  if (!profileData) return { ok: false, error: "profile_not_found", username };

  // Déjà connecté — ne pas envoyer de demande
  if (profileData.distance === "DISTANCE_1") {
    return { ok: false, action: "already_connected", username };
  }

  // Enrichir depuis la page actuelle (on y est déjà — Voyager répond avec les vraies données)
  const full = await fetchFullProfile(username, csrf);

  // Backend : créer le prospect + générer le message personnalisé
  const result = await processProfileOnBackend(
    {
      workspaceId,
      linkedInUrl: profile.linkedInUrl,
      name: profile.name,
      firstName: profile.firstName,
      jobTitle: profile.headline,
      company: full.company || "LinkedIn",
      headline: profile.headline,
      about: full.about,
      experiences: full.experiences,
    },
    token
  );

  if (!result) return { ok: false, error: "backend_error", username };

  // connectNote peut être null si sendWithoutNote est activé dans les settings
  const connResult = await sendConnectionRequest(username, result.connectNote ?? null, csrf);

  return {
    ...connResult,
    action: "connection_request",
    username,
    name: profile.name,
    prospectId: result.prospectId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION DES CONNEXIONS ACCEPTÉES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si chaque invitation en attente a été acceptée (DISTANCE_1)
 * Retourne la liste des connexions acceptées avec leur entityUrn
 */
async function handleCheckConnections(prospects) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf", accepted: [] };

  const accepted = [];

  for (const prospect of prospects) {
    try {
      const profile = await resolveLinkedInProfile(prospect.username, csrf);
      if (profile?.distance === "DISTANCE_1") {
        accepted.push({
          prospectId: prospect.prospectId,
          username: prospect.username,
          name: prospect.name,
          entityUrn: profile.entityUrn,
          pendingMessage: prospect.pendingMessage,
        });
      }
      // Petit délai entre chaque vérification
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    } catch { /* silencieux */ }
  }

  return { ok: true, accepted };
}

/**
 * Envoie le message post-connexion à une connexion qui vient d'accepter
 */
async function handleSendPostMessage(entityUrn, message) {
  const csrf = getCsrfToken();
  if (!csrf || !entityUrn || !message) {
    return { ok: false, error: "paramètres manquants" };
  }
  return sendLinkedInMessage(entityUrn, message, csrf);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKING DES RÉPONSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère l'URN LinkedIn de l'utilisateur connecté
 */
async function getMyEntityUrn(csrf) {
  try {
    const res = await fetch("/voyager/api/identity/profiles/me", {
      headers: voyagerHeaders(csrf),
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.entityUrn ?? null;
  } catch {
    return null;
  }
}

/**
 * Cherche la conversation avec un profil spécifique et vérifie s'il a répondu
 * Retourne { replied: boolean, replyPreview: string|null }
 */
async function checkReplyFromProspect(username, csrf, myUrn) {
  try {
    // Résoudre l'URN du prospect
    const profile = await resolveLinkedInProfile(username, csrf);
    if (!profile?.entityUrn) return { replied: false, replyPreview: null };

    // Trouver la conversation avec ce prospect
    const encodedUrn = encodeURIComponent(profile.entityUrn);
    const convRes = await fetch(
      `/voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX&participants=List(${encodedUrn})&q=participants`,
      { headers: voyagerHeaders(csrf), credentials: "include" }
    );
    if (!convRes.ok) return { replied: false, replyPreview: null };

    const convData = await convRes.json();
    const conversation = convData.elements?.[0];
    if (!conversation) return { replied: false, replyPreview: null };

    // Récupérer les messages de la conversation
    const convUrn = encodeURIComponent(conversation.entityUrn ?? "");
    const eventsRes = await fetch(
      `/voyager/api/messaging/conversations/${convUrn}/events?keyVersion=LEGACY_INBOX&count=10`,
      { headers: voyagerHeaders(csrf), credentials: "include" }
    );
    if (!eventsRes.ok) return { replied: false, replyPreview: null };

    const eventsData = await eventsRes.json();
    const events = eventsData.elements ?? [];

    // Vérifier si au moins un message vient du prospect (pas de nous)
    const hasReply = events.some((e) => {
      if (!e.eventContent?.["com.linkedin.voyager.messaging.event.MessageEvent"]) return false;
      const senderUrn =
        e.from?.["com.linkedin.voyager.messaging.MessagingMember"]?.miniProfile?.entityUrn ?? null;
      if (!senderUrn) return false;
      return senderUrn !== myUrn;
    });
    if (!hasReply) return { replied: false, replyPreview: null };

    // Extraire un aperçu du dernier message reçu
    const lastEvent = events[0]; // Les events sont en ordre anti-chronologique
    const msgBody =
      lastEvent?.eventContent?.["com.linkedin.voyager.messaging.event.MessageEvent"]?.body ?? "";
    const replyPreview = msgBody.slice(0, 100) || null;

    return { replied: true, replyPreview };
  } catch {
    return { replied: false, replyPreview: null };
  }
}

/**
 * Handler SKALLE_CHECK_REPLIES
 * Vérifie si les prospects CONTACTED ont répondu sur LinkedIn
 */
async function handleCheckReplies(prospects) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf", responded: [] };

  const myUrn = await getMyEntityUrn(csrf);
  const responded = [];

  for (const prospect of prospects) {
    try {
      const result = await checkReplyFromProspect(prospect.username, csrf, myUrn);
      if (result.replied) {
        responded.push({
          prospectId: prospect.prospectId,
          username: prospect.username,
          name: prospect.name,
          replyPreview: result.replyPreview,
        });
      }
      // Délai entre chaque vérification pour éviter le rate limiting
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    } catch { /* silencieux */ }
  }

  return { ok: true, responded };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION DE LECTURE — Scroll humain pendant la visite d'un profil
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scroll progressif et irrégulier pour simuler la lecture d'un profil.
 * S'arrête automatiquement quand durationMs est écoulé.
 */
async function handleSimulateReading(durationMs) {
  const maxScroll = Math.min(document.documentElement.scrollHeight * 0.65, 1400);
  const end = Date.now() + durationMs;
  let position = 0;

  while (Date.now() < end - 800) {
    // Pas de scroll aléatoire entre 50 et 160px
    const step = 50 + Math.random() * 110;
    position = Math.min(position + step, maxScroll);
    window.scrollTo({ top: position, behavior: "smooth" });

    // Pause entre 300 et 900ms (variation du rythme de lecture)
    const pause = 300 + Math.random() * 600;
    await new Promise((r) => setTimeout(r, pause));

    // 15% de chance de remonter légèrement (comportement naturel)
    if (Math.random() < 0.15) {
      position = Math.max(0, position - (20 + Math.random() * 60));
      window.scrollTo({ top: position, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    }

    if (position >= maxScroll) break;
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WARM LEADS — Profile viewers + Followers (Gap 1 & 2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Récupère mon propre entityUrn (urn:li:fsd_profile:xxx) depuis /voyager/api/me
 */
async function getMyProfileUrn(csrf) {
  try {
    const res = await fetch("/voyager/api/me", {
      headers: voyagerHeaders(csrf),
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    // miniProfile.entityUrn → "urn:li:fs_miniProfile:xxx"
    // Pour l'API followers on a besoin de "urn:li:fsd_profile:xxx"
    const miniUrn = data.miniProfile?.entityUrn ?? "";
    const profileId = miniUrn.replace("urn:li:fs_miniProfile:", "");
    return profileId ? `urn:li:fsd_profile:${profileId}` : null;
  } catch {
    return null;
  }
}

function miniProfileToLead(mp, type) {
  if (!mp?.publicIdentifier) return null;
  const name = [mp.firstName, mp.lastName].filter(Boolean).join(" ") || "LinkedIn Member";
  return {
    type,
    name,
    handle: mp.publicIdentifier,
    profileUrl: `https://www.linkedin.com/in/${mp.publicIdentifier}`,
    headline: mp.occupation ?? mp.headline ?? "",
  };
}

/**
 * SKALLE_SCRAPE_VIEWERS
 * Appelle GET /voyager/api/wvmpProfile/views?q=viewedBy
 * Requiert LinkedIn Premium pour voir plus de 5 viewers.
 */
async function handleScrapeViewers(maxCount = 20) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf", leads: [] };

  const leads = [];
  let start = 0;
  const count = Math.min(maxCount, 20);

  try {
    while (leads.length < maxCount) {
      const res = await fetch(
        `/voyager/api/wvmpProfile/views?q=viewedBy&count=${count}&start=${start}`,
        { headers: voyagerHeaders(csrf), credentials: "include" }
      );
      if (!res.ok) break;

      const data = await res.json();
      const elements = data.elements ?? [];
      if (!elements.length) break;

      for (const el of elements) {
        // Structure : el.actor.miniProfile ou el.navigationContext.miniProfile
        const mp =
          el.actor?.miniProfile ??
          el.navigationContext?.navigationDetails?.miniProfile ??
          null;
        const lead = miniProfileToLead(mp, "PROFILE_VIEW");
        if (lead) leads.push(lead);
      }

      const total = data.paging?.total ?? 0;
      start += elements.length;
      if (start >= total || start >= maxCount) break;

      // Délai humain entre les pages
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    }
  } catch (err) {
    return { ok: false, error: String(err), leads };
  }

  return { ok: true, leads };
}

/**
 * SKALLE_SCRAPE_FOLLOWERS
 * Appelle GET /voyager/api/relationships/followers?q=followersOf
 */
async function handleScrapeFollowers(maxCount = 50) {
  const csrf = getCsrfToken();
  if (!csrf) return { ok: false, error: "no_csrf", leads: [] };

  const myUrn = await getMyProfileUrn(csrf);
  if (!myUrn) return { ok: false, error: "no_profile_urn", leads: [] };

  const leads = [];
  let start = 0;
  const count = Math.min(maxCount, 50);

  try {
    while (leads.length < maxCount) {
      const encodedUrn = encodeURIComponent(myUrn);
      const res = await fetch(
        `/voyager/api/relationships/followers?q=followersOf&entityUrn=${encodedUrn}&count=${count}&start=${start}`,
        { headers: voyagerHeaders(csrf), credentials: "include" }
      );

      if (!res.ok) {
        // Fallback : endpoint alternatif observé sur certaines versions LinkedIn
        const fallbackRes = await fetch(
          `/voyager/api/identity/followers?q=followers&count=${count}&start=${start}`,
          { headers: voyagerHeaders(csrf), credentials: "include" }
        );
        if (!fallbackRes.ok) break;
        const fbData = await fallbackRes.json();
        const fbElements = fbData.elements ?? [];
        for (const el of fbElements) {
          const mp = el.miniProfile ?? el.follower?.miniProfile ?? null;
          const lead = miniProfileToLead(mp, "FOLLOW");
          if (lead) leads.push(lead);
        }
        break;
      }

      const data = await res.json();
      const elements = data.elements ?? [];
      if (!elements.length) break;

      for (const el of elements) {
        const mp = el.miniProfile ?? el.follower?.miniProfile ?? null;
        const lead = miniProfileToLead(mp, "FOLLOW");
        if (lead) leads.push(lead);
      }

      const total = data.paging?.total ?? 0;
      start += elements.length;
      if (start >= total || start >= maxCount) break;

      await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    }
  } catch (err) {
    return { ok: false, error: String(err), leads };
  }

  return { ok: true, leads };
}

// ─── Cache local des profils warm (TTL 30 jours) ─────────────────────────────
// Evite de re-scraper et re-envoyer des profils déjà traités dans les runs précédents.
// Structure : { [handle]: timestamp_ms }

const WARM_CACHE_TTL_MS = 30 * 24 * 60 * 60_000; // 30 jours
const WARM_CACHE_KEY = { PROFILE_VIEW: "warmCacheViewers", FOLLOW: "warmCacheFollowers" };

async function getWarmSeenCache(type) {
  const key = WARM_CACHE_KEY[type] ?? "warmCacheMisc";
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (r) => {
      const raw = r[key] ?? {};
      const now = Date.now();
      // Prune les entrées expirées
      const pruned = Object.fromEntries(
        Object.entries(raw).filter(([, ts]) => now - ts < WARM_CACHE_TTL_MS)
      );
      resolve(pruned);
    });
  });
}

async function updateWarmSeenCache(type, handles) {
  const key = WARM_CACHE_KEY[type] ?? "warmCacheMisc";
  const existing = await getWarmSeenCache(type);
  const now = Date.now();
  const updated = { ...existing };
  for (const handle of handles) updated[handle] = now;
  chrome.storage.local.set({ [key]: updated });
}

/**
 * Envoie les warm leads (viewers / followers) vers le backend SKALLE.
 * Filtre les handles déjà envoyés dans les 30 derniers jours pour éviter
 * les appels Voyager redondants et les doublons backend.
 */
async function sendWarmLeadsToBackend(type, leads, token) {
  if (!leads.length) return { ok: true, imported: 0 };

  // Filtrer les profils déjà traités récemment
  const seen = await getWarmSeenCache(type);
  const fresh = leads.filter((l) => !seen[l.handle]);

  if (!fresh.length) {
    console.debug(`[SKALLE] Warm ${type} — ${leads.length} profils déjà en cache, rien à envoyer`);
    return { ok: true, imported: 0, duplicates: leads.length };
  }

  const apiBase = await getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/social/linkedin/warm-import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, leads: fresh }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const result = await res.json();

    // Mettre en cache tous les handles envoyés (même les doublons backend)
    await updateWarmSeenCache(type, fresh.map((l) => l.handle));

    return result;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Listeners (tous les types de messages) ────────────────────────────────────

// Vérification préventive : si le contexte est invalide on n'enregistre pas.
// Le background détecte le timeout (15s) et gère l'absence de réponse.
if (!chrome.runtime?.id) {
  console.debug("[SKALLE] Contexte extension invalide au chargement — listeners non enregistrés");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Exécute une décision CSO pré-approuvée (mode manuel/queue)
  if (msg.type === "SKALLE_EXECUTE") {
    executeDecision(msg.decision)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Mode autonome étape 1 : cherche des profils via Voyager (pas de navigation)
  if (msg.type === "SKALLE_SEARCH_PROFILES") {
    handleSearchProfiles(msg.queries, msg.maxProfiles ?? 3)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err), list: [] }));
    return true;
  }

  // Mode autonome étape 2 : enrichit + connecte depuis la page du profil (après navigation)
  if (msg.type === "SKALLE_PROCESS_AND_CONNECT") {
    handleProcessAndConnect(msg.profile, msg.workspaceId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Vérifie quelles invitations ont été acceptées (daily check)
  if (msg.type === "SKALLE_CHECK_CONNECTIONS") {
    handleCheckConnections(msg.prospects)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err), accepted: [] }));
    return true;
  }

  // Envoie le message post-connexion à une connexion acceptée
  if (msg.type === "SKALLE_SEND_POST_MESSAGE") {
    handleSendPostMessage(msg.entityUrn, msg.message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Envoie une relance à un prospect qui n'a pas répondu après 5 jours
  if (msg.type === "SKALLE_SEND_FOLLOWUP") {
    const { username, message } = msg;
    const csrf = getCsrfToken();
    if (!csrf) { sendResponse({ ok: false, error: "no_csrf" }); return true; }

    resolveLinkedInProfile(username, csrf)
      .then((profile) => {
        if (!profile?.entityUrn) return { ok: false, error: "profile_not_found" };
        return sendLinkedInMessage(profile.entityUrn, message, csrf);
      })
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Vérifie si des prospects CONTACTED ont répondu
  if (msg.type === "SKALLE_CHECK_REPLIES") {
    handleCheckReplies(msg.prospects)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err), responded: [] }));
    return true;
  }

  // Scroll humain pendant la lecture d'un profil (mode autonome)
  if (msg.type === "SKALLE_SIMULATE_READING") {
    handleSimulateReading(msg.durationMs ?? 8_000)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Scrappe les viewers de profil (LinkedIn Premium requis pour > 5)
  if (msg.type === "SKALLE_SCRAPE_VIEWERS") {
    handleScrapeViewers(msg.maxCount ?? 20)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err), leads: [] }));
    return true;
  }

  // Scrappe les followers du profil connecté
  if (msg.type === "SKALLE_SCRAPE_FOLLOWERS") {
    handleScrapeFollowers(msg.maxCount ?? 50)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err), leads: [] }));
    return true;
  }

  // Import warm leads vers le backend (appelé par background après scrape)
  if (msg.type === "SKALLE_SEND_WARM_LEADS") {
    getToken()
      .then((token) => sendWarmLeadsToBackend(msg.leadType, msg.leads, token))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
