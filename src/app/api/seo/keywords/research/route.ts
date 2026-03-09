import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { researchKeyword } from "@/actions/seo";

export async function GET(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword");
  if (!keyword || keyword.length < 2) {
    return NextResponse.json({ error: "keyword requis (min 2 caractères)" }, { status: 400 });
  }

  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);
  const result = await researchKeyword(workspaceId, keyword);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
