import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordVariantEngagement } from "@/lib/services/social/ab-tester";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string; variantId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { variantId } = await params;
  const body = await req.json() as { likes?: number; comments?: number; views?: number };

  const updated = await recordVariantEngagement(variantId, body);
  return NextResponse.json(updated);
}
