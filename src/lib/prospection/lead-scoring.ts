/**
 * 🎯 Lead Scoring & ICP Matching - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Email verification score > 95%
 * - Lead-to-meeting conversion > 15%
 * - Data accuracy > 98%
 * - Enrichment complet (20+ données par lead)
 * 
 * Optimisations:
 * - ICP scoring automatique (job title, company size, tech stack)
 * - Intent signals (visites site, recherches, engagement)
 * - Lead scoring AI (probabilité de conversion)
 * - Multi-source verification en cascade
 */

import { getOpenAI } from "@/lib/ai/langchain";
import { EnrichedLead } from "./enrichment";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ICPCriteria {
  // Job Title
  targetJobTitles?: string[];
  excludeJobTitles?: string[];
  seniorityLevels?: string[]; // "C-Level", "VP", "Director", "Manager", "Individual Contributor"
  
  // Company
  companySizes?: string[]; // "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
  industries?: string[];
  excludeIndustries?: string[];
  revenueRange?: { min?: number; max?: number };
  fundingStage?: string[]; // "Seed", "Series A", "Series B", "Series C+", "Public"
  
  // Location
  locations?: string[];
  timezone?: string[];
  
  // Tech Stack
  technologies?: string[]; // "Salesforce", "HubSpot", "Stripe", etc.
  
  // Intent Signals
  requireIntentSignals?: boolean;
  minIntentScore?: number; // 0-100
  
  // Engagement
  minLinkedInConnections?: number;
  activeOnLinkedIn?: boolean;
}

export interface LeadScore {
  // Scores individuels (0-100)
  icpFitScore: number; // Match avec ICP
  emailQualityScore: number; // Qualité de l'email (verification + score)
  dataCompletenessScore: number; // Complétude des données (20+ champs)
  intentScore: number; // Signaux d'intention (visites, recherches)
  engagementScore: number; // Engagement LinkedIn/social
  
  // Score global (0-100)
  overallScore: number;
  
  // Probabilité de conversion (0-100)
  conversionProbability: number;
  
  // Ranking (A, B, C, D)
  tier: "A" | "B" | "C" | "D";
  
  // Métadonnées
  strengths: string[]; // Points forts du lead
  weaknesses: string[]; // Points faibles du lead
  recommendations: string[]; // Recommandations d'action
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CALCULATE ICP FIT SCORE - Score de match avec ICP
// ═══════════════════════════════════════════════════════════════════════════

export function calculateICPFitScore(
  lead: EnrichedLead,
  icpCriteria: ICPCriteria
): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 0;
  let maxScore = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // 1. Job Title Match (30 points)
  maxScore += 30;
  if (lead.jobTitle && icpCriteria.targetJobTitles) {
    const jobTitleLower = lead.jobTitle.toLowerCase();
    const isMatch = icpCriteria.targetJobTitles.some((target) =>
      jobTitleLower.includes(target.toLowerCase())
    );
    
    if (isMatch) {
      score += 30;
      strengths.push(`Job title matches ICP: ${lead.jobTitle}`);
    } else if (icpCriteria.excludeJobTitles) {
      const isExcluded = icpCriteria.excludeJobTitles.some((exclude) =>
        jobTitleLower.includes(exclude.toLowerCase())
      );
      if (isExcluded) {
        weaknesses.push(`Job title excluded: ${lead.jobTitle}`);
      }
    }
  }

  // 2. Seniority Level (20 points)
  maxScore += 20;
  if (lead.jobTitle && icpCriteria.seniorityLevels) {
    const jobTitleLower = lead.jobTitle.toLowerCase();
    const seniorityMatch = icpCriteria.seniorityLevels.some((level) => {
      switch (level) {
        case "C-Level":
          return jobTitleLower.includes("ceo") || jobTitleLower.includes("cto") || jobTitleLower.includes("cmo") || jobTitleLower.includes("cfo");
        case "VP":
          return jobTitleLower.includes("vice president") || jobTitleLower.includes("vp");
        case "Director":
          return jobTitleLower.includes("director");
        case "Manager":
          return jobTitleLower.includes("manager") || jobTitleLower.includes("head");
        default:
          return false;
      }
    });
    
    if (seniorityMatch) {
      score += 20;
      strengths.push(`Seniority matches ICP: ${lead.jobTitle}`);
    }
  }

  // 3. Company Size Match (15 points)
  maxScore += 15;
  if (lead.companySize && icpCriteria.companySizes) {
    const isMatch = icpCriteria.companySizes.includes(lead.companySize);
    if (isMatch) {
      score += 15;
      strengths.push(`Company size matches ICP: ${lead.companySize}`);
    }
  }

  // 4. Industry Match (15 points)
  maxScore += 15;
  if (lead.industry) {
    if (icpCriteria.industries) {
      const industryLower = lead.industry.toLowerCase();
      const isMatch = icpCriteria.industries.some((target) =>
        industryLower.includes(target.toLowerCase())
      );
      if (isMatch) {
        score += 15;
        strengths.push(`Industry matches ICP: ${lead.industry}`);
      }
    }
    
    if (icpCriteria.excludeIndustries) {
      const industryLower = lead.industry.toLowerCase();
      const isExcluded = icpCriteria.excludeIndustries.some((exclude) =>
        industryLower.includes(exclude.toLowerCase())
      );
      if (isExcluded) {
        score = Math.max(0, score - 20); // Pénalité forte
        weaknesses.push(`Industry excluded: ${lead.industry}`);
      }
    }
  }

  // 5. Location Match (10 points)
  maxScore += 10;
  if (lead.location && icpCriteria.locations) {
    const locationLower = lead.location.toLowerCase();
    const isMatch = icpCriteria.locations.some((target) =>
      locationLower.includes(target.toLowerCase())
    );
    if (isMatch) {
      score += 10;
      strengths.push(`Location matches ICP: ${lead.location}`);
    }
  }

  // 6. Revenue Range (10 points)
  maxScore += 10;
  if (lead.revenue && icpCriteria.revenueRange) {
    // Parser le revenue (ex: "$1M-$10M" -> {min: 1000000, max: 10000000})
    const revenueMatch = parseRevenueRange(lead.revenue, icpCriteria.revenueRange);
    if (revenueMatch) {
      score += 10;
      strengths.push(`Revenue range matches ICP: ${lead.revenue}`);
    }
  }

  // Normaliser le score (0-100)
  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return { score: normalizedScore, strengths, weaknesses };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 CALCULATE EMAIL QUALITY SCORE - Score de qualité de l'email
// ═══════════════════════════════════════════════════════════════════════════

export function calculateEmailQualityScore(
  lead: EnrichedLead
): { score: number; strengths: string[]; weaknesses: string[] } {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Email vérifié (60 points)
  if (lead.emailVerified) {
    score += 60;
    strengths.push("Email verified");
  } else {
    weaknesses.push("Email not verified");
  }

  // Email score (30 points)
  if (lead.emailScore !== undefined) {
    // Score déjà sur 0-100, prendre 30% de ce score
    score += Math.round((lead.emailScore / 100) * 30);
    if (lead.emailScore >= 95) {
      strengths.push(`Email score excellent: ${lead.emailScore}%`);
    } else if (lead.emailScore < 70) {
      weaknesses.push(`Email score faible: ${lead.emailScore}%`);
    }
  }

  // Email format (10 points)
  if (lead.email) {
    const emailDomain = lead.email.split("@")[1];
    // Vérifier si c'est un email corporate (pas Gmail/Yahoo/etc.)
    const freeEmailDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com"];
    if (!freeEmailDomains.includes(emailDomain?.toLowerCase() || "")) {
      score += 10;
      strengths.push(`Corporate email: ${emailDomain}`);
    } else {
      weaknesses.push(`Free email provider: ${emailDomain}`);
    }
  } else {
    weaknesses.push("No email address");
  }

  return { score, strengths, weaknesses };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CALCULATE DATA COMPLETENESS SCORE - Score de complétude des données
// ═══════════════════════════════════════════════════════════════════════════

export function calculateDataCompletenessScore(
  lead: EnrichedLead
): { score: number; strengths: string[]; weaknesses: string[] } {
  const fields = [
    { name: "name", value: lead.name, weight: 10 },
    { name: "email", value: lead.email, weight: 15 },
    { name: "company", value: lead.company, weight: 15 },
    { name: "jobTitle", value: lead.jobTitle, weight: 10 },
    { name: "location", value: lead.location, weight: 5 },
    { name: "industry", value: lead.industry, weight: 5 },
    { name: "companySize", value: lead.companySize, weight: 5 },
    { name: "revenue", value: lead.revenue, weight: 5 },
    { name: "phone", value: lead.phone, weight: 10 },
    { name: "linkedInUrl", value: lead.linkedInUrl, weight: 10 },
    { name: "linkedInConnections", value: lead.linkedInConnections, weight: 5 },
    { name: "enrichmentData", value: lead.enrichmentData, weight: 5 },
  ];

  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  fields.forEach((field) => {
    if (field.value !== undefined && field.value !== null && field.value !== "") {
      score += field.weight;
      strengths.push(`${field.name} available`);
    } else {
      weaknesses.push(`Missing ${field.name}`);
    }
  });

  return { score, strengths, weaknesses };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CALCULATE INTENT SCORE - Score d'intention (signaux d'intérêt)
// ═══════════════════════════════════════════════════════════════════════════

export async function calculateIntentScore(
  lead: EnrichedLead
): Promise<{ score: number; strengths: string[]; weaknesses: string[] }> {
  let score = 0;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Engagement LinkedIn connections (proxy d'activité)
  if (lead.linkedInConnections) {
    if (lead.linkedInConnections >= 500) {
      score += 20;
      strengths.push("High LinkedIn connections (≥500)");
    } else if (lead.linkedInConnections >= 200) {
      score += 15;
      strengths.push("Good LinkedIn connections (≥200)");
    } else {
      weaknesses.push(`Low LinkedIn connections: ${lead.linkedInConnections}`);
    }
  }

  // Email verified = signe d'intérêt potentiel
  if (lead.emailVerified) {
    score += 10;
    strengths.push("Email verified (shows intent)");
  }

  // Historique d'engagement email depuis la DB (ouvertures + réponses)
  if (lead.email) {
    try {
      const [opens, replies] = await Promise.all([
        prisma.sequenceStep.count({
          where: {
            channel: "EMAIL",
            status: "OPENED",
            sequence: { prospect: { email: lead.email } },
          },
        }),
        prisma.sequenceStep.count({
          where: {
            channel: "EMAIL",
            status: "REPLIED",
            sequence: { prospect: { email: lead.email } },
          },
        }),
      ]);

      if (replies > 0) {
        score += 30;
        strengths.push(`A répondu à ${replies} email(s) — signal fort`);
      } else if (opens > 0) {
        score += 15 + Math.min(opens * 3, 15); // max +30
        strengths.push(`A ouvert ${opens} email(s)`);
      } else {
        weaknesses.push("Aucune ouverture d'email détectée");
      }
    } catch {
      // Prisma non disponible dans ce contexte (ex: build statique), on ignore
    }
  }

  return { score, strengths, weaknesses };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 CALCULATE LEAD SCORE - Score global du lead avec AI
// ═══════════════════════════════════════════════════════════════════════════

export async function calculateLeadScore(
  lead: EnrichedLead,
  icpCriteria: ICPCriteria
): Promise<LeadScore> {
  // 1. Calculer les scores individuels
  const icpFit = calculateICPFitScore(lead, icpCriteria);
  const emailQuality = calculateEmailQualityScore(lead);
  const dataCompleteness = calculateDataCompletenessScore(lead);
  const intent = await calculateIntentScore(lead);

  // 2. Poids des scores pour le score global
  const weights = {
    icpFit: 0.40, // 40% - Le plus important
    emailQuality: 0.25, // 25% - Email vérifié essentiel
    dataCompleteness: 0.20, // 20% - Données complètes importantes
    intent: 0.15, // 15% - Signaux d'intention
  };

  // 3. Calculer le score global
  const overallScore = Math.round(
    icpFit.score * weights.icpFit +
    emailQuality.score * weights.emailQuality +
    dataCompleteness.score * weights.dataCompleteness +
    intent.score * weights.intent
  );

  // 4. Calculer la probabilité de conversion avec AI
  const conversionProbability = await calculateConversionProbability(
    lead,
    icpFit,
    emailQuality,
    dataCompleteness,
    intent
  );

  // 5. Déterminer le tier (A, B, C, D)
  let tier: "A" | "B" | "C" | "D";
  if (overallScore >= 80 && conversionProbability >= 20) {
    tier = "A"; // High priority
  } else if (overallScore >= 60 && conversionProbability >= 10) {
    tier = "B"; // Medium-high priority
  } else if (overallScore >= 40 && conversionProbability >= 5) {
    tier = "C"; // Medium priority
  } else {
    tier = "D"; // Low priority
  }

  // 6. Recommandations
  const recommendations = generateRecommendations(
    lead,
    icpFit,
    emailQuality,
    dataCompleteness,
    intent,
    tier
  );

  return {
    icpFitScore: icpFit.score,
    emailQualityScore: emailQuality.score,
    dataCompletenessScore: dataCompleteness.score,
    intentScore: intent.score,
    engagementScore: 0,
    overallScore,
    conversionProbability,
    tier,
    strengths: [
      ...icpFit.strengths,
      ...emailQuality.strengths,
      ...dataCompleteness.strengths,
      ...intent.strengths,
    ],
    weaknesses: [
      ...icpFit.weaknesses,
      ...emailQuality.weaknesses,
      ...dataCompleteness.weaknesses,
      ...intent.weaknesses,
    ],
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 CALCULATE CONVERSION PROBABILITY - Probabilité de conversion avec AI
// ═══════════════════════════════════════════════════════════════════════════

async function calculateConversionProbability(
  lead: EnrichedLead,
  icpFit: { score: number; strengths: string[]; weaknesses: string[] },
  emailQuality: { score: number; strengths: string[]; weaknesses: string[] },
  dataCompleteness: { score: number; strengths: string[]; weaknesses: string[] },
  intent: { score: number; strengths: string[]; weaknesses: string[] }
): Promise<number> {
  try {
    const openai = getOpenAI();
    
    const prompt = `
Tu es un expert en lead scoring B2B avec une précision de 85%+.

Analyse ce lead et estime la probabilité de conversion (meeting booked) sur une échelle de 0 à 100.

**LEAD:**
- Nom: ${lead.name}
- Entreprise: ${lead.company}
- Poste: ${lead.jobTitle || "Non spécifié"}
- Industrie: ${lead.industry || "Non spécifiée"}
- Taille entreprise: ${lead.companySize || "Non spécifiée"}
- Email vérifié: ${lead.emailVerified ? "Oui" : "Non"}
- Score email: ${lead.emailScore || 0}/100
- Connexions LinkedIn: ${lead.linkedInConnections || 0}

**SCORES:**
- ICP Fit: ${icpFit.score}/100
- Email Quality: ${emailQuality.score}/100
- Data Completeness: ${dataCompleteness.score}/100
- Intent: ${intent.score}/100

**POINTS FORTS:**
${icpFit.strengths.concat(emailQuality.strengths).concat(dataCompleteness.strengths).concat(intent.strengths).join("\n")}

**POINTS FAIBLES:**
${icpFit.weaknesses.concat(emailQuality.weaknesses).concat(dataCompleteness.weaknesses).concat(intent.weaknesses).join("\n")}

**INSTRUCTIONS:**
Estime la probabilité de conversion (meeting booked dans les 30 jours) en tenant compte de:
1. Le match avec l'ICP (pondération forte)
2. La qualité de l'email (email vérifié = indicateur fort)
3. La complétude des données (données complètes = signe d'engagement)
4. Les signaux d'intention (engagement LinkedIn, visites site)

**Réponds UNIQUEMENT avec un nombre entre 0 et 100 (probabilité de conversion en %).**
Exemple: 23
`;

    const completion = await openai.invoke(prompt);
    const contentStr =
      typeof completion.content === "string"
        ? completion.content
        : Array.isArray(completion.content)
          ? completion.content
              .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
              .join("")
          : "";
    const response = contentStr.trim();
    
    // Parser le nombre
    const probability = parseInt(response.match(/\d+/)?.[0] || "0");
    return Math.max(0, Math.min(100, probability));
  } catch (error) {
    console.error("Error calculating conversion probability:", error);
    // Fallback: estimation basée sur les scores
    const avgScore = (
      icpFit.score * 0.4 +
      emailQuality.score * 0.3 +
      dataCompleteness.score * 0.2 +
      intent.score * 0.1
    );
    return Math.round(avgScore * 0.25); // Conversion probability ≈ 25% du score moyen
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💡 GENERATE RECOMMENDATIONS - Recommandations d'action
// ═══════════════════════════════════════════════════════════════════════════

function generateRecommendations(
  lead: EnrichedLead,
  icpFit: { score: number; strengths: string[]; weaknesses: string[] },
  emailQuality: { score: number; strengths: string[]; weaknesses: string[] },
  dataCompleteness: { score: number; strengths: string[]; weaknesses: string[] },
  intent: { score: number; strengths: string[]; weaknesses: string[] },
  tier: "A" | "B" | "C" | "D"
): string[] {
  const recommendations: string[] = [];

  // Recommandations selon le tier
  if (tier === "A") {
    recommendations.push("🚀 PRIORITÉ HAUTE - Contacter immédiatement");
    recommendations.push("Utiliser une séquence personnalisée multi-canal");
    recommendations.push("Approche value-first (pas de pitch direct)");
  } else if (tier === "B") {
    recommendations.push("⚠️ PRIORITÉ MOYENNE-HAUTE - Contacter cette semaine");
    recommendations.push("Enrichir les données manquantes si possible");
  } else if (tier === "C") {
    recommendations.push("📧 PRIORITÉ MOYENNE - Contacter ce mois-ci");
    recommendations.push("Nurturing sequence pour échauffer le lead");
  } else {
    recommendations.push("⏸️ PRIORITÉ BASSE - Ajouter à une séquence automatisée");
    recommendations.push("Ne pas investir trop de temps personnalisé");
  }

  // Recommandations spécifiques selon les faiblesses
  if (emailQuality.weaknesses.length > 0) {
    recommendations.push("⚠️ Vérifier l'email avant d'envoyer (score faible)");
  }

  if (dataCompleteness.weaknesses.length > 3) {
    recommendations.push("📊 Enrichir les données manquantes (trop de champs vides)");
  }

  if (icpFit.score < 50) {
    recommendations.push("❌ Match ICP faible - Vérifier si ce lead correspond vraiment à notre ICP");
  }

  if (intent.score < 20) {
    recommendations.push("🔍 Faible engagement - Envisager une approche plus douce (nurturing)");
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function parseRevenueRange(revenue: string, targetRange: { min?: number; max?: number }): boolean {
  // Parser des formats comme "$1M-$10M", "$5M", "$100K-$500K", etc.
  const revenueLower = revenue.toLowerCase();
  
  // Extraire les nombres
  const numbers = revenueLower.match(/[\d.]+[mk]?/gi);
  if (!numbers || numbers.length === 0) return false;

  // Convertir en nombres
  const parseValue = (val: string): number => {
    const num = parseFloat(val.replace(/[mk]/gi, ""));
    if (val.includes("m")) return num * 1000000;
    if (val.includes("k")) return num * 1000;
    return num;
  };

  const values = numbers.map(parseValue);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Vérifier si ça correspond au range cible
  if (targetRange.min !== undefined && max < targetRange.min) return false;
  if (targetRange.max !== undefined && min > targetRange.max) return false;

  return true;
}

