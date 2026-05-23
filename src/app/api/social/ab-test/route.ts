import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAbTest, getAbTests } from "@/lib/services/social/ab-tester";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const tests = await getAbTests(workspace.id);
  return NextResponse.json(tests);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const { name, baseContent, platform } = await req.json() as {
    name?: string;
    baseContent?: string;
    platform?: string;
  };

  if (!baseContent?.trim()) return NextResponse.json({ error: "Contenu requis" }, { status: 400 });

  const test = await createAbTest(
    workspace.id,
    name ?? `A/B Test ${new Date().toLocaleDateString("fr-FR")}`,
    baseContent,
    platform ?? "LINKEDIN"
  );

  return NextResponse.json(test, { status: 201 });
}
