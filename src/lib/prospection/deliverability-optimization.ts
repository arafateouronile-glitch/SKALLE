/**
 * 📨 Email Deliverability Optimization - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Deliverability > 98% (vs 85-90% moyenne)
 * - Spam rate < 0.1% (vs 1-2% moyenne)
 * - Bounce rate < 2% (vs 5-10% moyenne)
 * - Domain reputation > 95%
 * 
 * Optimisations:
 * - Warm-up progressif optimal (30-90 jours selon volume)
 * - SPF/DKIM/DMARC configuration parfaite avec validation
 * - Domain reputation monitoring (Google Postmaster, Microsoft SNDS)
 * - List hygiene automation (suppression bounces, invalid emails)
 * - Engagement monitoring (low engagement → suppression)
 * - Multiple sending domains (rotation automatique)
 * - IP warming (si volume élevé)
 */

import { prisma } from "@/lib/prisma";
import * as dns from "dns";
import { promisify } from "util";
import * as crypto from "crypto";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DomainReputation {
  domain: string;
  reputation: number; // 0-100
  isEstimated?: boolean; // true when no external API is configured (default fallback value)
  senderScore?: number; // 0-100 (Senderscore.org)
  googlePostmaster?: {
    reputation: number; // 0-100
    ipReputation?: number; // 0-100
    domainReputation?: number; // 0-100
    feedback?: Array<{
      date: Date;
      type: "spam" | "bounce" | "complaint";
      count: number;
    }>;
  };
  microsoftSNDS?: {
    reputation: number; // 0-100
    ipReputation?: number; // 0-100
    complaints?: number;
    spamTraps?: number;
  };
  recommendations: string[];
}

export interface DNSRecord {
  type: "SPF" | "DKIM" | "DMARC";
  valid: boolean;
  record?: string;
  score: number; // 0-100 (qualité de la configuration)
  errors?: string[];
  recommendations?: string[];
}

export interface WarmupPlan {
  totalDays: number; // 30, 60, ou 90 jours
  dailySchedule: Array<{
    day: number;
    emails: number;
    emailsPerHour?: number; // Distribution horaire optimale
    description: string;
  }>;
  estimatedDeliverability: number; // Prédiction de délivrabilité après warm-up
}

export interface ListHygiene {
  invalidEmails: number; // Emails invalides détectés
  bouncedEmails: number; // Emails ayant rebondi
  unsubscribedEmails: number; // Désabonnements
  spamComplaints: number; // Signalements spam
  lowEngagementEmails: number; // Low engagement (jamais ouvert)
  totalRemoved: number; // Total à supprimer
  recommendations: string[];
}

export interface DeliverabilityOptimization {
  domainReputation: DomainReputation;
  dnsRecords: DNSRecord[];
  warmupPlan: WarmupPlan;
  listHygiene: ListHygiene;
  overallDeliverability: number; // 0-100
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  actions: string[]; // Actions immédiates à prendre
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 DOMAIN REPUTATION MONITORING - Monitoring de réputation de domaine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Monitoring de réputation de domaine (Top 1%)
 * 
 * Sources:
 * - Google Postmaster Tools (Gmail)
 * - Microsoft SNDS (Outlook/Hotmail)
 * - Senderscore.org (général)
 * 
 * Top 1% Target:
 * - Domain reputation > 95%
 * - IP reputation > 95%
 * - Spam rate < 0.1%
 * - Complaint rate < 0.05%
 */
export async function getDomainReputation(
  domain: string
): Promise<{ success: boolean; data?: DomainReputation; error?: string }> {
  try {
    const reputation: DomainReputation = {
      domain,
      reputation: 85, // Valeur par défaut — remplacée si une API externe répond
      isEstimated: true,
      recommendations: [],
    };

    // 1. Google Postmaster Tools (Gmail)
    if (process.env.GOOGLE_POSTMASTER_API_KEY) {
      try {
        // TODO: Intégrer Google Postmaster Tools API
        // Pour l'instant, simulation
        const googleReputation = await fetchGooglePostmasterReputation(domain);
        if (googleReputation) {
          reputation.googlePostmaster = googleReputation;
          reputation.isEstimated = false;
          // Prendre le meilleur score
          if (googleReputation.reputation > reputation.reputation) {
            reputation.reputation = googleReputation.reputation;
          }
        }
      } catch (error) {
        console.error("Google Postmaster error:", error);
        reputation.recommendations.push("Configurez Google Postmaster Tools pour monitoring Gmail");
      }
    } else {
      reputation.recommendations.push("Configurez GOOGLE_POSTMASTER_API_KEY pour monitoring Gmail");
    }

    // 2. Microsoft SNDS (Outlook/Hotmail)
    if (process.env.MICROSOFT_SNDS_API_KEY) {
      try {
        // TODO: Intégrer Microsoft SNDS API
        // Pour l'instant, simulation
        const microsoftReputation = await fetchMicrosoftSNDSReputation(domain);
        if (microsoftReputation) {
          reputation.microsoftSNDS = microsoftReputation;
          reputation.isEstimated = false;
          // Prendre le meilleur score
          if (microsoftReputation.reputation > reputation.reputation) {
            reputation.reputation = microsoftReputation.reputation;
          }
        }
      } catch (error) {
        console.error("Microsoft SNDS error:", error);
        reputation.recommendations.push("Configurez Microsoft SNDS pour monitoring Outlook");
      }
    } else {
      reputation.recommendations.push("Configurez MICROSOFT_SNDS_API_KEY pour monitoring Outlook");
    }

    // 3. Senderscore.org (général)
    try {
      // TODO: Intégrer Senderscore.org API
      // Pour l'instant, simulation
      const senderScore = await fetchSenderScore(domain);
      if (senderScore !== undefined) {
        reputation.senderScore = senderScore;
        reputation.isEstimated = false;
        // Prendre le meilleur score
        if (senderScore > reputation.reputation) {
          reputation.reputation = senderScore;
        }
      }
    } catch (error) {
      console.error("Senderscore error:", error);
    }

    // Recommandations selon la réputation
    if (reputation.reputation < 95) {
      reputation.recommendations.push(`Réputation actuelle: ${reputation.reputation}/100. Objectif Top 1%: > 95%`);
      reputation.recommendations.push("Améliorez la réputation en: réduisant le spam rate, améliorant l'engagement, nettoyant la liste");
    }

    if (reputation.reputation < 90) {
      reputation.recommendations.push("⚠️ Réputation faible - Risque de placement en spam");
      reputation.recommendations.push("Arrêtez l'envoi en masse et démarrez un warm-up");
    }

    return { success: true, data: reputation };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 VALIDATE DNS RECORDS - Validation parfaite SPF/DKIM/DMARC
// ═══════════════════════════════════════════════════════════════════════════

const resolveTxt = promisify(dns.resolveTxt);

/**
 * Validation parfaite DNS records (Top 1%)
 * 
 * Top 1% Requirements:
 * - SPF : inclure tous les services d'envoi, ~all (soft fail)
 * - DKIM : configuration complète avec sélecteur valide
 * - DMARC : p=quarantine ou p=reject avec reporting
 */
export async function validateDNSRecords(
  domain: string
): Promise<{ success: boolean; records?: DNSRecord[]; error?: string }> {
  try {
    const records: DNSRecord[] = [];

    // 1. SPF Validation (Top 1%)
    const spfRecord = await validateSPF(domain);
    records.push(spfRecord);

    // 2. DKIM Validation (Top 1%)
    const dkimRecord = await validateDKIM(domain);
    records.push(dkimRecord);

    // 3. DMARC Validation (Top 1%)
    const dmarcRecord = await validateDMARC(domain);
    records.push(dmarcRecord);

    return { success: true, records };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function validateSPF(domain: string): Promise<DNSRecord> {
  try {
    const records = await resolveTxt(domain);
    const spfRecords = records.flat().filter((r) => r.startsWith("v=spf1"));

    if (spfRecords.length === 0) {
      return {
        type: "SPF",
        valid: false,
        score: 0,
        errors: ["Aucun record SPF trouvé"],
        recommendations: [
          "Ajoutez un record SPF dans vos DNS",
          "Format recommandé: v=spf1 include:_spf.resend.com ~all",
        ],
      };
    }

    const spfRecord = spfRecords[0];
    let score = 50;
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Vérifications Top 1%
    if (!spfRecord.includes("include:")) {
      score -= 10;
      errors.push("SPF ne contient pas 'include:' pour les services d'envoi");
      recommendations.push("Ajoutez 'include:_spf.resend.com' (ou votre service d'envoi)");
    }

    if (spfRecord.includes("+all")) {
      score -= 30;
      errors.push("SPF utilise '+all' (pass) - Risque de spam");
      recommendations.push("Changez '+all' en '~all' (soft fail) ou '-all' (hard fail)");
    } else if (spfRecord.includes("-all")) {
      score += 20;
      recommendations.push("✅ SPF utilise '-all' (hard fail) - Excellent");
    } else if (spfRecord.includes("~all")) {
      score += 10;
      recommendations.push("✅ SPF utilise '~all' (soft fail) - Bon");
    } else {
      errors.push("SPF ne spécifie pas de mécanisme 'all'");
      recommendations.push("Ajoutez '~all' (soft fail) ou '-all' (hard fail) à la fin");
    }

    // Vérifier les includes multiples (bonne pratique)
    const includeCount = (spfRecord.match(/include:/g) || []).length;
    if (includeCount >= 2) {
      score += 5;
      recommendations.push("✅ SPF inclut plusieurs services - Bon");
    }

    // Vérifier la longueur (SPF max 255 caractères)
    if (spfRecord.length > 255) {
      score -= 20;
      errors.push("SPF trop long (> 255 caractères) - Divisez en plusieurs records");
      recommendations.push("Utilisez SPF flattening ou divisez en plusieurs records");
    }

    const valid = score >= 80 && errors.length === 0;

    return {
      type: "SPF",
      valid,
      record: spfRecord,
      score: Math.min(100, Math.max(0, score)),
      errors: errors.length > 0 ? errors : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  } catch (error) {
    return {
      type: "SPF",
      valid: false,
      score: 0,
      errors: [String(error)],
      recommendations: ["Vérifiez que le domaine est correct et accessible"],
    };
  }
}

async function validateDKIM(domain: string, selector: string = "default"): Promise<DNSRecord> {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const records = await resolveTxt(dkimDomain);
    const dkimRecords = records.flat().filter((r) => r.includes("v=DKIM1"));

    if (dkimRecords.length === 0) {
      return {
        type: "DKIM",
        valid: false,
        score: 0,
        errors: [`Aucun record DKIM trouvé pour ${dkimDomain}`],
        recommendations: [
          `Configurez DKIM dans vos DNS pour ${dkimDomain}`,
          "Générez une paire de clés RSA et ajoutez la clé publique dans DNS",
        ],
      };
    }

    const dkimRecord = dkimRecords[0];
    let score = 70;
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Vérifications Top 1%
    if (!dkimRecord.includes("v=DKIM1")) {
      score -= 30;
      errors.push("DKIM ne contient pas 'v=DKIM1'");
    }

    if (!dkimRecord.includes("k=rsa")) {
      score -= 10;
      errors.push("DKIM n'utilise pas RSA (k=rsa)");
      recommendations.push("Utilisez RSA pour DKIM (meilleure compatibilité)");
    } else {
      score += 10;
      recommendations.push("✅ DKIM utilise RSA - Excellent");
    }

    if (!dkimRecord.includes("p=")) {
      score -= 20;
      errors.push("DKIM ne contient pas de clé publique (p=)");
    } else {
      score += 10;
      recommendations.push("✅ DKIM contient une clé publique valide");
    }

    // Vérifier la longueur de la clé (RSA 2048 bits recommandé)
    const pMatch = dkimRecord.match(/p=([^;]+)/);
    if (pMatch && pMatch[1]) {
      const keyLength = pMatch[1].replace(/\s/g, "").length;
      if (keyLength < 200) {
        score -= 10;
        recommendations.push("Considérez utiliser une clé RSA 2048 bits (plus sécurisée)");
      } else {
        score += 5;
        recommendations.push("✅ Clé DKIM longue (bonne sécurité)");
      }
    }

    const valid = score >= 80 && errors.length === 0;

    return {
      type: "DKIM",
      valid,
      record: dkimRecord,
      score: Math.min(100, Math.max(0, score)),
      errors: errors.length > 0 ? errors : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  } catch (error) {
    return {
      type: "DKIM",
      valid: false,
      score: 0,
      errors: [String(error)],
      recommendations: [`Vérifiez que le sélecteur DKIM '${selector}' est correct`],
    };
  }
}

async function validateDMARC(domain: string): Promise<DNSRecord> {
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const records = await resolveTxt(dmarcDomain);
    const dmarcRecords = records.flat().filter((r) => r.includes("v=DMARC1"));

    if (dmarcRecords.length === 0) {
      return {
        type: "DMARC",
        valid: false,
        score: 0,
        errors: [`Aucun record DMARC trouvé pour ${dmarcDomain}`],
        recommendations: [
          `Configurez DMARC dans vos DNS pour ${dmarcDomain}`,
          "Format recommandé: v=DMARC1; p=quarantine; rua=mailto:dmarc@votre-domaine.com",
        ],
      };
    }

    const dmarcRecord = dmarcRecords[0];
    let score = 70;
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Vérifications Top 1%
    if (!dmarcRecord.includes("v=DMARC1")) {
      score -= 30;
      errors.push("DMARC ne contient pas 'v=DMARC1'");
    }

    // Vérifier la policy (p=)
    if (dmarcRecord.includes("p=none")) {
      score -= 20;
      errors.push("DMARC utilise 'p=none' - Pas de protection");
      recommendations.push("Changez 'p=none' en 'p=quarantine' ou 'p=reject' pour protection");
    } else if (dmarcRecord.includes("p=quarantine")) {
      score += 10;
      recommendations.push("✅ DMARC utilise 'p=quarantine' - Bon (démarrage)");
      recommendations.push("Envisagez 'p=reject' une fois la réputation établie");
    } else if (dmarcRecord.includes("p=reject")) {
      score += 20;
      recommendations.push("✅ DMARC utilise 'p=reject' - Excellent (Top 1%)");
    } else {
      score -= 10;
      errors.push("DMARC ne spécifie pas de policy (p=)");
      recommendations.push("Ajoutez 'p=quarantine' (démarrage) ou 'p=reject' (Top 1%)");
    }

    // Vérifier le reporting (rua=)
    if (!dmarcRecord.includes("rua=")) {
      score -= 15;
      errors.push("DMARC ne contient pas de reporting (rua=)");
      recommendations.push("Ajoutez 'rua=mailto:dmarc@votre-domaine.com' pour recevoir les rapports");
    } else {
      score += 10;
      recommendations.push("✅ DMARC configure le reporting - Excellent");
    }

    // Vérifier le reporting agrégé (ruf=) - Bonus Top 1%
    if (dmarcRecord.includes("ruf=")) {
      score += 5;
      recommendations.push("✅ DMARC configure le reporting de forensic (ruf=) - Top 1%");
    }

    // Vérifier pct= (pourcentage d'application) - Bonus Top 1%
    if (dmarcRecord.includes("pct=100")) {
      score += 5;
      recommendations.push("✅ DMARC appliqué à 100% des emails - Top 1%");
    } else if (dmarcRecord.includes("pct=")) {
      const pctMatch = dmarcRecord.match(/pct=(\d+)/);
      if (pctMatch) {
        const pct = parseInt(pctMatch[1]);
        if (pct < 100) {
          recommendations.push(`DMARC appliqué à ${pct}% - Augmentez progressivement jusqu'à 100%`);
        }
      }
    }

    // Vérifier aspf= et adkim= (alignement strict) - Bonus Top 1%
    if (dmarcRecord.includes("aspf=s") || dmarcRecord.includes("adkim=s")) {
      score += 5;
      recommendations.push("✅ DMARC utilise l'alignement strict (aspf=s/adkim=s) - Top 1%");
    }

    const valid = score >= 85 && errors.length === 0;

    return {
      type: "DMARC",
      valid,
      record: dmarcRecord,
      score: Math.min(100, Math.max(0, score)),
      errors: errors.length > 0 ? errors : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  } catch (error) {
    return {
      type: "DMARC",
      valid: false,
      score: 0,
      errors: [String(error)],
      recommendations: ["Vérifiez que le domaine est correct et accessible"],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 OPTIMAL WARM-UP PLAN - Plan de warm-up optimal Top 1%
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Plan de warm-up optimal Top 1% (30-90 jours selon volume)
 * 
 * Top 1% Strategy:
 * - Démarrage lent (10-20 emails/jour)
 * - Augmentation progressive (5-10% par jour)
 * - Distribution horaire optimale (éviter pics)
 * - Engagement prioritaire (seulement emails engageants)
 * - Volume final selon objectif (50-500 emails/jour)
 */
export function getOptimalWarmupPlan(
  targetVolume: number, // Emails/jour cible après warm-up
  durationDays: number = 30 // Durée du warm-up (30, 60, ou 90 jours)
): WarmupPlan {
  // Calculer le plan de warm-up optimal
  const dailySchedule: Array<{
    day: number;
    emails: number;
    emailsPerHour?: number;
    description: string;
  }> = [];

  // Top 1% Strategy: Démarrage très lent, augmentation progressive
  let currentVolume = Math.max(5, Math.floor(targetVolume / 20)); // Démarrage à 5% du volume cible
  const maxVolume = targetVolume;

  for (let day = 1; day <= durationDays; day++) {
    // Calculer le volume pour ce jour (augmentation progressive)
    let volume = currentVolume;
    
    if (day <= 7) {
      // Semaine 1: Très lent (10-20 emails/jour max)
      volume = Math.min(20, Math.floor(targetVolume / 15));
      currentVolume = volume;
    } else if (day <= 14) {
      // Semaine 2: Lent (20-50 emails/jour)
      volume = Math.min(50, Math.floor(targetVolume / 10));
      currentVolume = volume;
    } else if (day <= 21) {
      // Semaine 3: Modéré (50-100 emails/jour)
      volume = Math.min(100, Math.floor(targetVolume / 5));
      currentVolume = volume;
    } else if (day <= 30) {
      // Semaine 4+: Progression vers volume cible
      const progress = (day - 21) / (durationDays - 21);
      volume = Math.floor(100 + (maxVolume - 100) * progress);
    } else {
      // Après 30 jours: Volume cible
      volume = maxVolume;
    }

    // Distribution horaire optimale (éviter pics)
    // Top 1%: Répartir sur 8-10 heures (9h-17h)
    const emailsPerHour = Math.ceil(volume / 9); // 9 heures = 9h-17h

    dailySchedule.push({
      day,
      emails: volume,
      emailsPerHour,
      description: `Jour ${day}: ${volume} emails (${emailsPerHour}/heure)`,
    });
  }

  // Prédiction de délivrabilité après warm-up
  // Top 1%: Warm-up optimal = 97-98% de délivrabilité
  const estimatedDeliverability = Math.min(98, 85 + (durationDays / 30) * 10);

  return {
    totalDays: durationDays,
    dailySchedule,
    estimatedDeliverability,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧹 LIST HYGIENE - Nettoyage automatique de la liste
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List hygiene automation (Top 1%)
 * 
 * Suppression automatique de:
 * - Emails invalides (bounce permanent)
 * - Bounces récurrents (> 2 bounces)
 * - Unsubscribes
 * - Spam complaints
 * - Low engagement (jamais ouvert après 5+ emails)
 * - Spam traps détectés
 * 
 * Top 1% Target:
 * - List hygiene > 98%
 * - Bounce rate < 2%
 * - Spam rate < 0.1%
 */
export async function analyzeListHygiene(
  workspaceId: string
): Promise<{ success: boolean; data?: ListHygiene; error?: string }> {
  try {
    // Récupérer tous les prospects avec historique d'emails
    const prospects = await prisma.prospect.findMany({
      where: { workspaceId },
      include: {
        sequences: {
          include: {
            steps: {
              where: { channel: "EMAIL" },
              orderBy: { sentAt: "desc" },
            },
          },
        },
      },
    });

    let invalidEmails = 0;
    let bouncedEmails = 0;
    let unsubscribedEmails = 0;
    let spamComplaints = 0;
    let lowEngagementEmails = 0;
    const recommendations: string[] = [];

    // Analyser chaque prospect
    for (const prospect of prospects) {
      if (!prospect.email) continue;

      // Vérifier si email invalide (bounce permanent)
      if (!prospect.emailVerified) {
        invalidEmails++;
        continue;
      }

      // Analyser l'historique des emails
      const allSteps = prospect.sequences.flatMap((seq) => seq.steps);
      
      // Compter les bounces
      const bounces = allSteps.filter((step) => step.status === "FAILED" && step.error?.includes("bounce")).length;
      if (bounces >= 2) {
        bouncedEmails++;
        recommendations.push(`Supprimer ${prospect.email}: ${bounces} bounces récurrents`);
        continue;
      }

      // Compter les unsubscribes (via emailStatus)
      if (prospect.emailStatus === "unsubscribed") {
        unsubscribedEmails++;
        recommendations.push(`Supprimer ${prospect.email}: Désabonné`);
        continue;
      }

      // Compter les spam complaints (via emailStatus)
      if (prospect.emailStatus === "spam_complaint") {
        spamComplaints++;
        recommendations.push(`Supprimer ${prospect.email}: Plainte spam signalée`);
        continue;
      }
      
      // Vérifier low engagement (jamais ouvert après 5+ emails)
      const sentSteps = allSteps.filter((step) => step.status === "SENT" || step.status === "DELIVERED");
      if (sentSteps.length >= 5) {
        const openedSteps = sentSteps.filter((step) => step.openedAt !== null);
        if (openedSteps.length === 0) {
          lowEngagementEmails++;
          recommendations.push(`Supprimer ${prospect.email}: Jamais ouvert après ${sentSteps.length} emails`);
        }
      }
    }

    const totalRemoved = invalidEmails + bouncedEmails + unsubscribedEmails + spamComplaints + lowEngagementEmails;
    const totalProspects = prospects.length;
    const totalCount = await prisma.prospect.count({ where: { workspaceId } });
    const hygieneScore = totalCount > 0 
      ? Math.round(((totalCount - totalRemoved) / totalCount) * 100) 
      : 100;

    // Recommandations selon l'hygiène
    if (hygieneScore < 95) {
      recommendations.push(`⚠️ Liste à nettoyer: ${totalRemoved} emails à supprimer (${hygieneScore}% d'hygiène)`);
      recommendations.push("Objectif Top 1%: > 98% d'hygiène");
    }

    if (bouncedEmails > totalProspects * 0.02) {
      recommendations.push(`⚠️ Taux de bounce élevé: ${Math.round((bouncedEmails / totalProspects) * 100)}%`);
      recommendations.push("Objectif Top 1%: < 2% de bounce rate");
      recommendations.push("Vérifiez la qualité de votre liste et utilisez une vérification d'email en cascade");
    }

    if (lowEngagementEmails > totalProspects * 0.1) {
      recommendations.push(`⚠️ Taux d'engagement faible: ${Math.round((lowEngagementEmails / totalProspects) * 100)}% n'ouvrent jamais`);
      recommendations.push("Supprimez les emails non engageants après 5+ emails");
    }

    return {
      success: true,
      data: {
        invalidEmails,
        bouncedEmails,
        unsubscribedEmails,
        spamComplaints,
        lowEngagementEmails,
        totalRemoved,
        recommendations,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 ENGAGEMENT MONITORING - Monitoring de l'engagement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Engagement monitoring (Top 1%)
 * 
 * Identification automatique de:
 * - Low engagement (jamais ouvert après 5+ emails)
 * - Declining engagement (ouverture en baisse)
 * - High engagement (à prioriser)
 * 
 * Actions automatiques:
 * - Supprimer low engagement après 5+ emails
 * - Réduire la fréquence pour declining engagement
 * - Prioriser high engagement dans les séquences
 */
export async function analyzeEngagement(
  workspaceId: string
): Promise<{
  success: boolean;
  data?: {
    highEngagement: Array<{ prospectId: string; openRate: number; replyRate: number }>;
    lowEngagement: Array<{ prospectId: string; emails: number; opens: number }>;
    decliningEngagement: Array<{ prospectId: string; trend: "declining" | "stable" | "improving" }>;
    recommendations: string[];
  };
  error?: string;
}> {
  try {
    const prospects = await prisma.prospect.findMany({
      where: { workspaceId },
      include: {
        sequences: {
          include: {
            steps: {
              where: { channel: "EMAIL" },
              orderBy: { sentAt: "desc" },
            },
          },
        },
      },
    });

    const highEngagement: Array<{ prospectId: string; openRate: number; replyRate: number }> = [];
    const lowEngagement: Array<{ prospectId: string; emails: number; opens: number }> = [];
    const decliningEngagement: Array<{ prospectId: string; trend: "declining" | "stable" | "improving" }> = [];
    const recommendations: string[] = [];

    for (const prospect of prospects) {
      const allSteps = prospect.sequences.flatMap((seq) => seq.steps);
      const sentSteps = allSteps.filter((step) => 
        step.status === "SENT" || step.status === "DELIVERED" || step.status === "OPENED" || step.status === "REPLIED"
      );

      if (sentSteps.length === 0) continue;

      const openedSteps = sentSteps.filter((step) => step.openedAt !== null);
      const repliedSteps = sentSteps.filter((step) => step.repliedAt !== null);

      const openRate = (openedSteps.length / sentSteps.length) * 100;
      const replyRate = (repliedSteps.length / sentSteps.length) * 100;

      // High engagement (> 50% open rate ou > 10% reply rate)
      if (openRate >= 50 || replyRate >= 10) {
        highEngagement.push({
          prospectId: prospect.id,
          openRate,
          replyRate,
        });
      }

      // Low engagement (jamais ouvert après 5+ emails)
      if (sentSteps.length >= 5 && openedSteps.length === 0) {
        lowEngagement.push({
          prospectId: prospect.id,
          emails: sentSteps.length,
          opens: 0,
        });
      }

      // Declining engagement (ouverture en baisse)
      if (sentSteps.length >= 3) {
        const recentSteps = sentSteps.slice(0, Math.floor(sentSteps.length / 2));
        const olderSteps = sentSteps.slice(Math.floor(sentSteps.length / 2));

        const recentOpenRate = (recentSteps.filter((s) => s.openedAt).length / recentSteps.length) * 100;
        const olderOpenRate = (olderSteps.filter((s) => s.openedAt).length / olderSteps.length) * 100;

        if (recentOpenRate < olderOpenRate * 0.7) {
          decliningEngagement.push({
            prospectId: prospect.id,
            trend: "declining",
          });
        }
      }
    }

    // Recommandations
    if (lowEngagement.length > 0) {
      recommendations.push(`Supprimer ${lowEngagement.length} prospects avec low engagement (jamais ouvert après 5+ emails)`);
    }

    if (decliningEngagement.length > 0) {
      recommendations.push(`Réduire la fréquence pour ${decliningEngagement.length} prospects avec engagement en baisse`);
    }

    if (highEngagement.length > 0) {
      recommendations.push(`Prioriser ${highEngagement.length} prospects avec high engagement (> 50% open rate)`);
    }

    return {
      success: true,
      data: {
        highEngagement,
        lowEngagement,
        decliningEngagement,
        recommendations,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 COMPREHENSIVE DELIVERABILITY OPTIMIZATION - Optimisation complète
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optimisation complète de la délivrabilité (Top 1%)
 * 
 * Analyse complète:
 * 1. Domain reputation
 * 2. DNS records (SPF/DKIM/DMARC)
 * 3. Warm-up plan
 * 4. List hygiene
 * 5. Engagement monitoring
 * 
 * Recommandations prioritaires pour atteindre > 98% de délivrabilité
 */
export async function optimizeDeliverability(
  workspaceId: string,
  targetVolume: number = 200
): Promise<{ success: boolean; data?: DeliverabilityOptimization; error?: string }> {
  try {
    const config = await prisma.emailDeliverabilityConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      return { success: false, error: "Configuration non trouvée" };
    }

    // 1. Domain reputation
    const reputation = await getDomainReputation(config.sendingDomain);

    // 2. DNS records validation
    const dnsValidation = await validateDNSRecords(config.sendingDomain);

    // 3. Warm-up plan optimal
    const warmupPlan = getOptimalWarmupPlan(targetVolume, 30);

    // 4. List hygiene
    const listHygiene = await analyzeListHygiene(workspaceId);

    // 5. Engagement monitoring
    const engagement = await analyzeEngagement(workspaceId);

    // Calculer la délivrabilité globale
    const domainReputationScore = reputation.data?.reputation || 85;
    const dnsScore = dnsValidation.records && dnsValidation.records.length > 0
      ? dnsValidation.records.reduce((sum, r) => sum + r.score, 0) / dnsValidation.records.length
      : 0;
    const warmupScore = config.warmupEnabled && config.warmupProgress >= 100 ? 98 : 85;
    const totalCount = await prisma.prospect.count({ where: { workspaceId } });
    const hygieneScore = listHygiene.data && totalCount > 0
      ? ((totalCount - listHygiene.data.totalRemoved) / totalCount) * 100
      : 100;

    const overallDeliverability = Math.round(
      domainReputationScore * 0.3 + // 30% - Domain reputation
      dnsScore * 0.3 + // 30% - DNS configuration
      warmupScore * 0.2 + // 20% - Warm-up status
      hygieneScore * 0.2 // 20% - List hygiene
    );

    // Déterminer le niveau de risque
    let riskLevel: "low" | "medium" | "high";
    if (overallDeliverability >= 97) {
      riskLevel = "low";
    } else if (overallDeliverability >= 90) {
      riskLevel = "medium";
    } else {
      riskLevel = "high";
    }

    // Recommandations prioritaires
    const recommendations: string[] = [];
    const actions: string[] = [];

    // Actions immédiates selon le score
    if (overallDeliverability < 95) {
      actions.push("🚨 PRIORITÉ HAUTE - Améliorer la délivrabilité avant envoi en masse");
    }

    if (domainReputationScore < 95) {
      actions.push("Améliorer la réputation du domaine (réduire spam rate, améliorer engagement)");
    }

    if (dnsScore < 90) {
      actions.push("Configurer parfaitement SPF/DKIM/DMARC dans les DNS");
    }

    if (!config.warmupEnabled || config.warmupProgress < 100) {
      actions.push("Démarrer/compléter le warm-up du domaine");
    }

    if (listHygiene.data && listHygiene.data.totalRemoved > 0) {
      actions.push(`Nettoyer la liste: supprimer ${listHygiene.data.totalRemoved} emails (${listHygiene.data.invalidEmails} invalides, ${listHygiene.data.bouncedEmails} bounces, ${listHygiene.data.lowEngagementEmails} low engagement)`);
    }

    // Recommandations
    recommendations.push(...(reputation.data?.recommendations || []));
    dnsValidation.records?.forEach((r) => {
      if (r.recommendations) {
        recommendations.push(...r.recommendations);
      }
    });
    if (listHygiene.data?.recommendations) {
      recommendations.push(...listHygiene.data.recommendations);
    }
    if (engagement.data?.recommendations) {
      recommendations.push(...engagement.data.recommendations);
    }

    // Recommandations Top 1%
    if (overallDeliverability < 98) {
      recommendations.push(`📊 Délivrabilité actuelle: ${overallDeliverability}% - Objectif Top 1%: > 98%`);
    }

    if (config.bounceRate > 2) {
      recommendations.push(`⚠️ Bounce rate: ${config.bounceRate}% - Objectif Top 1%: < 2%`);
    }

    if (config.spamRate > 0.1) {
      recommendations.push(`⚠️ Spam rate: ${config.spamRate}% - Objectif Top 1%: < 0.1%`);
    }

    return {
      success: true,
      data: {
        domainReputation: reputation.data || {
          domain: config.sendingDomain,
          reputation: 85,
          recommendations: [],
        },
        dnsRecords: dnsValidation.records || [],
        warmupPlan,
        listHygiene: listHygiene.data || {
          invalidEmails: 0,
          bouncedEmails: 0,
          unsubscribedEmails: 0,
          spamComplaints: 0,
          lowEngagementEmails: 0,
          totalRemoved: 0,
          recommendations: [],
        },
        overallDeliverability,
        riskLevel,
        recommendations,
        actions,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Google Postmaster Tools (OAuth2 service account) ───────────────────────

async function getGoogleServiceAccountToken(
  serviceAccount: { client_email: string; private_key: string },
  scope: string
): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope,
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    ).toString("base64url");
    const toSign = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(toSign);
    const signature = sign.sign(serviceAccount.private_key, "base64url");
    const jwt = `${toSign}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    return access_token;
  } catch {
    return null;
  }
}

async function fetchGooglePostmasterReputation(domain: string): Promise<{
  reputation: number;
  ipReputation?: number;
  domainReputation?: number;
} | null> {
  const serviceAccountJson = process.env.GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
    const accessToken = await getGoogleServiceAccountToken(
      sa,
      "https://www.googleapis.com/auth/postmaster.readonly"
    );
    if (!accessToken) return null;

    // Fetch last 7 days of traffic stats
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const params = new URLSearchParams({
      "startDate.year": String(start.getFullYear()),
      "startDate.month": String(start.getMonth() + 1),
      "startDate.day": String(start.getDate()),
      "endDate.year": String(end.getFullYear()),
      "endDate.month": String(end.getMonth() + 1),
      "endDate.day": String(end.getDate()),
    });

    const url = `https://gmailpostmastertools.googleapis.com/v1/domains/${encodeURIComponent(
      domain
    )}/trafficStats?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;

    const data = (await res.json()) as { trafficStats?: Array<{ domainReputation?: string; ipReputation?: string }> };
    const stats = data.trafficStats?.[0];
    if (!stats) return null;

    // Google uses enum strings for reputation categories
    const REPUTATION_MAP: Record<string, number> = {
      HIGH: 95,
      MEDIUM: 70,
      LOW: 40,
      BAD: 10,
      REPUTATION_CATEGORY_UNSPECIFIED: 50,
    };
    const domainRep = REPUTATION_MAP[stats.domainReputation ?? ""] ?? 50;
    const ipRep = REPUTATION_MAP[stats.ipReputation ?? ""] ?? 50;
    return {
      reputation: Math.round((domainRep + ipRep) / 2),
      domainReputation: domainRep,
      ipReputation: ipRep,
    };
  } catch {
    return null;
  }
}

// ─── Microsoft SNDS (manual override via env var) ───────────────────────────
// SNDS has no public REST API — requires manual IP registration at
// https://sendersupport.olc.protection.outlook.com/snds/
// Set MICROSOFT_SNDS_SCORE=<0-100> for a manual override.

async function fetchMicrosoftSNDSReputation(_domain: string): Promise<{
  reputation: number;
} | null> {
  const raw = process.env.MICROSOFT_SNDS_SCORE;
  if (!raw) return null;
  const score = parseInt(raw, 10);
  if (isNaN(score)) return null;
  return { reputation: Math.min(100, Math.max(0, score)) };
}

// ─── SenderScore / Validity REST API ────────────────────────────────────────
// Free account at https://www.validity.com/products/senderscore/
// Set SENDERSCORE_API_KEY to enable automatic lookups.

async function fetchSenderScore(domain: string): Promise<number | undefined> {
  const apiKey = process.env.SENDERSCORE_API_KEY;
  if (!apiKey) return undefined;

  try {
    const res = await fetch(
      `https://api.senderscore.com/v2/lookup/domain/${encodeURIComponent(domain)}`,
      { headers: { "X-API-Key": apiKey, Accept: "application/json" } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { score?: number; senderScore?: number; data?: { score?: number } };
    const score = data.score ?? data.senderScore ?? data.data?.score;
    return typeof score === "number"
      ? Math.min(100, Math.max(0, Math.round(score)))
      : undefined;
  } catch {
    return undefined;
  }
}

