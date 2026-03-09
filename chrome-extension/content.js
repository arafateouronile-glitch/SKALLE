/**
 * SKALLE - Content script pour extraction des membres de groupes Facebook
 *
 * S'exécute sur facebook.com/groups/*/members
 * Injecte un bouton pour lancer l'extraction et envoie les données à l'API SKALLE
 */

const BATCH_SIZE = 50;
const API_BASE = "http://localhost:3000";

async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["skalleToken"], (r) => resolve(r.skalleToken || ""));
  });
}

/**
 * Extrait l'ID du groupe depuis l'URL
 */
function getGroupId() {
  const m = window.location.pathname.match(/\/groups\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Extrait le nom du groupe depuis le DOM (header ou titre)
 */
function getGroupName() {
  const h1 = document.querySelector('h1[dir="auto"]') || document.querySelector('h1');
  return h1?.textContent?.trim() || "Groupe Facebook";
}

/**
 * Extrait les membres visibles depuis le DOM
 * Facebook utilise différentes structures selon les mises à jour
 */
function extractMembersFromDOM() {
  const members = [];
  const seen = new Set();

  // Sélecteurs possibles pour les liens profils (Facebook change souvent la structure)
  const linkSelectors = [
    'a[href*="/user.php?id="]',
    'a[href*="facebook.com/profile.php?id="]',
    'a[href*="facebook.com/"][role="link"]',
    '[data-visualcompletion="ignore-dynamic"] a[href*="facebook.com"]',
  ];

  const links = document.querySelectorAll(linkSelectors.join(", "));

  for (const a of links) {
    const href = a.getAttribute("href") || "";
    if (!href.includes("facebook.com") || href.includes("/groups/")) continue;

    let metaUserId = null;
    const idMatch = href.match(/[?&]id=(\d+)/) || href.match(/facebook\.com\/(\d+)/);
    if (idMatch) metaUserId = idMatch[1];

    const usernameMatch = href.match(/facebook\.com\/([a-zA-Z0-9._]+)(?:\?|$|\/)/);
    const handle = metaUserId || (usernameMatch ? usernameMatch[1] : null);
    if (!handle) continue;

    const nameEl = a.closest("div")?.querySelector("span[dir='auto']") || a;
    const name = nameEl.textContent?.trim() || "Membre";
    if (name.length < 2 || name.length > 100) continue;

    const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href.startsWith("/") ? href : "/" + href}`;
    const key = handle;
    if (seen.has(key)) continue;
    seen.add(key);

    members.push({
      name: name.replace(/\s+/g, " ").trim(),
      handle: handle,
      profileUrl: fullUrl,
      metaUserId: metaUserId || undefined,
    });
  }

  // Fallback : chercher les spans avec noms dans la structure "Membres"
  const memberCards = document.querySelectorAll('[data-pagelet*="GroupMembers"] div[role="listitem"], [data-pagelet*="Members"] div[role="listitem"]');
  for (const card of memberCards) {
    const a = card.querySelector('a[href*="facebook.com"]');
    if (!a) continue;
    const href = a.getAttribute("href") || "";
    const idMatch = href.match(/[?&]id=(\d+)/) || href.match(/facebook\.com\/(\d+)/);
    const metaUserId = idMatch ? idMatch[1] : null;
    const usernameMatch = href.match(/facebook\.com\/([a-zA-Z0-9._]+)(?:\?|$|\/)/);
    const handle = metaUserId || (usernameMatch ? usernameMatch[1] : null);
    if (!handle || seen.has(handle)) continue;

    const span = card.querySelector('span[dir="auto"]');
    const name = span?.textContent?.trim() || "Membre";
    seen.add(handle);

    const fullUrl = href.startsWith("http") ? href : `https://www.facebook.com${href.startsWith("/") ? href : "/" + href}`;
    members.push({
      name: name.replace(/\s+/g, " ").trim(),
      handle,
      profileUrl: fullUrl,
      metaUserId: metaUserId || undefined,
    });
  }

  return members;
}

/**
 * Scroll la page pour charger plus de membres (lazy loading)
 */
async function scrollToLoadMore(limit = 200) {
  let lastHeight = 0;
  let iterations = 0;
  const maxIterations = 20;

  while (iterations < maxIterations) {
    const members = extractMembersFromDOM();
    if (members.length >= limit) break;

    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 1500));
    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
    iterations++;
  }
}

/**
 * Envoie un batch de membres à l'API SKALLE
 */
async function sendBatch(groupId, groupName, groupUrl, members) {
  const token = await getToken();
  if (!token) {
    throw new Error("Token non configuré. Ouvrez la popup de l'extension.");
  }

  const res = await fetch(`${API_BASE}/api/facebook-groups/import-members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      groupId,
      groupName,
      groupUrl,
      members,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

/**
 * Affiche une notification sur la page
 */
function showToast(message, type = "info") {
  const existing = document.getElementById("skalle-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "skalle-toast";
  toast.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    padding: 14px 20px; border-radius: 8px; font-family: system-ui; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 360px;
    background: ${type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6"};
    color: white;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

/**
 * Injecte le bouton d'import dans la page
 */
function injectButton() {
  if (document.getElementById("skalle-import-btn")) return;

  const btn = document.createElement("button");
  btn.id = "skalle-import-btn";
  btn.innerHTML = "📥 Importer les membres → SKALLE";
  btn.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999998;
    padding: 12px 20px; border-radius: 8px; border: none; font-weight: 600; font-size: 14px;
    background: linear-gradient(135deg, #10b981, #059669); color: white; cursor: pointer;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  `;
  btn.onmouseover = () => (btn.style.opacity = "0.9");
  btn.onmouseout = () => (btn.style.opacity = "1");

  btn.addEventListener("click", async () => {
    const groupId = getGroupId();
    if (!groupId) {
      showToast("Impossible de détecter l'ID du groupe.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Chargement des membres...";

    try {
      await scrollToLoadMore(300);
      const members = extractMembersFromDOM();

      if (members.length === 0) {
        showToast("Aucun membre détecté. Essayez de scroller la liste manuellement.", "error");
        btn.textContent = "📥 Importer les membres → SKALLE";
        btn.disabled = false;
        return;
      }

      let totalImported = 0;
      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const batch = members.slice(i, i + BATCH_SIZE);
        const result = await sendBatch(
          groupId,
          getGroupName(),
          window.location.href.split("?")[0],
          batch
        );
        totalImported += result.imported || 0;
        btn.textContent = `Import... ${Math.min(i + BATCH_SIZE, members.length)}/${members.length}`;
      }

      showToast(`✓ ${totalImported} membres importés dans SKALLE !`, "success");
    } catch (err) {
      showToast(err.message || "Erreur lors de l'import", "error");
    } finally {
      btn.textContent = "📥 Importer les membres → SKALLE";
      btn.disabled = false;
    }
  });

  document.body.appendChild(btn);
}

// Démarrer quand le DOM est prêt
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectButton);
} else {
  setTimeout(injectButton, 2000);
}
