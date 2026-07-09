import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits, addCredits } from "@/lib/credits";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";

const STYLE_CONTEXTS: Record<string, string> = {
  studio:
    "clean light grey or soft white wall background, large diffused window light from the side creating a gentle natural highlight — no flash, no ring light, no studio umbrella, no artificial key lighting",
  lifestyle:
    "modern indoor setting lightly blurred in background — kitchen counter, living room or café visible, natural window light from the side, candid relaxed expression",
  business:
    "modern open-plan office or co-working space softly blurred in background, business casual attire, confident natural expression, daylight from a side window",
  casual:
    "outdoor street or park background softly blurred, open shade or overcast natural light — soft and even, no harsh shadows, relaxed everyday outfit, candid natural smile",
};

export async function POST(request: Request) {
  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey?.startsWith("sk-")) {
      return NextResponse.json({ error: "OPENAI_API_KEY non configuré." }, { status: 503 });
    }

    const body = (await request.json()) as { description?: string; style?: string };
    const description = body.description?.trim() ?? "";
    if (description.length < 5) {
      return NextResponse.json({ error: "Description trop courte (min 5 caractères)." }, { status: 400 });
    }

    const VALID_STYLES = ["studio", "lifestyle", "business", "casual"];
    const style = VALID_STYLES.includes(body.style ?? "") ? body.style! : "studio";
    const styleContext = STYLE_CONTEXTS[style];

    const workspace = await getOrCreateWorkspace(session);

    const creditResult = await useCredits(session.user.id, "avatar_generate");
    if (!creditResult.success) {
      return NextResponse.json({ error: "Crédits insuffisants (5 requis)." }, { status: 402 });
    }

    const prompt = `Candid portrait photo shot on iPhone 15 Pro in Portrait mode. ${description}. ${styleContext}. Person looking directly at camera, face centered in frame with natural headroom, slight computational bokeh on background (f/1.8 equivalent depth of field), sharp facial details with authentic skin pores and micro-texture — no airbrushing, no beauty filter, no plastic skin smoothing. Color temperature 5500–5800K, pure neutral white balance — absolutely no warm yellow tint, no orange cast, no color grading. Skin tones accurate and true to life. Slight authentic iPhone sensor noise in shadows. 28mm equivalent focal length. Looks like a real spontaneous photo taken by a friend, not a professional photoshoot. No text, no watermarks, no artifacts, portrait crop 2:3.`;

    const genRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1536",
        quality: "high",
      }),
    });

    if (!genRes.ok) {
      await addCredits(session.user.id, 5, "refund").catch(() => {});
      const err = await genRes.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
      console.error("[generate-avatar] Image gen error:", JSON.stringify(err));
      return NextResponse.json(
        { error: err.error?.message ?? "Erreur génération image." },
        { status: 502 }
      );
    }

    // gpt-image-1 returns base64-encoded image (no URL)
    const genData = (await genRes.json()) as { data?: { b64_json?: string }[] };
    const b64 = genData.data?.[0]?.b64_json;
    if (!b64) {
      await addCredits(session.user.id, 5, "refund").catch(() => {});
      return NextResponse.json({ error: "Image non reçue." }, { status: 502 });
    }

    const imageBuffer = Buffer.from(b64, "base64");

    // Create AvatarAsset record (storagePath set after upload)
    const asset = await prisma.avatarAsset.create({
      data: {
        workspaceId: workspace.id,
        name: description.slice(0, 60),
        storagePath: "pending",
      },
    });

    const storagePath = `${workspace.id}/avatars/${asset.id}.png`;
    await uploadToStorage(imageBuffer, storagePath, "image/png");

    await prisma.avatarAsset.update({
      where: { id: asset.id },
      data: { storagePath },
    });

    const previewUrl = await getSignedUrl(storagePath, 3600).catch(() => null);

    return NextResponse.json({
      avatar: {
        id: asset.id,
        name: asset.name,
        storagePath,
        previewUrl,
        createdAt: asset.createdAt,
      },
    });
  } catch (e) {
    console.error("[generate-avatar]", e);
    if (session?.user?.id) {
      await addCredits(session.user.id, 5, "refund").catch(() => {});
    }
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
