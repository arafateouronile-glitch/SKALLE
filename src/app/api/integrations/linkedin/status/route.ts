import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLinkedInStatus } from "@/lib/services/integrations/linkedin-api";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ connected: false });

  const workspace = await getOrCreateWorkspace(session);

  const status = await getLinkedInStatus(workspace.id);
  return NextResponse.json(status);
}
