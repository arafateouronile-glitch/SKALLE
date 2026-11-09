/**
 * 🎓 Sync hebdomadaire du registre Qualiopi (Liste Publique des Organismes de
 * Formation, data.gouv.fr) → cache local `QualiopiOrganism`.
 *
 * Le fichier source est republié quotidiennement par le gouvernement, mais le
 * statut de certification d'un organisme ne change pas assez souvent pour
 * justifier de re-télécharger/parser ~37 Mo chaque jour — hebdomadaire est un
 * compromis raisonnable entre fraîcheur et coût d'exécution.
 */

import { inngest } from "../client";
import { syncQualiopiRegistry } from "@/lib/services/sales/qualiopi-registry-sync";

export const syncQualiopiRegistryWeekly = inngest.createFunction(
  {
    id: "sync-qualiopi-registry-weekly",
    name: "Sync Qualiopi Registry (data.gouv.fr) - Weekly",
    retries: 1,
  },
  { cron: "0 3 * * 1" }, // lundi 3h
  async ({ step, logger }) => {
    const result = await step.run("download-parse-upsert", () => syncQualiopiRegistry());
    logger.info(
      `Qualiopi Registry — ${result.upserted} organismes synchronisés (${result.rowsParsed} lignes certifiées trouvées)`
    );
    return result;
  }
);

// ─── Manual trigger (test / rattrapage) ──────────────────────────────────────

export const syncQualiopiRegistryManual = inngest.createFunction(
  { id: "sync-qualiopi-registry-manual", name: "Sync Qualiopi Registry - Déclenchement manuel", retries: 1 },
  { event: "qualiopi/registry-sync.trigger" },
  async ({ step, logger }) => {
    const result = await step.run("download-parse-upsert", () => syncQualiopiRegistry());
    logger.info(
      `Qualiopi Registry (manuel) — ${result.upserted} organismes synchronisés (${result.rowsParsed} lignes certifiées trouvées)`
    );
    return result;
  }
);
