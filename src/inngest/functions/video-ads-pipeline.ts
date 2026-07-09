import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { addCredits } from "@/lib/credits";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import {
  submitImage2Video as klingSubmitImage2Video,
  pollImage2Video as klingPollImage2Video,
  submitLipSync,
  pollLipSync,
} from "@/lib/services/video/kling-client";
import {
  submitSoraImage2Video,
  pollSoraGeneration,
} from "@/lib/services/video/sora-client";
import {
  submitVeoImage2Video,
  pollVeoGeneration,
} from "@/lib/services/video/veo-client";
import {
  submitSeedanceImage2Video,
  pollSeedanceGeneration,
} from "@/lib/services/video/seedance-client";
import { submitDIDTalk, pollDIDTalk } from "@/lib/services/video/did-client";
import { buildVideoPrompt, getBestThumbnailTimestamp } from "@/lib/services/video/prompt-builder";
import type { StoryboardPlan } from "@/lib/services/video/storyboard-templates";
import {
  compositeScreenOnUGC,
  burnSubtitles,
  extendVideoToSeconds,
  exportSquareVideo,
  exportLandscapeVideo,
  extractThumbnailAt,
  concatenateVideos,
  splitAudio,
  stitchVideos,
} from "@/lib/services/video/ffmpeg-composite";
import {
  transcribeWithWordTimestamps,
  buildAssSubtitles,
  type SubtitlePreset,
} from "@/lib/services/video/subtitle-generator";

// Each poll is its own step so Inngest can sleep between them without
// holding an HTTP connection open (avoids free-tier 2-min step timeout).
const MAX_POLLS = 60; // 60 × 15s = 15 min max per task (Kling/Seedance/Veo)
const MAX_POLLS_SORA = 80; // 80 × 15s = 20 min — Sora queue can be slow

// ~2.5 words/second for tts-1-hd (French + English average)
function estimateAudioDurationSeconds(script: string): number {
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount / 2.5);
}

async function generateTTSAudio(script: string, voice: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      input: script,
      voice,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS failed ${res.status}: ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// Dispatch image2video to the right model client
function estimateVideoDuration(script: string): "5" | "10" {
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  // ~2.5 words/second for tts-1-hd French → 12 words ≈ 5s
  return wordCount > 12 ? "10" : "5";
}

async function submitImage2Video(
  model: string,
  avatarUrl: string,
  prompt: string,
  duration: "5" | "10",
  dialogue?: string,
  targetSeconds?: number,
  generateAudio?: boolean
): Promise<string> {
  switch (model) {
    case "SORA":
      return submitSoraImage2Video(avatarUrl, prompt, duration === "10" ? 10 : 5);
    case "VEO":
      return submitVeoImage2Video(avatarUrl, prompt, dialogue, generateAudio ?? true);
    case "SEEDANCE":
      return submitSeedanceImage2Video(avatarUrl, prompt, targetSeconds ?? 8, dialogue, generateAudio ?? true);
    case "KLING":
    default:
      return klingSubmitImage2Video(avatarUrl, prompt, duration);
  }
}

async function pollImage2Video(
  model: string,
  taskId: string
): Promise<{ status: string; videoUrl?: string }> {
  switch (model) {
    case "SORA":
      return pollSoraGeneration(taskId);
    case "VEO":
      return pollVeoGeneration(taskId);
    case "SEEDANCE":
      return pollSeedanceGeneration(taskId);
    case "KLING":
    default:
      return klingPollImage2Video(taskId);
  }
}

export const runVideoAdPipeline = inngest.createFunction(
  {
    id: "video-ads-pipeline-run",
    name: "Video Ads UGC — Pipeline",
    retries: 2,
    timeouts: { finish: "50m" },
  },
  { event: "video-ads/pipeline.run" },
  async ({ event, step }) => {
    const { jobId, workspaceId, userId, productContext = "", subtitlePreset = "clean" } = event.data as {
      jobId: string;
      workspaceId: string;
      userId: string;
      productContext?: string;
      subtitlePreset?: string;
    };

    const job = await step.run("load-job", async () => {
      const j = await prisma.videoAdJob.findUnique({ where: { id: jobId } });
      if (!j) throw new Error(`VideoAdJob ${jobId} not found`);
      if (!j.avatarStoragePath && !j.baseVideoStoragePath) throw new Error("Missing avatar or base video");
      if (!j.script?.trim()) throw new Error("Missing script");
      return j;
    });

    const model = job.videoModel ?? "KLING";
    const hasScreenRecording = !!job.screenRecordingStoragePath;
    // Level 2: user uploaded a real selfie video — skip AI image2video, go straight to lip-sync
    const hasBaseVideo = !!job.baseVideoStoragePath;
    // Storyboard mode: generate N clips with per-plan prompts instead of prompt variations
    const storyboardPlans: StoryboardPlan[] | null =
      Array.isArray(job.storyboardPlans) && (job.storyboardPlans as StoryboardPlan[]).length > 0
        ? (job.storyboardPlans as StoryboardPlan[])
        : null;

    // Veo 3.1 and Seedance 1.5 Pro both support native audio (lip-sync built into the video).
    // When the script is short enough, skip TTS + Kling entirely — native audio does it all.
    // Max durations: Veo = 8s, Seedance = 12s. Sora has no native audio.
    // Storyboard mode disables native audio — TTS + Kling handles all audio uniformly.
    const audioDurationSecs = estimateAudioDurationSeconds(job.script ?? "");
    const isNativeAudio = !hasBaseVideo && !storyboardPlans && (
      (model === "VEO" && audioDurationSecs <= 8) ||
      (model === "SEEDANCE" && audioDurationSecs <= 12)
    );

    // Inject the spoken script as dialogue into the video prompt for native lip-sync.
    // Veo: first 8s of words (~20 words); Seedance: first 12s of words (~30 words).
    const nativeAudioMaxWords = model === "SEEDANCE" ? Math.floor(12 * 2.5) : Math.floor(8 * 2.5);
    const nativeAudioDialogue = (model === "VEO" || model === "SEEDANCE")
      ? (job.script ?? "").trim().split(/\s+/).slice(0, nativeAudioMaxWords).join(" ")
      : undefined;

    // Step 1 — TTS: generate audio from script (skipped when model uses native audio)
    const audioStoragePath = await step.run("generate-tts-audio", async () => {
      if (isNativeAudio) return null; // Veo / Seedance generate audio natively
      await prisma.videoAdJob.update({
        where: { id: jobId },
        data: { status: "TRANSCRIBING" },
      });

      const audioBuffer = await generateTTSAudio(job.script, job.voiceName);
      const path = `${workspaceId}/${jobId}/tts-audio.mp3`;
      await uploadToStorage(audioBuffer, path, "audio/mpeg");

      await prisma.videoAdJob.update({
        where: { id: jobId },
        data: { audioStoragePath: path, status: "ANIMATING" },
      });

      return path;
    });

    // Step 2 — get signed URLs (Kling + Sora need public URLs; Veo re-fetches internally)
    const { audioSignedUrl, avatarSignedUrl } = await step.run("get-signed-urls", async () => {
      const [audioSignedUrl, avatarSignedUrl] = await Promise.all([
        audioStoragePath ? getSignedUrl(audioStoragePath, 3600) : Promise.resolve(""),
        job.avatarStoragePath ? getSignedUrl(job.avatarStoragePath, 3600) : Promise.resolve(""),
      ]);
      return { audioSignedUrl, avatarSignedUrl };
    });

    // Step 3+4 — image2video OR real base video (Level 2)
    let animatedVideoUrl: string | undefined;
    // Total seconds of animation produced — used by extend step to decide whether to loop
    let totalAnimatedDuration: number;

    if (hasBaseVideo) {
      // Use the real selfie video directly — skip AI animation entirely
      animatedVideoUrl = await step.run("get-base-video-url", async () => {
        await prisma.videoAdJob.update({ where: { id: jobId }, data: { status: "LIP_SYNCING" } });
        return getSignedUrl(job.baseVideoStoragePath!, 7200);
      });
      totalAnimatedDuration = audioDurationSecs + 1; // real video assumed ≥ audio, skip loop
    } else {
      // Deterministic params — computed outside steps so multi-clip can reuse them
      const enrichedPrompt = buildVideoPrompt(job.animationPrompt, job.ugcStyle ?? "ugc_produit", productContext, job.script ?? "", job.movementType ?? "statique");
      const klingDuration = estimateVideoDuration(job.script ?? "");
      const seedanceDuration = Math.min(audioDurationSecs, 12);

      if (storyboardPlans) {
        // ── STORYBOARD MODE ───────────────────────────────────────────────────
        // Generate one clip per plan with its own camera/scene/action prompt.
        // Plans are stitched in order → authentic multi-cut UGC ad.
        const numPlans = storyboardPlans.length;
        totalAnimatedDuration = 5 * numPlans; // min clip duration × plan count

        // Per-plan model: use plan.preferredModel if set, otherwise fall back to job model.
        // e.g. Plans 1 & 3 (no face) → SORA for cinematic angles; Plan 2 (face) → job model for lip-sync.
        const planModels = storyboardPlans.map((p) => p.preferredModel ?? model);

        const taskIds = await Promise.all(
          storyboardPlans.map((plan, c) =>
            step.run(`submit-plan-${c}`, async () => {
              const planPrompt = buildVideoPrompt(
                plan.contentDirection,
                job.ugcStyle ?? "ugc_app",
                productContext,
                c === 0 ? (job.script ?? "") : "", // script timing cues only on plan 1 (hook)
                plan.movementType
              );
              return submitImage2Video(planModels[c], avatarSignedUrl, planPrompt, "5", undefined, 5);
            })
          )
        );

        await step.run("register-storyboard-task", async () => {
          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { klingImage2VideoTaskId: taskIds[0] },
          });
        });

        const storyboardMaxPolls = planModels.some((m) => m === "SORA") ? MAX_POLLS_SORA : MAX_POLLS;
        const clipUrls: (string | undefined)[] = new Array(numPlans).fill(undefined);
        for (let i = 0; i < storyboardMaxPolls; i++) {
          const pollResults = await step.run(`poll-plans-${i}`, async () =>
            Promise.all(
              taskIds.map((taskId, c) =>
                pollImage2Video(planModels[c], taskId).then(r => ({ c, status: r.status, videoUrl: r.videoUrl }))
              )
            )
          );

          let allDone = true;
          for (const r of pollResults) {
            if (r.status === "succeed" && r.videoUrl) clipUrls[r.c] = r.videoUrl;
            else if (r.status === "failed") throw new Error(`${planModels[r.c]} plan ${r.c} (${taskIds[r.c]}) failed`);
            if (!clipUrls[r.c]) allDone = false;
          }
          if (allDone) break;
          if (i < storyboardMaxPolls - 1) await step.sleep(`wait-plans-${i}`, "15s");
        }

        if (!clipUrls.every(Boolean)) throw new Error(`Storyboard generation timed out (models: ${planModels.join(", ")})`);

        animatedVideoUrl = await step.run("concat-storyboard", async () => {
          const buffers = await Promise.all(
            (clipUrls as string[]).map(url =>
              fetch(url)
                .then(r => { if (!r.ok) throw new Error(`Plan download failed: ${r.status}`); return r.arrayBuffer(); })
                .then(ab => Buffer.from(ab))
            )
          );
          const concatenated = await concatenateVideos(buffers);
          const concatPath = `${workspaceId}/${jobId}/storyboard.mp4`;
          await uploadToStorage(concatenated, concatPath, "video/mp4");
          return getSignedUrl(concatPath, 3600);
        });

      } else {
        // ── STANDARD / MULTI-CLIP ─────────────────────────────────────────────
        // Max clip duration per model (seconds)
        const clipMaxDuration =
          model === "VEO" ? 8 :
          model === "SEEDANCE" ? 12 :
          model === "SORA" ? (klingDuration === "10" ? 10 : 5) :
          model === "KLING" ? (klingDuration === "10" ? 10 : 5) : 5;

        // Generate multiple clips when audio exceeds one clip length (max 3 to control cost).
        // isNativeAudio always implies audioDuration ≤ clipMaxDuration → numClips === 1.
        const numClips = isNativeAudio ? 1 : Math.min(3, Math.ceil(audioDurationSecs / clipMaxDuration));
        totalAnimatedDuration = clipMaxDuration * numClips;

        if (numClips === 1) {
          // ── SINGLE CLIP ─────────────────────────────────────────────────────
          const image2VideoTaskId = await step.run("submit-image2video", async () => {
            const taskId = await submitImage2Video(model, avatarSignedUrl, enrichedPrompt, klingDuration, nativeAudioDialogue, seedanceDuration);
            await prisma.videoAdJob.update({
              where: { id: jobId },
              data: { klingImage2VideoTaskId: taskId },
            });
            return taskId;
          });

          for (let i = 0; i < MAX_POLLS; i++) {
            const pollResult = await step.run(`poll-image2video-${i}`, async () =>
              pollImage2Video(model, image2VideoTaskId)
            );
            if (pollResult.status === "succeed" && pollResult.videoUrl) {
              animatedVideoUrl = pollResult.videoUrl;
              break;
            }
            if (pollResult.status === "failed") {
              throw new Error(`${model} image2video task ${image2VideoTaskId} failed`);
            }
            if (i < MAX_POLLS - 1) await step.sleep(`wait-image2video-${i}`, "15s");
          }
          if (!animatedVideoUrl) throw new Error(`${model} image2video task timed out`);

          // Veo / Seedance with native audio: clip already contains audio — skip TTS + Kling
          if (isNativeAudio) {
            await step.run("persist-result", async () => {
              await prisma.videoAdJob.update({
                where: { id: jobId },
                data: { status: "DONE", finalVideoUrl: animatedVideoUrl, klingVideoUrl: animatedVideoUrl },
              });
              await prisma.aPIUsage.create({
                data: { service: model.toLowerCase(), operation: "video_ad_generate", credits: 20, workspaceId },
              });
            });
            return { jobId, finalVideoUrl: animatedVideoUrl };
          }
        } else {
          // ── MULTI-CLIP ───────────────────────────────────────────────────────
          // Generate N clips in parallel with slight prompt variations so that when
          // the concatenated sequence is looped for long scripts, the motion diversity
          // hides the repeat (3 × 12s concat looped 1.7× >> 1 × 12s looped 5×).
          const CLIP_VARIATIONS = [
            "",
            "\n\n[CLIP VARIATION: alternate motion phase — slightly different gesture timing and postural shift. Natural human variation.]",
            "\n\n[CLIP VARIATION: third take — different gesture emphasis and head position. Same person, same energy, natural variation.]",
          ];

          const taskIds = await Promise.all(
            Array.from({ length: numClips }, (_, c) =>
              step.run(`submit-clip-${c}`, async () => {
                const variantPrompt = enrichedPrompt + (CLIP_VARIATIONS[c] ?? "");
                return submitImage2Video(model, avatarSignedUrl, variantPrompt, klingDuration, undefined, seedanceDuration);
              })
            )
          );

          await step.run("register-task-ids", async () => {
            await prisma.videoAdJob.update({
              where: { id: jobId },
              data: { klingImage2VideoTaskId: taskIds[0] },
            });
          });

          const clipUrls: (string | undefined)[] = new Array(numClips).fill(undefined);
          for (let i = 0; i < MAX_POLLS; i++) {
            const pollResults = await step.run(`poll-clips-${i}`, async () =>
              Promise.all(
                taskIds.map((taskId, c) =>
                  pollImage2Video(model, taskId).then(r => ({ c, status: r.status, videoUrl: r.videoUrl }))
                )
              )
            );

            let allDone = true;
            for (const r of pollResults) {
              if (r.status === "succeed" && r.videoUrl) clipUrls[r.c] = r.videoUrl;
              else if (r.status === "failed") throw new Error(`${model} clip ${r.c} (task ${taskIds[r.c]}) failed`);
              if (!clipUrls[r.c]) allDone = false;
            }

            if (allDone) break;
            if (i < MAX_POLLS - 1) await step.sleep(`wait-clips-${i}`, "15s");
          }

          if (!clipUrls.every(Boolean)) throw new Error(`${model} multi-clip generation timed out`);

          animatedVideoUrl = await step.run("concat-clips", async () => {
            const buffers = await Promise.all(
              (clipUrls as string[]).map(url =>
                fetch(url)
                  .then(r => { if (!r.ok) throw new Error(`Clip download failed: ${r.status}`); return r.arrayBuffer(); })
                  .then(ab => Buffer.from(ab))
              )
            );
            const concatenated = await concatenateVideos(buffers);
            const concatPath = `${workspaceId}/${jobId}/concat-clips.mp4`;
            await uploadToStorage(concatenated, concatPath, "video/mp4");
            return getSignedUrl(concatPath, 3600);
          });
        }
      }
    }

    // Hook+body mode: Seedance/Veo/Sora generates a dynamic hook clip, D-ID generates the rest.
    // D-ID drives head/body movements from the audio prosody → coherent gestures, any duration.
    // Only active when D_ID_API_KEY is set and audio exceeds one clip length.
    const clipMaxDurationForMode =
      model === "VEO" ? 8 :
      model === "SEEDANCE" ? 12 :
      model === "SORA" ? 10 : 0;
    const isHookBodyMode =
      !hasBaseVideo &&
      !storyboardPlans && // storyboard manages its own clips
      clipMaxDurationForMode > 0 &&
      audioDurationSecs > clipMaxDurationForMode &&
      !isNativeAudio &&
      !!process.env.D_ID_API_KEY;

    let finalVideoUrl: string | undefined;

    if (isHookBodyMode) {
      // ── HOOK + D-ID BODY ────────────────────────────────────────────────────
      // Split TTS audio at hook boundary, then generate both clips in parallel.

      const { hookAudioUrl, bodyAudioUrl } = await step.run("split-audio", async () => {
        const audioRes = await fetch(audioSignedUrl);
        if (!audioRes.ok) throw new Error("Failed to download TTS audio for split");
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        const { before, after } = await splitAudio(audioBuffer, clipMaxDurationForMode);

        const hookPath = `${workspaceId}/${jobId}/hook-audio.mp3`;
        const bodyPath = `${workspaceId}/${jobId}/body-audio.mp3`;
        await Promise.all([
          uploadToStorage(before, hookPath, "audio/mpeg"),
          uploadToStorage(after, bodyPath, "audio/mpeg"),
        ]);
        const [hookUrl, bodyUrl] = await Promise.all([
          getSignedUrl(hookPath, 3600),
          getSignedUrl(bodyPath, 7200),
        ]);
        return { hookAudioUrl: hookUrl, bodyAudioUrl: bodyUrl };
      });

      // Submit hook (Seedance/Veo, native audio disabled — Kling will lip-sync it)
      // Submit D-ID body in parallel (D-ID does its own lip-sync from body audio)
      const hookPrompt = buildVideoPrompt(
        job.animationPrompt,
        job.ugcStyle ?? "ugc_produit",
        productContext,
        job.script ?? "",
        job.movementType ?? "statique"
      );
      const [hookTaskId, didTalkId] = await Promise.all([
        step.run("submit-hook", async () => {
          const taskId = await submitImage2Video(
            model, avatarSignedUrl, hookPrompt,
            estimateVideoDuration(job.script ?? ""),
            undefined, clipMaxDurationForMode,
            false // no native audio — Kling handles hook lip-sync
          );
          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { klingImage2VideoTaskId: taskId, status: "ANIMATING" },
          });
          return taskId;
        }),
        step.run("submit-did-body", async () => {
          return submitDIDTalk(avatarSignedUrl, bodyAudioUrl);
        }),
      ]);

      // Poll hook + D-ID together each round (both must finish before stitching)
      let hookVideoUrl: string | undefined;
      let didBodyUrl: string | undefined;
      for (let i = 0; i < MAX_POLLS; i++) {
        const [hookPoll, didPoll] = await Promise.all([
          step.run(`poll-hook-${i}`, () => pollImage2Video(model, hookTaskId)),
          step.run(`poll-did-${i}`, () => pollDIDTalk(didTalkId)),
        ]);

        if (hookPoll.status === "succeed" && hookPoll.videoUrl) hookVideoUrl = hookPoll.videoUrl;
        if (hookPoll.status === "failed") throw new Error(`${model} hook generation failed`);
        if (didPoll.status === "done" && didPoll.videoUrl) didBodyUrl = didPoll.videoUrl;
        if (didPoll.status === "error") throw new Error("D-ID body generation failed");

        if (hookVideoUrl && didBodyUrl) break;
        if (i < MAX_POLLS - 1) await step.sleep(`wait-hook-did-${i}`, "15s");
      }
      if (!hookVideoUrl) throw new Error(`${model} hook generation timed out`);
      if (!didBodyUrl) throw new Error("D-ID body generation timed out");

      // Kling lip-sync on the hook only (hook video + hook audio)
      await prisma.videoAdJob.update({
        where: { id: jobId },
        data: { status: "LIP_SYNCING", klingVideoUrl: hookVideoUrl },
      });
      const hookLipSyncTaskId = await step.run("submit-hook-lipsync", async () => {
        const taskId = await submitLipSync(hookVideoUrl!, hookAudioUrl);
        await prisma.videoAdJob.update({
          where: { id: jobId },
          data: { klingLipSyncTaskId: taskId },
        });
        return taskId;
      });

      let lipSyncedHookUrl: string | undefined;
      for (let i = 0; i < MAX_POLLS; i++) {
        const pollResult = await step.run(`poll-hook-lipsync-${i}`, () =>
          pollLipSync(hookLipSyncTaskId)
        );
        if (pollResult.status === "succeed" && pollResult.videoUrl) {
          lipSyncedHookUrl = pollResult.videoUrl;
          break;
        }
        if (pollResult.status === "failed") throw new Error("Kling hook lip-sync failed");
        if (i < MAX_POLLS - 1) await step.sleep(`wait-hook-lipsync-${i}`, "15s");
      }
      if (!lipSyncedHookUrl) throw new Error("Kling hook lip-sync timed out");

      // Stitch lip-synced hook + D-ID body → final video
      finalVideoUrl = await step.run("stitch-hook-body", async () => {
        const [hookRes, bodyRes] = await Promise.all([
          fetch(lipSyncedHookUrl!),
          fetch(didBodyUrl!),
        ]);
        if (!hookRes.ok) throw new Error(`Hook download failed: ${hookRes.status}`);
        if (!bodyRes.ok) throw new Error(`D-ID body download failed: ${bodyRes.status}`);

        const [hookBuf, bodyBuf] = await Promise.all([
          hookRes.arrayBuffer().then(Buffer.from),
          bodyRes.arrayBuffer().then(Buffer.from),
        ]);

        const stitched = await stitchVideos([hookBuf, bodyBuf]);
        const stitchedPath = `${workspaceId}/${jobId}/stitched.mp4`;
        await uploadToStorage(stitched, stitchedPath, "video/mp4");
        return getSignedUrl(stitchedPath, 30 * 24 * 3600);
      });
    } else {
      // ── STANDARD FLOW: extend + Kling lip-sync ─────────────────────────────
      const lipSyncSourceUrl = await step.run("extend-video-for-lipsync", async () => {
        const audioDuration = estimateAudioDurationSeconds(job.script);
        const baseDuration = totalAnimatedDuration;

        if (!hasBaseVideo) {
          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { status: "LIP_SYNCING", klingVideoUrl: animatedVideoUrl },
          });
        }

        if (audioDuration <= baseDuration) return animatedVideoUrl!;

        const baseRes = await fetch(animatedVideoUrl!);
        if (!baseRes.ok) throw new Error(`Failed to download base video for looping: ${baseRes.status}`);
        const baseBuffer = Buffer.from(await baseRes.arrayBuffer());

        const extended = await extendVideoToSeconds(baseBuffer, audioDuration + 2);
        const extPath = `${workspaceId}/${jobId}/extended-base.mp4`;
        await uploadToStorage(extended, extPath, "video/mp4");
        return getSignedUrl(extPath, 3600);
      });

      const lipSyncTaskId = await step.run("submit-lipsync", async () => {
        const taskId = await submitLipSync(lipSyncSourceUrl, audioSignedUrl);
        await prisma.videoAdJob.update({
          where: { id: jobId },
          data: { klingLipSyncTaskId: taskId },
        });
        return taskId;
      });

      for (let i = 0; i < MAX_POLLS; i++) {
        const pollResult = await step.run(`poll-lipsync-${i}`, async () =>
          pollLipSync(lipSyncTaskId)
        );
        if (pollResult.status === "succeed" && pollResult.videoUrl) {
          finalVideoUrl = pollResult.videoUrl;
          break;
        }
        if (pollResult.status === "failed") {
          throw new Error(`Kling lip-sync task ${lipSyncTaskId} failed`);
        }
        if (i < MAX_POLLS - 1) await step.sleep(`wait-lipsync-${i}`, "15s");
      }
      if (!finalVideoUrl) throw new Error(`Kling lip-sync task timed out`);
    }

    // Step 7 — composite screen recording onto UGC video (only if user uploaded one)
    let compositeVideoUrl: string | null = null;
    if (hasScreenRecording) {
      compositeVideoUrl = await step.run("composite-screen-recording", async () => {
        try {
          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { status: "COMPOSITING" },
          });

          // Get signed URL for screen recording, then download both videos
          const screenSignedUrl = await getSignedUrl(job.screenRecordingStoragePath!, 3600);
          const [ugcRes, screenRes] = await Promise.all([
            fetch(finalVideoUrl),
            fetch(screenSignedUrl),
          ]);

          if (!ugcRes.ok) throw new Error(`Failed to download UGC video: ${ugcRes.status}`);
          if (!screenRes.ok) throw new Error(`Failed to download screen recording: ${screenRes.status}`);

          const [ugcBuffer, screenBuffer] = await Promise.all([
            ugcRes.arrayBuffer().then(Buffer.from),
            screenRes.arrayBuffer().then(Buffer.from),
          ]);

          // FFmpeg WASM composite: PiP overlay
          const composited = await compositeScreenOnUGC(ugcBuffer, screenBuffer);

          // Upload composited video to Supabase
          const compositePath = `${workspaceId}/${jobId}/composite.mp4`;
          await uploadToStorage(composited, compositePath, "video/mp4");
          const signedUrl = await getSignedUrl(compositePath, 30 * 24 * 3600);

          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { compositeVideoUrl: signedUrl },
          });

          return signedUrl;
        } catch (err) {
          // Compositing is non-critical — log and skip gracefully
          console.error("[composite-screen-recording] FFmpeg composite failed, skipping:", err);
          return null;
        }
      });
    }

    // Step 8 — transcribe TTS audio to get word-level timestamps for subtitles
    const wordTimestamps = await step.run("transcribe-for-subtitles", async () => {
      try {
        await prisma.videoAdJob.update({
          where: { id: jobId },
          data: { status: "CAPTIONING" },
        });

        const audioSignedUrlForSubs = await getSignedUrl(audioStoragePath!, 3600);
        const audioRes = await fetch(audioSignedUrlForSubs);
        if (!audioRes.ok) throw new Error(`Failed to download TTS audio: ${audioRes.status}`);

        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        return await transcribeWithWordTimestamps(audioBuffer);
      } catch (err) {
        console.error("[transcribe-for-subtitles] Whisper failed, skipping captions:", err);
        return null;
      }
    });

    // Step 9 — burn subtitles into the best available video (composite > finalVideoUrl)
    let captionedVideoUrl: string | null = null;
    if (wordTimestamps && wordTimestamps.length > 0) {
      captionedVideoUrl = await step.run("burn-subtitles", async () => {
        try {
          const assContent = buildAssSubtitles(wordTimestamps, subtitlePreset as SubtitlePreset);
          const sourceUrl = compositeVideoUrl ?? finalVideoUrl;

          const sourceRes = await fetch(sourceUrl);
          if (!sourceRes.ok) throw new Error(`Failed to download source video: ${sourceRes.status}`);

          const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());
          const captioned = await burnSubtitles(sourceBuffer, assContent);

          const captionedPath = `${workspaceId}/${jobId}/captioned.mp4`;
          await uploadToStorage(captioned, captionedPath, "video/mp4");
          const url = await getSignedUrl(captionedPath, 30 * 24 * 3600);

          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { captionedVideoUrl: url },
          });

          return url;
        } catch (err) {
          console.error("[burn-subtitles] FFmpeg subtitle burn failed, skipping:", err);
          return null;
        }
      });
    }

    // Step 10 — export format variants (1:1 square + 16:9 landscape) + thumbnail
    const sourceForExport = captionedVideoUrl ?? compositeVideoUrl ?? finalVideoUrl;

    const { squareVideoUrl, landscapeVideoUrl, thumbnailUrl } = await step.run(
      "export-format-variants",
      async () => {
        try {
          await prisma.videoAdJob.update({
            where: { id: jobId },
            data: { status: "EXPORTING" },
          });

          const sourceRes = await fetch(sourceForExport);
          if (!sourceRes.ok) throw new Error(`Failed to download source for export: ${sourceRes.status}`);
          const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());

          // Generate all 3 exports in parallel
          const thumbTimestamp = getBestThumbnailTimestamp(job.script ?? "");
          const [squareBuf, landscapeBuf, thumbBuf] = await Promise.all([
            exportSquareVideo(sourceBuffer),
            exportLandscapeVideo(sourceBuffer),
            extractThumbnailAt(sourceBuffer, thumbTimestamp),
          ]);

          const [squarePath, landscapePath, thumbPath] = [
            `${workspaceId}/${jobId}/square.mp4`,
            `${workspaceId}/${jobId}/landscape.mp4`,
            `${workspaceId}/${jobId}/thumbnail.jpg`,
          ];

          await Promise.all([
            uploadToStorage(squareBuf, squarePath, "video/mp4"),
            uploadToStorage(landscapeBuf, landscapePath, "video/mp4"),
            uploadToStorage(thumbBuf, thumbPath, "image/jpeg"),
          ]);

          const [squareVideoUrl, landscapeVideoUrl, thumbnailUrl] = await Promise.all([
            getSignedUrl(squarePath, 30 * 24 * 3600),
            getSignedUrl(landscapePath, 30 * 24 * 3600),
            getSignedUrl(thumbPath, 30 * 24 * 3600),
          ]);

          return { squareVideoUrl, landscapeVideoUrl, thumbnailUrl };
        } catch (err) {
          console.error("[export-format-variants] Failed, skipping:", err);
          return { squareVideoUrl: null, landscapeVideoUrl: null, thumbnailUrl: null };
        }
      }
    );

    // Step 11 — persist result
    await step.run("persist-result", async () => {
      await prisma.videoAdJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          finalVideoUrl,
          ...(compositeVideoUrl ? { compositeVideoUrl } : {}),
          ...(captionedVideoUrl ? { captionedVideoUrl } : {}),
          ...(squareVideoUrl ? { squareVideoUrl } : {}),
          ...(landscapeVideoUrl ? { landscapeVideoUrl } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        },
      });
      await prisma.aPIUsage.create({
        data: {
          service: model.toLowerCase(),
          operation: "video_ad_generate",
          credits: 20,
          workspaceId,
        },
      });
    });

    return { jobId, finalVideoUrl, compositeVideoUrl, captionedVideoUrl, squareVideoUrl, landscapeVideoUrl, thumbnailUrl };
  }
);

export const videoAdPipelineFailure = inngest.createFunction(
  { id: "video-ads-pipeline-failure", name: "Video Ads Pipeline — On Failure" },
  { event: "inngest/function.failed" },
  async ({ event }) => {
    const originalEvent = event.data?.event;
    if (originalEvent?.name !== "video-ads/pipeline.run") return;

    const { jobId, userId } = originalEvent.data as { jobId: string; userId: string };
    const errorMessage =
      (event.data?.error?.message as string) ?? "Erreur inconnue lors de la génération.";

    await prisma.videoAdJob
      .update({ where: { id: jobId }, data: { status: "FAILED", errorMessage } })
      .catch(() => {});

    await addCredits(userId, 20, "refund").catch(() => {});
  }
);
