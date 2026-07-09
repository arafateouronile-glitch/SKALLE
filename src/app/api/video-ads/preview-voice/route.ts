import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

const PREVIEW_TEXT =
  "Bonjour, je vais vous présenter quelque chose d'incroyable qui va changer votre façon de travailler.";

export async function POST(request: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY non configuré." }, { status: 503 });
    }

    const body = (await request.json()) as { voice?: string };
    const voice = VALID_VOICES.includes(body.voice ?? "") ? body.voice! : "nova";

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: PREVIEW_TEXT,
        voice,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[preview-voice] TTS error:", err);
      return NextResponse.json({ error: "Erreur TTS." }, { status: 502 });
    }

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[preview-voice]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
