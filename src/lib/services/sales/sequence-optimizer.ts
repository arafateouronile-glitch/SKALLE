/**
 * Sequence Optimizer — analyse les performances des séquences d'outreach
 * et génère des suggestions d'amélioration via AI.
 *
 * Types de suggestions :
 * - SUBJECT_REWRITE  → reformuler l'objet email (taux d'ouverture faible)
 * - DELAY_CHANGE     → ajuster le délai entre les étapes
 * - CONTENT_REWRITE  → réécrire le corps d'un step (taux de réponse faible)
 * - DEACTIVATE       → désactiver une séquence sans réponse après N steps
 * - CHANNEL_SWITCH   → passer EMAIL → LINKEDIN si email bounce
 */

import { prisma } from "@/lib/prisma";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionType =
  | "SUBJECT_REWRITE"
  | "DELAY_CHANGE"
  | "CONTENT_REWRITE"
  | "DEACTIVATE"
  | "CHANNEL_SWITCH";

export interface SequenceStat {
  sequenceId: string;
  sequenceName: string;
  prospectName: string;
  prospectCompany: string;
  prospectJobTitle: string | null;
  isActive: boolean;
  totalSteps: number;
  sentCount: number;
  openedCount: number;
  repliedCount: number;
  failedCount: number;
  openRate: number;
  replyRate: number;
  steps: StepStat[];
}

export interface StepStat {
  stepId: string;
  stepNumber: number;
  channel: string;
  subject: string | null;
  contentPreview: string;
  delayDays: number;
  status: string;
  openRate: number;
  replyRate: number;
  sentAt: Date | null;
}

const AISuggestionSchema = z.object({
  sequenceId: z.string(),
  stepId: z.string().nullable().optional(),
  type: z.enum(["SUBJECT_REWRITE", "DELAY_CHANGE", "CONTENT_REWRITE", "DEACTIVATE", "CHANNEL_SWITCH"]),
  reason: z.string().min(20),
  currentValue: z.record(z.string(), z.unknown()),
  suggestedValue: z.record(z.string(), z.unknown()),
  estimatedImpact: z.string().min(10),
});

const AISuggestionsArraySchema = z.array(AISuggestionSchema).min(1).max(10);

// ─── Collect stats ─────────────────────────────────────────────────────────────

export async function collectSequenceStats(workspaceId: string): Promise<SequenceStat[]> {
  const sequences = await prisma.outreachSequence.findMany({
    where: { workspaceId },
    include: {
      prospect: { select: { name: true, company: true, jobTitle: true } },
      steps: {
        orderBy: { stepNumber: "asc" },
        select: {
          id: true,
          stepNumber: true,
          channel: true,
          subject: true,
          content: true,
          delayDays: true,
          status: true,
          sentAt: true,
          openedAt: true,
          repliedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return sequences.map((seq) => {
    const sentSteps = seq.steps.filter((s) => s.status !== "PENDING");
    const sentCount = sentSteps.filter((s) => ["SENT", "OPENED", "REPLIED", "DELIVERED", "CLICKED"].includes(s.status)).length;
    const openedCount = seq.steps.filter((s) => s.openedAt !== null).length;
    const repliedCount = seq.steps.filter((s) => s.repliedAt !== null || s.status === "REPLIED").length;
    const failedCount = seq.steps.filter((s) => s.status === "FAILED").length;
    const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
    const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

    const steps: StepStat[] = seq.steps.map((s) => ({
      stepId: s.id,
      stepNumber: s.stepNumber,
      channel: s.channel,
      subject: s.subject,
      contentPreview: s.content.slice(0, 200),
      delayDays: s.delayDays,
      status: s.status,
      openRate: s.openedAt ? 100 : 0,
      replyRate: s.repliedAt || s.status === "REPLIED" ? 100 : 0,
      sentAt: s.sentAt,
    }));

    return {
      sequenceId: seq.id,
      sequenceName: seq.name,
      prospectName: seq.prospect.name,
      prospectCompany: seq.prospect.company,
      prospectJobTitle: seq.prospect.jobTitle,
      isActive: seq.isActive,
      totalSteps: seq.steps.length,
      sentCount,
      openedCount,
      repliedCount,
      failedCount,
      openRate,
      replyRate,
      steps,
    };
  });
}

// ─── Generate suggestions ──────────────────────────────────────────────────────

function buildOptimizerPrompt(stats: SequenceStat[]): string {
  const focused = stats
    .filter((s) => s.sentCount > 0 || s.isActive)
    .slice(0, 20);

  const lines = focused.map((s) => {
    const stepLines = s.steps.map((step) =>
      `  Step ${step.stepNumber} (${step.channel}, J+${step.delayDays}) — ${step.status}` +
      (step.subject ? ` — Objet: "${step.subject}"` : "") +
      ` — Ouvert: ${step.openRate}% / Répondu: ${step.replyRate}%` +
      `\n    Aperçu: "${step.contentPreview}"`
    ).join("\n");

    return `Séquence "${s.sequenceName}" [${s.sequenceId}]
  Prospect: ${s.prospectName} (${s.prospectJobTitle ?? "—"} @ ${s.prospectCompany})
  Active: ${s.isActive} | Steps: ${s.totalSteps} | Envoyés: ${s.sentCount}
  Taux ouverture global: ${s.openRate}% | Taux réponse: ${s.replyRate}%
  Échecs: ${s.failedCount}
${stepLines}`;
  }).join("\n\n---\n\n");

  return `Voici les performances des séquences d'outreach :

${lines}

Génère des suggestions d'optimisation concrètes au format JSON.
Règles :
- Ne suggère rien si la séquence a déjà une réponse (replyRate > 0 global)
- SUBJECT_REWRITE si openRate < 30% sur un step EMAIL avec subject
- DELAY_CHANGE si des steps échouent ou sont skippés de manière répétée
- CONTENT_REWRITE si openRate > 40% mais replyRate = 0% (ouvert mais pas de réponse)
- DEACTIVATE si isActive=true, 3+ steps envoyés, 0 ouverture, 0 réponse
- CHANNEL_SWITCH si failedCount élevé sur EMAIL → suggérer LINKEDIN

currentValue doit contenir la valeur actuelle (ex: {subject: "...", delayDays: 3, content: "..."})
suggestedValue doit contenir la valeur proposée avec une amélioration concrète
stepId peut être null pour les suggestions niveau séquence (ex: DEACTIVATE)

Réponds UNIQUEMENT avec le JSON (tableau de suggestions, max 8) :
[{"sequenceId":"...","stepId":"...","type":"...","reason":"...","currentValue":{...},"suggestedValue":{...},"estimatedImpact":"..."}]`;
}

export async function generateSuggestions(
  workspaceId: string,
  stats: SequenceStat[]
): Promise<void> {
  const actionable = stats.filter((s) => s.sentCount > 0 || (s.isActive && s.totalSteps > 0));
  if (actionable.length === 0) return;

  const claude = getClaude();

  const systemPrompt = `Tu es un expert en outreach B2B et optimisation de séquences de vente.
Tu analyses les données de performance et proposes des améliorations précises et actionnables.
Tes suggestions se basent uniquement sur les données fournies.
Tu réponds toujours avec un JSON valide, sans markdown ni explication supplémentaire.

Connaissance clés :
- Taux d'ouverture email B2B moyen : 20-30% (bon : >35%)
- Taux de réponse cold email : 5-15% (bon : >10%)
- Délai optimal entre steps : J+3 à J+7 pour cold outreach
- Les sujets courts (5-7 mots), personnalisés, avec question convertissent mieux
- Si 3 steps envoyés sans réponse → la séquence est probablement à mettre en pause`;

  const response = await claude.invoke([
    new SystemMessage({ content: systemPrompt }),
    new HumanMessage({ content: buildOptimizerPrompt(actionable) }),
  ]);

  const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  let parsed: z.infer<typeof AISuggestionsArraySchema>;
  try {
    const cleaned = raw.replace(/^```[\w]*\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const data = JSON.parse(cleaned) as unknown;
    parsed = AISuggestionsArraySchema.parse(Array.isArray(data) ? data : [data]);
  } catch {
    return;
  }

  // Validate that sequenceIds belong to this workspace
  const validIds = new Set(stats.map((s) => s.sequenceId));

  for (const suggestion of parsed) {
    if (!validIds.has(suggestion.sequenceId)) continue;

    await prisma.sequenceSuggestion.create({
      data: {
        workspaceId,
        sequenceId: suggestion.sequenceId,
        stepId: suggestion.stepId ?? null,
        type: suggestion.type,
        reason: suggestion.reason,
        currentValue: JSON.parse(JSON.stringify(suggestion.currentValue)),
        suggestedValue: JSON.parse(JSON.stringify(suggestion.suggestedValue)),
        estimatedImpact: suggestion.estimatedImpact,
        status: "PENDING",
      },
    });
  }
}

// ─── Apply suggestion ──────────────────────────────────────────────────────────

export async function applySuggestion(
  suggestionId: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  const suggestion = await prisma.sequenceSuggestion.findFirst({
    where: { id: suggestionId, workspaceId, status: "APPROVED" },
  });
  if (!suggestion) return { success: false, error: "Suggestion introuvable ou non approuvée" };

  const suggested = suggestion.suggestedValue as Record<string, unknown>;

  try {
    switch (suggestion.type) {
      case "SUBJECT_REWRITE":
      case "CONTENT_REWRITE": {
        if (!suggestion.stepId) return { success: false, error: "stepId requis" };
        const update: Record<string, unknown> = {};
        if (suggestion.type === "SUBJECT_REWRITE" && suggested.subject) {
          update.subject = suggested.subject as string;
        }
        if (suggestion.type === "CONTENT_REWRITE" && suggested.content) {
          update.content = suggested.content as string;
        }
        await prisma.sequenceStep.update({
          where: { id: suggestion.stepId },
          data: update,
        });
        break;
      }

      case "DELAY_CHANGE": {
        if (!suggestion.stepId) return { success: false, error: "stepId requis" };
        if (typeof suggested.delayDays === "number") {
          await prisma.sequenceStep.update({
            where: { id: suggestion.stepId },
            data: { delayDays: suggested.delayDays },
          });
        }
        break;
      }

      case "DEACTIVATE": {
        await prisma.outreachSequence.update({
          where: { id: suggestion.sequenceId },
          data: { isActive: false },
        });
        break;
      }

      case "CHANNEL_SWITCH": {
        if (!suggestion.stepId) return { success: false, error: "stepId requis" };
        if (suggested.channel) {
          await prisma.sequenceStep.update({
            where: { id: suggestion.stepId },
            data: { channel: suggested.channel as "EMAIL" | "LINKEDIN" | "PHONE" | "SMS" },
          });
        }
        break;
      }
    }

    await prisma.sequenceSuggestion.update({
      where: { id: suggestionId },
      data: { status: "APPLIED" },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erreur inconnue" };
  }
}

// ─── Full pipeline ─────────────────────────────────────────────────────────────

export async function runSequenceOptimizer(workspaceId: string): Promise<{
  analyzed: number;
  generated: number;
}> {
  // Delete stale PENDING suggestions older than 7 days
  await prisma.sequenceSuggestion.deleteMany({
    where: {
      workspaceId,
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  const stats = await collectSequenceStats(workspaceId);

  const before = await prisma.sequenceSuggestion.count({
    where: { workspaceId, status: "PENDING" },
  });

  await generateSuggestions(workspaceId, stats);

  const after = await prisma.sequenceSuggestion.count({
    where: { workspaceId, status: "PENDING" },
  });

  return { analyzed: stats.length, generated: after - before };
}
