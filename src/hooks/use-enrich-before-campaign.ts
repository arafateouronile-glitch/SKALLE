"use client";

/**
 * Enrichit à la demande un petit lot de prospects juste avant d'ouvrir le
 * wizard de campagne — réutilisé par les 4 radars (Signals/Local/Newborn/
 * Qualiopi) et par l'import de liste sur `/goskalle/campaigns`. Dégrade
 * proprement : si l'enrichissement échoue, ouvre quand même le wizard avec
 * les données déjà connues plutôt que de bloquer l'utilisateur.
 *
 * Plafonné à `SYNC_ENRICH_CAP` : un import CSV peut envoyer des centaines de
 * prospects d'un coup (contrairement aux radars, qui n'envoient naturellement
 * que de petits lots) — enrichir tout ça en synchrone avant d'ouvrir le wizard
 * a déjà bloqué une Server Action plusieurs minutes et déclenché le
 * rate-limiting anti-abus de Dropcontact (403 en rafale, clé/quota pourtant
 * valides). Le surplus au-delà du plafond est laissé à l'enrichissement
 * automatique en arrière-plan (`autoEnrichOnCreate`, déjà déclenché à la
 * création de chaque prospect via l'événement Inngest `prospect/created`).
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { enrichSelectedProspectsAction, type EnrichedProspectSummary } from "@/actions/cso-sales";

const SYNC_ENRICH_CAP = 20;

export function useEnrichBeforeCampaign(workspaceId: string | null) {
  const [enriching, setEnriching] = useState(false);

  const enrichThenOpen = useCallback(
    async (
      prospects: EnrichedProspectSummary[],
      openWizard: (prospects: EnrichedProspectSummary[]) => void
    ) => {
      if (!workspaceId || prospects.length === 0) return;
      setEnriching(true);
      try {
        const toEnrichSync = prospects.slice(0, SYNC_ENRICH_CAP);
        const rest = prospects.slice(SYNC_ENRICH_CAP);

        const res = await enrichSelectedProspectsAction(workspaceId, toEnrichSync.map((p) => p.id));
        if (res.success && res.prospects) {
          if (rest.length > 0) {
            toast.success(
              `${toEnrichSync.length} prospect(s) enrichis immédiatement — les ${rest.length} autres le seront automatiquement en arrière-plan.`
            );
          }
          openWizard([...res.prospects, ...rest]);
        } else {
          toast.error(res.error ?? "Enrichissement indisponible — ouverture avec les données actuelles.");
          openWizard(prospects);
        }
      } catch {
        toast.error("Enrichissement indisponible — ouverture avec les données actuelles.");
        openWizard(prospects);
      } finally {
        setEnriching(false);
      }
    },
    [workspaceId]
  );

  return { enriching, enrichThenOpen };
}
