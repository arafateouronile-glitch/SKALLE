import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { startBulkGeneration, getBatchJobProgress } from "@/actions/seo";
import { z } from "zod";

const bulkBodySchema = z.object({
  keywords: z.array(z.string().min(2)).min(1).max(300),
  workspaceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await req.json();
    const parsed = bulkBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const workspaceId = parsed.data.workspaceId || authResult.workspaceId;
    const result = await startBulkGeneration(workspaceId, parsed.data.keywords);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, data: { batchJobId: result.batchJobId } },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const url = new URL(req.url);
  const batchJobId = url.searchParams.get("batchJobId");
  if (!batchJobId) {
    return NextResponse.json({ error: "batchJobId requis" }, { status: 400 });
  }

  const result = await getBatchJobProgress(batchJobId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
