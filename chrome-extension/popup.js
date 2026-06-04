// ── Config ────────────────────────────────────────────────────────────────────

async function getApiBase() {
  const { skalleApiBase } = await chrome.storage.sync.get({ skalleApiBase: "" });
  return skalleApiBase?.trim() || "https://skalle.vercel.app";
}

// ── Token ─────────────────────────────────────────────────────────────────────

document.getElementById("save").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  const rawUrl = document.getElementById("apiBase").value.trim();
  const apiBase = rawUrl.replace(/\/$/, "") || "";   // vide = localhost côté scripts

  await chrome.storage.sync.set({ skalleToken: token, skalleApiBase: apiBase });
  const btn = document.getElementById("save");
  btn.textContent = "✓ Enregistré !";
  setTimeout(() => { btn.textContent = "Enregistrer"; }, 2000);
});

// ── Config automation ─────────────────────────────────────────────────────────

async function loadConfig() {
  const config = await chrome.storage.sync.get({
    skalleToken: "",
    skalleApiBase: "",
    automationEnabled: true,
    dailyLimit: 10,
    businessHoursStart: 9,
    businessHoursEnd: 18,
  });

  if (config.skalleToken) {
    document.getElementById("token").value = config.skalleToken;
  }
  document.getElementById("apiBase").value = config.skalleApiBase || "";
  document.getElementById("automationEnabled").checked = config.automationEnabled;
  document.getElementById("autonomousEnabled").checked = config.autonomousEnabled ?? false;
  document.getElementById("dailyLimit").value = config.dailyLimit;
  document.getElementById("hoursStart").value = config.businessHoursStart;
  document.getElementById("hoursEnd").value = config.businessHoursEnd;
}

document.getElementById("saveConfig").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    automationEnabled: document.getElementById("automationEnabled").checked,
    autonomousEnabled: document.getElementById("autonomousEnabled").checked,
    dailyLimit: parseInt(document.getElementById("dailyLimit").value) || 10,
    businessHoursStart: parseInt(document.getElementById("hoursStart").value) || 9,
    businessHoursEnd: parseInt(document.getElementById("hoursEnd").value) || 18,
  });
  const btn = document.getElementById("saveConfig");
  btn.textContent = "✓ Config enregistrée";
  setTimeout(() => { btn.textContent = "Enregistrer la config"; }, 2000);
});

// ── Statut automation ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  no_token:                    { text: "Token manquant",        cls: "pill-red"   },
  disabled:                    { text: "Désactivée",            cls: "pill-gray"  },
  day_off:                     { text: "Week-end / férié",      cls: "pill-gray"  },
  outside_hours:               { text: "Hors horaires",         cls: "pill-amber" },
  cooldown:                    { text: "⏸ Cooldown",           cls: "pill-amber" },
  limit_reached:               { text: "Limite atteinte",       cls: "pill-amber" },
  waiting_linkedin:            { text: "LinkedIn non ouvert",   cls: "pill-amber" },
  autonomous_waiting_linkedin: { text: "LinkedIn non ouvert",   cls: "pill-amber" },
  autonomous_running:          { text: "🤖 Recherche…",         cls: "pill-blue"  },
  autonomous_done:             { text: "🤖 Terminé",            cls: "pill-green" },
  running:                     { text: "En cours…",             cls: "pill-blue"  },
  done:                        { text: "Terminé",               cls: "pill-green" },
  idle:                        { text: "En attente",            cls: "pill-gray"  },
  challenge_detected:          { text: "🚨 CAPTCHA LinkedIn",   cls: "pill-red"   },
  rate_limited:                { text: "⏸ Rate limit 4h",      cls: "pill-amber" },
};

function parseStatus(raw) {
  if (!raw) return { key: "idle", count: 0, limit: 10 };
  const [key, rest] = raw.split(":");
  let count = 0, limit = 10;
  if (rest) {
    const m = rest.match(/(\d+)\/(\d+)/);
    if (m) { count = parseInt(m[1]); limit = parseInt(m[2]); }
  }
  return { key, count, limit };
}

async function refreshStatus() {
  let data = {};
  try {
    data = await chrome.runtime.sendMessage({ type: "SKALLE_GET_STATUS" }) ?? {};
  } catch {
    // Service worker inactif (MV3) — état idle par défaut
  }
  const { key, count, limit } = parseStatus(data?.automationStatus);

  // Challenge alert
  const challengeAlert = document.getElementById("challengeAlert");
  if (challengeAlert) {
    challengeAlert.style.display = data?.linkedInChallenge ? "block" : "none";
  }

  // Rate-limit alert
  const rateLimitAlert = document.getElementById("rateLimitAlert");
  const rateLimitMeta = document.getElementById("rateLimitMeta");
  if (rateLimitAlert) {
    const resumeAt = data?.rateLimitResumeAt ?? 0;
    const active = resumeAt && Date.now() < resumeAt;
    rateLimitAlert.style.display = active ? "block" : "none";
    if (active && rateLimitMeta) {
      const minLeft = Math.ceil((resumeAt - Date.now()) / 60_000);
      rateLimitMeta.textContent = `Reprise automatique dans ${minLeft < 60 ? `${minLeft} min` : `${Math.ceil(minLeft / 60)}h`}.`;
    }
  }

  const info = STATUS_LABELS[key] ?? { text: key, cls: "pill-gray" };
  const pill = document.getElementById("statusPill");
  pill.textContent = info.text;
  pill.className = `status-pill ${info.cls}`;

  const pct = limit > 0 ? Math.min(100, (count / limit) * 100) : 0;
  document.getElementById("progressFill").style.width = `${pct}%`;

  const today = new Date().toISOString().slice(0, 10);
  const actionDate = data?.actionDate ?? "";
  const countToday = actionDate === today ? (data?.actionCount ?? 0) : 0;
  document.getElementById("statusMeta").textContent =
    `${countToday} action${countToday !== 1 ? "s" : ""} effectuée${countToday !== 1 ? "s" : ""} aujourd'hui · Prochain check dans ~30 min`;

  // Afficher fenêtre active, cooldown, limite du jour, warmup, rythme semaine
  const limitInfo = document.getElementById("effectiveLimitInfo");
  if (limitInfo) {
    const local = await chrome.storage.local.get([
      "dailyTargetDate", "dailyTarget", "warmupStartDate",
      "windowDate", "windowStart", "windowEnd",
      "nextActionAt", "wkCount",
    ]);
    const isToday = local.dailyTargetDate === today;
    const effectiveTarget = isToday ? local.dailyTarget : null;
    const parts = [];

    // Fenêtre active du jour
    if (local.windowDate === today && local.windowStart != null) {
      const toHM = (h) => {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return `${hh}h${mm > 0 ? String(mm).padStart(2, "0") : ""}`;
      };
      parts.push(`Fenêtre : ${toHM(local.windowStart)}–${toHM(local.windowEnd)}`);
    }

    // Objectif du jour
    if (effectiveTarget) parts.push(`Objectif : ${effectiveTarget} actions`);

    // Warmup
    if (local.warmupStartDate) {
      const diffDays = Math.floor((Date.now() - new Date(local.warmupStartDate).getTime()) / 86400000);
      const w = Math.min(Math.floor(diffDays / 7), 3);
      parts.push(`Warmup S${w + 1} (${["30%","50%","70%","✓"][w]})`);
    }

    // Actions cette semaine
    if (local.wkCount > 0) parts.push(`${local.wkCount} cette semaine`);

    // Cooldown
    if (local.nextActionAt && Date.now() < local.nextActionAt) {
      const minLeft = Math.ceil((local.nextActionAt - Date.now()) / 60_000);
      parts.push(`Cooldown : encore ${minLeft} min`);
    }

    limitInfo.textContent = parts.join(" · ");
  }
}

document.getElementById("refresh").addEventListener("click", refreshStatus);

// ── Reset complet automation ──────────────────────────────────────────────────

document.getElementById("resetAutomation").addEventListener("click", async () => {
  const btn = document.getElementById("resetAutomation");
  btn.disabled = true;
  btn.textContent = "⏳ Reset…";
  await chrome.storage.local.remove([
    "linkedInChallenge", "challengeAt",
    "rateLimitAt", "rateLimitResumeAt",
    "nextActionAt",
  ]);
  await chrome.storage.sync.set({ automationEnabled: true });
  await refreshStatus();
  btn.disabled = false;
  btn.textContent = "✅ Automation débloquée";
  setTimeout(() => { btn.textContent = "🔓 Débloquer l'automation (reset complet)"; }, 3000);
});

// ── Résolution du challenge LinkedIn ──────────────────────────────────────────

document.getElementById("challengeResolved").addEventListener("click", async () => {
  const btn = document.getElementById("challengeResolved");
  btn.disabled = true;
  btn.textContent = "⏳ Réactivation…";
  try { await chrome.runtime.sendMessage({ type: "SKALLE_CHALLENGE_RESOLVED" }); } catch { /* service worker inactif */ }
  await refreshStatus();
  btn.disabled = false;
  btn.textContent = "✅ J'ai résolu le challenge — reprendre";
});

// ── Actions manuelles ─────────────────────────────────────────────────────────

document.getElementById("runNow").addEventListener("click", async () => {
  const btn = document.getElementById("runNow");
  btn.disabled = true;
  btn.textContent = "⏳ Lancement…";
  try { await chrome.runtime.sendMessage({ type: "SKALLE_RUN_NOW" }); } catch { /* service worker inactif */ }
  await refreshStatus();
  btn.disabled = false;
  btn.textContent = "▶ Lancer maintenant";
});

// ── Dashboard link ────────────────────────────────────────────────────────────

document.getElementById("openDashboard").addEventListener("click", async (e) => {
  e.preventDefault();
  const base = await getApiBase();
  chrome.tabs.create({ url: `${base}/sales-os/agent` });
});

// ── Reset warmup ──────────────────────────────────────────────────────────────

document.getElementById("resetWarmup").addEventListener("click", async () => {
  const today = new Date().toISOString().slice(0, 10);
  await chrome.storage.local.remove(["warmupStartDate", "dailyTargetDate", "dailyTarget"]);
  await chrome.storage.local.set({ warmupStartDate: today });
  await refreshStatus();
  const btn = document.getElementById("resetWarmup");
  btn.textContent = "✓ Warmup réinitialisé";
  setTimeout(() => { btn.textContent = "↺ Nouveau compte LinkedIn (reset warmup)"; }, 2500);
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadConfig();
refreshStatus();
