"use server";

/**
 * 🤖 Agent Server Actions
 * 
 * Actions serveur pour exécuter les agents IA.
 * Ces actions sont appelées depuis les composants React.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  runSEOAgent, 
  runDiscoveryAgent, 
  runSocialAgent, 
  runProspectionAgent,
  listAgents,
  type AgentResult 
} from "@/lib/ai/agents";

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) {
    throw new Error("Workspace non trouvé");
  }
  return workspace;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 LIST AGENTS
// ═══════════════════════════════════════════════════════════════════════════

export async function getAvailableAgents() {
  await requireAuth();
  return listAgents();
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 SEO AGENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteSEOAgentInput {
  workspaceId: string;
  keyword: string;
  generateImage?: boolean;
  targetLength?: "short" | "medium" | "long";
}

export async function executeSEOAgent(
  input: ExecuteSEOAgentInput
): Promise<{ success: boolean; data?: AgentResult; error?: string }> {
  try {
    const session = await requireAuth();
    const workspace = await requireWorkspace(input.workspaceId, session.user!.id!);

    const result = await runSEOAgent({
      keyword: input.keyword,
      workspaceId: input.workspaceId,
      brandVoice: workspace.brandVoice as Record<string, unknown> | undefined,
      generateImage: input.generateImage ?? true,
      targetLength: input.targetLength ?? "long",
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("SEO Agent error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 DISCOVERY AGENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteDiscoveryAgentInput {
  workspaceId: string;
  competitorUrl: string;
  industry?: string;
  focusAreas?: ("seo" | "content" | "keywords" | "strategy")[];
}

export async function executeDiscoveryAgent(
  input: ExecuteDiscoveryAgentInput
): Promise<{ success: boolean; data?: AgentResult; error?: string }> {
  try {
    const session = await requireAuth();
    const workspace = await requireWorkspace(input.workspaceId, session.user!.id!);

    const result = await runDiscoveryAgent({
      competitorUrl: input.competitorUrl,
      yourDomain: workspace.domainUrl || undefined,
      industry: input.industry || "business",
      focusAreas: input.focusAreas || ["seo", "content", "keywords", "strategy"],
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Discovery Agent error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 SOCIAL AGENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteSocialAgentInput {
  workspaceId: string;
  sourceContent: string;
  contentType: "article" | "video_transcript" | "podcast_notes" | "presentation";
  targetPlatforms: ("X" | "LINKEDIN" | "TIKTOK" | "INSTAGRAM")[];
  generateVisuals?: boolean;
}

export async function executeSocialAgent(
  input: ExecuteSocialAgentInput
): Promise<{ success: boolean; data?: AgentResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(input.workspaceId, session.user!.id!);

    const result = await runSocialAgent({
      sourceContent: input.sourceContent,
      contentType: input.contentType,
      targetPlatforms: input.targetPlatforms,
      workspaceId: input.workspaceId,
      generateVisuals: input.generateVisuals ?? false,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Social Agent error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 PROSPECTION AGENT
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteProspectionAgentInput {
  workspaceId: string;
  prospect: {
    name: string;
    company: string;
    jobTitle: string;
    linkedInUrl?: string;
    notes?: string;
  };
  ourOffer?: string;
  preferredTone?: "formal" | "professional" | "friendly" | "casual";
}

export async function executeProspectionAgent(
  input: ExecuteProspectionAgentInput
): Promise<{ success: boolean; data?: AgentResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(input.workspaceId, session.user!.id!);

    // Créer le prospect en DB
    const dbProspect = await prisma.prospect.create({
      data: {
        name: input.prospect.name,
        company: input.prospect.company,
        jobTitle: input.prospect.jobTitle || "",
        linkedInUrl: input.prospect.linkedInUrl || "",
        notes: input.prospect.notes,
        status: "NEW",
        workspaceId: input.workspaceId,
      },
    });

    const result = await runProspectionAgent({
      prospectId: dbProspect.id,
      prospect: input.prospect,
      ourOffer: input.ourOffer,
      preferredTone: input.preferredTone,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error("Prospection Agent error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AGENT EXECUTION HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export async function getAgentExecutionHistory(workspaceId: string) {
  const session = await requireAuth();
  await requireWorkspace(workspaceId, session.user!.id!);

  // Get API usage as proxy for agent executions
  const history = await prisma.aPIUsage.findMany({
    where: {
      workspaceId,
      operation: {
        in: ["seo_agent", "discovery_agent", "social_agent", "prospection_agent"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return history.map((item) => ({
    id: item.id,
    agentType: item.operation.replace("_agent", ""),
    credits: item.credits,
    createdAt: item.createdAt,
    metadata: item.metadata,
  }));
}
