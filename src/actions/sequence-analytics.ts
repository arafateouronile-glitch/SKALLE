"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepFunnelRow {
  stepNumber: number;
  channel: string;
  sent: number;
  opened: number;
  replied: number;
  failed: number;
  openRate: number;   // opened / sent × 100
  replyRate: number;  // replied / sent × 100
}

export interface ChannelRow {
  channel: string;
  sent: number;
  replied: number;
  replyRate: number;
}

export interface SequenceRow {
  id: string;
  name: string;
  prospectName: string;
  prospectCompany: string;
  totalSteps: number;
  sent: number;
  opened: number;
  replied: number;
  replyRate: number;
  isActive: boolean;
  createdAt: string;
}

export interface SequenceAnalyticsResult {
  totalSequences: number;
  activeSequences: number;
  overallSent: number;
  overallReplied: number;
  overallReplyRate: number;
  avgStepsToReply: number | null;
  stepFunnel: StepFunnelRow[];
  byChannel: ChannelRow[];
  sequenceRanking: SequenceRow[];
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function getSequenceStepAnalytics(
  workspaceId: string
): Promise<{ success: boolean; data?: SequenceAnalyticsResult; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) return { success: false, error: "Workspace non trouvé" };

    // Load all sequences with their steps in one query
    const sequences = await prisma.outreachSequence.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        prospect: { select: { name: true, company: true } },
        steps: {
          select: {
            stepNumber: true,
            channel: true,
            status: true,
            sentAt: true,
            openedAt: true,
            repliedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalSequences = sequences.length;
    const activeSequences = sequences.filter((s) => s.isActive).length;

    // ── Per-step aggregation ──────────────────────────────────────────────────

    const SENT_STATUSES = new Set(["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "FAILED"]);

    // Map: stepNumber → { channel, sent, opened, replied, failed }
    const stepMap = new Map<
      number,
      { channel: string; sent: number; opened: number; replied: number; failed: number }
    >();

    // Map: channel → { sent, replied }
    const channelMap = new Map<string, { sent: number; replied: number }>();

    let overallSent = 0;
    let overallReplied = 0;
    const stepsToReplyArr: number[] = [];

    const sequenceRows: SequenceRow[] = sequences.map((seq) => {
      let seqSent = 0;
      let seqOpened = 0;
      let seqReplied = 0;

      for (const step of seq.steps) {
        const isSent = SENT_STATUSES.has(step.status);
        const isOpened = step.status === "OPENED" || step.status === "CLICKED" || !!step.openedAt;
        const isReplied = step.status === "REPLIED" || !!step.repliedAt;
        const isFailed = step.status === "FAILED";

        if (!stepMap.has(step.stepNumber)) {
          stepMap.set(step.stepNumber, { channel: step.channel, sent: 0, opened: 0, replied: 0, failed: 0 });
        }
        if (!channelMap.has(step.channel)) {
          channelMap.set(step.channel, { sent: 0, replied: 0 });
        }

        const sRow = stepMap.get(step.stepNumber)!;
        const cRow = channelMap.get(step.channel)!;

        if (isSent) {
          sRow.sent++;
          cRow.sent++;
          seqSent++;
          overallSent++;
        }
        if (isOpened) { sRow.opened++; seqOpened++; }
        if (isReplied) {
          sRow.replied++;
          cRow.replied++;
          seqReplied++;
          overallReplied++;
          stepsToReplyArr.push(step.stepNumber);
        }
        if (isFailed) { sRow.failed++; }
      }

      return {
        id: seq.id,
        name: seq.name,
        prospectName: seq.prospect.name,
        prospectCompany: seq.prospect.company,
        totalSteps: seq.steps.length,
        sent: seqSent,
        opened: seqOpened,
        replied: seqReplied,
        replyRate: seqSent > 0 ? Math.round((seqReplied / seqSent) * 100) : 0,
        isActive: seq.isActive,
        createdAt: seq.createdAt.toISOString(),
      };
    });

    // ── Build output arrays ───────────────────────────────────────────────────

    const stepFunnel: StepFunnelRow[] = Array.from(stepMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([stepNumber, row]) => ({
        stepNumber,
        channel: row.channel,
        sent: row.sent,
        opened: row.opened,
        replied: row.replied,
        failed: row.failed,
        openRate: row.sent > 0 ? Math.round((row.opened / row.sent) * 100) : 0,
        replyRate: row.sent > 0 ? Math.round((row.replied / row.sent) * 100) : 0,
      }));

    const byChannel: ChannelRow[] = Array.from(channelMap.entries())
      .map(([channel, row]) => ({
        channel,
        sent: row.sent,
        replied: row.replied,
        replyRate: row.sent > 0 ? Math.round((row.replied / row.sent) * 100) : 0,
      }))
      .sort((a, b) => b.replyRate - a.replyRate);

    const overallReplyRate =
      overallSent > 0 ? Math.round((overallReplied / overallSent) * 100) : 0;

    const avgStepsToReply =
      stepsToReplyArr.length > 0
        ? Math.round((stepsToReplyArr.reduce((a, b) => a + b, 0) / stepsToReplyArr.length) * 10) / 10
        : null;

    // Sort: highest reply rate first (only include sequences that had sends)
    const sequenceRanking = sequenceRows
      .filter((s) => s.sent > 0)
      .sort((a, b) => b.replyRate - a.replyRate)
      .slice(0, 20);

    return {
      success: true,
      data: {
        totalSequences,
        activeSequences,
        overallSent,
        overallReplied,
        overallReplyRate,
        avgStepsToReply,
        stepFunnel,
        byChannel,
        sequenceRanking,
      },
    };
  } catch (error) {
    console.error("[sequence-analytics]", error);
    return { success: false, error: String(error) };
  }
}

// ─── A/B Test Results ─────────────────────────────────────────────────────────

export interface AbTestResult {
  abTestId: string;
  sequenceName: string;
  a: { sequences: number; sent: number; opened: number; replied: number; openRate: number; replyRate: number };
  b: { sequences: number; sent: number; opened: number; replied: number; openRate: number; replyRate: number };
  winner: "A" | "B" | "tie" | "pending";
}

export async function getAllAbTests(
  workspaceId: string
): Promise<{ success: boolean; data?: AbTestResult[]; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) return { success: false, error: "Workspace non trouvé" };

    const sequences = await prisma.outreachSequence.findMany({
      where: { workspaceId, abTestId: { not: null } },
      select: {
        id: true, name: true, abTestId: true, abVariant: true,
        steps: { select: { status: true, openedAt: true, repliedAt: true } },
      },
    });

    const SENT_STATUSES = new Set(["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"]);

    // Group by abTestId
    const byTest = new Map<string, typeof sequences>();
    for (const seq of sequences) {
      if (!seq.abTestId) continue;
      if (!byTest.has(seq.abTestId)) byTest.set(seq.abTestId, []);
      byTest.get(seq.abTestId)!.push(seq);
    }

    function variantStats(seqs: typeof sequences, variant: string) {
      const filtered = seqs.filter((s) => s.abVariant === variant);
      let sent = 0, opened = 0, replied = 0;
      for (const seq of filtered) {
        for (const step of seq.steps) {
          if (SENT_STATUSES.has(step.status)) sent++;
          if (step.openedAt) opened++;
          if (step.repliedAt) replied++;
        }
      }
      return {
        sequences: filtered.length,
        sent, opened, replied,
        openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
      };
    }

    const results: AbTestResult[] = [];
    for (const [abTestId, seqs] of byTest.entries()) {
      const a = variantStats(seqs, "A");
      const b = variantStats(seqs, "B");
      let winner: AbTestResult["winner"] = "pending";
      if (a.sent >= 5 && b.sent >= 5) {
        if (a.replyRate > b.replyRate + 2) winner = "A";
        else if (b.replyRate > a.replyRate + 2) winner = "B";
        else winner = "tie";
      }
      const aSeq = seqs.find((s) => s.abVariant === "A");
      results.push({ abTestId, sequenceName: (aSeq?.name ?? "Test").replace(" — Variante A", "").replace(" — Variante B", ""), a, b, winner });
    }

    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
