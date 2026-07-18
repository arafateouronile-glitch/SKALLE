/**
 * 🕵️ Spike — followers d'une page entreprise LinkedIn (concurrent)
 *
 * NON VÉRIFIÉ. Les endpoints Voyager utilisés ici sont des suppositions
 * raisonnables par analogie avec scrapeFollowers() (linkedin-warm-scraper.ts),
 * qui résout l'URN d'une PERSONNE puis liste ses followers. Pour une page
 * ENTREPRISE, la forme exacte de l'API n'est pas confirmée — LinkedIn est plus
 * restrictif sur l'exposition des followers de pages company que de profils
 * personnels, et il est possible que cela nécessite un accès API partenaire.
 *
 * À exécuter UNIQUEMENT à la main, contre une session LinkedIn réelle et
 * consentie (jamais en CI, jamais à grande échelle tant que la forme n'est
 * pas confirmée stable) :
 *
 *   LI_AT="..." JSESSIONID="..." COMPANY_VANITY="nom-de-la-page" npx tsx scripts/spike-competitor-followers.ts
 *
 * Si ce spike réussit : porter scrapeCompanyFollowers() dans
 * src/lib/services/social/linkedin-warm-scraper.ts (même style défensif que
 * scrapeFollowers()) et câbler serverSideWarmLeadsCron pour itérer
 * CompetitorWatch. Si ce spike échoue avec un 403/404 stable : la liste
 * CompetitorWatch reste utile (config manuelle), mais le scan automatique
 * concurrent est à documenter comme non disponible plutôt qu'à forcer.
 */

const LI_VOYAGER = "https://www.linkedin.com/voyager/api";

function headers(liAt: string, jsessionId: string) {
  const csrf = jsessionId.replace(/^"|"$/g, "");
  return {
    Cookie: `li_at=${liAt}; JSESSIONID="${csrf}"`,
    "Csrf-Token": csrf,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "X-Restli-Protocol-Version": "2.0.0",
    "X-Li-Lang": "fr_FR",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

// Étape 1 (à vérifier) : résoudre l'URN de la société depuis son vanity name.
async function resolveCompanyUrn(
  vanityName: string,
  liAt: string,
  jsessionId: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${LI_VOYAGER}/organization/companies?q=universalName&universalName=${encodeURIComponent(vanityName)}`,
      { headers: headers(liAt, jsessionId), signal: AbortSignal.timeout(15_000) }
    );
    console.log(`[resolveCompanyUrn] status=${res.status}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { elements?: Array<{ entityUrn?: string }> };
    console.log("[resolveCompanyUrn] réponse brute:", JSON.stringify(data).slice(0, 500));
    return data.elements?.[0]?.entityUrn ?? null;
  } catch (err) {
    console.error("[resolveCompanyUrn] erreur:", err);
    return null;
  }
}

// Étape 2 (à vérifier) : lister les followers de la société.
async function fetchCompanyFollowers(
  companyUrn: string,
  liAt: string,
  jsessionId: string,
  count = 10
): Promise<unknown> {
  const encoded = encodeURIComponent(companyUrn);
  try {
    const res = await fetch(
      `${LI_VOYAGER}/relationships/followers?q=followersOf&entityUrn=${encoded}&count=${count}&start=0`,
      { headers: headers(liAt, jsessionId), signal: AbortSignal.timeout(15_000) }
    );
    console.log(`[fetchCompanyFollowers] status=${res.status}`);
    if (!res.ok) {
      console.log("[fetchCompanyFollowers] body:", await res.text().catch(() => ""));
      return null;
    }
    return res.json();
  } catch (err) {
    console.error("[fetchCompanyFollowers] erreur:", err);
    return null;
  }
}

async function main() {
  const liAt = process.env.LI_AT;
  const jsessionId = process.env.JSESSIONID ?? "";
  const vanityName = process.env.COMPANY_VANITY;

  if (!liAt || !vanityName) {
    console.error("Usage: LI_AT=... JSESSIONID=... COMPANY_VANITY=... npx tsx scripts/spike-competitor-followers.ts");
    process.exit(1);
  }

  console.log(`Résolution de l'URN pour "${vanityName}"…`);
  const companyUrn = await resolveCompanyUrn(vanityName, liAt, jsessionId);

  if (!companyUrn) {
    console.log("❌ Échec résolution URN — endpoint /organization/companies à revérifier manuellement (DevTools LinkedIn).");
    return;
  }

  console.log(`✅ URN résolue : ${companyUrn}`);
  await new Promise((r) => setTimeout(r, 1_000));

  console.log("Récupération des followers…");
  const followers = await fetchCompanyFollowers(companyUrn, liAt, jsessionId);

  if (!followers) {
    console.log("❌ Échec récupération followers — endpoint /relationships/followers avec URN société à revérifier (peut nécessiter un accès partenaire).");
    return;
  }

  console.log("✅ Réponse followers (brute, à parser si le format est exploitable) :");
  console.log(JSON.stringify(followers, null, 2).slice(0, 2000));
}

main();
