import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { runEnhancedSEOAudit, getAuditHistory } from "@/actions/seo";
import { z } from "zod";

const auditBodySchema = z.object({
  url: z.string().url(),
  targetKeyword: z.string().optional(),
  includeCompetitors: z.boolean().optional(),
  workspaceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await req.json();
    const parsed = auditBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const workspaceId = parsed.data.workspaceId || authResult.workspaceId;
    const result = await runEnhancedSEOAudit({
      workspaceId,
      url: parsed.data.url,
      targetKeyword: parsed.data.targetKeyword,
      includeCompetitors: parsed.data.includeCompetitors,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);
  const url = new URL(req.url);
  const filterUrl = url.searchParams.get("url") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const result = await getAuditHistory(workspaceId, filterUrl, limit);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
