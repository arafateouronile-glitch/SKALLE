"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailAbStep {
  stepId: string;
  stepNumber: number;
  sequenceId: string;
  sequenceName: string;
  prospectName: string;
  prospectCompany: string;
  subject: string | null;
  subjectVariants: string[];
  personalizationScore: number | null;
  status: string;
  openedAt: string | null;
  sentAt: string | null;
}

export interface EmailAbData {
  steps: EmailAbStep[];
  openRate: number;
  totalWithVariants: number;
}

// ─── getEmailAbData ───────────────────────────────────────────────────────────

export async function getEmailAbData(
  workspaceId: string
): Promise<{ success: boolean; data?: EmailAbData; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      select: { id: true },
    });
    if (!workspace) return { success: false, error: "Workspace non trouvé" };

    const rawSteps = await prisma.sequenceStep.findMany({
      where: {
        channel: "EMAIL",
        sequence: { workspaceId },
      },
      include: {
        sequence: {
          select: {
            id: true,
            name: true,
            prospect: { select: { name: true, company: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const enriched: EmailAbStep[] = [];
    for (const step of rawSteps) {
      const meta = (step.metadata as Record<string, unknown>) ?? {};
      const variants = Array.isArray(meta.subjectVariants)
        ? (meta.subjectVariants as string[])
        : [];
      if (variants.length === 0) continue;

      enriched.push({
        stepId: step.id,
        stepNumber: step.stepNumber,
        sequenceId: step.sequence.id,
        sequenceName: step.sequence.name,
        prospectName: step.sequence.prospect.name,
        prospectCompany: step.sequence.prospect.company,
        subject: step.subject,
        subjectVariants: variants,
        personalizationScore:
          typeof meta.personalizationScore === "number"
            ? meta.personalizationScore
            : null,
        status: step.status as string,
        openedAt: step.openedAt?.toISOString() ?? null,
        sentAt: step.sentAt?.toISOString() ?? null,
      });
    }

    const sent = enriched.filter((s) =>
      ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(s.status)
    ).length;
    const opened = enriched.filter((s) => s.openedAt !== null).length;
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;

    return {
      success: true,
      data: { steps: enriched, openRate, totalWithVariants: enriched.length },
    };
  } catch (error) {
    console.error("getEmailAbData error:", error);
    return { success: false, error: String(error) };
  }
}

// ─── applySubjectVariant ──────────────────────────────────────────────────────

export async function applySubjectVariant(
  stepId: string,
  variantSubject: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    // Verify ownership via workspace
    const step = await prisma.sequenceStep.findFirst({
      where: { id: stepId },
      select: {
        id: true,
        status: true,
        metadata: true,
        sequence: { select: { workspaceId: true } },
      },
    });

    if (!step) return { success: false, error: "Étape non trouvée" };

    const ws = await prisma.workspace.findFirst({
      where: { id: step.sequence.workspaceId, userId: session.user!.id! },
      select: { id: true },
    });
    if (!ws) return { success: false, error: "Accès refusé" };

    if (step.status !== "PENDING") {
      return { success: false, error: "Seules les étapes PENDING peuvent être modifiées" };
    }

    const meta = (step.metadata as Record<string, unknown>) ?? {};

    await prisma.sequenceStep.update({
      where: { id: stepId },
      data: {
        subject: variantSubject,
        metadata: { ...meta, variantApplied: variantSubject },
      },
    });

    return { success: true };
  } catch (error) {
    console.error("applySubjectVariant error:", error);
    return { success: false, error: String(error) };
  }
}
