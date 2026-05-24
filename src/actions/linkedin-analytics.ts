"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface LinkedInDayStats {
  date: string; // "DD/MM"
  connect: number;
  message: number;
  failed: number;
  replies: number;
}

export interface LinkedInAnalyticsData {
  config: {
    isActive: boolean;
    warmupDay: number;
    warmupStartedAt: string | null;
    dailyConnectLimit: number;
    dailyMessageLimit: number;
    lastRunAt: string | null;
    lastRunStats: Record<string, unknown> | null;
  } | null;
  totals: {
    connectSent: number;
    messageSent: number;
    stepsFailed: number;
    stepsPending: number;
    repliesReceived: number;
    replyRate: number; // % replies / messages sent
  };
  last30Days: LinkedInDayStats[];
  prospectFunnel: Array<{ status: string; label: string; count: number }>;
}

function toDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function daysRange(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toDay(d));
  }
  return days;
}

export async function getLinkedInAnalytics(
  workspaceId: string
): Promise<{ success: boolean; data?: LinkedInAnalyticsData; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Non autorisé");

    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true },
    });
    if (!ws) throw new Error("Workspace non trouvé");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

    const [config, steps, replies, prospectGroups] = await Promise.all([
      prisma.linkedInAutomationConfig.findUnique({
        where: { workspaceId },
        select: {
          isActive: true,
          warmupDay: true,
          warmupStartedAt: true,
          dailyConnectLimit: true,
          dailyMessageLimit: true,
          lastRunAt: true,
          lastRunStats: true,
        },
      }),

      prisma.sequenceStep.findMany({
        where: {
          channel: "LINKEDIN",
          sequence: { workspaceId },
          OR: [
            { sentAt: { gte: thirtyDaysAgo } },
            { createdAt: { gte: thirtyDaysAgo }, status: { in: ["PENDING", "FAILED"] } },
          ],
        },
        select: {
          status: true,
          linkedInAction: true,
          sentAt: true,
          createdAt: true,
        },
      }),

      prisma.linkedInReply.findMany({
        where: { workspaceId, receivedAt: { gte: thirtyDaysAgo } },
        select: { receivedAt: true },
      }),

      prisma.prospect.groupBy({
        by: ["status"],
        where: {
          workspaceId,
          status: { in: ["CONTACTED", "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED"] },
        },
        _count: { id: true },
      }),
    ]);

    // Build per-day maps
    const days = daysRange(30);
    const dayMap = new Map<string, LinkedInDayStats>(
      days.map((d) => [d, { date: d, connect: 0, message: 0, failed: 0, replies: 0 }])
    );

    let connectSent = 0;
    let messageSent = 0;
    let stepsFailed = 0;
    let stepsPending = 0;

    for (const s of steps) {
      if (s.status === "SENT" && s.sentAt) {
        const day = toDay(new Date(s.sentAt));
        const entry = dayMap.get(day);
        if (s.linkedInAction === "connect") {
          connectSent++;
          if (entry) entry.connect++;
        } else {
          messageSent++;
          if (entry) entry.message++;
        }
      } else if (s.status === "FAILED") {
        stepsFailed++;
        const day = toDay(new Date(s.createdAt));
        const entry = dayMap.get(day);
        if (entry) entry.failed++;
      } else if (s.status === "PENDING") {
        stepsPending++;
      }
    }

    for (const r of replies) {
      const day = toDay(new Date(r.receivedAt));
      const entry = dayMap.get(day);
      if (entry) entry.replies++;
    }

    const repliesReceived = replies.length;
    const replyRate = messageSent > 0 ? Math.round((repliesReceived / messageSent) * 100) : 0;

    const STATUS_LABELS: Record<string, string> = {
      CONTACTED: "Contactés",
      RESPONDED: "Répondus",
      MEETING_BOOKED: "RDV pris",
      CONVERTED: "Convertis",
      REJECTED: "Perdus",
    };
    const STATUS_ORDER = ["CONTACTED", "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED"];
    const prospectFunnel = STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: prospectGroups.find((g) => g.status === status)?._count.id ?? 0,
    }));

    return {
      success: true,
      data: {
        config: config
          ? {
              isActive: config.isActive,
              warmupDay: config.warmupDay,
              warmupStartedAt: config.warmupStartedAt?.toISOString() ?? null,
              dailyConnectLimit: config.dailyConnectLimit,
              dailyMessageLimit: config.dailyMessageLimit,
              lastRunAt: config.lastRunAt?.toISOString() ?? null,
              lastRunStats: config.lastRunStats as Record<string, unknown> | null,
            }
          : null,
        totals: { connectSent, messageSent, stepsFailed, stepsPending, repliesReceived, replyRate },
        last30Days: [...dayMap.values()],
        prospectFunnel,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}
