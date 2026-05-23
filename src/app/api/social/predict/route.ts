import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { predictViralScore } from "@/lib/services/social/viral-predictor";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { content, platform } = await req.json() as {
    content?: string;
    platform?: string;
  };

  if (!content?.trim()) return NextResponse.json({ error: "Contenu requis" }, { status: 400 });

  const normalizedPlatform = (platform?.toUpperCase() ?? "LINKEDIN") as
    | "LINKEDIN"
    | "TWITTER"
    | "X"
    | "INSTAGRAM"
    | "TIKTOK";

  const prediction = await predictViralScore(content, normalizedPlatform);
  return NextResponse.json(prediction);
}
