/**
 * POST /api/social/find-email
 *
 * Trouve l'email professionnel d'un créateur ou blog.
 * Body: { platform, name, bio?, domain?, channelId?, businessEmail? }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findCreatorEmail } from "@/lib/services/social/email-finder";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json() as {
    platform: "youtube" | "linkedin" | "facebook" | "instagram" | "blog";
    name: string;
    bio?: string;
    domain?: string;
    channelId?: string;
    businessEmail?: string;
  };

  const { platform, name, bio, domain, channelId, businessEmail } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name requis" }, { status: 400 });

  const result = await findCreatorEmail({
    platform,
    name: name.trim(),
    bio,
    domain,
    channelId,
    businessEmail,
  });
  return NextResponse.json(result);
}
