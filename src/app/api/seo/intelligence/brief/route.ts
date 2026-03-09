import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { generateContentBrief } from "@/actions/seo";

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.keyword || typeof body.keyword !== "string") {
    return NextResponse.json({ error: "keyword requis (string)" }, { status: 400 });
  }

  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);
  const result = await generateContentBrief(workspaceId, body.keyword);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
