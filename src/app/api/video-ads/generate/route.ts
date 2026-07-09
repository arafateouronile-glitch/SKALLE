import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { useCredits, addCredits } from "@/lib/credits";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { inngest } from "@/inngest/client";

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = (typeof VALID_VOICES)[number];

const VALID_MODELS = ["KLING", "SORA", "VEO", "SEEDANCE"] as const;
type VideoAdModel = (typeof VALID_MODELS)[number];

export async function POST(request: Request) {
  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY?.startsWith("sk-")) {
      return NextResponse.json(
        { error: "Synthèse vocale non configurée (OPENAI_API_KEY)." },
        { status: 503 }
      );
    }

    const workspace = await getOrCreateWorkspace(session);
    const body = (await request.json()) as {
      jobId: string;
      script: string;
      animationPrompt: string;
      voiceName?: string;
      videoModel?: string;
      ugcStyle?: string;
      movementType?: string;
      productContext?: string;
      subtitlePreset?: string;
      variantCount?: number;
      storyboardPlans?: unknown;
    };

    const videoModel: VideoAdModel = VALID_MODELS.includes(body.videoModel as VideoAdModel)
      ? (body.videoModel as VideoAdModel)
      : "KLING";

    // Validate the required API key per model
    if (videoModel === "KLING" && !process.env.KLING_API_KEY) {
      return NextResponse.json(
        { error: "Kling AI non configuré (KLING_API_KEY manquant)." },
        { status: 503 }
      );
    }
    if (videoModel === "VEO" && !process.env.GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Veo non configuré (GOOGLE_AI_API_KEY)." },
        { status: 503 }
      );
    }
    if (videoModel === "SEEDANCE" && !process.env.BYTEPLUS_ARK_API_KEY) {
      return NextResponse.json(
        { error: "Seedance non configuré (BYTEPLUS_ARK_API_KEY manquant)." },
        { status: 503 }
      );
    }
    // Sora uses OPENAI_API_KEY already validated above

    if (!body.jobId || !body.script?.trim() || !body.animationPrompt?.trim()) {
      return NextResponse.json(
        { error: "jobId, script et animationPrompt requis." },
        { status: 400 }
      );
    }

    const voiceName: OpenAIVoice = VALID_VOICES.includes(body.voiceName as OpenAIVoice)
      ? (body.voiceName as OpenAIVoice)
      : "nova";

    const job = await prisma.videoAdJob.findFirst({
      where: { id: body.jobId, workspaceId: workspace.id },
    });

    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    if (!job.avatarStoragePath && !job.baseVideoStoragePath) {
      return NextResponse.json(
        { error: "Photo avatar ou vidéo requise avant de générer." },
        { status: 400 }
      );
    }

    if (job.status === "ANIMATING" || job.status === "LIP_SYNCING") {
      return NextResponse.json({ jobId: job.id, status: job.status });
    }

    const variantCount = Math.max(1, Math.min(3, Math.floor(body.variantCount ?? 1)));
    const creditsNeeded = 20 * variantCount;

    // Charge all credits at once — refund covers only the primary job on failure
    for (let i = 0; i < variantCount; i++) {
      const creditResult = await useCredits(session.user.id, "video_ad_generate");
      if (!creditResult.success) {
        // Refund already-charged iterations
        if (i > 0) {
          await addCredits(session.user.id, i * 20, "refund").catch(() => {});
        }
        return NextResponse.json(
          { error: `Crédits insuffisants (${creditsNeeded} requis).` },
          { status: 402 }
        );
      }
    }

    const VALID_PRESETS = ["clean", "bold", "minimal"];
    const subtitlePreset = VALID_PRESETS.includes(body.subtitlePreset ?? "")
      ? body.subtitlePreset!
      : "clean";

    const scriptTrimmed = body.script.trim();
    const promptTrimmed = body.animationPrompt.trim();
    const ugcStyleVal = body.ugcStyle ?? "ugc_produit";
    const movementTypeVal = body.movementType ?? "statique";
    const productCtx = body.productContext?.trim() ?? "";

    // Update primary job
    await prisma.videoAdJob.update({
      where: { id: job.id },
      data: {
        status: "ANIMATING",
        script: scriptTrimmed,
        animationPrompt: promptTrimmed,
        voiceName,
        videoModel,
        ugcStyle: ugcStyleVal,
        movementType: movementTypeVal,
        creditsUsed: 20,
        errorMessage: null,
        finalVideoUrl: null,
        klingVideoUrl: null,
        audioStoragePath: null,
        klingImage2VideoTaskId: null,
        klingLipSyncTaskId: null,
        ...(body.storyboardPlans ? { storyboardPlans: body.storyboardPlans } : {}),
      },
    });

    // Create extra variant jobs (reuse same avatar/base-video path)
    const extraJobs = variantCount > 1
      ? await Promise.all(
          Array.from({ length: variantCount - 1 }).map(() =>
            prisma.videoAdJob.create({
              data: {
                workspaceId: workspace.id,
                avatarStoragePath: job.avatarStoragePath,
                baseVideoStoragePath: job.baseVideoStoragePath,
                status: "ANIMATING",
                script: scriptTrimmed,
                animationPrompt: promptTrimmed,
                voiceName,
                videoModel,
                ugcStyle: ugcStyleVal,
                movementType: movementTypeVal,
                creditsUsed: 20,
              },
            })
          )
        )
      : [];

    const allJobs = [job, ...extraJobs];

    await Promise.all(
      allJobs.map((j) =>
        inngest.send({
          name: "video-ads/pipeline.run",
          data: {
            jobId: j.id,
            workspaceId: workspace.id,
            userId: session!.user!.id,
            productContext: productCtx,
            subtitlePreset,
          },
        })
      )
    );

    return NextResponse.json(
      { variants: allJobs.map((j) => ({ jobId: j.id })), status: "ANIMATING" },
      { status: 202 }
    );
  } catch (e) {
    console.error("[video-ads/generate]", e);
    if (session?.user?.id) {
      await addCredits(session.user.id, 20, "refund").catch(() => {});
    }
    return NextResponse.json(
      { error: "Erreur lors du lancement de la génération." },
      { status: 500 }
    );
  }
}
