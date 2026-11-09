/**
 * 🧬 Inngest Function: Fusion des signaux à la création d'un prospect
 *
 * Écoute le même point d'entrée que les 3 radars CSO (Signals/Local/Newborn)
 * — event dédié `signal/prospect-fusion`, distinct de `prospect/created` pour
 * ne jamais interférer avec la logique d'auto-enrichissement (auto-enrich.ts)
 * qui dépend elle du gating sur les emails placeholder.
 */

import { inngest } from "../client";
import { fuseProspectOnCreate } from "@/lib/services/sales/signal-fusion";

export const fuseProspectSignals = inngest.createFunction(
  {
    id: "fuse-prospect-signals",
    name: "Fuse Prospect Signals (Composite Score)",
    retries: 2,
  },
  { event: "signal/prospect-fusion" },
  async ({ event, step }) => {
    const { prospectId } = event.data as { prospectId: string; workspaceId: string };

    await step.run("fuse-signals", async () => {
      await fuseProspectOnCreate(prospectId);
    });

    return { success: true };
  }
);
