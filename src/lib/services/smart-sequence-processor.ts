/**
 * Smart Sequence Processor
 *
 * Gère les branches conditionnelles des séquences CSO :
 *
 *   CONNECTION_REQUEST
 *     ├─ (accepted ≤7j)  → POST_CONNECTION_MESSAGE  → (replied)    → CLOSE
 *     │                                               └─ (no reply ≥5j) → FOLLOWUP
 *     └─ (ignored ≥7j)   → EMAIL_FALLBACK (ou re-engage LinkedIn)
 *
 * Les steps en attente sont stockés avec :
 *   - scheduledAt = FAR_FUTURE (ne sont pas ramassés par email-outreach-daily)
 *   - metadata.smartBranch = true
 *   - metadata.waitingFor = "CONNECTION_ACCEPTED" | "NOT_ACCEPTED" | "NO_REPLY"
 *
 * Ce processor active ou annule les branches selon les événements.
 */

import { prisma } from "@/lib/prisma";
import { generateCsoMessages, buildBrandContext } from "@/lib/prospection/message-generator";
import type { ProspectResearch } from "@/lib/prospection/prospect-researcher";

// Sentinel : date future lointaine pour les steps "en attente de condition"
export const FAR_FUTURE = new Date("2099-01-01T00:00:00.000Z");

export type SmartBranchWaitFor =
  | "CONNECTION_ACCEPTED"     // Step 2 — attendu après acceptation connexion LinkedIn
  | "NOT_ACCEPTED"            // Step 3 — activé si toujours NEW après N jours
  | "NO_REPLY"                // Step 4 — activé si CONTACTED sans réponse après N jours
  | "EMAIL_OPENED_NO_REPLY";  // Step 5 — activé si email ouvert mais pas répondu après N jours

export interface SmartStepMeta {
  smartBranch: true;
  waitingFor: SmartBranchWaitFor;
  daysThreshold?: number; // Pour NOT_ACCEPTED et NO_REPLY
}

// ─── Événement : connexion acceptée ──────────────────────────────────────────

/**
 * Appelé quand connection-accepted reçoit un rapport de l'extension.
 * - Active le step POST_CONNECTION (scheduledAt → null = immédiat)
 * - Annule le step EMAIL_FALLBACK (NOT_ACCEPTED)
 * - Programme le step NO_REPLY (scheduledAt → now + 5j)
 */
export async function onConnectionAccepted(prospectId: string): Promise<void> {
  const steps = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { gte: new Date("2090-01-01") }, // FAR_FUTURE sentinel
      sequence: { prospectId, isActive: true },
    },
    select: { id: true, metadata: true },
  });

  const now = new Date();

  for (const step of steps) {
    const meta = (step.metadata ?? {}) as Partial<SmartStepMeta>;
    if (!meta.smartBranch) continue;

    if (meta.waitingFor === "CONNECTION_ACCEPTED") {
      // Activer immédiatement le message post-connexion
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { scheduledAt: null },
      });
    } else if (meta.waitingFor === "NOT_ACCEPTED") {
      // Annuler le fallback email/LinkedIn
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "SKIPPED" },
      });
    } else if (meta.waitingFor === "NO_REPLY") {
      // Programmer le followup à J+5 depuis maintenant
      const days = meta.daysThreshold ?? 5;
      const fireAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { scheduledAt: fireAt },
      });
    }
  }
}

// ─── Événement : prospect a répondu ──────────────────────────────────────────

/**
 * Appelé quand prospect-responded reçoit un rapport de l'extension.
 * - Annule tous les steps NO_REPLY en attente pour ce prospect.
 */
export async function onProspectReplied(prospectId: string): Promise<void> {
  const steps = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      sequence: { prospectId, isActive: true },
    },
    select: { id: true, metadata: true },
  });

  for (const step of steps) {
    const meta = (step.metadata ?? {}) as Partial<SmartStepMeta>;
    if (meta.smartBranch && meta.waitingFor === "NO_REPLY") {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "SKIPPED" },
      });
    }
  }
}

// ─── Vérification quotidienne ─────────────────────────────────────────────────

/**
 * Tourne toutes les 24h (déclenché par l'extension ou Inngest).
 *
 * Pour chaque step smart en attente dont la scheduledAt est passée :
 * - Si le prospect est déjà CONTACTED / RESPONDED → SKIP
 * - Sinon (branch NOT_ACCEPTED) → génère le contenu de fallback et active le step
 */
export async function processPendingBranches(workspaceId?: string): Promise<{
  activated: number;
  skipped: number;
}> {
  const now = new Date();
  let activated = 0;
  let skipped = 0;

  const steps = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now, gte: new Date("2000-01-01") }, // exclut FAR_FUTURE (≥2090)
      metadata: { not: "null" },
      sequence: {
        isActive: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
    },
    include: {
      sequence: {
        select: {
          workspaceId: true,
          prospect: {
            select: {
              id: true,
              status: true,
              name: true,
              jobTitle: true,
              company: true,
              email: true,
              linkedInUrl: true,
              enrichmentData: true,
              workspaceId: true,
            },
          },
        },
      },
    },
  });

  for (const step of steps) {
    const meta = (step.metadata ?? {}) as Partial<SmartStepMeta>;
    if (!meta.smartBranch) continue;

    const prospect = step.sequence.prospect;
    const wsId = step.sequence.workspaceId;

    // Si le prospect a évolué favorablement → annuler la branche fallback
    if (
      meta.waitingFor === "NOT_ACCEPTED" &&
      ["CONTACTED", "RESPONDED", "MEETING_BOOKED", "CONVERTED"].includes(prospect.status)
    ) {
      await prisma.sequenceStep.update({ where: { id: step.id }, data: { status: "SKIPPED" } });
      skipped++;
      continue;
    }

    if (meta.waitingFor === "NO_REPLY" && prospect.status === "RESPONDED") {
      await prisma.sequenceStep.update({ where: { id: step.id }, data: { status: "SKIPPED" } });
      skipped++;
      continue;
    }

    // Branche NOT_ACCEPTED — générer le contenu si vide (lazy generation)
    if (meta.waitingFor === "NOT_ACCEPTED" && !step.content?.trim()) {
      const content = await generateFallbackContent(prospect, wsId);
      if (!content) {
        await prisma.sequenceStep.update({ where: { id: step.id }, data: { status: "SKIPPED" } });
        skipped++;
        continue;
      }
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: {
          content: content.body,
          subject: content.subject ?? undefined,
          scheduledAt: null, // active maintenant
        },
      });
    } else {
      // Contenu déjà généré ou NO_REPLY → activer
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { scheduledAt: null },
      });
    }

    activated++;
  }

  // ── Email ouvert sans réponse → escalade LinkedIn ────────────────────────────
  // Cherche les steps EMAIL avec status OPENED depuis plus de daysThreshold jours
  const openedEmailSteps = await prisma.sequenceStep.findMany({
    where: {
      channel: "EMAIL",
      status: "OPENED",
      openedAt: { not: null, lte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000) },
      sequence: {
        isActive: true,
        ...(workspaceId ? { workspaceId } : {}),
        // S'assurer qu'il n'y a pas de step REPLIED dans la même séquence
        steps: { none: { status: "REPLIED" } },
      },
    },
    select: {
      sequenceId: true,
      sequence: { select: { prospectId: true, workspaceId: true } },
    },
    distinct: ["sequenceId"],
  });

  for (const emailStep of openedEmailSteps) {
    // Trouver le step LinkedIn d'escalade lié à cette séquence
    const linkedInEscalation = await prisma.sequenceStep.findFirst({
      where: {
        sequenceId: emailStep.sequenceId,
        status: "PENDING",
        scheduledAt: { gte: new Date("2090-01-01") },
        metadata: { not: "null" },
      },
      select: { id: true, metadata: true, content: true },
    });

    if (!linkedInEscalation) continue;

    const meta = (linkedInEscalation.metadata ?? {}) as Partial<SmartStepMeta>;
    if (meta.waitingFor !== "EMAIL_OPENED_NO_REPLY") continue;

    // Générer le contenu LinkedIn si vide
    if (!linkedInEscalation.content?.trim()) {
      const wsId = emailStep.sequence.workspaceId;
      const prospect = await prisma.prospect.findUnique({
        where: { id: emailStep.sequence.prospectId },
        select: {
          id: true, name: true, jobTitle: true, company: true,
          email: true, linkedInUrl: true, enrichmentData: true, workspaceId: true,
        },
      });
      if (prospect) {
        const content = await generateFallbackContent(prospect, wsId);
        if (content) {
          await prisma.sequenceStep.update({
            where: { id: linkedInEscalation.id },
            data: { content: content.body, subject: content.subject ?? undefined, scheduledAt: null },
          });
          activated++;
          continue;
        }
      }
      await prisma.sequenceStep.update({ where: { id: linkedInEscalation.id }, data: { status: "SKIPPED" } });
      skipped++;
    } else {
      await prisma.sequenceStep.update({ where: { id: linkedInEscalation.id }, data: { scheduledAt: null } });
      activated++;
    }
  }

  return { activated, skipped };
}

// ─── Génération lazy du contenu fallback ─────────────────────────────────────

async function generateFallbackContent(
  prospect: {
    id: string;
    name: string;
    jobTitle: string | null;
    company: string;
    email: string | null;
    linkedInUrl: string | null;
    enrichmentData: unknown;
    workspaceId: string;
  },
  workspaceId: string
): Promise<{ body: string; subject?: string; channel: "EMAIL" | "LINKEDIN" } | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, brandVoice: true },
  });
  if (!workspace) return null;

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  const brand = buildBrandContext(workspace.name, bv);

  const ed = (prospect.enrichmentData ?? {}) as Record<string, unknown>;
  const li = (ed.linkedIn ?? {}) as Record<string, unknown>;

  const research: ProspectResearch = {
    companyTrigger: null,
    companyStage: "PME établie",
    hiringSignals: [],
    recentNews: [],
    techStack: [],
    linkedInHeadline: (li.headline as string) ?? prospect.jobTitle ?? null,
    linkedInAbout: (li.about as string) ?? null,
    linkedInExperiences: (li.experiences as ProspectResearch["linkedInExperiences"]) ?? [],
    recentLinkedInActivity: null,
    jobTenure: null,
    recentJobChange: false,
    topPainPoint: "gestion administrative chronophage",
    urgencySignal: "N/A",
    icebreakerLine: "",
    suggestedAngle: "pain",
    researchedAt: new Date().toISOString(),
    confidence: "low",
    serperUsed: false,
  };

  const profile = {
    id: prospect.id,
    name: prospect.name,
    firstName: prospect.name.split(" ")[0],
    company: prospect.company,
    jobTitle: prospect.jobTitle ?? "",
    email: prospect.email,
    linkedInUrl: prospect.linkedInUrl,
  };

  const channel = prospect.email ? "EMAIL" : "LINKEDIN";

  try {
    const msg = await generateCsoMessages(
      profile,
      research,
      brand,
      channel === "EMAIL" ? "EMAIL" : "FOLLOWUP"
    );
    return {
      body: msg.content,
      subject: msg.subject,
      channel,
    };
  } catch {
    return null;
  }
}
