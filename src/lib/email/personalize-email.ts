/**
 * 🎯 Email Personalization Dispatcher
 *
 * Route vers la personnalisation AI (OpenAI) ou template selon la config.
 */

import {
  applyTemplate,
  buildVariablesFromProspect,
  type StepTemplate,
} from "./template-personalization";
import type { ResearchResult } from "@/lib/prospection/email-personalization";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PersonalizeParams {
  prospect: {
    id: string;
    name: string;
    email?: string | null;
    company: string;
    jobTitle?: string | null;
    industry?: string | null;
    location?: string | null;
    linkedInUrl?: string | null;
    enrichmentData?: unknown;
  };
  stepTemplate: StepTemplate;
  mode: "ai" | "template";
  sender: { name: string; email: string; company: string };
  ourOffer?: string;
  /** Mémoïsation de la recherche prospect partagée entre les appels d'un même
   * cycle de personnalisation — cf. `email-personalization.ts`. */
  researchCache?: Map<string, Promise<ResearchResult>>;
}

export interface PersonalizedResult {
  subject: string;
  content: string;
  personalizationScore: number;
  mode: "ai" | "template";
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 DÉTECTION AI
// ═══════════════════════════════════════════════════════════════════════════

export function hasAIPersonalization(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

export async function personalizeEmail(
  params: PersonalizeParams
): Promise<PersonalizedResult> {
  const { prospect, stepTemplate, mode, sender, ourOffer, researchCache } = params;

  // Mode AI : tenter la personnalisation OpenAI
  if (mode === "ai" && hasAIPersonalization()) {
    try {
      const { generatePersonalizedEmail } = await import(
        "@/lib/prospection/email-personalization"
      );

      const result = await generatePersonalizedEmail({
        prospect: {
          id: prospect.id,
          name: prospect.name,
          firstName: prospect.name.split(/\s+/)[0] || "",
          lastName: prospect.name.split(/\s+/).slice(1).join(" ") || "",
          email: prospect.email || "",
          company: prospect.company,
          jobTitle: prospect.jobTitle || "",
          location: prospect.location || "",
          industry: prospect.industry || "",
          linkedInUrl: prospect.linkedInUrl || "",
          timezone: "Europe/Paris",
          enrichmentData: prospect.enrichmentData,
        },
        sequenceStep: stepTemplate.stepNumber,
        ourOffer: ourOffer || "nos services",
        ourCompany: sender.company,
        researchCache,
      });

      return {
        subject: result.subject,
        content: result.content,
        personalizationScore: result.personalizationScore,
        mode: "ai",
      };
    } catch (error) {
      console.warn("[Personalize] AI failed, fallback to template:", error);
      // Fallback vers template
    }
  }

  // Mode Template : substitution de variables
  const variables = buildVariablesFromProspect(prospect, sender);
  const subject = applyTemplate(stepTemplate.subject, variables);
  const content = applyTemplate(stepTemplate.content, variables);

  // Score basé sur le nombre de variables effectivement remplacées
  const totalVars = (stepTemplate.content.match(/\{(\w+)\}/g) || []).length;
  const unreplaced = (content.match(/\{(\w+)\}/g) || []).length;
  const replacedRatio = totalVars > 0 ? (totalVars - unreplaced) / totalVars : 1;
  const score = Math.round(40 + replacedRatio * 30); // 40-70 range pour template

  return {
    subject,
    content,
    personalizationScore: score,
    mode: "template",
  };
}
