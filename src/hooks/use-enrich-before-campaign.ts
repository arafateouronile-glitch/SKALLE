"use client";

/**
 * Enrichit à la demande un petit lot de prospects juste avant d'ouvrir le
 * wizard de campagne — réutilisé par les 4 radars (Signals/Local/Newborn/
 * Qualiopi) et par l'import de liste sur `/goskalle/campaigns`. Dégrade
 * proprement : si l'enrichissement échoue, ouvre quand même le wizard avec
 * les données déjà connues plutôt que de bloquer l'utilisateur.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { enrichSelectedProspectsAction, type EnrichedProspectSummary } from "@/actions/cso-sales";

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
        const res = await enrichSelectedProspectsAction(workspaceId, prospects.map((p) => p.id));
        if (res.success && res.prospects) {
          openWizard(res.prospects);
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
