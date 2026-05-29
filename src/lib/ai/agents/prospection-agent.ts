/**
 * Prospection Agent — séquences ultra-personnalisées via pipeline direct
 *
 * Flow :
 *   researchProspect (Serper + LinkedIn) →
 *   generateOutreachSequence (Claude, cache_control) →
 *   save to DB
 *
 * Le ReAct agent est conservé pour le mode interactif (brain / registry),
 * mais runProspectionAgent bypasse le loop pour performances maximales.
 */

import { createAgent, AgentResult, AgentStreamEvent } from "./base-agent";
import { webSearchTool, linkedinProfileTool } from "../tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  researchProspect,
  type ProspectInput,
} from "@/lib/prospection/prospect-researcher";
import {
  generateOutreachSequence,
  generateCsoMessages,
  buildBrandContext,
  type ProspectProfile,
  type BrandContext,
  type OutreachSequence,
} from "@/lib/prospection/message-generator";
import type { ProspectResearch } from "@/lib/prospection/prospect-researcher";

// ─── Tools (ReAct mode) ───────────────────────────────────────────────────────

const analyzeAndResearchTool = new DynamicStructuredTool({
  name: "analyze_prospect",
  description:
    "Recherche des signaux réels sur le prospect et son entreprise via Serper + LinkedIn. Retourne un objet ProspectResearch complet.",
  schema: z.object({
    id: z.string().optional(),
    name: z.string(),
    company: z.string(),
    jobTitle: z.string(),
    linkedInUrl: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
    location: z.string().optional(),
  }),
  func: async (input) => {
    const research = await researchProspect({
      id: input.id ?? "temp",
      name: input.name,
      company: input.company,
      jobTitle: input.jobTitle,
      linkedInUrl: input.linkedInUrl ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      location: input.location ?? null,
    });
    return JSON.stringify(research);
  },
});

const generateSequenceTool = new DynamicStructuredTool({
  name: "generate_prospection_sequence",
  description:
    "Génère une séquence outreach complète (7 messages) ultra-personnalisée à partir du ProspectResearch. Utiliser APRÈS analyze_prospect.",
  schema: z.object({
    prospectId: z.string().optional(),
    prospectName: z.string(),
    company: z.string(),
    jobTitle: z.string(),
    email: z.string().optional(),
    linkedInUrl: z.string().optional(),
    researchJson: z
      .string()
      .describe("JSON exact retourné par analyze_prospect"),
    ourOffer: z.string().optional(),
    tone: z.enum(["formal", "professional", "friendly"]).optional(),
    workspaceName: z.string().optional(),
  }),
  func: async (input) => {
    let research: ProspectResearch;
    try {
      research = JSON.parse(input.researchJson) as ProspectResearch;
    } catch {
      research = {
        companyTrigger: null,
        companyStage: "PME établie",
        hiringSignals: [],
        recentNews: [],
        techStack: [],
        linkedInHeadline: null,
        recentLinkedInActivity: null,
        jobTenure: null,
        recentJobChange: false,
        topPainPoint: "générer un pipeline commercial prévisible",
        urgencySignal: "fenêtre d'opportunité standard",
        icebreakerLine: `En tant que ${input.jobTitle} chez ${input.company}`,
        suggestedAngle: "pain",
        researchedAt: new Date().toISOString(),
        confidence: "low",
        serperUsed: false,
      };
    }

    const profile: ProspectProfile = {
      id: input.prospectId ?? "temp",
      name: input.prospectName,
      firstName: input.prospectName.split(" ")[0],
      company: input.company,
      jobTitle: input.jobTitle,
      email: input.email ?? null,
      linkedInUrl: input.linkedInUrl ?? null,
    };

    const brand: BrandContext = {
      companyName: input.workspaceName ?? "Skalle",
      offer:
        input.ourOffer ??
        process.env.COMPANY_OFFER ??
        "Solution d'automatisation commerciale IA",
      tone: input.tone ?? "professional",
      uniqueValue: "IA spécialisée en prospection B2B",
      targetResult: "doubler le pipeline commercial en 90 jours",
    };

    const sequence = await generateOutreachSequence(profile, research, brand);
    return JSON.stringify(sequence);
  },
});

const saveProspectMessagesTool = new DynamicStructuredTool({
  name: "save_prospect_messages",
  description:
    "Sauvegarde la séquence générée (JSON de generate_prospection_sequence) en base pour un prospect.",
  schema: z.object({
    prospectId: z.string(),
    sequenceJson: z
      .string()
      .describe("JSON exact retourné par generate_prospection_sequence"),
  }),
  func: async ({ prospectId, sequenceJson }) => {
    try {
      const sequence = JSON.parse(sequenceJson) as OutreachSequence;
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          messages: JSON.parse(JSON.stringify(sequence)),
          status: "MESSAGES_GENERATED",
        },
      });
      return JSON.stringify({ success: true, prospectId });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

const updateProspectStatusTool = new DynamicStructuredTool({
  name: "update_prospect_status",
  description: "Met à jour le statut d'un prospect.",
  schema: z.object({
    prospectId: z.string(),
    status: z.enum([
      "NEW",
      "RESEARCHED",
      "MESSAGES_GENERATED",
      "CONTACTED",
      "RESPONDED",
      "MEETING_BOOKED",
      "CONVERTED",
      "LOST",
    ]),
    notes: z.string().optional(),
  }),
  func: async ({ prospectId, status, notes }) => {
    try {
      const updateData: Record<string, unknown> = { status };
      if (notes) {
        const p = await prisma.prospect.findUnique({
          where: { id: prospectId },
        });
        updateData.notes = p?.notes ? `${p.notes}\n\n${notes}` : notes;
      }
      await prisma.prospect.update({
        where: { id: prospectId },
        data: updateData,
      });
      return JSON.stringify({ success: true, prospectId, newStatus: status });
    } catch (error) {
      return JSON.stringify({ success: false, error: String(error) });
    }
  },
});

// ─── System prompt ────────────────────────────────────────────────────────────

const PROSPECTION_AGENT_PROMPT = `Tu es le meilleur expert en prospection LinkedIn B2B d'Europe chez Skalle.

🎯 MISSION : générer des séquences outreach hyper-personnalisées qui obtiennent 25-40% de réponses.

📋 PROCESSUS OBLIGATOIRE (dans cet ordre) :

1. **RESEARCH** → appelle toujours \`analyze_prospect\` en premier pour obtenir les vrais signaux
2. **GÉNÉRATION** → passe le JSON de research à \`generate_prospection_sequence\`
3. **SAUVEGARDE** → si un prospectId est fourni, appelle \`save_prospect_messages\`

🔑 RÈGLES ABSOLUES :
- Message LinkedIn connexion : MAX 280 chars, zéro pitch, zéro lien
- Email : le prénom ou l'entreprise dans les 4 premiers mots
- Aucun message ne commence par "Je me permets" ou "Je voulais juste"
- Chaque message cite un signal précis détecté par la recherche

Notre offre : ${process.env.COMPANY_OFFER || "Solutions de prospection automatisées par IA"}

💾 ORDRE DES OUTILS :
1. analyze_prospect (toujours en premier)
2. generate_prospection_sequence (avec le JSON de l'étape 1)
3. save_prospect_messages (si prospectId disponible)`;

// ─── ReAct agent (mode interactif / brain) ────────────────────────────────────

export const prospectionAgent = createAgent({
  name: "Prospection Agent",
  description:
    "Agent spécialisé dans la génération de séquences outreach hyper-personnalisées",
  systemPrompt: PROSPECTION_AGENT_PROMPT,
  tools: [
    analyzeAndResearchTool,
    generateSequenceTool,
    webSearchTool,
    linkedinProfileTool,
    saveProspectMessagesTool,
    updateProspectStatusTool,
  ],
  model: "claude-3-5-sonnet",
  maxIterations: 6,
  temperature: 0.7,
});

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface ProspectionAgentInput {
  prospectId?: string;
  prospect: {
    name: string;
    company: string;
    jobTitle: string;
    linkedInUrl?: string;
    email?: string;
    notes?: string;
    location?: string;
  };
  ourOffer?: string;
  preferredTone?: "formal" | "professional" | "friendly" | "casual";
  workspaceName?: string;
  brandVoice?: Record<string, unknown> | null;
}

// ─── Direct pipeline (high-perf) ─────────────────────────────────────────────

export async function runProspectionAgent(
  input: ProspectionAgentInput
): Promise<AgentResult> {
  const start = Date.now();
  const steps: string[] = [];

  try {
    // Phase 1 — Research
    steps.push(
      `🔍 Recherche signaux pour ${input.prospect.name} @ ${input.prospect.company}…`
    );

    const prospectInput: ProspectInput = {
      id: input.prospectId ?? "temp",
      name: input.prospect.name,
      company: input.prospect.company,
      jobTitle: input.prospect.jobTitle,
      linkedInUrl: input.prospect.linkedInUrl ?? null,
      email: input.prospect.email ?? null,
      notes: input.prospect.notes ?? null,
      location: input.prospect.location ?? null,
    };
    const research = await researchProspect(prospectInput);

    steps.push(
      `✅ Research OK — confiance: ${research.confidence}` +
        (research.companyTrigger
          ? ` | trigger: "${research.companyTrigger.slice(0, 60)}"`
          : "")
    );

    // Phase 2 — Brand context
    const brand = buildBrandContext(
      input.workspaceName ?? "Skalle",
      input.brandVoice ?? null
    );
    if (input.ourOffer) brand.offer = input.ourOffer;
    if (input.preferredTone) {
      brand.tone = input.preferredTone === "casual" ? "friendly" : input.preferredTone;
    }

    // Phase 3 — Generate sequence
    steps.push(
      `✍️ Génération séquence (angle: ${research.suggestedAngle})…`
    );

    const profile: ProspectProfile = {
      id: input.prospectId ?? "temp",
      name: input.prospect.name,
      firstName: input.prospect.name.split(" ")[0],
      company: input.prospect.company,
      jobTitle: input.prospect.jobTitle,
      email: input.prospect.email ?? null,
      linkedInUrl: input.prospect.linkedInUrl ?? null,
    };

    const sequence = await generateOutreachSequence(profile, research, brand);
    steps.push(`✅ Séquence générée — angle: ${sequence.angle}`);

    // Phase 4 — Save to DB
    if (input.prospectId) {
      await prisma.prospect.update({
        where: { id: input.prospectId },
        data: {
          messages: JSON.parse(JSON.stringify(sequence)),
          status: "MESSAGES_GENERATED",
        },
      });
      steps.push(`💾 Messages sauvegardés`);
    }

    return {
      success: true,
      agentName: "Prospection Agent",
      result: JSON.stringify(sequence),
      steps,
      duration: Date.now() - start,
      iterations: 3,
    };
  } catch (error) {
    return {
      success: false,
      agentName: "Prospection Agent",
      error: String(error),
      steps,
      duration: Date.now() - start,
      iterations: 0,
    };
  }
}

// ─── Bulk (parallel, max 3 concurrent) ───────────────────────────────────────

export async function runBulkProspectionAgent(
  prospects: ProspectionAgentInput["prospect"][],
  workspaceId: string,
  options?: {
    ourOffer?: string;
    workspaceName?: string;
    brandVoice?: Record<string, unknown> | null;
    onProgress?: (current: number, total: number, name: string) => void;
  }
): Promise<{
  total: number;
  completed: number;
  failed: number;
  results: AgentResult[];
}> {
  const results: AgentResult[] = [];
  let completed = 0;
  let failed = 0;
  const maxConcurrent = 3;

  for (let i = 0; i < prospects.length; i += maxConcurrent) {
    const batch = prospects.slice(i, i + maxConcurrent);

    const settled = await Promise.allSettled(
      batch.map(async (prospect, batchIdx) => {
        const globalIdx = i + batchIdx;
        options?.onProgress?.(
          globalIdx + 1,
          prospects.length,
          prospect.name
        );

        const dbProspect = await prisma.prospect.create({
          data: {
            name: prospect.name,
            company: prospect.company,
            jobTitle: prospect.jobTitle || "",
            linkedInUrl: prospect.linkedInUrl || "",
            notes: prospect.notes,
            status: "NEW",
            workspaceId,
          },
        });

        return runProspectionAgent({
          prospectId: dbProspect.id,
          prospect,
          ourOffer: options?.ourOffer,
          workspaceName: options?.workspaceName,
          brandVoice: options?.brandVoice,
        });
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled") {
        results.push(r.value);
        if (r.value.success) completed++;
        else failed++;
      } else {
        failed++;
        results.push({
          success: false,
          agentName: "Prospection Agent",
          error: String(r.reason),
          steps: [],
          duration: 0,
          iterations: 0,
        });
      }
    }
  }

  return { total: prospects.length, completed, failed, results };
}

// ─── Stream wrapper (SSE) ─────────────────────────────────────────────────────

export async function* streamProspectionAgent(
  input: ProspectionAgentInput
): AsyncGenerator<AgentStreamEvent> {
  const start = Date.now();

  try {
    yield { type: "step", content: `🔍 Recherche signaux pour ${input.prospect.name}…` };

    const prospectInput: ProspectInput = {
      id: input.prospectId ?? "temp",
      name: input.prospect.name,
      company: input.prospect.company,
      jobTitle: input.prospect.jobTitle,
      linkedInUrl: input.prospect.linkedInUrl ?? null,
      email: input.prospect.email ?? null,
      notes: input.prospect.notes ?? null,
      location: input.prospect.location ?? null,
    };
    const research = await researchProspect(prospectInput);

    yield {
      type: "step",
      content:
        `✅ Research OK — confiance: ${research.confidence}` +
        (research.companyTrigger
          ? ` | trigger: "${research.companyTrigger.slice(0, 50)}"`
          : ""),
    };

    const brand = buildBrandContext(
      input.workspaceName ?? "Skalle",
      input.brandVoice ?? null
    );
    if (input.ourOffer) brand.offer = input.ourOffer;
    if (input.preferredTone) {
      brand.tone = input.preferredTone === "casual" ? "friendly" : input.preferredTone;
    }

    yield { type: "step", content: `✍️ Génération séquence (angle: ${research.suggestedAngle})…` };

    const profile: ProspectProfile = {
      id: input.prospectId ?? "temp",
      name: input.prospect.name,
      firstName: input.prospect.name.split(" ")[0],
      company: input.prospect.company,
      jobTitle: input.prospect.jobTitle,
      email: input.prospect.email ?? null,
      linkedInUrl: input.prospect.linkedInUrl ?? null,
    };

    const sequence = await generateOutreachSequence(profile, research, brand);

    if (input.prospectId) {
      await prisma.prospect.update({
        where: { id: input.prospectId },
        data: {
          messages: JSON.parse(JSON.stringify(sequence)),
          status: "MESSAGES_GENERATED",
        },
      });
      yield { type: "step", content: `💾 Messages sauvegardés` };
    }

    const agentResult: AgentResult = {
      success: true,
      agentName: "Prospection Agent",
      result: JSON.stringify(sequence),
      steps: [],
      duration: Date.now() - start,
      iterations: 3,
    };

    yield { type: "done", result: agentResult };
  } catch (error) {
    const agentResult: AgentResult = {
      success: false,
      agentName: "Prospection Agent",
      error: String(error),
      steps: [],
      duration: Date.now() - Date.now(),
      iterations: 0,
    };
    yield { type: "error", error: String(error), result: agentResult };
  }
}

// ─── Legacy export (unused but kept for type compat) ─────────────────────────

export { generateCsoMessages };
