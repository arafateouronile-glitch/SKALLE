/**
 * CSO Agent Brain — Pipeline Manager (Semi-Auto)
 *
 * observe → generate → store
 * Execution is triggered separately after user approval.
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { SequenceChannel } from "@prisma/client";
import { checkBudget, trackSpend } from "@/lib/ai/budget-guard";
import { researchProspectsBatch, type ProspectInput } from "@/lib/prospection/prospect-researcher";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CsoActionType =
  | "CSO_LAUNCH_LINKEDIN"
  | "CSO_LAUNCH_EMAIL"
  | "CSO_FOLLOWUP"
  | "CSO_STALE_REJECT";

export interface CsoDecisionDraft {
  actionType: CsoActionType;
  prospectId: string;
  prospectName: string;
  reasoning: string;
  priority: number; // 1 (urgent) → 5 (low)
  actionData: Record<string, unknown>;
}

export interface PipelineObservation {
  highScoreNew: Array<{
    id: string; name: string; company: string; jobTitle: string | null;
    email: string | null; linkedInUrl: string | null; score: number;
    hasEmail: boolean; hasLinkedIn: boolean;
  }>;
  stagnantContacted: Array<{
    id: string; name: string; company: string; jobTitle: string | null;
    daysSinceContact: number; channel: string;
    lastMessage: string | null;
  }>;
  staleProspects: Array<{
    id: string; name: string; company: string;
    daysSinceContact: number;
  }>;
}

// ─── Step 1: Observe ──────────────────────────────────────────────────────────

export async function observePipeline(workspaceId: string): Promise<PipelineObservation> {
  const now = new Date();

  // High-score NEW/RESEARCHED/MESSAGES_GENERATED prospects (not yet contacted)
  const newProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED"] },
      score: { gte: 50 },
    },
    select: {
      id: true, name: true, company: true, jobTitle: true,
      email: true, linkedInUrl: true, score: true,
    },
    orderBy: { score: "desc" },
    take: 20,
  });

  // Filter out prospects already in an active sequence
  const inQueue = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      sequence: { workspaceId },
    },
    select: { sequence: { select: { prospectId: true } } },
  });
  const queuedIds = new Set(inQueue.map((s) => s.sequence.prospectId));

  const highScoreNew = newProspects
    .filter((p) => !queuedIds.has(p.id))
    .map((p) => ({
      ...p,
      hasEmail: !!p.email,
      hasLinkedIn: !!p.linkedInUrl,
    }))
    .slice(0, 10);

  // CONTACTED with no reply for 5+ days
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1_000);
  const contactedProspects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: "CONTACTED",
      lastInteractionAt: { lte: fiveDaysAgo },
    },
    select: {
      id: true, name: true, company: true, jobTitle: true,
      lastInteractionAt: true,
      sequences: {
        where: { isActive: true },
        select: {
          steps: {
            where: { status: { in: ["SENT", "DELIVERED"] } },
            select: { content: true, channel: true, sentAt: true },
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
        take: 1,
      },
    },
    orderBy: { lastInteractionAt: "asc" },
    take: 15,
  });

  const stagnantContacted = contactedProspects.map((p) => {
    const daysSince = p.lastInteractionAt
      ? Math.floor((now.getTime() - p.lastInteractionAt.getTime()) / 86_400_000)
      : 99;
    const lastStep = p.sequences[0]?.steps[0];
    return {
      id: p.id,
      name: p.name,
      company: p.company,
      jobTitle: p.jobTitle,
      daysSinceContact: daysSince,
      channel: (lastStep?.channel ?? "EMAIL") as string,
      lastMessage: lastStep?.content?.slice(0, 200) ?? null,
    };
  });

  // CONTACTED 21+ days → candidates for REJECTED
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1_000);
  const staleRaw = await prisma.prospect.findMany({
    where: {
      workspaceId,
      status: "CONTACTED",
      lastInteractionAt: { lte: twentyOneDaysAgo },
    },
    select: { id: true, name: true, company: true, lastInteractionAt: true },
    orderBy: { lastInteractionAt: "asc" },
    take: 10,
  });

  const staleProspects = staleRaw.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    daysSinceContact: p.lastInteractionAt
      ? Math.floor((now.getTime() - p.lastInteractionAt.getTime()) / 86_400_000)
      : 99,
  }));

  return { highScoreNew, stagnantContacted, staleProspects };
}

// ─── Step 2: Generate decisions with Claude ───────────────────────────────────

function stripMarkdownJson(raw: string): string {
  return raw.replace(/^```[\w]*\s*/m, "").replace(/```\s*$/m, "").trim();
}

function buildSystemPrompt(brandContext: string): string {
  const brandSection = brandContext
    ? `\n## Contexte de marque (à utiliser dans tous les messages générés)\n${brandContext}\n`
    : "";
  return `Tu es le CSO Agent, un assistant autonome de gestion de pipeline commercial.

Ton rôle : analyser l'état du pipeline et générer des décisions d'outreach personnalisées et priorisées.
${brandSection}
Pour chaque prospect, tu génères une décision structurée :
- actionType : CSO_LAUNCH_LINKEDIN | CSO_LAUNCH_EMAIL | CSO_FOLLOWUP | CSO_STALE_REJECT
- Règles :
  • CSO_LAUNCH_LINKEDIN : prospect NEW/RESEARCHED avec linkedInUrl, score ≥ 70
  • CSO_LAUNCH_EMAIL : prospect NEW/RESEARCHED avec email, score ≥ 50 (et pas de LinkedIn ou score < 70)
  • CSO_FOLLOWUP : prospect CONTACTED depuis 5-20 jours sans réponse → message de relance
  • CSO_STALE_REJECT : prospect CONTACTED depuis 21+ jours → suggérer de marquer REJECTED (libère le pipeline)
- priority : 1 (urgent, score élevé ou délai long) → 5 (peu urgent)
- Pour LAUNCH_LINKEDIN : génère une note de connexion (<300 chars) personnalisée au contexte de marque
- Pour LAUNCH_EMAIL : génère un objet + corps d'email (~120 mots) personnalisé au ton de marque
- Pour FOLLOWUP : génère un message court de relance (60-80 mots) sur le même canal que le dernier contact
- Pour STALE_REJECT : reasoning explicatif uniquement, pas de message

Réponds UNIQUEMENT avec un JSON valide, tableau de décisions :
[
  {
    "actionType": "CSO_LAUNCH_LINKEDIN",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 1,
    "actionData": {
      "connectNote": "...",
      "linkedInUrl": "..."
    }
  },
  {
    "actionType": "CSO_LAUNCH_EMAIL",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 2,
    "actionData": {
      "subject": "...",
      "content": "...",
      "email": "..."
    }
  },
  {
    "actionType": "CSO_FOLLOWUP",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 2,
    "actionData": {
      "channel": "EMAIL",
      "subject": "...",
      "content": "..."
    }
  },
  {
    "actionType": "CSO_STALE_REJECT",
    "prospectId": "...",
    "prospectName": "...",
    "reasoning": "...",
    "priority": 4,
    "actionData": {}
  }
]

Génère au maximum 15 décisions au total. Priorise la qualité sur la quantité.`
}

export async function generateCsoDecisions(
  obs: PipelineObservation,
  workspaceId: string
): Promise<CsoDecisionDraft[]> {
  const total =
    obs.highScoreNew.length + obs.stagnantContacted.length + obs.staleProspects.length;
  if (total === 0) return [];

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, brandVoice: true, user: { select: { plan: true } } },
  });

  const plan = workspace?.user?.plan ?? "AGENCY";
  const budgetCheck = await checkBudget(workspaceId, "cso_agent_analyze", "claude-sonnet-4-6", plan);
  if (!budgetCheck.allowed) {
    console.warn(`[CSO Agent] Budget dépassé pour ${workspaceId}: ${budgetCheck.reason}`);
    return [];
  }

  const bv = (workspace?.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace?.name ?? "Skalle", bv);

  // ── Step A: Research high-score prospects in parallel ──────────────────────
  const prospectInputs: ProspectInput[] = obs.highScoreNew.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    jobTitle: p.jobTitle,
    linkedInUrl: p.linkedInUrl,
    email: p.email,
  }));

  const researchMap = prospectInputs.length > 0
    ? await researchProspectsBatch(prospectInputs, 2).catch(() => new Map())
    : new Map();

  // ── Step B: Claude decides WHICH prospects to contact + priority ───────────
  const brandContext = [
    workspace?.name ? `Entreprise : ${workspace.name}` : null,
    brand.offer ? `Offre : ${brand.offer}` : null,
    brand.tone ? `Ton : ${brand.tone}` : null,
  ].filter(Boolean).join("\n");

  // Enrich highScoreNew with research signals for better decision making
  const newProspectsWithContext = obs.highScoreNew.map((p) => {
    const r = researchMap.get(p.id);
    const signals = r
      ? [
          r.companyTrigger ? `🔥 ${r.companyTrigger}` : null,
          r.hiringSignals[0] ? `💼 ${r.hiringSignals[0]}` : null,
          r.recentJobChange ? "🆕 Changement de poste récent" : null,
          `Confiance research: ${r.confidence}`,
        ].filter(Boolean).join(" | ")
      : "Pas de signal fort détecté";
    return `- ${p.name} | ${p.company} | ${p.jobTitle ?? "N/A"} | Score: ${p.score} | Email: ${p.hasEmail ? "✓" : "✗"} | LinkedIn: ${p.hasLinkedIn ? "✓" : "✗"} | SIGNALS: [${signals}] | id: ${p.id}`;
  });

  const humanPrompt = `
Voici l'état actuel du pipeline :

## Prospects high-score non contactés (${obs.highScoreNew.length})
${newProspectsWithContext.join("\n")}

## Prospects contactés sans réponse (${obs.stagnantContacted.length})
${obs.stagnantContacted.map((p) =>
    `- ${p.name} | ${p.company} | ${p.daysSinceContact}j sans réponse | Canal: ${p.channel} | Dernier message: "${p.lastMessage ?? "N/A"}" | id: ${p.id}`
  ).join("\n")}

## Prospects en attente depuis 21+ jours (${obs.staleProspects.length})
${obs.staleProspects.map((p) =>
    `- ${p.name} | ${p.company} | ${p.daysSinceContact}j sans activité | id: ${p.id}`
  ).join("\n")}

Priorise les prospects avec des SIGNALS forts (🔥 levée, 💼 recrutement, 🆕 changement de poste).
Génère les décisions. Les messages seront personnalisés séparément.
`;

  const claude = getClaude();
  const parser = getStringParser();

  const response = await claude.invoke([
    new SystemMessage({ content: buildSystemPrompt(brandContext) }),
    new HumanMessage({ content: humanPrompt }),
  ]);

  await trackSpend(workspaceId, "cso_agent_analyze").catch(() => undefined);

  const raw = await parser.invoke(response);
  const clean = stripMarkdownJson(raw);

  let decisions: CsoDecisionDraft[] = [];
  try {
    const parsed = JSON.parse(clean) as CsoDecisionDraft[];
    decisions = Array.isArray(parsed) ? parsed.slice(0, 15) : [];
  } catch {
    return [];
  }

  // ── Step C: Replace generic messages with hyper-personalized ones ──────────
  const enrichedDecisions = await Promise.all(
    decisions.map(async (d): Promise<CsoDecisionDraft> => {
      const research = researchMap.get(d.prospectId);
      if (!research) return d;

      const prospectData = obs.highScoreNew.find((p) => p.id === d.prospectId)
        ?? obs.stagnantContacted.find((p) => p.id === d.prospectId);
      if (!prospectData) return d;

      const profile = {
        id: d.prospectId,
        name: d.prospectName,
        firstName: d.prospectName.split(" ")[0],
        company: prospectData.company,
        jobTitle: prospectData.jobTitle ?? "",
        email: "email" in prospectData ? prospectData.email : undefined,
        linkedInUrl: "linkedInUrl" in prospectData ? prospectData.linkedInUrl : undefined,
      };

      try {
        if (d.actionType === "CSO_LAUNCH_LINKEDIN") {
          const msg = await generateCsoMessages(profile, research, brand, "LINKEDIN");
          return { ...d, actionData: { ...d.actionData, connectNote: msg.content, _angle: msg.angle } };

        } else if (d.actionType === "CSO_LAUNCH_EMAIL") {
          const msg = await generateCsoMessages(profile, research, brand, "EMAIL");
          return { ...d, actionData: { ...d.actionData, subject: msg.subject, content: msg.content, _angle: msg.angle } };

        } else if (d.actionType === "CSO_FOLLOWUP") {
          const lastMsg = "lastMessage" in prospectData ? (prospectData.lastMessage ?? undefined) : undefined;
          const channel = "channel" in prospectData ? (prospectData.channel as "EMAIL" | "LINKEDIN" | "FOLLOWUP") : "EMAIL";
          const msg = await generateCsoMessages(profile, research, brand, channel === "LINKEDIN" ? "LINKEDIN" : "FOLLOWUP", lastMsg);
          return { ...d, actionData: { ...d.actionData, subject: msg.subject, content: msg.content, _angle: msg.angle } };
        }
      } catch (err) {
        console.warn(`[CSO] Message generation failed for ${d.prospectId}:`, err);
      }

      return d;
    })
  );

  return enrichedDecisions;
}

// ─── Step 3: Store decisions ──────────────────────────────────────────────────

export async function storeCsoDecisions(
  workspaceId: string,
  drafts: CsoDecisionDraft[]
): Promise<number> {
  if (!drafts.length) return 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  // Skip duplicates: same prospectId + same actionType already PENDING
  // Also skip prospects rejected for the same action type in the last 7 days (cooldown)
  const [existing, recentRejected] = await Promise.all([
    prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "PENDING",
        actionType: { in: drafts.map((d) => d.actionType) },
      },
      select: { actionType: true, actionData: true },
    }),
    prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "REJECTED",
        updatedAt: { gte: sevenDaysAgo },
      },
      select: { actionType: true, actionData: true },
    }),
  ]);

  const blockedKeys = new Set(
    [...existing, ...recentRejected].map((e) => {
      const data = e.actionData as Record<string, unknown> | null;
      return `${e.actionType}:${data?.prospectId ?? ""}`;
    })
  );

  const fresh = drafts.filter(
    (d) => !blockedKeys.has(`${d.actionType}:${d.prospectId}`)
  );

  if (!fresh.length) return 0;

  await prisma.agentDecision.createMany({
    data: fresh.map((d) => ({
      workspaceId,
      actionType: d.actionType,
      reasoning: d.reasoning,
      priority: d.priority,
      status: "PENDING",
      actionData: {
        prospectId: d.prospectId,
        prospectName: d.prospectName,
        ...d.actionData,
      },
    })),
  });

  return fresh.length;
}

// ─── Step 4: Execute an approved decision ─────────────────────────────────────

export async function executeCsoDecision(
  decisionId: string,
  workspaceId: string
): Promise<{ ok: boolean; message: string }> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, workspaceId, status: "APPROVED" },
  });

  if (!decision) return { ok: false, message: "Décision introuvable ou déjà exécutée" };

  const data = decision.actionData as Record<string, unknown> & { prospectId: string };

  try {
    const now = new Date();

    if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
      const sequence = await prisma.outreachSequence.create({
        data: {
          workspaceId,
          prospectId: data.prospectId,
          name: `LinkedIn CSO — ${data.prospectName as string}`,
          isActive: true,
        },
      });
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "LINKEDIN",
          content: (data.connectNote as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });
      // Mark prospect as CONTACTED so it won't reappear in observe
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { status: "CONTACTED", lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_LAUNCH_EMAIL") {
      const sequence = await prisma.outreachSequence.create({
        data: {
          workspaceId,
          prospectId: data.prospectId,
          name: `Email CSO — ${data.prospectName as string}`,
          isActive: true,
        },
      });
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "EMAIL",
          subject: (data.subject as string) ?? "(sans objet)",
          content: (data.content as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { status: "CONTACTED", lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_FOLLOWUP") {
      let sequence = await prisma.outreachSequence.findFirst({
        where: { workspaceId, prospectId: data.prospectId, isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (!sequence) {
        sequence = await prisma.outreachSequence.create({
          data: {
            workspaceId,
            prospectId: data.prospectId,
            name: `Relance CSO — ${data.prospectName as string}`,
            isActive: true,
          },
        });
      }
      const lastStep = await prisma.sequenceStep.findFirst({
        where: { sequenceId: sequence.id },
        orderBy: { stepNumber: "desc" },
      });
      const nextStep = (lastStep?.stepNumber ?? 0) + 1;
      await prisma.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: nextStep,
          channel: ((data.channel as string) ?? "EMAIL") as SequenceChannel,
          subject: (data.subject as string) ?? undefined,
          content: (data.content as string) ?? "",
          status: "PENDING",
          scheduledAt: null,
        },
      });
      // Reset lastInteractionAt so the follow-up cooldown restarts
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { lastInteractionAt: now },
      });
    } else if (decision.actionType === "CSO_STALE_REJECT") {
      // Cancel active sequences before marking rejected
      await prisma.sequenceStep.updateMany({
        where: {
          sequence: { workspaceId, prospectId: data.prospectId },
          status: "PENDING",
        },
        data: { status: "SKIPPED" },
      });
      await prisma.prospect.update({
        where: { id: data.prospectId },
        data: { status: "REJECTED" },
      });
    }

    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "EXECUTED", executedAt: new Date() },
    });

    return { ok: true, message: "Exécuté avec succès" };
  } catch (err) {
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "FAILED", result: { error: String(err) } },
    });
    return { ok: false, message: String(err) };
  }
}
