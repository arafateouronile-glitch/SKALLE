/**
 * GET /api/integrations/apollo
 * Retourne si Apollo est disponible (clé configurée côté SKALLE).
 * La clé n'est jamais exposée au client.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export { getApolloApiKey } from "@/lib/services/apollo-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const available = !!process.env.APOLLO_API_KEY;
  return NextResponse.json({ available });
}
