import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

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

    const body = (await request.json()) as { script?: string; ugcStyle?: string };
    const script = body.script?.trim() ?? "";
    if (script.length < 10) {
      return NextResponse.json({ error: "Script trop court." }, { status: 400 });
    }

    const prompt = `Tu es expert en copywriting UGC TikTok/Reels. Analyse le HOOK (les 2-3 premières secondes) de ce script vidéo.

Script:
"""
${script.slice(0, 800)}
"""
Style: ${body.ugcStyle ?? "ugc_app"}

Réponds UNIQUEMENT en JSON valide, sans markdown:
{
  "score": <entier 1-10>,
  "issue": "<problème principal en moins de 8 mots>",
  "tip": "<amélioration concrète et actionnable en moins de 15 mots>"
}

Critères de scoring:
1-3: Hook générique, pas d'accroche, démarre trop lentement
4-5: Hook correct mais perfectible, manque de punch
6-7: Bon hook, accrocheur, peut être amélioré
8-9: Excellent hook, scroll-stopper, intrigue immédiate
10: Hook parfait, viral, pain point + curiosité + promesse en <3s`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Erreur IA." }, { status: 502 });
    }

    const data = await res.json() as { content?: { type: string; text: string }[] };
    const raw = data.content?.[0]?.text ?? "{}";

    let parsed: { score?: number; issue?: string; tip?: string } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim()) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "Réponse IA invalide." }, { status: 502 });
    }

    const score = Math.max(1, Math.min(10, Math.round(parsed.score ?? 5)));
    const level = score <= 4 ? "weak" : score <= 7 ? "good" : "excellent";

    return NextResponse.json({
      score,
      level,
      issue: parsed.issue ?? "",
      tip: parsed.tip ?? "",
    });
  } catch (e) {
    console.error("[score-hook]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
