/**
 * SKALLE - Background Service Worker
 *
 * Orchestre l'automation LinkedIn CSO :
 * 1. Toutes les 30 min : poll les décisions APPROVED depuis le backend
 * 2. Pour chaque décision : trouve un onglet LinkedIn ouvert
 *    → envoie un message au content script pour exécuter l'action
 * 3. Rate limiting : max 10 actions/jour, heures bureau, délai aléatoire 3-8 min
 * 4. Rapporte chaque exécution au backend (→ EXECUTED)
 */

let API_BASE = "https://skalle.vercel.app";

// Initialise depuis le storage au démarrage du service worker
chrome.storage.sync.get({ skalleApiBase: "" }, (data) => {
  if (data.skalleApiBase) API_BASE = data.skalleApiBase;
});

// Mise à jour en temps réel quand l'utilisateur sauvegarde dans le popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.skalleApiBase?.newValue !== undefined) {
    API_BASE = changes.skalleApiBase.newValue || "https://skalle.vercel.app";
  }
});
const ALARM_NAME = "skalle-automation";
const ALARM_CHECK_CONNECTIONS = "skalle-check-connections";
const ALARM_CHECK_REPLIES = "skalle-check-replies";
const ALARM_WARM_IMPORT = "skalle-warm-import";
const POLL_INTERVAL_MINUTES = 30;
const CHECK_CONNECTIONS_INTERVAL_MINUTES = 60 * 24; // toutes les 24h
const CHECK_REPLIES_INTERVAL_MINUTES = 60 * 12;     // toutes les 12h
const WARM_IMPORT_INTERVAL_MINUTES = 60 * 6;        // toutes les 6h

// ── Config (modifiable via popup) ─────────────────────────────────────────────

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        skalleToken: "",
        automationEnabled: true,
        autonomousEnabled: false,   // mode autonome (recherche + connexion sans action humaine)
        dailyLimit: 10,
        businessHoursStart: 9,
        businessHoursEnd: 18,
      },
      resolve
    );
  });
}

// ── Anti-ban helpers ──────────────────────────────────────────────────────────

// Fêtes françaises à date fixe (MM-DD)
const FR_FIXED_HOLIDAYS = new Set([
  "01-01", // Jour de l'An
  "05-01", // Fête du Travail
  "05-08", // Victoire 1945
  "07-14", // Fête Nationale
  "08-15", // Assomption
  "11-01", // Toussaint
  "11-11", // Armistice
  "12-25", // Noël
]);

// Calcul de Pâques (algorithme de Butcher/Anonymous Gregorian)
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isPublicHoliday(date) {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (FR_FIXED_HOLIDAYS.has(mmdd)) return true;

  // Fêtes mobiles basées sur Pâques
  const easter = easterDate(date.getFullYear());
  const mobileHolidays = [
    new Date(easter.getTime() + 1 * 86400000),   // Lundi de Pâques
    new Date(easter.getTime() + 39 * 86400000),  // Ascension
    new Date(easter.getTime() + 50 * 86400000),  // Lundi de Pentecôte
  ];
  return mobileHolidays.some(h =>
    h.getDate() === date.getDate() &&
    h.getMonth() === date.getMonth()
  );
}

function isWorkingDay() {
  const now = new Date();
  const day = now.getDay(); // 0=dim, 6=sam
  if (day === 0 || day === 6) return false;
  return !isPublicHoliday(now);
}

// Accepte des heures fractionnaires (ex: 9.25 = 9h15)
function isBusinessHours(start, end) {
  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  return nowH >= start && nowH < end;
}

// ─── 2. Fenêtre d'activité variable ──────────────────────────────────────────
// Générée une fois par jour avec ±45 min d'offset sur le début ET la fin.
// Un humain ne commence pas exactement à 9h00 et ne s'arrête pas à 18h00 pile.

async function getDailyWindow(configStart, configEnd) {
  const today = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get(["windowDate", "windowStart", "windowEnd"], (r) => {
      if (r.windowDate === today && r.windowStart != null) {
        resolve({ start: r.windowStart, end: r.windowEnd });
        return;
      }
      const startOffset = (Math.floor(Math.random() * 91) - 45) / 60; // -45min → +45min
      const endOffset   = (Math.floor(Math.random() * 91) - 45) / 60;
      const start = configStart + startOffset;
      const end   = configEnd   + endOffset;
      chrome.storage.local.set({ windowDate: today, windowStart: start, windowEnd: end }, () => {
        resolve({ start, end });
      });
    });
  });
}

// ─── 2b. Challenge & Rate-limit — pause étendus ──────────────────────────────

const CHALLENGE_PAUSE_MS  = 24 * 60 * 60_000; // 24h — nécessite action humaine
const RATE_LIMIT_PAUSE_MS =  4 * 60 * 60_000; // 4h  — pause automatique

/**
 * Enregistre un état challenge LinkedIn.
 * - Désactive l'automation
 * - Bloque tout jusqu'à résolution manuelle OU 24h (auto-clear)
 * - Envoie une notification Chrome
 */
async function setChallengeState() {
  await chrome.storage.local.set({
    linkedInChallenge: true,
    challengeAt: Date.now(),
    automationStatus: "challenge_detected",
  });
  await chrome.storage.sync.set({ automationEnabled: false });

  chrome.notifications?.create("skalle-challenge", {
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "⚠️ SKALLE — LinkedIn demande une vérification",
    message: "Ouvrez LinkedIn et résolvez le CAPTCHA manuellement. Cliquez ici pour ouvrir le popup SKALLE.",
    priority: 2,
  });
}

/**
 * Vérifie si un challenge est actif (et auto-clear après 24h).
 */
async function isChallengePending() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["linkedInChallenge", "challengeAt"], (r) => {
      if (!r.linkedInChallenge) return resolve(false);
      // Auto-clear après 24h pour éviter un blocage permanent
      if (r.challengeAt && Date.now() - r.challengeAt > CHALLENGE_PAUSE_MS) {
        chrome.storage.local.remove(["linkedInChallenge", "challengeAt"]);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

/**
 * Enregistre un rate-limit (429) LinkedIn.
 * - Pause 4h (non bloquante — reprend automatiquement)
 * - Notification Chrome
 */
async function setRateLimitState() {
  const resumeAt = Date.now() + RATE_LIMIT_PAUSE_MS;
  await chrome.storage.local.set({
    rateLimitAt: Date.now(),
    rateLimitResumeAt: resumeAt,
    automationStatus: "rate_limited",
  });

  chrome.notifications?.create("skalle-ratelimit", {
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "⏸ SKALLE — Rate limit LinkedIn",
    message: "LinkedIn a limité les requêtes. L'automation reprend automatiquement dans 4h.",
    priority: 1,
  });
}

/**
 * Vérifie si un rate-limit 4h est encore actif.
 */
async function isRateLimited() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["rateLimitResumeAt"], (r) => {
      resolve(!!(r.rateLimitResumeAt && Date.now() < r.rateLimitResumeAt));
    });
  });
}

/**
 * Traite un abortCode retourné par le content script.
 * Retourne true si l'automation doit s'arrêter immédiatement.
 */
async function handleAbortCode(abortCode) {
  if (!abortCode) return false;
  if (abortCode === "CHALLENGE") {
    await setChallengeState();
    return true;
  }
  if (abortCode === "RESTRICTED") {
    // Restriction compte confirmée → même traitement que CHALLENGE (action humaine requise)
    await setChallengeState();
    console.warn("[SKALLE] Compte LinkedIn restreint — action humaine requise");
    return true;
  }
  if (abortCode === "RATE_LIMITED") {
    await setRateLimitState();
    return true;
  }
  // NETWORK_ERROR et autres → échec silencieux, pas d'arrêt
  return false;
}

// ─── 3. Cooldown post-action ──────────────────────────────────────────────────
// Après chaque action, on impose un silence de 45–90 min avant la suivante.
// Évite les bursts visibles et simule le comportement d'un humain distrait.

async function isInCooldown() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["nextActionAt"], (r) => {
      resolve(!!(r.nextActionAt && Date.now() < r.nextActionAt));
    });
  });
}

async function setCooldown() {
  const ms = (45 + Math.floor(Math.random() * 46)) * 60_000; // 45–90 min
  chrome.storage.local.set({ nextActionAt: Date.now() + ms });
}

// ─── 4. Rythme hebdomadaire ───────────────────────────────────────────────────
// Si la semaine précédente était chargée (>80% de la limite), on réduit de 30%.
// Si elle était légère (<50%), on augmente légèrement de 10%.

function getMondayKey() {
  const now = new Date();
  const day = now.getDay() || 7; // 1=Lun, 7=Dim
  const monday = new Date(now.getTime() - (day - 1) * 86400000);
  return monday.toISOString().slice(0, 10);
}

async function getWeeklyFactor(dailyLimit) {
  const monday = getMondayKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(["wkMonday", "wkCount", "prevWkCount"], (r) => {
      let prevCount = r.prevWkCount ?? 0;
      let thisCount = r.wkCount ?? 0;

      if (r.wkMonday !== monday) {
        // Nouvelle semaine — archiver la précédente
        prevCount = r.wkMonday ? (r.wkCount ?? 0) : 0;
        thisCount = 0;
        chrome.storage.local.set({ wkMonday: monday, wkCount: 0, prevWkCount: prevCount });
      }

      // Intensité de la semaine précédente vs limite théorique (5 jours × limite)
      const weekCap = dailyLimit * 5;
      const intensity = weekCap > 0 ? prevCount / weekCap : 0;
      const factor = intensity > 0.8 ? 0.7 : intensity < 0.5 ? 1.1 : 1.0;

      resolve(factor);
    });
  });
}

async function incrementWeekCount() {
  const monday = getMondayKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(["wkMonday", "wkCount"], (r) => {
      const count = (r.wkMonday === monday ? r.wkCount ?? 0 : 0) + 1;
      chrome.storage.local.set({ wkMonday: monday, wkCount: count }, resolve);
    });
  });
}

// Limite quotidienne variable : ±30 % autour de la limite configurée
// Recalculée une seule fois par jour et mise en cache pour la cohérence
async function getDailyTarget(configLimit) {
  const today = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get(["dailyTargetDate", "dailyTarget"], (r) => {
      if (r.dailyTargetDate === today && r.dailyTarget) {
        resolve(r.dailyTarget);
        return;
      }
      const min = Math.max(1, Math.floor(configLimit * 0.7));
      const max = Math.ceil(configLimit * 1.3);
      const target = min + Math.floor(Math.random() * (max - min + 1));
      chrome.storage.local.set({ dailyTargetDate: today, dailyTarget: target }, () => resolve(target));
    });
  });
}

// Warmup progressif : rampe sur 4 semaines pour les nouveaux comptes
// Semaine 1 : 30% | Semaine 2 : 50% | Semaine 3 : 70% | Semaine 4+ : 100%
async function getWarmupMultiplier() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["warmupStartDate"], (r) => {
      if (!r.warmupStartDate) {
        const today = new Date().toISOString().slice(0, 10);
        chrome.storage.local.set({ warmupStartDate: today });
        resolve(0.3);
        return;
      }
      const diffDays = Math.floor((Date.now() - new Date(r.warmupStartDate).getTime()) / 86400000);
      const week = Math.min(Math.floor(diffDays / 7), 3);
      resolve([0.3, 0.5, 0.7, 1.0][week]);
    });
  });
}

// Limite effective du jour = target × warmup × rythme_semaine, minimum 1
async function getEffectiveDailyLimit(configLimit) {
  const [target, warmup, weekly] = await Promise.all([
    getDailyTarget(configLimit),
    getWarmupMultiplier(),
    getWeeklyFactor(configLimit),
  ]);
  return Math.max(1, Math.floor(target * warmup * weekly));
}

async function getTodayCount() {
  const today = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get(["actionDate", "actionCount"], (r) => {
      resolve(r.actionDate === today ? r.actionCount ?? 0 : 0);
    });
  });
}

async function incrementCount() {
  const today = new Date().toISOString().slice(0, 10);
  const count = await getTodayCount();
  return new Promise((resolve) => {
    chrome.storage.local.set({ actionDate: today, actionCount: count + 1 }, resolve);
  });
}

// Compteur dédié aux demandes de connexion (séparé des messages post-connexion).
// LinkedIn limite à ~100/semaine, soit ~20/jour pour rester dans les clous.
async function getConnReqToday() {
  const today = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get(["connReqDate", "connReqCount"], (r) => {
      resolve(r.connReqDate === today ? r.connReqCount ?? 0 : 0);
    });
  });
}

async function incrementConnReq() {
  const today = new Date().toISOString().slice(0, 10);
  const count = await getConnReqToday();
  return new Promise((resolve) => {
    chrome.storage.local.set({ connReqDate: today, connReqCount: count + 1 }, resolve);
  });
}

async function setStatus(status) {
  chrome.storage.local.set({ automationStatus: status, statusAt: Date.now() });
}

function randomDelay(minMs = 3 * 60_000, maxMs = 8 * 60_000) {
  return Math.floor(Math.random() * (maxMs - minMs) + minMs);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── LinkedIn tab management ───────────────────────────────────────────────────

async function findLinkedInTab() {
  return new Promise((resolve) => {
    chrome.tabs.query(
      { url: ["https://www.linkedin.com/*", "https://fr.linkedin.com/*"] },
      (tabs) => resolve(tabs.find((t) => !t.url?.includes("/login")) ?? null)
    );
  });
}

// Ouvre un onglet en arrière-plan (non actif) pour l'automation autonome.
// Ne touche pas à l'onglet courant de l'utilisateur.
async function openProfileTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => resolve(tab));
  });
}

// Attend que l'onglet soit chargé (status "complete") avec un timeout de sécurité.
async function waitForTabLoad(tabId, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, timeoutMs);
  });
}

async function sendToContentScript(tabId, message, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        // Lire lastError IMMÉDIATEMENT dans le callback pour éviter l'erreur console
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? "port_closed" });
          return;
        }
        resolve(response ?? { ok: false, error: "no_response" });
      });
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, error: "send_failed" });
    }
  });
}

// ── Backend API ───────────────────────────────────────────────────────────────

async function fetchApprovedDecisions(token) {
  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/queue`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.decisions ?? [];
  } catch {
    return [];
  }
}

async function reportExecuted(token, decisionId, result) {
  // Mode autonome : pas de décision DB à marquer (le prospect est géré par process-profile)
  if (!decisionId) return;
  try {
    await fetch(`${API_BASE}/api/cso-agent/executed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ decisionId, ...result }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {}
}

// ── Main automation loop ──────────────────────────────────────────────────────

async function runAutomation(forceRun = false) {
  const config = await getConfig();

  if (!config.skalleToken) {
    await setStatus("no_token");
    return;
  }

  if (!config.automationEnabled) {
    await setStatus("disabled");
    return;
  }

  // Bloquer si challenge LinkedIn en attente (nécessite action humaine)
  if (await isChallengePending()) {
    await setStatus("challenge_detected");
    return;
  }

  // Bloquer si rate-limit actif (pause 4h automatique)
  if (await isRateLimited()) {
    await setStatus("rate_limited");
    return;
  }

  if (!forceRun) {
    if (!isWorkingDay()) {
      await setStatus("day_off");
      return;
    }

    // Fenêtre d'activité variable (±45 min autour des heures configurées)
    const window = await getDailyWindow(config.businessHoursStart, config.businessHoursEnd);
    if (!isBusinessHours(window.start, window.end)) {
      await setStatus("outside_hours");
      return;
    }

    // Cooldown post-action (45–90 min depuis la dernière action)
    if (await isInCooldown()) {
      await setStatus("cooldown");
      return;
    }
  }

  const effectiveLimit = await getEffectiveDailyLimit(config.dailyLimit);
  const count = await getTodayCount();
  if (count >= effectiveLimit) {
    await setStatus(`limit_reached:${count}/${effectiveLimit}`);
    return;
  }

  await setStatus("running");

  const decisions = await fetchApprovedDecisions(config.skalleToken);
  if (!decisions.length) {
    await setStatus(`idle:${count}/${effectiveLimit}`);
    return;
  }

  const tab = await findLinkedInTab();
  if (!tab) {
    await setStatus(`waiting_linkedin:${count}/${effectiveLimit}`);
    console.log("[SKALLE] → waiting_linkedin");
    return;
  }

  // ── 1 action par cycle (l'alarme 30 min gère la suivante) ─────────────────
  const decision = decisions[0];
  const result = await sendToContentScript(tab.id, { type: "SKALLE_EXECUTE", decision });

  // Si le content script n'est pas injecté (onglet LinkedIn rechargé sans refresh
  // de l'extension, ou tab pas encore prêt), ne pas marquer FAILED — réessayer
  // au prochain cycle. L'utilisateur doit rafraîchir l'onglet LinkedIn.
  if (!result?.ok && (
    result?.error?.includes("Receiving end does not exist") ||
    result?.error?.includes("Could not establish connection") ||
    result?.error === "port_closed" ||
    result?.error === "timeout"
  )) {
    await setStatus(`waiting_linkedin:${count}/${effectiveLimit}`);
    console.warn("[SKALLE] Content script non disponible — rafraîchissez l'onglet LinkedIn. Décision conservée en APPROVED.");
    return;
  }

  // Vérifier si le content script a détecté un challenge ou rate-limit
  if (result?.abortCode && await handleAbortCode(result.abortCode)) {
    return; // Stopper immédiatement
  }

  await reportExecuted(config.skalleToken, decision.id, result);
  await incrementCount();
  await incrementWeekCount();
  await setCooldown(); // 45–90 min avant la prochaine action

  const newCount = await getTodayCount();
  await setStatus(`done:${newCount}/${effectiveLimit}`);
}

// ── Tracking des réponses (12h) ───────────────────────────────────────────────

async function checkReplies() {
  const config = await getConfig();
  if (!config.skalleToken) return;

  const tab = await findLinkedInTab();
  if (!tab) return;

  // Récupérer les prospects CONTACTED depuis le backend
  let prospects = [];
  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/contacted-prospects`, {
      headers: { Authorization: `Bearer ${config.skalleToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    prospects = data.prospects ?? [];
  } catch { return; }

  if (!prospects.length) return;

  console.log(`[SKALLE] Vérification des réponses pour ${prospects.length} prospect(s)…`);

  // Demander au content script de vérifier les conversations
  const result = await sendToContentScript(tab.id, {
    type: "SKALLE_CHECK_REPLIES",
    prospects,
  }, 120_000); // 2 min — peut prendre du temps pour beaucoup de prospects

  if (!result?.responded?.length) return;

  console.log(`[SKALLE] ${result.responded.length} réponse(s) détectée(s) !`);

  // Marquer chaque prospect comme RESPONDED
  for (const responded of result.responded) {
    try {
      await fetch(`${API_BASE}/api/cso-agent/prospect-responded`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.skalleToken}`,
        },
        body: JSON.stringify({
          prospectId: responded.prospectId,
          replyPreview: responded.replyPreview,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch { /* silencieux */ }
  }
}

// ── Relances automatiques ─────────────────────────────────────────────────────

async function checkFollowups() {
  const config = await getConfig();
  if (!config.skalleToken) return;

  const tab = await findLinkedInTab();
  if (!tab) return;

  // Récupérer les prospects éligibles à une relance
  let prospects = [];
  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/followup-due`, {
      headers: { Authorization: `Bearer ${config.skalleToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    prospects = data.prospects ?? [];
  } catch { return; }

  if (!prospects.length) return;

  console.log(`[SKALLE] ${prospects.length} relance(s) à envoyer`);

  // Max 3 relances par cycle pour ne pas surcharger
  for (const prospect of prospects.slice(0, 3)) {
    try {
      // 1. Générer le message de relance (angle différent du premier)
      const genRes = await fetch(`${API_BASE}/api/cso-agent/process-followup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.skalleToken}`,
        },
        body: JSON.stringify(prospect),
        signal: AbortSignal.timeout(30_000),
      });
      if (!genRes.ok) continue;
      const { followupMessage } = await genRes.json();
      if (!followupMessage) continue;

      // 2. Envoyer via l'extension (résolution URN + messaging API)
      const sendResult = await sendToContentScript(tab.id, {
        type: "SKALLE_SEND_FOLLOWUP",
        username: prospect.username,
        message: followupMessage,
      }, 30_000);

      // 3. Marquer comme envoyée
      await fetch(`${API_BASE}/api/cso-agent/followup-sent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.skalleToken}`,
        },
        body: JSON.stringify({ prospectId: prospect.prospectId, ok: sendResult?.ok ?? false }),
        signal: AbortSignal.timeout(10_000),
      });

      console.log(`[SKALLE] Relance ${sendResult?.ok ? "✓" : "✗"} → ${prospect.name}`);

      // Délai humain entre relances
      await sleep(3_000 + Math.random() * 5_000);
    } catch (err) {
      console.error("[SKALLE] Erreur relance:", err);
    }
  }
}

// ── Mode autonome ─────────────────────────────────────────────────────────────

async function runAutonomousSearch() {
  const config = await getConfig();
  if (!config.skalleToken || !config.autonomousEnabled) return;
  if (!isWorkingDay()) return;
  if (await isChallengePending()) return;
  if (await isRateLimited()) return;

  const window = await getDailyWindow(config.businessHoursStart, config.businessHoursEnd);
  if (!isBusinessHours(window.start, window.end)) return;
  if (await isInCooldown()) return;

  const effectiveLimit = await getEffectiveDailyLimit(config.dailyLimit);
  const count = await getTodayCount();
  if (count >= effectiveLimit) return;

  // Plafond dédié aux demandes de connexion : min(effectiveLimit, 20/jour)
  // LinkedIn suit les connexions séparément des messages — ~100/semaine max.
  const connReqToday = await getConnReqToday();
  const connReqLimit = Math.min(effectiveLimit, 20);
  if (connReqToday >= connReqLimit) {
    await setStatus(`conn_req_limit:${connReqToday}/${connReqLimit}`);
    return;
  }

  // Récupérer les requêtes de recherche depuis le backend
  let searchData;
  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/search-queries`, {
      headers: { Authorization: `Bearer ${config.skalleToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    searchData = await res.json();
  } catch { return; }

  if (!searchData?.queries?.length) return;

  // Trouver un onglet LinkedIn ouvert — ne jamais en créer un
  const tab = await findLinkedInTab();
  if (!tab) {
    await setStatus(`autonomous_waiting_linkedin:${count}/${effectiveLimit}`);
    return;
  }

  const remaining = effectiveLimit - count;
  const maxThisCycle = Math.min(1, remaining); // 1 profil/cycle — le reste attend le prochain alarm

  await setStatus(`autonomous_running:${count}/${effectiveLimit}`);

  // ── Étape 1 : Chercher des profils via l'API Voyager (sans navigation) ──────
  const profiles = await sendToContentScript(tab.id, {
    type: "SKALLE_SEARCH_PROFILES",
    queries: searchData.queries,
    maxProfiles: maxThisCycle,
  }, 30_000);

  if (profiles?.abortCode && await handleAbortCode(profiles.abortCode)) return;

  if (!profiles?.list?.length) {
    await setStatus(`idle:${count}/${effectiveLimit}`);
    return;
  }

  // ── Étape 2 : Pour chaque profil, ouvrir un onglet dédié puis connecter ─────
  // Onglet en arrière-plan (active: false) → l'utilisateur garde son onglet intact.

  for (const profile of profiles.list) {
    const currentCount = await getTodayCount();
    if (currentCount >= effectiveLimit) break;

    // Vérifier le plafond connexions avant chaque tentative
    const connReqNow = await getConnReqToday();
    if (connReqNow >= connReqLimit) {
      await setStatus(`conn_req_limit:${connReqNow}/${connReqLimit}`);
      break;
    }

    // Ouvrir un onglet dédié (non actif) pour ce profil
    const profileTab = await openProfileTab(profile.linkedInUrl);
    await waitForTabLoad(profileTab.id, 8_000);
    await sleep(1_500); // Laisser React finir le rendu

    // Temps de lecture simulé avec scroll humain (5-15 secondes)
    const readTime = 5_000 + Math.random() * 10_000;
    console.log(`[SKALLE] Lecture profil ${profile.username} (${Math.round(readTime / 1000)}s)…`);
    await sendToContentScript(profileTab.id, {
      type: "SKALLE_SIMULATE_READING",
      durationMs: readTime,
    }, readTime + 3_000);

    // Enrichir et connecter depuis le contexte de la page de profil
    const result = await sendToContentScript(profileTab.id, {
      type: "SKALLE_PROCESS_AND_CONNECT",
      profile,
      workspaceId: searchData.workspaceId,
    }, 60_000);

    // Fermer l'onglet dédié — qu'il y ait eu succès ou erreur
    chrome.tabs.remove(profileTab.id);

    // Vérifier abort code après chaque action autonome
    if (result?.abortCode && await handleAbortCode(result.abortCode)) break;

    if (result?.ok) {
      await incrementCount();
      await incrementWeekCount();
      if (result.action === "connection_request") await incrementConnReq();
      await setCooldown(); // 45–90 min avant la prochaine action
      await reportExecuted(config.skalleToken, null, {
        ...result,
        autonomous: true,
        prospectId: result.prospectId,
      });
    }

    const newCount = await getTodayCount();
    await setStatus(`autonomous_running:${newCount}/${effectiveLimit}`);

    // Délai humain entre chaque profil (3-8 min)
    if (profiles.list.indexOf(profile) < profiles.list.length - 1) {
      const delay = randomDelay();
      console.log(`[SKALLE] Prochain profil dans ${Math.round(delay / 60_000)} min`);
      await sleep(delay);
    }
  }

  const finalCount = await getTodayCount();
  await setStatus(`autonomous_done:${finalCount}/${effectiveLimit}`);
}

// ── Warm leads import — viewers + followers (toutes les 6h) ──────────────────

async function importWarmLeads() {
  const config = await getConfig();
  if (!config.skalleToken) return;
  if (!isWorkingDay()) return;

  const tab = await findLinkedInTab();
  if (!tab) return;

  console.log("[SKALLE] Import warm leads : viewers + followers…");

  // 1. Scrappe les viewers
  const viewersResult = await sendToContentScript(tab.id, {
    type: "SKALLE_SCRAPE_VIEWERS",
    maxCount: 20,
  }, 30_000);

  if (viewersResult?.leads?.length) {
    await sendToContentScript(tab.id, {
      type: "SKALLE_SEND_WARM_LEADS",
      leadType: "PROFILE_VIEW",
      leads: viewersResult.leads,
    }, 15_000);
    console.log(`[SKALLE] Viewers importés : ${viewersResult.leads.length}`);
  }

  // Pause entre les deux scrapes
  await sleep(2_000 + Math.random() * 2_000);

  // 2. Scrappe les followers
  const followersResult = await sendToContentScript(tab.id, {
    type: "SKALLE_SCRAPE_FOLLOWERS",
    maxCount: 50,
  }, 45_000);

  if (followersResult?.leads?.length) {
    await sendToContentScript(tab.id, {
      type: "SKALLE_SEND_WARM_LEADS",
      leadType: "FOLLOW",
      leads: followersResult.leads,
    }, 15_000);
    console.log(`[SKALLE] Followers importés : ${followersResult.leads.length}`);
  }
}

// ── Traitement des branches conditionnelles (24h) ─────────────────────────────

async function processBranches() {
  const config = await getConfig();
  if (!config.skalleToken) return;

  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/process-branches`, {
      headers: { Authorization: `Bearer ${config.skalleToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.activated > 0 || data.skipped > 0) {
        console.log(`[SKALLE] Branches : ${data.activated} activée(s), ${data.skipped} annulée(s)`);
      }
    }
  } catch { /* silencieux */ }
}

// ── Vérification des connexions acceptées (24h) ───────────────────────────────

async function checkAcceptedConnections() {
  const config = await getConfig();
  if (!config.skalleToken) return;

  const tab = await findLinkedInTab();
  if (!tab) return;

  // Récupérer les invitations en attente depuis le backend
  let pending = [];
  try {
    const res = await fetch(`${API_BASE}/api/cso-agent/pending-connections`, {
      headers: { Authorization: `Bearer ${config.skalleToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    pending = data.pending ?? [];
  } catch { return; }

  if (!pending.length) return;

  console.log(`[SKALLE] Vérification de ${pending.length} invitation(s) en attente…`);

  // Demander au content script de vérifier la distance pour chaque prospect
  const checkResult = await sendToContentScript(tab.id, {
    type: "SKALLE_CHECK_CONNECTIONS",
    prospects: pending,
  }, 60_000);

  if (!checkResult?.accepted?.length) return;

  console.log(`[SKALLE] ${checkResult.accepted.length} connexion(s) acceptée(s) !`);

  // Pour chaque connexion acceptée : envoyer le message post-connexion
  for (const accepted of checkResult.accepted) {
    try {
      // Envoyer le message post-connexion via LinkedIn
      const msgResult = await sendToContentScript(tab.id, {
        type: "SKALLE_SEND_POST_MESSAGE",
        entityUrn: accepted.entityUrn,
        message: accepted.pendingMessage,
      }, 30_000);

      // Informer le backend
      await fetch(`${API_BASE}/api/cso-agent/connection-accepted`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.skalleToken}`,
        },
        body: JSON.stringify({
          prospectId: accepted.prospectId,
          messageSent: msgResult?.ok ?? false,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      // Délai entre les messages (éviter le spam)
      await sleep(3_000 + Math.random() * 4_000);
    } catch (err) {
      console.error("[SKALLE] Erreur envoi message post-connexion:", err);
    }
  }
}

// ── Alarm setup ───────────────────────────────────────────────────────────────

chrome.alarms.create(ALARM_NAME, {
  delayInMinutes: 1,
  periodInMinutes: POLL_INTERVAL_MINUTES,
});

// Vérification des connexions acceptées toutes les 24h
chrome.alarms.create(ALARM_CHECK_CONNECTIONS, {
  delayInMinutes: 5,
  periodInMinutes: CHECK_CONNECTIONS_INTERVAL_MINUTES,
});

// Vérification des réponses toutes les 12h
chrome.alarms.create(ALARM_CHECK_REPLIES, {
  delayInMinutes: 10,
  periodInMinutes: CHECK_REPLIES_INTERVAL_MINUTES,
});

// Import warm leads (viewers + followers) toutes les 6h
chrome.alarms.create(ALARM_WARM_IMPORT, {
  delayInMinutes: 15,
  periodInMinutes: WARM_IMPORT_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runAutonomousSearch();
    await runAutomation();
  }
  if (alarm.name === ALARM_CHECK_CONNECTIONS) {
    await processBranches();       // Traite les branches conditionnelles en premier
    await checkAcceptedConnections();
    await checkFollowups();
  }
  if (alarm.name === ALARM_CHECK_REPLIES) {
    await checkReplies();
  }
  if (alarm.name === ALARM_WARM_IMPORT) {
    await importWarmLeads();
  }
});

// Manual trigger from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SKALLE_RUN_NOW") {
    runAutonomousSearch()
      .then(() => runAutomation(true)) // forceRun=true : bypass cooldown + heures
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "SKALLE_IMPORT_WARM_NOW") {
    importWarmLeads()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === "SKALLE_GET_STATUS") {
    chrome.storage.local.get(
      [
        "automationStatus", "actionDate", "actionCount", "statusAt",
        "linkedInChallenge", "challengeAt",
        "rateLimitAt", "rateLimitResumeAt",
        "connReqDate", "connReqCount",
      ],
      (r) => sendResponse(r)
    );
    return true;
  }

  // Résolution manuelle du challenge par l'utilisateur
  if (msg.type === "SKALLE_CHALLENGE_RESOLVED") {
    chrome.storage.local.remove(["linkedInChallenge", "challengeAt"], async () => {
      await chrome.storage.sync.set({ automationEnabled: true });
      await setStatus("idle");
      sendResponse({ ok: true });
    });
    return true;
  }
});
