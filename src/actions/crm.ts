"use server";

import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CRMSourceFilter =
  | "all"
  | "LINKEDIN"
  | "FACEBOOK_GROUP"
  | "INSTAGRAM_HASHTAG"
  | "SEO_INBOUND"
  | "JOB_BOARD_SIGNAL"
  | "LOCAL_MAPS"
  | "NEW_COMPANY_REGISTRY";

export type ProspectStatusPipeline =
  | "NEW"
  | "CONTACTED"
  | "REPLIED"
  | "CONVERTED"
  | "REJECTED";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!ws) throw new Error("Workspace non trouvé");
  return ws;
}

function sourceFilterToWhere(
  workspaceId: string,
  sourceFilter: CRMSourceFilter
): Prisma.ProspectWhereInput {
  const base = { workspaceId };
  if (sourceFilter === "all") return base;
  if (sourceFilter === "LINKEDIN")
    return { ...base, OR: [{ source: "LINKEDIN" }, { platform: "LINKEDIN" }] };
  if (sourceFilter === "FACEBOOK_GROUP")
    return { ...base, OR: [{ source: "FACEBOOK_GROUP" }, { platform: "FACEBOOK" }] };
  if (sourceFilter === "INSTAGRAM_HASHTAG")
    return { ...base, OR: [{ source: "INSTAGRAM_HASHTAG" }, { platform: "INSTAGRAM" }] };
  if (sourceFilter === "SEO_INBOUND") return { ...base, source: "SEO_INBOUND" };
  if (sourceFilter === "JOB_BOARD_SIGNAL") return { ...base, source: "JOB_BOARD_SIGNAL" };
  if (sourceFilter === "LOCAL_MAPS") return { ...base, source: "LOCAL_MAPS" };
  if (sourceFilter === "NEW_COMPANY_REGISTRY") return { ...base, source: "NEW_COMPANY_REGISTRY" };
  return base;
}

export interface ProspectForCrm {
  id: string;
  name: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  status: string;
  source: string | null;
  platform: string | null;
  value: number | null;
  score: number;
  temperature: string;
  lastInteractionAt: Date | null;
  updatedAt: Date;
}

const PROSPECT_SELECT = {
  id: true,
  name: true,
  company: true,
  jobTitle: true,
  email: true,
  status: true,
  source: true,
  platform: true,
  value: true,
  score: true,
  temperature: true,
  lastInteractionAt: true,
  updatedAt: true,
} as const;

export async function getProspectsForCrm(
  workspaceId: string,
  sourceFilter: CRMSourceFilter = "all"
): Promise<{ success: boolean; data?: ProspectForCrm[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const where = sourceFilterToWhere(workspaceId, sourceFilter);
    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: [{ score: "desc" }, { lastInteractionAt: "desc" }, { updatedAt: "desc" }],
      select: PROSPECT_SELECT,
    });

    return { success: true, data: prospects as ProspectForCrm[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}

export async function updateProspectStatusAction(
  prospectId: string,
  status: ProspectStatusPipeline,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    await prisma.prospect.updateMany({
      where: { id: prospectId, workspaceId },
      data: { status },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}

export async function getRelanceLeads(
  workspaceId: string
): Promise<{ success: boolean; data?: ProspectForCrm[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const prospects = await prisma.prospect.findMany({
      where: {
        workspaceId,
        status: { in: ["CONTACTED", "REPLIED"] },
        OR: [
          { lastInteractionAt: { lt: fourDaysAgo } },
          { lastInteractionAt: null, updatedAt: { lt: fourDaysAgo } },
        ],
      },
      orderBy: { lastInteractionAt: "asc" },
      select: PROSPECT_SELECT,
    });

    return { success: true, data: prospects as ProspectForCrm[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}
