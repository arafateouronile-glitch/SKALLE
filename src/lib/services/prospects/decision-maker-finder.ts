/**
 * 🔎 Décideur nommé à partir d'une entreprise (Serper LinkedIn search)
 *
 * Extrait de `/api/prospects/find-contacts` (usage manuel via `FindContactsDialog`)
 * pour être réutilisé aussi par `resolve-radar-decision-makers` (cron), qui résout
 * automatiquement un décideur nommé sur les leads Signals Radar / Local Radar —
 * ces radars ne fournissent qu'un nom d'entreprise, jamais un nom de personne, donc
 * aucun enrichissement email (Dropcontact) n'est possible tant que cette étape n'a
 * pas tourné. Gratuit (Serper, déjà payé ailleurs dans le produit) — pas de nouvelle
 * dépendance.
 */

export interface FoundContact {
  name: string;
  jobTitle: string;
  linkedinUrl: string;
  email?: string;
  snippet?: string;
  source?: "serper" | "apify";
}

interface SerperResult {
  title: string;
  link: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

export function parseLinkedInResult(r: SerperResult): FoundContact | null {
  if (!r.link.includes("linkedin.com/in/")) return null;
  const clean = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").replace(/\s*- LinkedIn$/, "");
  const parts = clean.split(/\s*[-–]\s*/);
  const name = parts[0]?.trim();
  if (!name || name.length < 2) return null;
  const jobTitle = parts.slice(1).join(" · ").trim();
  const emailMatch = r.snippet?.match(/[\w.+-]+@[\w-]+\.\w{2,}/);
  return {
    name,
    jobTitle,
    linkedinUrl: r.link,
    email: emailMatch?.[0],
    snippet: r.snippet,
    source: "serper",
  };
}

/**
 * Cherche des décideurs (CEO/directeur/fondateur/gérant…) d'une entreprise via
 * Serper. Renvoie [] si SERPER_API_KEY absente ou si rien trouvé — jamais d'erreur
 * non catchée, sûr à appeler en tâche de fond.
 */
export async function searchLinkedIn(company: string): Promise<FoundContact[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `site:linkedin.com/in "${company}" (directeur OR directrice OR CEO OR fondateur OR fondatrice OR CTO OR CMO OR "head of" OR président OR DG OR gérant)`,
        gl: "fr",
        hl: "fr",
        num: 8,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data: SerperResponse = await res.json();
    return (data.organic ?? [])
      .map(parseLinkedInResult)
      .filter((c): c is FoundContact => c !== null)
      .slice(0, 8);
  } catch {
    return [];
  }
}
