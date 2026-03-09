import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { getArticle } from "@/actions/seo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);

    // Vérifier que l'article existe
    const articleResult = await getArticle(workspaceId, id);
    if (!articleResult.success) {
      return NextResponse.json({ error: articleResult.error }, { status: 404 });
    }

    // Déléguer au CMS existant
    const { publishPostToCMS } = await import("@/actions/cms");
    const result = await publishPostToCMS(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, link: result.link });
  } catch (error) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
