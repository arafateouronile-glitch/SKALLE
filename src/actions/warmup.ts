"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  WARMUP_DURATION,
  dailyLimitForDay,
  warmupProgressPct,
  fullWarmupSchedule,
  getWarmupStatus,
  type WarmupStatus,
} from "@/lib/email/warmup";

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireSmtpConfig(smtpConfigId: string, workspaceId: string, userId: string) {
  const config = await prisma.smtpConfig.findFirst({
    where: { id: smtpConfigId, workspaceId, workspace: { userId } },
  });
  if (!config) throw new Error("Compte SMTP introuvable");
  return config;
}

// ─── Public actions ───────────────────────────────────────────────────────────

/** Start or restart warmup for a mailbox. */
export async function startMailboxWarmupAction(
  workspaceId: string,
  smtpConfigId: string,
  targetVolume: number = 100
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    const config = await requireSmtpConfig(smtpConfigId, workspaceId, session.user!.id!);

    const safeTarget = Math.max(10, Math.min(targetVolume, config.dailyLimit));

    await prisma.smtpConfig.update({
      where: { id: smtpConfigId },
      data: {
        warmupEnabled: true,
        warmupCompleted: false,
        warmupDay: 1,
        warmupSentToday: 0,
        warmupStartedAt: new Date(),
        warmupLastResetAt: new Date(),
        warmupTargetVol: safeTarget,
      },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pause an ongoing warmup (keeps progress). */
export async function pauseMailboxWarmupAction(
  workspaceId: string,
  smtpConfigId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireSmtpConfig(smtpConfigId, workspaceId, session.user!.id!);

    await prisma.smtpConfig.update({
      where: { id: smtpConfigId },
      data: { warmupEnabled: false },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Resume a paused warmup. */
export async function resumeMailboxWarmupAction(
  workspaceId: string,
  smtpConfigId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireSmtpConfig(smtpConfigId, workspaceId, session.user!.id!);

    await prisma.smtpConfig.update({
      where: { id: smtpConfigId },
      data: { warmupEnabled: true },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Reset warmup back to zero. */
export async function resetMailboxWarmupAction(
  workspaceId: string,
  smtpConfigId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireSmtpConfig(smtpConfigId, workspaceId, session.user!.id!);

    await prisma.smtpConfig.update({
      where: { id: smtpConfigId },
      data: {
        warmupEnabled: false,
        warmupCompleted: false,
        warmupDay: 0,
        warmupSentToday: 0,
        warmupStartedAt: null,
        warmupLastResetAt: null,
      },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type MailboxWarmupEntry = {
  id: string;
  fromEmail: string;
  fromName: string;
  label: string;
  provider: string;
  isVerified: boolean;
  dailyLimit: number;
  status: WarmupStatus;
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  warmupDay: number;
  warmupSentToday: number;
  warmupStartedAt: Date | null;
  warmupTargetVol: number;
  progressPct: number;
  todayLimit: number;
  daysRemaining: number;
  estimatedCompletionDate: Date | null;
  schedule: { day: number; limit: number; pct: number }[];
};

/** Get all mailboxes for a workspace with their warmup status. */
export async function getMailboxesWarmupStatusAction(
  workspaceId: string
): Promise<{ success: boolean; data?: MailboxWarmupEntry[]; error?: string }> {
  try {
    const session = await requireAuth();
    await prisma.workspace.findFirstOrThrow({ where: { id: workspaceId, userId: session.user!.id! } });

    const configs = await prisma.smtpConfig.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        label: true,
        provider: true,
        isVerified: true,
        dailyLimit: true,
        warmupEnabled: true,
        warmupCompleted: true,
        warmupDay: true,
        warmupSentToday: true,
        warmupStartedAt: true,
        warmupLastResetAt: true,
        warmupTargetVol: true,
      },
    });

    const data: MailboxWarmupEntry[] = configs.map((c) => {
      const status = getWarmupStatus(c);
      const progressPct = warmupProgressPct(c.warmupDay);
      const todayLimit = dailyLimitForDay(c.warmupDay, c.warmupTargetVol);
      const daysRemaining = Math.max(0, WARMUP_DURATION - c.warmupDay);

      let estimatedCompletionDate: Date | null = null;
      if (c.warmupStartedAt && status === "running") {
        estimatedCompletionDate = new Date(c.warmupStartedAt);
        estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + WARMUP_DURATION);
      }

      return {
        id: c.id,
        fromEmail: c.fromEmail,
        fromName: c.fromName,
        label: c.label,
        provider: c.provider,
        isVerified: c.isVerified,
        dailyLimit: c.dailyLimit,
        status,
        warmupEnabled: c.warmupEnabled,
        warmupCompleted: c.warmupCompleted,
        warmupDay: c.warmupDay,
        warmupSentToday: c.warmupSentToday,
        warmupStartedAt: c.warmupStartedAt,
        warmupTargetVol: c.warmupTargetVol,
        progressPct,
        todayLimit,
        daysRemaining,
        estimatedCompletionDate,
        schedule: fullWarmupSchedule(c.warmupTargetVol),
      };
    });

    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Runtime helpers (used by campaign-sender / sequence-sender) ─────────────

/** Check if a mailbox can still send today under warmup limits. */
export async function checkSmtpWarmupAllowance(smtpConfigId: string): Promise<{
  canSend: boolean;
  remainingToday: number | null;
  warmupActive: boolean;
  currentDay: number;
  dailyLimit: number;
}> {
  const config = await prisma.smtpConfig.findUnique({
    where: { id: smtpConfigId },
    select: {
      warmupEnabled: true,
      warmupCompleted: true,
      warmupDay: true,
      warmupSentToday: true,
      warmupTargetVol: true,
    },
  });

  if (!config || !config.warmupEnabled || config.warmupCompleted) {
    return { canSend: true, remainingToday: null, warmupActive: false, currentDay: 0, dailyLimit: 0 };
  }

  const limit = dailyLimitForDay(config.warmupDay, config.warmupTargetVol);
  const remaining = limit - config.warmupSentToday;

  return {
    canSend: remaining > 0,
    remainingToday: Math.max(0, remaining),
    warmupActive: true,
    currentDay: config.warmupDay,
    dailyLimit: limit,
  };
}

/** Increment the sent-today counter for a mailbox warmup. */
export async function incrementSmtpWarmupCounter(smtpConfigId: string): Promise<void> {
  await prisma.smtpConfig.updateMany({
    where: { id: smtpConfigId, warmupEnabled: true, warmupCompleted: false },
    data: { warmupSentToday: { increment: 1 } },
  });
}
