/**
 * API publique Skalle v1 — Headless SEO Factory (asynchrone)
 * POST /api/v1/seo/generate : déclencher la création d'un article SEO depuis l'extérieur (Zapier, Make, Airtable).
 *
 * Répond en 202 Accepted immédiatement pour éviter les timeouts (Vercel 10–15s).
 * La génération s'exécute en arrière-plan via Inngest.
 *
 * Auth : Authorization: Bearer <sk_live_xxx>
 * Body : { keyword, tone?, language? }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateSkalleApi, consumeApiCredits } from "@/lib/skalle-api-auth";
import { inngest } from "@/inngest/client";

const bodySchema = z.object({
  keyword: z.string().min(1).max(300).trim(),
  tone: z.string().max(50).optional().default("professional"),
  language: z.string().length(2).optional().default("fr"),
});

export async function POST(req: Request) {
  try {
    const auth = await authenticateSkalleApi(req, "api_seo_generate");
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Body JSON invalide" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Données invalides",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { keyword, tone, language } = parsed.data;

    const creditResult = await consumeApiCredits(
      auth.userId,
      "api_seo_generate",
      auth.workspaceId
    );
    if (!creditResult.success) {
      return NextResponse.json(
        { success: false, error: creditResult.error ?? "Crédits insuffisants" },
        { status: 402 }
      );
    }

    const sendResult = await inngest.send({
      name: "articles/single.generate",
      data: {
        workspaceId: auth.workspaceId,
        keyword,
        brandVoice: { tone, language },
      },
    });

    const jobId =
      typeof sendResult === "object" && sendResult?.ids?.[0]
        ? sendResult.ids[0]
        : "queued";

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId,
          message:
            "Génération lancée. L'article sera rédigé en arrière-plan et apparaîtra dans votre workspace.",
          keyword,
        },
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[api/v1/seo/generate]", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Erreur interne",
      },
      { status: 500 }
    );
  }
}
