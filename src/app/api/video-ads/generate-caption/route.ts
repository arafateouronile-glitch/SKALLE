import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

const PLATFORM_PROMPTS: Record<string, string> = {
  tiktok: `TikTok — casual, hook fort, 2-4 emojis, 3-5 hashtags trending (#pourtoi #viral + niche), 80-120 mots, CTA "Lien en bio"`,
  instagram: `Instagram Reels — hook + corps + CTA, 3-5 emojis bien placés, 5-8 hashtags mix populaire + niche, 100-150 mots, CTA "Profil en bio"`,
  linkedin: `LinkedIn — ton professionnel mais accessible, 1-2 emojis max, stats/chiffres si possible, 3 hashtags métier, 120-180 mots, CTA "Commentez si ça vous parle"`,
};

export async function POST(request: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configuré." }, { status: 503 });
    }

    const body = (await request.json()) as {
      script?: string;
      ugcStyle?: string;
      productContext?: string;
    };

    const script = body.script?.trim() ?? "";
    if (script.length < 10) {
      return NextResponse.json({ error: "Script trop court." }, { status: 400 });
    }

    const platformInstructions = Object.entries(PLATFORM_PROMPTS)
      .map(([p, desc]) => `**${p.toUpperCase()}**: ${desc}`)
      .join("\n");

    const prompt = `Tu es copywriter expert UGC/social media. À partir de ce script vidéo, génère des captions optimisées pour chaque plateforme.

Script vidéo:
"""
${script.slice(0, 600)}
"""
${body.productContext ? `\nContexte produit: ${body.productContext}` : ""}

Instructions par plateforme:
${platformInstructions}

Réponds UNIQUEMENT en JSON valide, sans markdown:
{
  "tiktok": "<caption TikTok complète>",
  "instagram": "<caption Instagram complète>",
  "linkedin": "<caption LinkedIn complète>"
}

Chaque caption doit être prête à copier-coller. Adapte le ton mais garde le même message central.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Erreur IA." }, { status: 502 });
    }

    const data = (await res.json()) as { content?: { type: string; text: string }[] };
    const raw = data.content?.[0]?.text ?? "{}";

    let parsed: { tiktok?: string; instagram?: string; linkedin?: string } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim()) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "Réponse IA invalide." }, { status: 502 });
    }

    return NextResponse.json({
      tiktok: parsed.tiktok ?? "",
      instagram: parsed.instagram ?? "",
      linkedin: parsed.linkedin ?? "",
    });
  } catch (e) {
    console.error("[generate-caption]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
