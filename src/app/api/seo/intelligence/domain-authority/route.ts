import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { getDomainAuthorityAction } from "@/actions/seo";

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.domain || typeof body.domain !== "string") {
    return NextResponse.json({ error: "domain requis (string)" }, { status: 400 });
  }

  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);
  const result = await getDomainAuthorityAction(workspaceId, body.domain);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
