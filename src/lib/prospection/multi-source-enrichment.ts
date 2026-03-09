/**
 * 🔍 Multi-Source Enrichment - Top 1% Performance
 * 
 * Objectifs Top 1%:
 * - Email verification score > 95%
 * - Data accuracy > 98%
 * - Enrichment complet (20+ données par lead)
 * 
 * Optimisations:
 * - Multi-source enrichment (Apollo + Clay + Hunter + ZoomInfo)
 * - Email verification en cascade (Hunter → NeverBounce → Kickbox)
 * - Data deduplication et validation
 * - Enrichment progressif (priorité aux sources fiables)
 */

import { EnrichedLead } from "./enrichment";
import { verifyEmailHunter } from "./enrichment";
import { searchLeadsApollo, enrichLeadClay } from "./enrichment";

// ═══════════════════════════════════════════════════════════════════════════
// 📧 EMAIL VERIFICATION CASCADE - Vérification en cascade
// ═══════════════════════════════════════════════════════════════════════════

interface EmailVerificationResult {
  verified: boolean;
  score: number; // 0-100
  confidence: "high" | "medium" | "low";
  provider: "hunter" | "neverbounce" | "kickbox";
  reason?: string;
}

/**
 * Vérification d'email en cascade (Top 1%)
 * 
 * Cascade:
 * 1. Hunter.io (premier choix)
 * 2. NeverBounce (si Hunter < 95)
 * 3. Kickbox (si NeverBounce < 95)
 * 
 * Score minimum accepté: 95% (Top 1%)
 */
export async function verifyEmailCascade(
  email: string,
  domain?: string
): Promise<{ success: boolean; result?: EmailVerificationResult; error?: string }> {
  // 1. Hunter.io (premier choix - meilleure précision)
  if (process.env.HUNTER_API_KEY) {
    try {
      const hunterResult = await verifyEmailHunter(email, domain);
      if (hunterResult.success && hunterResult.verified !== undefined && hunterResult.score !== undefined) {
        const score = hunterResult.score;
        
        // Si score ≥ 95, accepté immédiatement (Top 1%)
        if (score >= 95) {
          return {
            success: true,
            result: {
              verified: hunterResult.verified,
              score,
              confidence: "high",
              provider: "hunter",
              reason: "Hunter verification: score ≥ 95%",
            },
          };
        }
        
        // Si score ≥ 80, essayer NeverBounce pour confirmer
        if (score >= 80) {
          const neverBounceResult = await verifyEmailNeverBounce(email);
          if (neverBounceResult.success && neverBounceResult.result) {
            // Prendre le meilleur score
            const bestScore = Math.max(score, neverBounceResult.result.score);
            if (bestScore >= 95) {
              return {
                success: true,
                result: {
                  verified: bestScore >= 95,
                  score: bestScore,
                  confidence: "high",
                  provider: neverBounceResult.result.score > score ? "neverbounce" : "hunter",
                  reason: "Multi-source verification: score ≥ 95%",
                },
              };
            }
          }
        }
        
        // Si Hunter < 80, essayer NeverBounce puis Kickbox
        if (score < 80) {
          // NeverBounce
          const neverBounceResult = await verifyEmailNeverBounce(email);
          if (neverBounceResult.success && neverBounceResult.result && neverBounceResult.result.score >= 95) {
            return neverBounceResult;
          }
          
          // Kickbox (dernier recours)
          const kickboxResult = await verifyEmailKickbox(email);
          if (kickboxResult.success && kickboxResult.result && kickboxResult.result.score >= 95) {
            return kickboxResult;
          }
        }
        
        // Retourner le meilleur résultat disponible
        return {
          success: true,
          result: {
            verified: hunterResult.verified,
            score,
            confidence: score >= 80 ? "medium" : "low",
            provider: "hunter",
            reason: score >= 95 ? "Verified" : `Score ${score}% (below 95% threshold)`,
          },
        };
      }
    } catch (error) {
      console.error("Hunter.io verification error:", error);
    }
  }

  // 2. NeverBounce (fallback)
  const neverBounceResult = await verifyEmailNeverBounce(email);
  if (neverBounceResult.success && neverBounceResult.result && neverBounceResult.result.score >= 95) {
    return neverBounceResult;
  }

  // 3. Kickbox (dernier recours)
  const kickboxResult = await verifyEmailKickbox(email);
  if (kickboxResult.success && kickboxResult.result) {
    return kickboxResult;
  }

  // Aucune vérification réussie
  return {
    success: false,
    error: "Email verification failed across all providers",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 NEVERBOUNCE - Vérification d'email (source 2)
// ═══════════════════════════════════════════════════════════════════════════

async function verifyEmailNeverBounce(
  email: string
): Promise<{ success: boolean; result?: EmailVerificationResult; error?: string }> {
  if (!process.env.NEVERBOUNCE_API_KEY) {
    return { success: false, error: "NEVERBOUNCE_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.neverbounce.com/v4/single/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: process.env.NEVERBOUNCE_API_KEY,
        email,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "NeverBounce error" };
    }

    // NeverBounce retourne: "valid", "invalid", "disposable", "catchall", "unknown"
    const result = data.result;
    const verified = result === "valid";
    
    // Score selon le résultat
    let score = 0;
    if (result === "valid") score = 98;
    else if (result === "catchall") score = 60;
    else if (result === "unknown") score = 40;
    else score = 0;

    return {
      success: true,
      result: {
        verified,
        score,
        confidence: score >= 95 ? "high" : score >= 70 ? "medium" : "low",
        provider: "neverbounce",
        reason: `NeverBounce: ${result}`,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 KICKBOX - Vérification d'email (source 3)
// ═══════════════════════════════════════════════════════════════════════════

async function verifyEmailKickbox(
  email: string
): Promise<{ success: boolean; result?: EmailVerificationResult; error?: string }> {
  if (!process.env.KICKBOX_API_KEY) {
    return { success: false, error: "KICKBOX_API_KEY not configured" };
  }

  try {
    const response = await fetch(
      `https://api.kickbox.com/v2/verify?email=${encodeURIComponent(email)}&apikey=${process.env.KICKBOX_API_KEY}&timeout=10000`
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || "Kickbox error" };
    }

    // Kickbox retourne: "deliverable", "undeliverable", "risky", "unknown"
    const result = data.result;
    const verified = result === "deliverable";
    const confidence = data.confidence || 0; // 0-100

    return {
      success: true,
      result: {
        verified,
        score: confidence,
        confidence: confidence >= 95 ? "high" : confidence >= 70 ? "medium" : "low",
        provider: "kickbox",
        reason: `Kickbox: ${result} (confidence: ${confidence}%)`,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 MULTI-SOURCE ENRICHMENT - Enrichissement multi-sources
// ═══════════════════════════════════════════════════════════════════════════

interface MultiSourceEnrichmentParams {
  linkedInUrl?: string;
  email?: string;
  company?: string;
  name?: string;
  sources?: ("apollo" | "clay" | "zoominfo" | "all")[];
}

/**
 * Enrichissement multi-sources (Top 1%)
 * 
 * Priorité:
 * 1. Apollo.io (meilleure couverture B2B)
 * 2. Clay.com (enrichissement LinkedIn)
 * 3. ZoomInfo (si disponible)
 * 
 * Fusion intelligente des données (priorité aux sources fiables)
 */
export async function enrichMultiSource(
  params: MultiSourceEnrichmentParams
): Promise<{ success: boolean; lead?: EnrichedLead; sources?: string[]; error?: string }> {
  const { linkedInUrl, email, company, name, sources = ["all"] } = params;
  const sourcesUsed: string[] = [];
  const enrichedData: Partial<EnrichedLead> = {};
  const sourcePriorities: Record<string, number> = {
    apollo: 3,
    clay: 2,
    zoominfo: 1,
  };

  // 1. Apollo.io (si email ou company fournis)
  if ((sources.includes("all") || sources.includes("apollo")) && (email || company)) {
    try {
      if (process.env.APOLLO_API_KEY) {
        const apolloResult = await searchLeadsApollo({
          keywords: name ? [name] : [],
          perPage: 1,
        });

        if (apolloResult.success && apolloResult.leads && apolloResult.leads.length > 0) {
          const apolloLead = apolloResult.leads[0];
          
          // Fusionner les données (priorité Apollo)
          Object.assign(enrichedData, {
            name: apolloLead.name || enrichedData.name || name,
            email: apolloLead.email || enrichedData.email || email,
            emailVerified: apolloLead.emailVerified || enrichedData.emailVerified || false,
            emailScore: apolloLead.emailScore || enrichedData.emailScore,
            phone: apolloLead.phone || enrichedData.phone,
            phoneVerified: apolloLead.phoneVerified || enrichedData.phoneVerified || false,
            company: apolloLead.company || enrichedData.company || company,
            jobTitle: apolloLead.jobTitle || enrichedData.jobTitle,
            location: apolloLead.location || enrichedData.location,
            industry: apolloLead.industry || enrichedData.industry,
            companySize: apolloLead.companySize || enrichedData.companySize,
            revenue: apolloLead.revenue || enrichedData.revenue,
            linkedInConnections: apolloLead.linkedInConnections || enrichedData.linkedInConnections,
          });

          sourcesUsed.push("apollo");
        }
      }
    } catch (error) {
      console.error("Apollo enrichment error:", error);
    }
  }

  // 2. Clay.com (si LinkedIn URL fournie)
  if ((sources.includes("all") || sources.includes("clay")) && linkedInUrl) {
    try {
      if (process.env.CLAY_API_KEY) {
        const clayResult = await enrichLeadClay(linkedInUrl, company);
        
        if (clayResult.success && clayResult.data) {
          const clayLead = clayResult.data;
          
          // Fusionner les données (priorité Clay pour certaines données)
          if (!enrichedData.email && clayLead.email) {
            enrichedData.email = clayLead.email;
            enrichedData.emailVerified = clayLead.emailVerified;
            enrichedData.emailScore = clayLead.emailScore;
          }
          
          if (!enrichedData.phone && clayLead.phone) {
            enrichedData.phone = clayLead.phone;
            enrichedData.phoneVerified = clayLead.phoneVerified;
          }
          
          // Compléter les données manquantes
          if (!enrichedData.jobTitle && clayLead.jobTitle) enrichedData.jobTitle = clayLead.jobTitle;
          if (!enrichedData.location && clayLead.location) enrichedData.location = clayLead.location;
          if (!enrichedData.industry && clayLead.industry) enrichedData.industry = clayLead.industry;
          if (!enrichedData.companySize && clayLead.companySize) enrichedData.companySize = clayLead.companySize;
          if (!enrichedData.revenue && clayLead.revenue) enrichedData.revenue = clayLead.revenue;
          if (!enrichedData.linkedInConnections && clayLead.linkedInConnections) {
            enrichedData.linkedInConnections = clayLead.linkedInConnections;
          }

          sourcesUsed.push("clay");
        }
      }
    } catch (error) {
      console.error("Clay enrichment error:", error);
    }
  }

  // 3. ZoomInfo (si disponible)
  if ((sources.includes("all") || sources.includes("zoominfo")) && (email || company)) {
    try {
      // TODO: Implémenter ZoomInfo API
      // ZoomInfo nécessite une intégration spécifique
      if (process.env.ZOOMINFO_API_KEY) {
        // sourcesUsed.push("zoominfo");
      }
    } catch (error) {
      console.error("ZoomInfo enrichment error:", error);
    }
  }

  // 4. Vérification d'email en cascade (si email disponible)
  if (enrichedData.email) {
    const verification = await verifyEmailCascade(enrichedData.email, company);
    if (verification.success && verification.result) {
      enrichedData.emailVerified = verification.result.verified && verification.result.score >= 95;
      enrichedData.emailScore = verification.result.score;
    }
  }

  // 5. Créer l'objet EnrichedLead final
  const lead: EnrichedLead = {
    name: enrichedData.name || name || "",
    email: enrichedData.email || email,
    emailVerified: enrichedData.emailVerified || false,
    emailScore: enrichedData.emailScore,
    phone: enrichedData.phone,
    phoneVerified: enrichedData.phoneVerified || false,
    linkedInUrl: linkedInUrl || enrichedData.linkedInUrl,
    company: enrichedData.company || company || "",
    jobTitle: enrichedData.jobTitle,
    location: enrichedData.location,
    industry: enrichedData.industry,
    companySize: enrichedData.companySize,
    revenue: enrichedData.revenue,
    linkedInConnections: enrichedData.linkedInConnections,
    enrichmentData: enrichedData,
  };

  // Vérifier que l'on a au moins les données essentielles
  if (!lead.name || !lead.company) {
    return { success: false, error: "Insufficient data: name and company required" };
  }

  return { success: true, lead, sources: sourcesUsed };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export type { EmailVerificationResult, MultiSourceEnrichmentParams };
