/**
 * SKALLE - Intercepteur Voyager API LinkedIn
 * Injecté dans le contexte de la page (pas le contexte extension)
 * → accès au vrai window.fetch avec les cookies de session
 */
(function () {
  if (window.__SKALLE_LI_INJECTED__) return;
  window.__SKALLE_LI_INJECTED__ = true;

  const _fetch = window.fetch.bind(window);

  window.fetch = async function (resource, init) {
    const response = await _fetch(resource, init);

    try {
      const url = typeof resource === "string" ? resource : resource?.url ?? "";

      if (
        url.includes("/voyager/api/identity/") &&
        (url.includes("/profiles/") || url.includes("memberIdentity"))
      ) {
        response.clone().json().then((data) => {
          window.postMessage({ type: "SKALLE_LI_DATA", url, data }, "*");
        }).catch(() => {});
      }
    } catch { /* silent */ }

    return response;
  };
})();
