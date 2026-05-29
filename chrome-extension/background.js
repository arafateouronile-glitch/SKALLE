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

let API_BASE = "http://localhost:3000";

// Initialise depuis le storage au démarrage du service worker
chrome.storage.sync.get({ skalleApiBase: "" }, (data) => {
  if (data.skalleApiBase) API_BASE = data.skalleApiBase;
});

// Mise à jour en temps réel quand l'utilisateur sauvegarde dans le popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.skalleApiBase?.newValue !== undefined) {
    API_BASE = changes.skalleApiBase.newValue || "http://localhost:3000";
  }
});
const ALARM_NAME = "skalle-automation";
const ALARM_CHECK_CONNECTIONS = "skalle-check-connections";
const ALARM_CHECK_REPLIES = "skalle-check-replies";
const POLL_INTERVAL_MINUTES = 30;
const CHECK_CONNECTIONS_INTERVAL_MINUTES = 60 * 24; // toutes les 24h
const CHECK_REPLIES_INTERVAL_MINUTES = 60 * 12;     // toutes les 12h

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBusinessHours(start, end) {
  const hour = new Date().getHours();
  return hour >= start && hour < end;
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


async function sendToContentScript(tabId, message, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      resolve(response ?? { ok: false, error: "no_response" });
    });
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

async function runAutomation() {
  const config = await getConfig();

  if (!config.skalleToken) {
    await setStatus("no_token");
    return;
  }

  if (!config.automationEnabled) {
    await setStatus("disabled");
    return;
  }

  if (!isBusinessHours(config.businessHoursStart, config.businessHoursEnd)) {
    await setStatus("outside_hours");
    return;
  }

  const count = await getTodayCount();
  if (count >= config.dailyLimit) {
    await setStatus(`limit_reached:${count}/${config.dailyLimit}`);
    return;
  }

  await setStatus("running");

  const decisions = await fetchApprovedDecisions(config.skalleToken);
  if (!decisions.length) {
    await setStatus(`idle:${count}/${config.dailyLimit}`);
    return;
  }

  // Seulement agir si l'utilisateur a LinkedIn ouvert — jamais ouvrir un onglet nous-mêmes
  const tab = await findLinkedInTab();
  if (!tab) {
    await setStatus(`waiting_linkedin:${count}/${config.dailyLimit}`);
    console.log("[SKALLE] LinkedIn n'est pas ouvert — en attente que l'utilisateur l'ouvre");
    return;
  }

  for (const decision of decisions) {
    const currentCount = await getTodayCount();
    if (currentCount >= config.dailyLimit) break;

    // Send action to content script
    const result = await sendToContentScript(tab.id, {
      type: "SKALLE_EXECUTE",
      decision,
    });

    // Report back to backend
    await reportExecuted(config.skalleToken, decision.id, result);
    await incrementCount();

    const newCount = await getTodayCount();
    await setStatus(`running:${newCount}/${config.dailyLimit}`);

    // Random human-like delay before next action
    if (decisions.indexOf(decision) < decisions.length - 1) {
      const delay = randomDelay();
      console.log(`[SKALLE] Prochaine action dans ${Math.round(delay / 60_000)} min`);
      await sleep(delay);
    }
  }

  const finalCount = await getTodayCount();
  await setStatus(`done:${finalCount}/${config.dailyLimit}`);
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

/** Navigue un onglet vers une URL et attend que la page soit chargée.
 *  LinkedIn est une SPA : chrome.tabs.onUpdated peut ne jamais déclencher
 *  "complete" pour une navigation client-side. On ajoute un fallback 5s.
 */
async function navigateTabAndWait(tabId, url, extraDelayMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, extraDelayMs);
    };

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") done();
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url });

    // Fallback : si onUpdated ne se déclenche pas (SPA pushState), on résout après 5s
    setTimeout(done, 5_000);
  });
}

async function runAutonomousSearch() {
  const config = await getConfig();
  if (!config.skalleToken || !config.autonomousEnabled) return;
  if (!isBusinessHours(config.businessHoursStart, config.businessHoursEnd)) return;

  const count = await getTodayCount();
  if (count >= config.dailyLimit) return;

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
    await setStatus(`autonomous_waiting_linkedin:${count}/${config.dailyLimit}`);
    return;
  }

  const remaining = config.dailyLimit - count;
  const maxThisCycle = Math.min(3, remaining); // Max 3 profils/cycle

  await setStatus(`autonomous_running:${count}/${config.dailyLimit}`);

  // ── Étape 1 : Chercher des profils via l'API Voyager (sans navigation) ──────
  const profiles = await sendToContentScript(tab.id, {
    type: "SKALLE_SEARCH_PROFILES",
    queries: searchData.queries,
    maxProfiles: maxThisCycle,
  }, 30_000);

  if (!profiles?.list?.length) {
    await setStatus(`idle:${count}/${config.dailyLimit}`);
    return;
  }

  // ── Étape 2 : Pour chaque profil, naviguer vers la page puis connecter ──────
  const originalUrl = tab.url; // Pour restaurer l'onglet à la fin

  for (const profile of profiles.list) {
    const currentCount = await getTodayCount();
    if (currentCount >= config.dailyLimit) break;

    // Naviguer vers le vrai profil LinkedIn (génère un page view réel)
    await navigateTabAndWait(tab.id, profile.linkedInUrl);

    // Temps de lecture simulé avec scroll humain (5-15 secondes)
    const readTime = 5_000 + Math.random() * 10_000;
    console.log(`[SKALLE] Lecture profil ${profile.username} (${Math.round(readTime / 1000)}s)…`);
    await sendToContentScript(tab.id, {
      type: "SKALLE_SIMULATE_READING",
      durationMs: readTime,
    }, readTime + 3_000);

    // Enrichir et connecter depuis le contexte de la page de profil
    const result = await sendToContentScript(tab.id, {
      type: "SKALLE_PROCESS_AND_CONNECT",
      profile,
      workspaceId: searchData.workspaceId,
    }, 60_000);

    if (result?.ok) {
      await incrementCount();
      await reportExecuted(config.skalleToken, null, {
        ...result,
        autonomous: true,
        prospectId: result.prospectId,
      });
    }

    const newCount = await getTodayCount();
    await setStatus(`autonomous_running:${newCount}/${config.dailyLimit}`);

    // Délai humain entre chaque profil (3-8 min)
    if (profiles.list.indexOf(profile) < profiles.list.length - 1) {
      const delay = randomDelay();
      console.log(`[SKALLE] Prochain profil dans ${Math.round(delay / 60_000)} min`);
      await sleep(delay);
    }
  }

  // Restaurer l'onglet sur le feed LinkedIn
  chrome.tabs.update(tab.id, { url: "https://www.linkedin.com/feed/" });

  const finalCount = await getTodayCount();
  await setStatus(`autonomous_done:${finalCount}/${config.dailyLimit}`);
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runAutonomousSearch();
    await runAutomation();
  }
  if (alarm.name === ALARM_CHECK_CONNECTIONS) {
    await checkAcceptedConnections();
    await checkFollowups(); // Lance les relances dans le même cycle 24h
  }
  if (alarm.name === ALARM_CHECK_REPLIES) {
    await checkReplies();
  }
});

// Manual trigger from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SKALLE_RUN_NOW") {
    runAutonomousSearch()
      .then(() => runAutomation())
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "SKALLE_GET_STATUS") {
    chrome.storage.local.get(
      ["automationStatus", "actionDate", "actionCount", "statusAt"],
      (r) => sendResponse(r)
    );
    return true;
  }
});
