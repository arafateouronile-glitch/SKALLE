/**
 * 📸 IG Extractor - Script à lancer sur Instagram
 *
 * Lance ce script dans la console du navigateur (F12) lorsque tu es sur :
 * - La liste des abonnés d'un compte concurrent
 * - La page d'un hashtag (#hashtag)
 *
 * Instructions :
 * 1. Va sur instagram.com/[compte]/followers/ ou instagram.com/explore/tags/[hashtag]/
 * 2. Fais défiler pour charger les profils visibles
 * 3. Ouvre la console (F12 > Console)
 * 4. Remplace TA_CLE_API par ton token d'extension (depuis le dashboard Skalle)
 * 5. Remplace TON_DOMAINE par l'URL de ton app (ex: https://ton-saas.com)
 * 6. Colle et exécute ce script
 */
(function () {
  const API_URL = "TON_DOMAINE/api/prospects/import";
  const BEARER_TOKEN = "TA_CLE_API";

  const prospects = [];
  const sourceUrl = window.location.href;

  // Sélecteurs Instagram (peuvent changer - à adapter si Instagram modifie son DOM)
  const selectors = [
    'span._ap3a._aaco._aacw._aacx._aad7._aade',  // Usernames dans les listes
    'a[href^="/"] span',  // Fallback pour les spans dans les liens profil
  ];

  let elements = [];
  for (const sel of selectors) {
    elements = document.querySelectorAll(sel);
    if (elements.length > 0) break;
  }

  elements.forEach((el) => {
    const handle = el.innerText?.trim();
    if (!handle || handle === "" || handle.includes(" ")) return;
    const cleanHandle = handle.replace(/^@/, "");
    const profileUrl = `https://www.instagram.com/${cleanHandle}/`;

    if (handle && !prospects.find((p) => p.handle === cleanHandle || p.handle === handle)) {
      const isFromHashtag = sourceUrl.includes("/explore/tags/");
      prospects.push({
        name: cleanHandle,
        handle: cleanHandle,
        profileUrl: profileUrl,
        platform: "INSTAGRAM",
        interaction: isFromHashtag ? "Hashtag Interest" : "Follower / Competitor Audience",
      });
    }
  });

  console.log(`${prospects.length} prospects Instagram identifiés !`);
  if (prospects.length === 0) {
    console.warn("Aucun prospect trouvé. Assure-toi d'être sur une page followers ou hashtag et d'avoir scrollé pour charger les éléments.");
    return;
  }

  fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      prospects,
      sourceUrl,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        alert(`Importation IG réussie ! ${data.imported} importés, ${data.duplicates || 0} doublons ignorés.`);
      } else {
        alert("Erreur : " + (data.error || "Import échoué"));
      }
    })
    .catch((err) => {
      console.error(err);
      alert("Erreur réseau. Vérifie l'URL API et ton token.");
    });
})();
