/**
 * 📨 Email Deliverability - Délivrabilité Email
 * 
 * Gestion de la délivrabilité email:
 * - Vérification SPF/DKIM/DMARC
 * - Warm-up automatique
 * - Gestion des bounces
 * - Tracking de performance
 */

import { prisma } from "@/lib/prisma";
import {
  validateDNSRecords,
  getOptimalWarmupPlan,
  analyzeListHygiene,
  analyzeEngagement,
  optimizeDeliverability,
  getDomainReputation,
} from "./deliverability-optimization";

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CHECK SPF/DKIM/DMARC - Vérifier la configuration DNS
// ═══════════════════════════════════════════════════════════════════════════

export interface DNSRecords {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  spfRecord?: string;
  dkimRecord?: string;
  dmarcRecord?: string;
  errors?: string[];
}

export async function checkDNSRecords(
  domain: string
): Promise<{ success: boolean; data?: DNSRecords; error?: string }> {
  try {
    // Utiliser la validation optimisée Top 1%
    const validation = await validateDNSRecords(domain);

    if (!validation.success || !validation.records) {
      return { success: false, error: validation.error || "Erreur de validation DNS" };
    }

    const records = validation.records;
    const spfRecord = records.find((r) => r.type === "SPF");
    const dkimRecord = records.find((r) => r.type === "DKIM");
    const dmarcRecord = records.find((r) => r.type === "DMARC");

    const dnsRecords: DNSRecords = {
      spf: spfRecord?.valid || false,
      dkim: dkimRecord?.valid || false,
      dmarc: dmarcRecord?.valid || false,
      spfRecord: spfRecord?.record,
      dkimRecord: dkimRecord?.record,
      dmarcRecord: dmarcRecord?.record,
      errors: [
        ...(spfRecord?.errors || []),
        ...(dkimRecord?.errors || []),
        ...(dmarcRecord?.errors || []),
      ],
    };

    return { success: true, data: dnsRecords };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CHECK SPF - Vérifier SPF
// ═══════════════════════════════════════════════════════════════════════════

async function checkSPF(domain: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    // Récupérer le record SPF via DNS TXT
    // En production, utiliser une librairie DNS comme `dns` de Node.js
    // ou un service externe comme https://mxtoolbox.com/api/
    
    // Simulation - en production, faire une vraie requête DNS
    const spfRecord = `v=spf1 include:_spf.resend.com ~all`;
    
    const valid = spfRecord.includes("v=spf1");
    
    return { valid, record: spfRecord };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CHECK DKIM - Vérifier DKIM
// ═══════════════════════════════════════════════════════════════════════════

async function checkDKIM(
  domain: string,
  selector: string = "default"
): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    // Récupérer le record DKIM via DNS TXT
    // Format: {selector}._domainkey.{domain}
    // En production, faire une vraie requête DNS
    
    // Simulation - en production, faire une vraie requête DNS
    const dkimRecord = `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3...`;
    
    const valid = dkimRecord.includes("v=DKIM1");
    
    return { valid, record: dkimRecord };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CHECK DMARC - Vérifier DMARC
// ═══════════════════════════════════════════════════════════════════════════

async function checkDMARC(domain: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    // Récupérer le record DMARC via DNS TXT
    // Format: _dmarc.{domain}
    // En production, faire une vraie requête DNS
    
    // Simulation - en production, faire une vraie requête DNS
    const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`;
    
    const valid = dmarcRecord.includes("v=DMARC1");
    
    return { valid, record: dmarcRecord };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 WARM-UP - Warm-up automatique d'un domaine
// ═══════════════════════════════════════════════════════════════════════════

export interface WarmupSchedule {
  day: number;
  emails: number;
  description: string;
}

export function getWarmupSchedule(targetVolume: number = 200): WarmupSchedule[] {
  // Plan de warm-up optimal Top 1% (30 jours par défaut)
  const warmupPlan = getOptimalWarmupPlan(targetVolume, 30);
  return warmupPlan.dailySchedule.map((s) => ({
    day: s.day,
    emails: s.emails,
    description: s.description,
  }));
}

export async function updateWarmupProgress(
  workspaceId: string,
  emailsSentToday: number
): Promise<{ success: boolean; progress?: number; error?: string }> {
  try {
    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    if (!config.warmupEnabled) {
      return { success: true, progress: 100 };
    }

    // Calculer le jour de warm-up (depuis lastResetDate)
    const daysSinceStart = Math.floor(
      (Date.now() - config.lastResetDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const schedule = getWarmupSchedule();
    const currentDaySchedule = schedule.find((s) => s.day === daysSinceStart + 1);
    
    const targetEmails = currentDaySchedule?.emails || 200;
    const progress = Math.min(Math.round((emailsSentToday / targetEmails) * 100), 100);

    // Mettre à jour la progression
    await prisma.emailDeliverabilityConfig.update({
      where: { workspaceId },
      data: {
        warmupProgress: progress,
        currentDailySent: emailsSentToday,
      },
    });

    return { success: true, progress };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TRACK METRICS - Suivre les métriques de performance
// ═══════════════════════════════════════════════════════════════════════════

export async function trackEmailMetrics(
  workspaceId: string,
  event: "sent" | "delivered" | "bounced" | "opened" | "clicked" | "replied" | "spam"
): Promise<void> {
  try {
    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) return;

    // Compter les événements aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // En production, utiliser une table séparée pour les métriques
    // Pour l'instant, on met à jour directement la config
    
    const updates: Partial<{ bounceRate: number; openRate: number; replyRate: number; spamRate: number }> = {};

    // Base commune : tous les steps email traités (hors PENDING/SKIPPED)
    const totalProcessed = await prisma.sequenceStep.count({
      where: {
        sequence: { workspaceId },
        channel: "EMAIL",
        status: { notIn: ["PENDING", "SKIPPED"] },
      },
    });

    switch (event) {
      case "bounced": {
        const bounced = await prisma.sequenceStep.count({
          where: {
            sequence: { workspaceId },
            channel: "EMAIL",
            status: "FAILED",
            error: { contains: "bounce" },
          },
        });
        updates.bounceRate = totalProcessed > 0 ? Math.round((bounced / totalProcessed) * 10000) / 100 : 0;
        break;
      }
      case "opened": {
        const opened = await prisma.sequenceStep.count({
          where: {
            sequence: { workspaceId },
            channel: "EMAIL",
            openedAt: { not: null },
          },
        });
        updates.openRate = totalProcessed > 0 ? Math.round((opened / totalProcessed) * 10000) / 100 : 0;
        break;
      }
      case "replied": {
        const replied = await prisma.sequenceStep.count({
          where: {
            sequence: { workspaceId },
            channel: "EMAIL",
            repliedAt: { not: null },
          },
        });
        updates.replyRate = totalProcessed > 0 ? Math.round((replied / totalProcessed) * 10000) / 100 : 0;
        break;
      }
      case "spam": {
        const spam = await prisma.sequenceStep.count({
          where: {
            sequence: { workspaceId },
            channel: "EMAIL",
            status: "FAILED",
            error: { contains: "spam" },
          },
        });
        updates.spamRate = totalProcessed > 0 ? Math.round((spam / totalProcessed) * 10000) / 100 : 0;
        break;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.emailDeliverabilityConfig.update({
        where: { workspaceId },
        data: updates,
      });
    }
  } catch (error) {
    console.error("Track email metrics error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ VERIFY DELIVERABILITY - Vérifier la délivrabilité complète
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyDeliverability(
  workspaceId: string
): Promise<{
  success: boolean;
  data?: {
    spfConfigured: boolean;
    dkimConfigured: boolean;
    dmarcConfigured: boolean;
    warmupProgress: number;
    recommendations: string[];
  };
  error?: string;
}> {
  try {
    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // Vérifier DNS records
    const dnsCheck = await checkDNSRecords(config.sendingDomain);

    const recommendations: string[] = [];

    if (!config.spfConfigured || !dnsCheck.data?.spf) {
      recommendations.push("Configurez SPF dans vos DNS");
    }
    if (!config.dkimConfigured || !dnsCheck.data?.dkim) {
      recommendations.push("Configurez DKIM dans vos DNS");
    }
    if (!config.dmarcConfigured || !dnsCheck.data?.dmarc) {
      recommendations.push("Configurez DMARC dans vos DNS");
    }
    if (config.warmupProgress < 100 && config.warmupEnabled) {
      recommendations.push(
        `Warm-up en cours (${config.warmupProgress}%). Continuez le warm-up avant d'envoyer en masse.`
      );
    }
    if (config.bounceRate > 5) {
      recommendations.push(
        `Taux de rebond élevé (${config.bounceRate}%). Vérifiez votre liste d'emails.`
      );
    }
    if (config.spamRate > 1) {
      recommendations.push(
        `Taux de spam élevé (${config.spamRate}%). Améliorez le contenu de vos emails.`
      );
    }

    return {
      success: true,
      data: {
        spfConfigured: config.spfConfigured && (dnsCheck.data?.spf || false),
        dkimConfigured: config.dkimConfigured && (dnsCheck.data?.dkim || false),
        dmarcConfigured: config.dmarcConfigured && (dnsCheck.data?.dmarc || false),
        warmupProgress: config.warmupProgress,
        recommendations,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
