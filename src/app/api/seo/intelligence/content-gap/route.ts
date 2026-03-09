import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { getContentGap } from "@/actions/seo";

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = await req.json().catch(() => null);
  if (!body?.userDomain || typeof body.userDomain !== "string") {
    return NextResponse.json({ error: "userDomain requis (string)" }, { status: 400 });
  }
  if (!Array.isArray(body.competitorDomains) || body.competitorDomains.length === 0) {
    return NextResponse.json({ error: "competitorDomains requis (array de strings, 1-5)" }, { status: 400 });
  }

  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);
  const result = await getContentGap(workspaceId, body.userDomain, body.competitorDomains);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
