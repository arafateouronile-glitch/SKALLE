/**
 * 🎙️ Voice-to-Content — Transcription audio via OpenAI Whisper
 * POST multipart/form-data : champ "file" (audio webm/mp3/m4a, max 25 MB)
 * Débite 1 crédit. Retourne { text: string } ou { error: string }
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits, addCredits } from "@/lib/credits";

const OPENAI_TRANSCRIBE = "https://api.openai.com/v1/audio/transcriptions";
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(_request: Request) {
  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey?.startsWith("sk-")) {
      return NextResponse.json(
        { error: "Transcription non configurée (OPENAI_API_KEY)." },
        { status: 503 }
      );
    }

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace non trouvé." }, { status: 404 });
    }

    const creditResult = await useCredits(session.user.id, "voice_transcribe");
    if (!creditResult.success) {
      return NextResponse.json(
        { error: creditResult.error ?? "Crédits insuffisants." },
        { status: 402 }
      );
    }

    const formData = await _request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Fichier audio requis (champ 'file')." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 25 Mo)." },
        { status: 400 }
      );
    }

    const body = new FormData();
    body.append("file", file);
    body.append("model", "whisper-1");
    body.append("language", "fr");

    const res = await fetch(OPENAI_TRANSCRIBE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Whisper]", res.status, err);
      await addCredits(session.user.id, 1, "refund");
      return NextResponse.json(
        { error: res.status === 401 ? "Clé API OpenAI invalide." : "Erreur lors de la transcription." },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? "").trim();

    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "voice_transcribe",
        credits: 1,
        workspaceId: workspace.id,
      },
    });

    return NextResponse.json({ text });
  } catch (e) {
    console.error("[Whisper]", e);
    if (session?.user?.id) {
      await addCredits(session.user.id, 1, "refund").catch(() => {});
    }
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la transcription." },
      { status: 500 }
    );
  }
}
