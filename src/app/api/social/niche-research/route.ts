/**
 * POST /api/social/niche-research
 * Body: { topic: string, region?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { researchYouTubeNiche } from "@/lib/services/social/youtube-niche-research";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { topic, region = "FR" } = await req.json() as { topic?: string; region?: string };
  if (!topic?.trim()) return NextResponse.json({ error: "topic requis" }, { status: 400 });

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY non configurée. Ajoute-la dans tes variables d'environnement." },
      { status: 503 }
    );
  }

  try {
    const result = await researchYouTubeNiche(topic.trim(), region);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[niche-research]", e);
    return NextResponse.json({ error: "Erreur lors de l'analyse YouTube." }, { status: 500 });
  }
}
