"use server";

/**
 * 📨 Email Deliverability - Configuration et Gestion
 * 
 * Gestion de la délivrabilité email:
 * - Configuration SPF/DKIM/DMARC
 * - Warm-up automatique
 * - Tracking de performance
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkDNSRecords,
  verifyDeliverability,
  updateWarmupProgress,
  trackEmailMetrics,
  getWarmupSchedule,
} from "@/lib/prospection/deliverability";
import {
  validateDNSRecords as validateDNSRecordsOptimized,
  getOptimalWarmupPlan,
  analyzeListHygiene as analyzeListHygieneOptimized,
  analyzeEngagement as analyzeEngagementOptimized,
  optimizeDeliverability as optimizeDeliverabilityOptimized,
  getDomainReputation as getDomainReputationOptimized,
} from "@/lib/prospection/deliverability-optimization";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION DELIVERABILITY
// ═══════════════════════════════════════════════════════════════════════════

const deliverabilityConfigSchema = z.object({
  sendingDomain: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  replyToEmail: z.string().email().optional(),
  warmupEnabled: z.boolean().default(true),
  dailySendingLimit: z.number().min(1).max(1000).default(50),
});

export async function saveDeliverabilityConfig(
  workspaceId: string,
  data: z.infer<typeof deliverabilityConfigSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Valider les données
    const parsed = deliverabilityConfigSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Données invalides" };
    }

    // Vérifier les DNS records
    const dnsCheck = await checkDNSRecords(parsed.data.sendingDomain);

    // Upsert la configuration
    await prisma.emailDeliverabilityConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        sendingDomain: parsed.data.sendingDomain,
        fromEmail: parsed.data.fromEmail,
        fromName: parsed.data.fromName,
        replyToEmail: parsed.data.replyToEmail,
        warmupEnabled: parsed.data.warmupEnabled,
        dailySendingLimit: parsed.data.dailySendingLimit,
        spfConfigured: dnsCheck.data?.spf || false,
        dkimConfigured: dnsCheck.data?.dkim || false,
        dmarcConfigured: dnsCheck.data?.dmarc || false,
      },
      update: {
        sendingDomain: parsed.data.sendingDomain,
        fromEmail: parsed.data.fromEmail,
        fromName: parsed.data.fromName,
        replyToEmail: parsed.data.replyToEmail,
        warmupEnabled: parsed.data.warmupEnabled,
        dailySendingLimit: parsed.data.dailySendingLimit,
        spfConfigured: dnsCheck.data?.spf || false,
        dkimConfigured: dnsCheck.data?.dkim || false,
        dmarcConfigured: dnsCheck.data?.dmarc || false,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Save deliverability config error:", error);
    return { success: false, error: String(error) };
  }
}

export async function getDeliverabilityConfig(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      include: { emailDeliverabilityConfig: true },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    return { success: true, data: workspace.emailDeliverabilityConfig };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function verifyDNSRecords(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      include: { emailDeliverabilityConfig: true },
    });

    if (!workspace || !workspace.emailDeliverabilityConfig) {
      return { success: false, error: "Configuration non trouvée" };
    }

    const dnsCheck = await checkDNSRecords(workspace.emailDeliverabilityConfig.sendingDomain);

    // Mettre à jour la configuration avec les résultats
    await prisma.emailDeliverabilityConfig.update({
      where: { workspaceId },
      data: {
        spfConfigured: dnsCheck.data?.spf || false,
        dkimConfigured: dnsCheck.data?.dkim || false,
        dmarcConfigured: dnsCheck.data?.dmarc || false,
      },
    });

    const verification = await verifyDeliverability(workspaceId);

    return {
      success: true,
      data: {
        ...dnsCheck.data,
        recommendations: verification.data?.recommendations || [],
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getWarmupStatus(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // Utiliser le plan optimal Top 1%
    const warmupPlan = getOptimalWarmupPlan(config.dailySendingLimit, 30);
    const daysSinceStart = Math.floor(
      (Date.now() - config.lastResetDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentDaySchedule = warmupPlan.dailySchedule.find((s) => s.day === daysSinceStart + 1);
    
    return {
      success: true,
      data: {
        warmupEnabled: config.warmupEnabled,
        warmupProgress: config.warmupProgress,
        currentDay: daysSinceStart + 1,
        targetEmails: currentDaySchedule?.emails || config.dailySendingLimit,
        emailsSentToday: config.currentDailySent,
        emailsPerHour: currentDaySchedule?.emailsPerHour,
        schedule: warmupPlan.dailySchedule.slice(0, 30), // 30 premiers jours
        estimatedDeliverability: warmupPlan.estimatedDeliverability,
        totalDays: warmupPlan.totalDays,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 OPTIMIZE DELIVERABILITY - Optimisation complète Top 1%
// ═══════════════════════════════════════════════════════════════════════════

export async function optimizeDeliverabilityFull(
  workspaceId: string,
  targetVolume?: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // Utiliser l'optimisation complète Top 1%
    const optimization = await optimizeDeliverabilityOptimized(
      workspaceId,
      targetVolume || config.dailySendingLimit
    );

    return optimization;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 GET DOMAIN REPUTATION - Réputation du domaine
// ═══════════════════════════════════════════════════════════════════════════

export async function getDomainReputation(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // Utiliser le monitoring Top 1%
    const reputation = await getDomainReputationOptimized(config.sendingDomain);

    return reputation;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧹 ANALYZE LIST HYGIENE - Analyse de l'hygiène de la liste
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeListHygiene(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Utiliser l'analyse Top 1%
    const hygiene = await analyzeListHygieneOptimized(workspaceId);

    return hygiene;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔌 MONITORING STATUS - Statut des intégrations externes
// ═══════════════════════════════════════════════════════════════════════════

export async function getMonitoringStatus(): Promise<{
  googlePostmaster: boolean;
  senderScore: boolean;
  microsoftSNDS: boolean;
}> {
  return {
    googlePostmaster: !!process.env.GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON,
    senderScore: !!process.env.SENDERSCORE_API_KEY,
    microsoftSNDS: !!process.env.MICROSOFT_SNDS_SCORE,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ANALYZE ENGAGEMENT - Analyse de l'engagement
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeEngagement(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Utiliser l'analyse Top 1%
    const engagement = await analyzeEngagementOptimized(workspaceId);

    return engagement;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
