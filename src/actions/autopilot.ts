"use server";

/**
 * 🤖 Autopilot Server Actions
 * 
 * Gestion du mode autopilot:
 * - Configuration
 * - Activation/Désactivation
 * - Logs et historique
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/credits";
import { revalidatePath } from "next/cache";

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
// ⚙️ CONFIGURATION AUTOPILOT
// ═══════════════════════════════════════════════════════════════════════════

export interface AutopilotSettings {
  isActive: boolean;
  
  // SEO
  seoEnabled: boolean;
  seoFrequency: string;
  seoKeywords: string[];
  seoMinArticles: number;
  
  // Social
  socialEnabled: boolean;
  socialPlatforms: string[];
  socialFrequency: string;
  
  // Discovery
  discoveryEnabled: boolean;
  competitorUrls: string[];
  discoveryFrequency: string;
  alertOnOpportunity: boolean;
  
  // Prospection
  prospectionEnabled: boolean;
  prospectionDaily: number;
  
  // Notifications
  emailReports: boolean;
  emailFrequency: string;
}

export async function getAutopilotConfig(
  workspaceId: string
): Promise<{ success: boolean; data?: AutopilotSettings; error?: string; canEnable?: boolean }> {
  try {
    const session = await requireAuth();
    
    // Vérifier la propriété du workspace
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      include: { autopilotConfig: true, user: { select: { plan: true } } },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Vérifier si le plan permet l'autopilot
    const canEnable = PLAN_LIMITS[workspace.user.plan].autopilotEnabled;

    if (!workspace.autopilotConfig) {
      // Retourner les valeurs par défaut
      return {
        success: true,
        canEnable,
        data: {
          isActive: false,
          seoEnabled: false,
          seoFrequency: "weekly",
          seoKeywords: [],
          seoMinArticles: 3,
          socialEnabled: false,
          socialPlatforms: [],
          socialFrequency: "daily",
          discoveryEnabled: false,
          competitorUrls: [],
          discoveryFrequency: "weekly",
          alertOnOpportunity: true,
          prospectionEnabled: false,
          prospectionDaily: 5,
          emailReports: true,
          emailFrequency: "daily",
        },
      };
    }

    return {
      success: true,
      canEnable,
      data: {
        isActive: workspace.autopilotConfig.isActive,
        seoEnabled: workspace.autopilotConfig.seoEnabled,
        seoFrequency: workspace.autopilotConfig.seoFrequency,
        seoKeywords: workspace.autopilotConfig.seoKeywords,
        seoMinArticles: workspace.autopilotConfig.seoMinArticles,
        socialEnabled: workspace.autopilotConfig.socialEnabled,
        socialPlatforms: workspace.autopilotConfig.socialPlatforms,
        socialFrequency: workspace.autopilotConfig.socialFrequency,
        discoveryEnabled: workspace.autopilotConfig.discoveryEnabled,
        competitorUrls: workspace.autopilotConfig.competitorUrls,
        discoveryFrequency: workspace.autopilotConfig.discoveryFrequency,
        alertOnOpportunity: workspace.autopilotConfig.alertOnOpportunity,
        prospectionEnabled: workspace.autopilotConfig.prospectionEnabled,
        prospectionDaily: workspace.autopilotConfig.prospectionDaily,
        emailReports: workspace.autopilotConfig.emailReports,
        emailFrequency: workspace.autopilotConfig.emailFrequency,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function saveAutopilotConfig(
  workspaceId: string,
  settings: Partial<AutopilotSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    
    // Vérifier la propriété et le plan
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      include: { user: { select: { plan: true } } },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    if (!PLAN_LIMITS[workspace.user.plan].autopilotEnabled && settings.isActive) {
      return { 
        success: false, 
        error: "L'autopilot n'est pas disponible avec votre plan actuel. Passez au plan Business ou supérieur." 
      };
    }

    // Upsert la configuration
    await prisma.autopilotConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        isActive: settings.isActive ?? false,
        seoEnabled: settings.seoEnabled ?? false,
        seoFrequency: settings.seoFrequency ?? "weekly",
        seoKeywords: settings.seoKeywords ?? [],
        seoMinArticles: settings.seoMinArticles ?? 3,
        socialEnabled: settings.socialEnabled ?? false,
        socialPlatforms: settings.socialPlatforms ?? [],
        socialFrequency: settings.socialFrequency ?? "daily",
        discoveryEnabled: settings.discoveryEnabled ?? false,
        competitorUrls: settings.competitorUrls ?? [],
        discoveryFrequency: settings.discoveryFrequency ?? "weekly",
        alertOnOpportunity: settings.alertOnOpportunity ?? true,
        prospectionEnabled: settings.prospectionEnabled ?? false,
        prospectionDaily: settings.prospectionDaily ?? 5,
        emailReports: settings.emailReports ?? true,
        emailFrequency: settings.emailFrequency ?? "daily",
      },
      update: settings,
    });

    // Logger l'activation/désactivation
    if (settings.isActive !== undefined) {
      await prisma.autopilotLog.create({
        data: {
          workspaceId,
          agentType: "system",
          action: settings.isActive ? "Autopilot activé" : "Autopilot désactivé",
          status: "success",
        },
      });
    }

    revalidatePath(`/dashboard/autopilot`);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function toggleAutopilot(
  workspaceId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  return saveAutopilotConfig(workspaceId, { isActive });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 LOGS AUTOPILOT
// ═══════════════════════════════════════════════════════════════════════════

export interface AutopilotLogEntry {
  id: string;
  agentType: string;
  action: string;
  status: string;
  details: unknown;
  creditsUsed: number;
  createdAt: Date;
}

export async function getAutopilotLogs(
  workspaceId: string,
  limit: number = 50
): Promise<{ success: boolean; data?: AutopilotLogEntry[]; error?: string }> {
  try {
    const session = await requireAuth();
    
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const logs = await prisma.autopilotLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { success: true, data: logs };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 STATISTIQUES AUTOPILOT
// ═══════════════════════════════════════════════════════════════════════════

export interface AutopilotStats {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  creditsUsed: number;
  byAgent: { agent: string; count: number; credits: number }[];
  lastRun: Date | null;
}

export async function getAutopilotStats(
  workspaceId: string,
  days: number = 30
): Promise<{ success: boolean; data?: AutopilotStats; error?: string }> {
  try {
    const session = await requireAuth();
    
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.autopilotLog.findMany({
      where: {
        workspaceId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
    });

    const byAgent = logs.reduce((acc, log) => {
      const existing = acc.find(a => a.agent === log.agentType);
      if (existing) {
        existing.count++;
        existing.credits += log.creditsUsed;
      } else {
        acc.push({ agent: log.agentType, count: 1, credits: log.creditsUsed });
      }
      return acc;
    }, [] as { agent: string; count: number; credits: number }[]);

    return {
      success: true,
      data: {
        totalActions: logs.length,
        successfulActions: logs.filter(l => l.status === "success").length,
        failedActions: logs.filter(l => l.status === "failed").length,
        creditsUsed: logs.reduce((sum, l) => sum + l.creditsUsed, 0),
        byAgent,
        lastRun: logs[0]?.createdAt || null,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
