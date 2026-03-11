/**
 * 🧠 Inngest Functions: Agent Brain
 *
 * - Cron quotidien (7h) : cycle marketing pour tous les workspaces actifs
 * - Event-driven : exécution des décisions approuvées
 * - Cron hebdomadaire (dimanche 23h) : apprentissage des performances
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { trackSpend } from "@/lib/ai/budget-guard";
import {
  runDailyMarketingCycle,
  executeDecision,
  learnFromPerformance,
  checkGuardrails,
} from "@/lib/services/agent/brain";

// ═══════════════════════════════════════════════════════════════════════════
// 1. CRON QUOTIDIEN - Morning Routine (7h chaque jour)
// ═══════════════════════════════════════════════════════════════════════════

export const agentBrainDaily = inngest.createFunction(
  {
    id: "agent-brain-daily",
    name: "Agent Brain - Daily Marketing Cycle",
    retries: 1,
  },
  { cron: "0 7 * * *" },
  async ({ step }) => {
    // Récupérer tous les workspaces avec autopilot actif
    const activeWorkspaces = await step.run("get-active-workspaces", async () => {
      const configs = await prisma.autopilotConfig.findMany({
        where: { isActive: true },
        include: {
          workspace: {
            select: { id: true, userId: true },
          },
        },
      });
      return configs.map((c) => ({
        workspaceId: c.workspace.id,
        userId: c.workspace.userId,
      }));
    });

    let processed = 0;
    let failed = 0;

    for (const ws of activeWorkspaces) {
      try {
        // Vérifier les guardrails
        const guardrails = await step.run(`guardrails-${ws.workspaceId}`, async () => {
          return checkGuardrails(ws.workspaceId);
        });

        if (!guardrails.safe) {
          console.warn(`[Brain] Guardrails déclenchés pour ${ws.workspaceId}:`, guardrails.alerts);
          failed++;
          continue;
        }

        // Exécuter le cycle
        await step.run(`cycle-${ws.workspaceId}`, async () => {
          await useCredits(ws.userId, "agent_brain_cycle");
          const result = await runDailyMarketingCycle(ws.workspaceId);
          if (result.success) {
            await trackSpend(ws.workspaceId, "agent_brain_cycle");
          }
          return result;
        });

        processed++;
      } catch (error) {
        console.error(`[Brain] Erreur workspace ${ws.workspaceId}:`, error);
        failed++;
      }
    }

    return { processed, failed, total: activeWorkspaces.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. EVENT-DRIVEN - Cycle manuel
// ═══════════════════════════════════════════════════════════════════════════

export const agentBrainManualCycle = inngest.createFunction(
  {
    id: "agent-brain-manual-cycle",
    name: "Agent Brain - Manual Cycle",
    retries: 1,
  },
  { event: "agent-brain/run-cycle" },
  async ({ event, step }) => {
    const { workspaceId, userId } = event.data;

    // Guardrails
    const guardrails = await step.run("guardrails", async () => {
      return checkGuardrails(workspaceId);
    });

    if (!guardrails.safe) {
      return { success: false, alerts: guardrails.alerts };
    }

    // Décompter les crédits
    await step.run("use-credits", async () => {
      return useCredits(userId, "agent_brain_cycle");
    });

    // Exécuter le cycle
    const result = await step.run("run-cycle", async () => {
      const r = await runDailyMarketingCycle(workspaceId);
      if (r.success) {
        await trackSpend(workspaceId, "agent_brain_cycle");
      }
      return r;
    });

    return result;
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. EVENT-DRIVEN - Exécution des décisions approuvées
// ═══════════════════════════════════════════════════════════════════════════

export const agentBrainExecuteDecisions = inngest.createFunction(
  {
    id: "agent-brain-execute-decisions",
    name: "Agent Brain - Execute Approved Decisions",
    retries: 2,
  },
  { event: "agent-brain/execute-decisions" },
  async ({ event, step }) => {
    const { decisionIds, userId } = event.data;

    let executed = 0;
    let failed = 0;

    for (const decisionId of decisionIds as string[]) {
      try {
        await step.run(`execute-${decisionId}`, async () => {
          await useCredits(userId, "agent_brain_execute");
          const result = await executeDecision(decisionId);
          if (!result.success) {
            console.error(`[Brain] ❌ Décision ${decisionId} échouée: ${result.error}`);
          }
          const decision = await prisma.agentDecision.findUnique({
            where: { id: decisionId },
            select: { actionType: true, reasoning: true, workspaceId: true, priority: true },
          });
          if (decision) {
            if (result.success) {
              await trackSpend(decision.workspaceId, "agent_brain_execute");
            }
            try {
              const { notifyAgentBrainDecision } = await import("@/lib/services/notifications/admin");
              await notifyAgentBrainDecision({
                actionType: decision.actionType,
                summary: decision.reasoning?.slice(0, 300) ?? "Décision exécutée",
                workspaceId: decision.workspaceId,
                priority: String(decision.priority),
              });
            } catch {
              // Ne pas faire échouer l'exécution si la notification échoue
            }
          }
          return result;
        });
        executed++;
      } catch (error) {
        console.error(`[Brain] Erreur exécution décision ${decisionId}:`, error);
        failed++;
      }
    }

    return { executed, failed, total: (decisionIds as string[]).length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. CRON HEBDOMADAIRE - Apprentissage (dimanche 23h)
// ═══════════════════════════════════════════════════════════════════════════

export const agentBrainWeeklyLearn = inngest.createFunction(
  {
    id: "agent-brain-weekly-learn",
    name: "Agent Brain - Weekly Performance Learning",
    retries: 1,
  },
  { cron: "0 23 * * 0" }, // Dimanche 23h
  async ({ step }) => {
    const activeWorkspaces = await step.run("get-active-workspaces", async () => {
      const configs = await prisma.autopilotConfig.findMany({
        where: { isActive: true },
        include: { workspace: { select: { id: true } } },
      });
      return configs.map((c) => c.workspace.id);
    });

    let learned = 0;

    for (const workspaceId of activeWorkspaces) {
      try {
        await step.run(`learn-${workspaceId}`, async () => {
          const r = await learnFromPerformance(workspaceId);
          await trackSpend(workspaceId, "learn_from_performance");
          return r;
        });
        learned++;
      } catch (error) {
        console.error(`[Brain] Erreur apprentissage ${workspaceId}:`, error);
      }
    }

    return { learned, total: activeWorkspaces.length };
  }
);
