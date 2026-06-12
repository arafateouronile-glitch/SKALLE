/**
 * CSO Agent Daily — analyse le pipeline et génère des décisions PENDING pour validation.
 * L'exécution est déclenchée séparément (event cso/decision.execute) après approbation.
 *
 * Flux quotidien :
 *   Phase 1 — Analyse ICP : comprend le business → génère les Personas automatiquement
 *   Phase 2 — Auto-discovery : cherche des prospects ICP via Apollo/Serper
 *   Phase 3 — Pipeline management : outreach decisions sur les prospects existants
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  observePipeline,
  generateCsoDecisions,
  storeCsoDecisions,
  executeCsoDecision,
} from "@/lib/services/sales/cso-agent";
import {
  analyzeBusinessForICP,
  upsertPersonasFromAnalysis,
} from "@/lib/services/sales/business-analyzer";
import { autoDiscoverProspects } from "@/lib/services/sales/auto-prospector";

// Pool minimum de prospects frais avant de relancer la discovery
const FRESH_PROSPECT_THRESHOLD = 20;
// Fréquence de ré-analyse ICP (en jours)
const ANALYSIS_INTERVAL_DAYS = 7;

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
    const sevenDaysAgo = new Date(
      Date.now() - ANALYSIS_INTERVAL_DAYS * 24 * 60 * 60 * 1_000
    );

    // ── Phase 1: ICP Analysis ─────────────────────────────────────────────────
    // Workspaces avec brand voice configuré (offer, sector, audience ou uvp)
    const analysisTargets = await step.run("load-analysis-targets", async () => {
      const all = await prisma.workspace.findMany({
        select: { id: true, brandVoice: true },
      });
      return all
        .filter((w) => {
          const bv = (w.brandVoice ?? {}) as Record<string, unknown>;
          return !!(bv.offer || bv.sector || bv.audience || bv.uvp);
        })
        .map((w) => w.id);
    });

    logger.info(`CSO Agent — Phase 1 ICP: ${analysisTargets.length} workspaces eligibles`);

    for (const wsId of analysisTargets) {
      await step.run(`icp-analysis-${wsId}`, async () => {
        // Skip si une analyse récente existe déjà
        const recentPersona = await prisma.persona.findFirst({
          where: {
            workspaceId: wsId,
            status: "ACTIVE",
            updatedAt: { gte: sevenDaysAgo },
          },
          select: { id: true },
        });

        if (recentPersona) {
          logger.info(`Workspace ${wsId} — analyse ICP récente (< ${ANALYSIS_INTERVAL_DAYS}j), skip`);
          return { analyzed: false };
        }

        logger.info(`Workspace ${wsId} — démarrage analyse ICP`);
        const analysis = await analyzeBusinessForICP(wsId);

        if (!analysis) {
          logger.warn(`Workspace ${wsId} — analyse ICP échouée ou budget dépassé`);
          return { analyzed: false };
        }

        const count = await upsertPersonasFromAnalysis(wsId, analysis);
        logger.info(
          `Workspace ${wsId} — ${count} personas générés: ${analysis.segments.map((s) => s.name).join(", ")}`
        );
        return {
          analyzed: true,
          segments: count,
          summary: analysis.businessSummary,
        };
      });
    }

    // ── Phase 2: Auto-discovery ────────────────────────────────────────────────
    // Cherche de nouveaux prospects si le pool frais est insuffisant
    for (const wsId of analysisTargets) {
      await step.run(`auto-discovery-${wsId}`, async () => {
        const freshCount = await prisma.prospect.count({
          where: {
            workspaceId: wsId,
            status: { in: ["NEW", "RESEARCHED"] },
          },
        });

        if (freshCount >= FRESH_PROSPECT_THRESHOLD) {
          logger.info(
            `Workspace ${wsId} — ${freshCount} prospects frais (≥ ${FRESH_PROSPECT_THRESHOLD}), skip discovery`
          );
          return { discovered: 0 };
        }

        const needed = FRESH_PROSPECT_THRESHOLD - freshCount + 10; // +10 de buffer
        logger.info(
          `Workspace ${wsId} — pool frais faible (${freshCount}/${FRESH_PROSPECT_THRESHOLD}), discovery de ${needed} prospects`
        );

        const result = await autoDiscoverProspects(wsId, needed);
        logger.info(
          `Workspace ${wsId} — ${result.discovered} prospects découverts`,
          { byPersona: result.byPersona }
        );
        return result;
      });
    }

    // ── Phase 3: Pipeline management ─────────────────────────────────────────
    // Logique existante : observe → décisions → store
    const pipelineWorkspaces = await step.run("load-pipeline-workspaces", async () => {
      return prisma.workspace.findMany({
        where: { prospects: { some: {} } },
        select: { id: true },
      });
    });

    logger.info(`CSO Agent — Phase 3 Pipeline: ${pipelineWorkspaces.length} workspaces`);

    const summary: Array<{ workspaceId: string; generated: number }> = [];

    for (const ws of pipelineWorkspaces) {
      const result = await step.run(`analyze-${ws.id}`, async () => {
        const obs = await observePipeline(ws.id);
        const total =
          obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;

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
    return { workspacesAnalyzed: pipelineWorkspaces.length, summary };
  }
);

// ─── Manual trigger ───────────────────────────────────────────────────────────

export const csoAgentManual = inngest.createFunction(
  { id: "cso-agent-manual", name: "CSO Agent — Déclenchement manuel", retries: 1 },
  { event: "cso/agent.trigger" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    // Step 1: ICP analysis si pas de persona actif
    await step.run("icp-analysis", async () => {
      const hasActivePersona = await prisma.persona.findFirst({
        where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
        select: { id: true },
      });

      if (hasActivePersona) return { analyzed: false, reason: "personas existants" };

      const analysis = await analyzeBusinessForICP(workspaceId);
      if (!analysis) return { analyzed: false, reason: "analyse échouée" };

      const count = await upsertPersonasFromAnalysis(workspaceId, analysis);
      return { analyzed: true, segments: count, summary: analysis.businessSummary };
    });

    // Step 2: Auto-discovery si pool frais insuffisant
    await step.run("auto-discovery", async () => {
      const freshCount = await prisma.prospect.count({
        where: { workspaceId, status: { in: ["NEW", "RESEARCHED"] } },
      });

      if (freshCount >= FRESH_PROSPECT_THRESHOLD) return { discovered: 0 };

      const needed = FRESH_PROSPECT_THRESHOLD - freshCount + 10;
      return autoDiscoverProspects(workspaceId, needed);
    });

    // Step 3: Pipeline management
    return step.run("analyze", async () => {
      const obs = await observePipeline(workspaceId);
      const total =
        obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;
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
