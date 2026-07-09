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

// ── Log relay vers background.js (visible dans l'extension DevTools) ─────────
function csLog(...args) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  console.log("[SKALLE-CS]", msg);
  try { chrome.runtime.sendMessage({ type: "SKALLE_CS_LOG", msg: "[CS] " + msg }); } catch (_) {}
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
    // Essai 1 : API dash/profiles (format actuel LinkedIn)
    const res = await fetch(
      `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.ProfileEntityUrn-1`,
      { headers: { ...voyagerHeaders(csrf), accept: "application/vnd.linkedin.normalized+json+2.1" }, credentials: "include" }
    );
    csLog("resolveLinkedInProfile HTTP:", res.status, username);
    if (res.ok) {
      const json = await res.json();
      // LinkedIn renvoie un wrapper CollectionResponse — chercher urn:li:fsd_profile: récursivement
      const findFsdUrn = (o, depth) => {
        if (depth > 6) return null;
        if (typeof o === "string") return o.startsWith("urn:li:fsd_profile:") ? o : null;
        if (!o || typeof o !== "object") return null;
        if (Array.isArray(o)) { for (const v of o) { const r = findFsdUrn(v, depth + 1); if (r) return r; } return null; }
        if (typeof o.entityUrn === "string" && o.entityUrn.startsWith("urn:li:fsd_profile:")) return o.entityUrn;
        for (const v of Object.values(o)) { const r = findFsdUrn(v, depth + 1); if (r) return r; }
        return null;
      };
      const entityUrn = findFsdUrn(json, 0);
      const el = json?.elements?.[0] ?? json?.data ?? json ?? {};
      const distance = el.distance?.value ?? el.connectionDistance ?? "DISTANCE_2";
      csLog("resolveLinkedInProfile entityUrn:", entityUrn, "distance:", distance);
      if (entityUrn) return { entityUrn, distance, firstName: el.firstName ?? "" };
    }

    // Essai 2 : ancien endpoint
    const res2 = await fetch(
      `/voyager/api/identity/profiles/${username}`,
      { headers: voyagerHeaders(csrf), credentials: "include" }
    );
    csLog("resolveLinkedInProfile (legacy) HTTP:", res2.status);
    if (!res2.ok) return null;
    const data = await res2.json();
    csLog("resolveLinkedInProfile (legacy) entityUrn:", data.entityUrn);
    return {
      entityUrn: data.entityUrn ?? null,
      distance: data.distance?.value ?? "DISTANCE_2",
      firstName: data.firstName ?? "",
    };
  } catch (e) {
    console.warn("[SKALLE] Voyager erreur:", e?.message);
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
  // Priorité 1 : <button> avec aria-label explicite — exclut les <a> "People Also Viewed"
  // qui naviguent en SPA au lieu d'ouvrir la modal de connexion
  const byAriaBtn = document.querySelector(
    'button[aria-label*="Se connecter"], button[aria-label*="Connect with"], button[aria-label*="Inviter"], button[aria-label*="connecter"]'
  );
  if (byAriaBtn && !byAriaBtn.disabled) return byAriaBtn;

  // Priorité 2 : [role="button"] avec aria-label (div/span stylé en bouton)
  const byAriaRole = document.querySelector(
    '[role="button"][aria-label*="Se connecter"], [role="button"][aria-label*="Connect with"], [role="button"][aria-label*="Inviter"]'
  );
  if (byAriaRole) return byAriaRole;

  // Priorité 3 : <button> par texte (pas de <a> — ils naviguent, pas de modal)
  const byText = Array.from(document.querySelectorAll('button, [role="button"]')).find((el) => {
    if (el.disabled) return false;
    const text = el.textContent.trim().toLowerCase();
    return text === "se connecter" || text === "connect" || text === "inviter";
  });
  if (byText) return byText;
  return null;
}

// Attend que le bouton "Se connecter" apparaisse (LinkedIn hydrate en différé)
function waitForConnectButton(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const found = findConnectButton();
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const btn = findConnectButton();
      if (btn) { obs.disconnect(); clearTimeout(timer); resolve(btn); }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}

/**
 * Clique sur le bouton "Se connecter" via le DOM.
 * LinkedIn génère lui-même la requête normInvitations → headers natifs + timing naturel.
 */
async function sendConnectionRequestDOM(connectNote) {
  // Attendre que le bouton apparaisse (LinkedIn hydrate en différé, max 5s)
  // Cherche uniquement button/<[role=button]> — les <a> sont des pré-rendus cachés qui ne déclenchent pas le modal
  let btn = await waitForConnectButton(5000);

  // Mode "Follow" : Se connecter est dans le dropdown "Plus"
  if (!btn) {
    const allBtns = Array.from(document.querySelectorAll("button"));
    const isVisible = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    // IMPORTANT : on cible UNIQUEMENT le bouton VISIBLE — il peut exister plusieurs boutons
    // aria-label="Plus" sur la page (dont des pré-rendus display:none avec bottom=0).
    const plusBtn =
      allBtns.find((b) => {
        if (b.disabled || !isVisible(b)) return false;
        const aria = (b.getAttribute("aria-label") ?? "").trim().toLowerCase();
        return aria === "plus" || aria === "plus d'options";
      }) ??
      allBtns.find((b) => {
        if (b.disabled || !isVisible(b)) return false;
        const text = b.textContent.trim().toLowerCase();
        return text === "plus";
      });
    csLog("plusBtn:", plusBtn ? (plusBtn.getAttribute("aria-label") ?? plusBtn.textContent.trim()) : "non trouvé",
          "| visible:", plusBtn ? isVisible(plusBtn) : false,
          "| bottom:", plusBtn ? Math.round(plusBtn.getBoundingClientRect().bottom) : 0);

    if (plusBtn) {
      const isInviteEl = (el) => {
        const a = (el.getAttribute("aria-label") ?? "").toLowerCase();
        const t = el.textContent.trim().toLowerCase();
        // includes() au lieu de === pour attraper les <li> avec textContent composite (texte + SVG + espace)
        return a.includes("inviter") || a.includes("se connecter") || a.includes("connect") ||
               t.includes("se connecter") || t === "connect" || t.includes("connect with");
      };

      // Snapshot AVANT ouverture — position du Plus + quels éléments sont déjà interactifs
      const plusRect = plusBtn.getBoundingClientRect();
      const inviteSelectors = "a, button, [role='menuitem'], .artdeco-dropdown__item, li button, li a";
      const wasInteractable = new Set(
        Array.from(document.querySelectorAll(inviteSelectors))
          .filter(el => isInviteEl(el) && window.getComputedStyle(el).pointerEvents !== "none")
      );
      csLog("plusBtn bottom:", Math.round(plusRect.bottom), "| déjà interactifs:", wasInteractable.size);

      // v2.0.3 — cherche <a> PYMK dans la zone du header AVANT d'ouvrir Plus.
      // Ouvrir Plus crée un backdrop qui intercepte stopPropagation() sur les MouseEvents :
      // notre clickEl() bulle, traverse le backdrop qui l'arrête → React root ne le reçoit
      // jamais → le modal d'invitation ne s'ouvre pas (confirmé par snapshots pré/post clic).
      // En cliquant le <a> SANS ouvrir Plus, l'event bubble librement jusqu'à React → modal.
      const pymkA = Array.from(document.querySelectorAll("a")).find((el) => {
        if (!isInviteEl(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= plusRect.top - 30 && r.top <= plusRect.bottom + 400;
      });
      csLog("pymkA (avant Plus):", pymkA ? (pymkA.getAttribute("aria-label") ?? pymkA.textContent.trim().slice(0, 40)) : "null");

      if (pymkA) {
        btn = pymkA;
      } else {
      csLog("Aucun pymkA → ouverture Plus dropdown");
      // Clic Plus avec MouseEvent complet (coordonnées réelles) pour que LinkedIn l'accepte
      const clickWithCoords = (el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
      };
      clickWithCoords(plusBtn);

      // Attendre un peu et vérifier si le dropdown s'est ouvert (aria-expanded)
      await new Promise(r => setTimeout(r, 600));
      const expandedAfter = plusBtn.getAttribute("aria-expanded");
      csLog("aria-expanded après click Plus:", expandedAfter);

      // Si aria-expanded pas true, essayer via React props directement
      if (expandedAfter !== "true") {
        const rKey = Object.keys(plusBtn).find(k => k.startsWith("__reactProps"));
        if (rKey && plusBtn[rKey]?.onClick) {
          csLog("React props onClick — appel direct");
          plusBtn[rKey].onClick({ type: "click", bubbles: true, preventDefault: () => {}, stopPropagation: () => {} });
          await new Promise(r => setTimeout(r, 800));
          csLog("aria-expanded après React onClick:", plusBtn.getAttribute("aria-expanded"));
        } else {
          csLog("React props non disponibles — clé:", rKey ?? "none");
        }
      }
      await new Promise(r => setTimeout(r, 600)); // total ~2s

      // Approche 1 : chercher dans le menu OUVERT (portal ou inline) via [role="menu"]
      const openMenu = document.querySelector(
        '[role="menu"], .artdeco-dropdown__content--opened, [class*="artdeco-dropdown__content"][class*="opened"]'
      );
      // Log des items dans le menu pour diagnostic
      if (openMenu) {
        const sample = Array.from(openMenu.querySelectorAll("*")).slice(0, 20).map(el => ({
          tag: el.tagName, a: el.getAttribute("aria-label"), t: el.textContent.trim().slice(0, 25),
        }));
        csLog("openMenu classes:", openMenu.className.slice(0, 80), "| items:", openMenu.children.length);
        csLog("openMenu sample:", JSON.stringify(sample.slice(0, 8)));
      } else {
        csLog("openMenu: null");
      }

      // Priorité aux éléments interactifs natifs (<a>, <button>) — éviter les DIV wrappers
      // dont le clic ne bubble pas jusqu'au handler React du bon élément.
      const dropdownItem = openMenu
        ? (Array.from(openMenu.querySelectorAll("a, button, [role='menuitem']"))
            .find(el => isInviteEl(el) && el.getBoundingClientRect().width > 0)
          ?? Array.from(openMenu.querySelectorAll("*"))
            .find(el => isInviteEl(el) && el.getBoundingClientRect().width > 0))
        : null;
      csLog("dropdownItem via openMenu:", dropdownItem ? `${dropdownItem.tagName} — ${dropdownItem.getAttribute("aria-label") ?? dropdownItem.textContent.trim().slice(0, 40)}` : "null");

      if (dropdownItem) {
        btn = dropdownItem;
      } else {
        // Fallback inline : depuis le parent du bouton Plus
        const plusParent = plusBtn.closest('[class*="dropdown"], [class*="overflow"]') ?? plusBtn.parentElement;
        const parentItem = plusParent
          ? Array.from(plusParent.querySelectorAll("*"))
              .find(el => el !== plusBtn && isInviteEl(el) && el.getBoundingClientRect().width > 0)
          : null;
        csLog("parentItem (inline fallback):", parentItem ? (parentItem.getAttribute("aria-label") ?? parentItem.textContent.trim().slice(0, 40)) : "null");

        // nearPlus : dernier recours (Plus déjà ouvert → backdrop actif → risque de blocage)
        // Ce chemin n'est atteint que si pymkA était null (pas de PYMK visible avant ouverture Plus).
        const nearPlus = Array.from(document.querySelectorAll("a, button, [role='menuitem'], li")).find(el => {
          if (!isInviteEl(el)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top >= plusRect.top - 30 && r.top <= plusRect.bottom + 400;
        });
        csLog("nearPlus (fallback positionnel):", nearPlus ? (nearPlus.getAttribute("aria-label") ?? nearPlus.textContent.trim().slice(0, 40)) : "null");
        csLog("nearPlus inDOM:", nearPlus ? document.body.contains(nearPlus) : false);

        btn = parentItem ?? nearPlus ?? null;
        if (!btn) return { ok: false, reason: "plus_no_connect_in_dropdown", openMenu: openMenu?.className?.slice(0, 40) ?? "null" };
      }
      } // fin else { pymkA non trouvé → flow Plus dropdown }
    } else {
      return { ok: false, reason: "no_plus_no_connect", h1: (document.querySelector("main h1, h1")?.textContent ?? "").trim().slice(0, 50) };
    }
  }

  if (!btn) return { ok: false, reason: "button_not_found" };

  // Clic avec MouseEvent complet + fallback React props
  const clickEl = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  };

  csLog("btn trouvé — tag:", btn.tagName, "aria:", btn.getAttribute("aria-label") ?? btn.textContent.trim().slice(0, 40));
  csLog("btn inDOM:", document.body.contains(btn));

  // Snapshot avant clic: distinguer boutons "Envoyer" préexistants vs ceux du modal
  const normalizeText = (el) => (el.textContent ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
  const normalizeAttr = (el, attr) => (el.getAttribute(attr) ?? "").replace(/[\s\u00a0]+/g, " ").toLowerCase();
  const MODAL_SEL = "button, [role='button'], .artdeco-button, [type='button']";

  const preEnvoyer = Array.from(document.querySelectorAll("button"))
    .filter(b => normalizeText(b) === "envoyer")
    .map(b => ({ d: b.disabled, w: Math.round(b.getBoundingClientRect().width) }));
  csLog("Envoyer btns avant clic:", JSON.stringify(preEnvoyer));

  clickEl(btn);

  const sendBtn = await new Promise((resolve) => {
    const find = () => {
      const sansNote = Array.from(document.querySelectorAll(MODAL_SEL)).find((b) => {
        if (b.disabled) return false;
        const t = normalizeText(b);
        const a = normalizeAttr(b, "aria-label");
        if (t.includes("sans") || t.includes("without") || a.includes("sans") || a.includes("without")) return true;
        // LinkedIn a renommé "Envoyer sans note" → "Envoyer" — vérifier qu'on est dans un dialog
        // LinkedIn n'utilise pas role="dialog" sur son modal — juste vérifier le texte exact
        // Le bouton "Envoyer" du message composer est disabled quand aucun message n'est tapé
        if (t === "envoyer" || t === "send") return true;
        return false;
      });
      if (sansNote) return sansNote;
      if (connectNote?.trim()) {
        return Array.from(document.querySelectorAll(MODAL_SEL)).find((b) => {
          if (b.disabled) return false;
          const t = normalizeText(b);
          return t.includes("ajouter") || t.includes("add a note");
        }) ?? null;
      }
      return null;
    };

    const found = find();
    if (found) { csLog("sendBtn immédiat:", normalizeText(found)); return resolve(found); }

    // Polling 100ms (réduit pour ne pas rater la brève fenêtre du modal)
    const poll = setInterval(() => {
      const f = find();
      if (f) { clearInterval(poll); obs.disconnect(); clearTimeout(timer); csLog("sendBtn par polling:", normalizeText(f)); resolve(f); }
    }, 300);

    const obs = new MutationObserver(() => {
      const f = find();
      if (f) { clearInterval(poll); obs.disconnect(); clearTimeout(timer); csLog("sendBtn via obs:", normalizeText(f)); resolve(f); }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });

    // Snapshot 500ms: vérifier état des boutons Envoyer (disabled? visible?)
    setTimeout(() => {
      const snap = Array.from(document.querySelectorAll("button"))
        .filter(b => normalizeText(b) === "envoyer")
        .map(b => ({ d: b.disabled, w: Math.round(b.getBoundingClientRect().width), cls: b.className.slice(0, 22) }));
      csLog("Envoyer btns à 500ms:", JSON.stringify(snap));
    }, 500);

    const timer = setTimeout(() => {
      clearInterval(poll);
      obs.disconnect();
      const allBtns = Array.from(document.querySelectorAll("button, [role='button']"))
        .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .slice(0, 25)
        .map((b) => ({ tag: b.tagName, t: b.textContent.trim().slice(0, 30), a: b.getAttribute("aria-label") }));
      csLog("sendBtn timeout — visible btns:", JSON.stringify(allBtns));
      // Cherche "sans note" ou "without note" n'importe où dans le DOM (modal ouvert ?)
      const sansEls = Array.from(document.querySelectorAll("*"))
        .filter(el => {
          if (!["BUTTON","A","DIV","SPAN","P","LI"].includes(el.tagName)) return false;
          const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
          return t.includes("sans note") || t.includes("without note") || t === "envoyer" || t === "send now";
        })
        .slice(0, 8)
        .map(el => ({ tag: el.tagName, role: el.getAttribute("role"), class: (el.className ?? "").slice(0, 30), t: el.textContent.trim().slice(0, 40) }));
      csLog("sendBtn timeout — 'sans note' dans DOM:", JSON.stringify(sansEls));
      resolve(null);
    }, 4000);
  });

  if (!sendBtn) return { ok: false, reason: "modal_timeout" };

  if (connectNote?.trim() && normalizeText(sendBtn).includes("ajouter")) {
    // Cas avec note : cliquer "Ajouter une note", remplir, puis envoyer
    sendBtn.click();
    await new Promise((r) => setTimeout(r, 600));
    const textarea = await waitForElement("textarea", 2000);
    if (textarea) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, connectNote.slice(0, 300));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    }
    const finalSend = await new Promise((resolve) => {
      const find = () => Array.from(document.querySelectorAll("button")).find((b) => {
        if (b.disabled) return false;
        const t = normalizeText(b);
        return t === "envoyer" || t === "send";
      }) ?? null;
      const f = find(); if (f) return resolve(f);
      const obs = new MutationObserver(() => { const ff = find(); if (ff) { obs.disconnect(); clearTimeout(timer); resolve(ff); } });
      obs.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, 3000);
    });
    if (!finalSend) return { ok: false, reason: "send_button_not_found" };
    finalSend.click();
  } else {
    // Cas sans note (ou déjà sur "Envoyer sans note") : clic direct
    sendBtn.click();
  }

  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
}

/**
 * Envoie une demande de connexion via Voyager API (memberRelationships — endpoint actif 2025).
 * Le clic DOM (isTrusted bloqué) n'est plus tenté ici — c'est la responsabilité de l'appelant.
 */
async function sendConnectionRequest(username, connectNote, csrf, _skipDom = false, entityUrn = null) {
  const profileUrn = entityUrn ?? `urn:li:fsd_profile:${username}`;
  const headers = { ...voyagerHeaders(csrf), "content-type": "application/json" };
  csLog("memberRelationships: profileUrn=", profileUrn);

  const { res, abortCode } = await voyagerFetch(
    "/voyager/api/relationships/dash/memberRelationships?action=verifyQuotaAndCreate",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        inviteeProfileUrn: profileUrn,
        customMessage: (connectNote ?? "").slice(0, 300),
      }),
    }
  );
  csLog("memberRelationships:", res?.status, abortCode ?? "");
  if (abortCode) return { ok: false, abortCode };
  return { ok: res?.ok ?? false, status: res?.status };
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
    if (window.location.pathname.includes(`/in/${username}`)) {
      const domName = document.querySelector("h1")?.textContent?.trim() ?? "";
      const expectedName = (data.prospectName ?? "") + "";
      if (expectedName && !profileNameMatches(expectedName, domName)) {
        console.warn(`[SKALLE] profile_mismatch: attendu "${expectedName}", trouvé "${domName}" — action annulée`);
        return { ok: false, error: `profile_mismatch: attendu "${expectedName}", trouvé "${domName}"` };
      }
    }

    // ── Stratégie 1 : Voyager API (memberRelationships — confirmé 2025) ────────────
    // Le clic DOM (isTrusted bloqué par LinkedIn depuis le content script) n'est plus
    // la voie principale. L'API est identique à ce que LinkedIn appelle nativement.
    const profile = await resolveLinkedInProfile(username, csrf);

    if (profile?.distance === "DISTANCE_1") {
      // Déjà connecté → envoyer le message post-connexion
      const message = data.postConnectionMessage ?? data.connectNote ?? "";
      if (!message) return { ok: false, error: "no_message" };
      const result = await sendLinkedInMessage(profile.entityUrn, message, csrf);
      return { ...result, action: "message_sent", username };
    }

    const apiResult = await sendConnectionRequest(username, data.connectNote, csrf, true, profile?.entityUrn ?? null);
    if (apiResult.ok || apiResult.abortCode) {
      return { ...apiResult, action: "connection_request", username };
    }

    // ── Stratégie 2 : DOM click (fallback si API 5xx ou erreur réseau) ──────────
    console.warn("[SKALLE] API status:", apiResult.status, "→ fallback DOM");
    const domResult = await sendConnectionRequestDOM(data.connectNote);
    return { ...domResult, action: "connection_request", username, apiStatus: apiResult.status };
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
  const connResult = await sendConnectionRequest(username, result.connectNote ?? null, csrf, true, profileData.entityUrn ?? null);

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

// ── Listeners (tous les types de messages) ────────────────────────────────────

console.log("[SKALLE] Content script init — runtime.id:", chrome.runtime?.id ?? "ABSENT", window.location.href);
if (!chrome.runtime?.id) {
  console.warn("[SKALLE] Contexte extension invalide — listener non enregistré");
} else {
  window._skalleListenerRegistered = true;
  console.log("[SKALLE] Listener enregistré");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Vérifie que le content script est prêt (utilisé par background.js après navigation)
  if (msg.type === "SKALLE_PING") {
    sendResponse({ ok: true, url: window.location.href, v: "2.0.6" });
    return true;
  }

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
} // end else (_skalleListenerRegistered guard)
