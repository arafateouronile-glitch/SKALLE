import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getWorkspaceIdFromRequest } from "@/lib/api-auth";
import { listArticles, generateSingleArticle } from "@/actions/seo";
import { z } from "zod";

const generateBodySchema = z.object({
  keyword: z.string().min(2),
  workspaceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiRequest(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await req.json();
    const parsed = generateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const workspaceId = parsed.data.workspaceId || authResult.workspaceId;
    const result = await generateSingleArticle(workspaceId, parsed.data.keyword);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
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
  const workspaceId = getWorkspaceIdFromRequest(req, authResult.workspaceId);

  const result = await listArticles({
    workspaceId,
    status: (url.searchParams.get("status") as "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED") || undefined,
    keyword: url.searchParams.get("keyword") || undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
    sortBy: (url.searchParams.get("sortBy") as "createdAt" | "updatedAt" | "title" | "seoScore") || "createdAt",
    sortOrder: (url.searchParams.get("sortOrder") as "asc" | "desc") || "desc",
    page: parseInt(url.searchParams.get("page") || "1", 10),
    perPage: parseInt(url.searchParams.get("perPage") || "20", 10),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
