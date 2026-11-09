/**
 * 🚀 Personnalise puis lance une campagne automatiquement, en tâche de fond.
 *
 * Déclenché par `CampaignWizard` juste après `createCampaign()` — enchaîne les
 * deux étapes qui existaient déjà (`personalizeCampaignCore` /
 * `launchCampaignCore`, extraites de `src/actions/campaigns.ts` dans
 * `campaign-lifecycle.ts` pour être appelables sans session HTTP) sans action
 * manuelle sur une autre page. `launchCampaignCore` lui-même déclenche déjà
 * `campaign/launch`, consommé par `campaign-sender.ts` — inchangé.
 */

import { inngest } from "../client";
import { personalizeCampaignCore, launchCampaignCore } from "@/lib/email/campaign-lifecycle";

export const personalizeAndLaunchCampaign = inngest.createFunction(
  {
    id: "personalize-and-launch-campaign",
    name: "Personalize & Launch Campaign (Goskalle)",
    retries: 1,
  },
  { event: "campaign/personalize-and-launch" },
  async ({ event, step, logger }) => {
    const { campaignId } = event.data as { campaignId: string };

    const personalizeResult = await step.run("personalize", () =>
      personalizeCampaignCore(campaignId)
    );

    if (!personalizeResult.success) {
      logger.error(`Campagne ${campaignId} — personnalisation échouée : ${personalizeResult.error}`);
      return { personalized: false, launched: false, error: personalizeResult.error };
    }

    logger.info(`Campagne ${campaignId} — ${personalizeResult.personalized} step(s) personnalisé(s)`);

    const launchResult = await step.run("launch", () => launchCampaignCore(campaignId));

    if (!launchResult.success) {
      logger.error(`Campagne ${campaignId} — lancement échoué : ${launchResult.error}`);
      return { personalized: true, launched: false, error: launchResult.error };
    }

    logger.info(`Campagne ${campaignId} — lancée automatiquement`);
    return { personalized: true, launched: true };
  }
);
