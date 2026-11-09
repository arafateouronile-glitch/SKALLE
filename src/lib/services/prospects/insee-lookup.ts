/**
 * 🏛️ Lookup dirigeant par SIREN (API Recherche d'Entreprises — data.gouv.fr)
 *
 * Réutilise le parsing déjà écrit dans `newborn-leads.ts` (mêmes champs
 * `dirigeants[]` renvoyés par l'API) pour un lookup ponctuel par SIREN. Utilisé
 * par le résolveur de décideur (`decision-maker-resolver.ts`) sur les sources
 * qui ont un SIREN exact (ex: Qualiopi Radar) — en priorité sur la recherche
 * LinkedIn approximative (`decision-maker-finder.ts`), gratuite et plus fiable
 * puisque le SIREN garantit qu'on interroge la bonne entreprise.
 */

import { normalizeInseeResults } from "@/lib/services/sales/newborn-leads";

export interface DirigeantLookupResult {
  firstName: string;
  lastName: string;
  title: string | null;
  /** Code NAF/APE — déjà calculé par `normalizeInseeResults()` dans le même appel,
   * aucune requête supplémentaire nécessaire pour l'obtenir. */
  naf: string | null;
  nafLabel: string | null;
}

export async function findDirigeantBySiren(siren: string): Promise<DirigeantLookupResult | null> {
  if (!siren.trim()) return null;

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siren)}&per_page=1`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { results?: unknown[] };
    const [company] = normalizeInseeResults((data.results ?? []) as any[]); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!company?.directorFirstName || !company?.directorLastName) return null;

    return {
      firstName: company.directorFirstName,
      lastName: company.directorLastName,
      title: company.directorTitle,
      naf: company.activityCode || null,
      nafLabel: company.activityLabel || null,
    };
  } catch {
    return null;
  }
}
