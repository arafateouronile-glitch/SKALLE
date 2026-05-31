import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace)
    return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const post = await prisma.post.updateMany({
    where: { id, workspaceId: workspace.id, deletedAt: null },
    data: {
      status: body.status,
      ...(body.status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
    },
  });

  if (post.count === 0)
    return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

  return NextResponse.json({ success: true });
}
