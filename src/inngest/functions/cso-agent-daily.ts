/**
 * CSO Agent Daily — analyse le pipeline et génère des décisions PENDING pour validation.
 * L'exécution est déclenchée séparément (event cso/decision.execute) après approbation.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  observePipeline,
  generateCsoDecisions,
  storeCsoDecisions,
  executeCsoDecision,
} from "@/lib/services/sales/cso-agent";

// ─── Daily scan ───────────────────────────────────────────────────────────────

export const csoAgentDaily = inngest.createFunction(
  {
    id: "cso-agent-daily",
    name: "CSO Agent — Analyse pipeline quotidienne",
    concurrency: { limit: 2 },
    retries: 1,
  },
  { cron: "0 7 * * 1-5" }, // 7h du matin, lun-ven
  async ({ step, logger }) => {
    // All workspaces that have prospects
    const workspaces = await step.run("load-workspaces", async () => {
      return prisma.workspace.findMany({
        where: {
          prospects: { some: {} },
        },
        select: { id: true },
      });
    });

    logger.info(`CSO Agent — ${workspaces.length} workspaces à analyser`);

    const summary: Array<{ workspaceId: string; generated: number }> = [];

    for (const ws of workspaces) {
      const result = await step.run(`analyze-${ws.id}`, async () => {
        const obs = await observePipeline(ws.id);
        const total = obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;

        if (total === 0) {
          logger.info(`Workspace ${ws.id} — pipeline vide, skip`);
          return { generated: 0 };
        }

        logger.info(`Workspace ${ws.id} — ${total} candidats détectés`);
        const drafts = await generateCsoDecisions(obs, ws.id);
        const stored = await storeCsoDecisions(ws.id, drafts);
        logger.info(`Workspace ${ws.id} — ${stored} nouvelles décisions générées`);
        return { generated: stored };
      });

      summary.push({ workspaceId: ws.id, ...result });
    }

    const totalGenerated = summary.reduce((a, s) => a + s.generated, 0);
    logger.info(`CSO Agent terminé — ${totalGenerated} décisions générées`);
    return { workspacesAnalyzed: workspaces.length, summary };
  }
);

// ─── Manual trigger ───────────────────────────────────────────────────────────

export const csoAgentManual = inngest.createFunction(
  { id: "cso-agent-manual", name: "CSO Agent — Déclenchement manuel", retries: 1 },
  { event: "cso/agent.trigger" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("analyze", async () => {
      const obs = await observePipeline(workspaceId);
      const total = obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;
      if (total === 0) return { generated: 0, message: "Pipeline vide" };

      const drafts = await generateCsoDecisions(obs, workspaceId);
      const stored = await storeCsoDecisions(workspaceId, drafts);
      return { generated: stored };
    });
  }
);

// ─── Execute approved decision ────────────────────────────────────────────────

export const csoAgentExecute = inngest.createFunction(
  { id: "cso-agent-execute", name: "CSO Agent — Exécution décision approuvée", retries: 1 },
  { event: "cso/decision.execute" },
  async ({ event, step }) => {
    const { decisionId, workspaceId } = event.data as {
      decisionId: string;
      workspaceId: string;
    };

    return step.run("execute", async () => {
      return executeCsoDecision(decisionId, workspaceId);
    });
  }
);
