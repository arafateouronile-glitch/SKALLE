import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Columns shown in the Kanban (in order)
export const PIPELINE_COLUMNS = [
  "NEW",
  "RESEARCHED",
  "CONTACTED",
  "RESPONDED",
  "MEETING_BOOKED",
  "CONVERTED",
] as const;

export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number];

export interface PipelineProspect {
  id: string;
  name: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  emailStatus: string | null;
  emailVerified: boolean;
  linkedInUrl: string;
  score: number;
  temperature: string;
  platform: string | null;
  location: string | null;
  lastInteractionAt: string | null;
  personaName: string | null;
  status: PipelineColumn;
  createdAt: string;
}

const MAX_PER_COLUMN = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ columns: {}, counts: {} });

  // Fetch prospects for all visible columns in parallel
  const results = await Promise.all(
    PIPELINE_COLUMNS.map((status) =>
      prisma.prospect.findMany({
        where: { workspaceId: workspace.id, status },
        select: {
          id: true,
          name: true,
          company: true,
          jobTitle: true,
          email: true,
          emailStatus: true,
          emailVerified: true,
          linkedInUrl: true,
          score: true,
          temperature: true,
          platform: true,
          location: true,
          lastInteractionAt: true,
          createdAt: true,
          persona: { select: { name: true } },
        },
        orderBy: [{ score: "desc" }, { lastInteractionAt: "desc" }],
        take: MAX_PER_COLUMN,
      })
    )
  );

  // Count totals (separate query — cheaper than fetching all)
  const counts = await Promise.all(
    PIPELINE_COLUMNS.map((status) =>
      prisma.prospect.count({ where: { workspaceId: workspace.id, status } })
    )
  );

  const columns: Record<string, PipelineProspect[]> = {};
  const countMap: Record<string, number> = {};

  PIPELINE_COLUMNS.forEach((col, i) => {
    columns[col] = results[i].map((p) => ({
      id: p.id,
      name: p.name,
      company: p.company,
      jobTitle: p.jobTitle,
      email: p.email,
      emailStatus: p.emailStatus,
      emailVerified: p.emailVerified,
      linkedInUrl: p.linkedInUrl,
      score: p.score,
      temperature: p.temperature,
      platform: p.platform,
      location: p.location,
      lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
      personaName: p.persona?.name ?? null,
      status: col,
      createdAt: p.createdAt.toISOString(),
    }));
    countMap[col] = counts[i];
  });

  return NextResponse.json({ columns, counts: countMap });
}
