// BytePlus ModelArk — Dreamina Seedance 1.5 Pro (image-to-video)
// Endpoint: ark.ap-southeast.bytepluses.com
// Auth: Bearer token (BYTEPLUS_ARK_API_KEY)
//
// Note: Seedance 2.0 series DOES NOT support direct upload of real human face images.
// We use Seedance 1.5 Pro which accepts face images, native audio, duration 4–12s.

const BYTEPLUS_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

// Seedance 1.5 Pro: image-to-video with faces + native audio (generate_audio: true)
const MODEL_IMAGE2VIDEO = "seedance-1-5-pro-251215";

function getApiKey(): string {
  const key = process.env.BYTEPLUS_ARK_API_KEY;
  if (!key) throw new Error("BYTEPLUS_ARK_API_KEY not configured");
  return key;
}

/**
 * Submits an image-to-video task to Seedance 1.5 Pro.
 * Returns the async task ID for polling.
 *
 * @param imageUrl   Public URL of the avatar image (first frame)
 * @param prompt     Enriched motion/style prompt
 * @param duration   Target seconds [4–12]; clamped automatically
 * @param dialogue   Optional spoken text — injected in quotes for native audio lip-sync
 */
export async function submitSeedanceImage2Video(
  imageUrl: string,
  prompt: string,
  duration = 8,
  dialogue?: string,
  generateAudio = true
): Promise<string> {
  const apiKey = getApiKey();

  // Inject dialogue in quotes so Seedance native audio optimizes for it
  const fullPrompt = dialogue
    ? `${prompt}\n\nThe person says: "${dialogue}"`
    : prompt;

  const res = await fetch(`${BYTEPLUS_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_IMAGE2VIDEO,
      content: [
        {
          type: "image_url",
          image_url: { url: imageUrl },
          role: "first_frame",
        },
        {
          type: "text",
          text: fullPrompt,
        },
      ],
      resolution: "720p",
      ratio: "9:16",
      duration: Math.max(4, Math.min(12, Math.round(duration))),
      generate_audio: generateAudio,
      watermark: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seedance submit error ${res.status}: ${err}`);
  }

  const data = await res.json() as { id?: string };
  if (!data?.id) throw new Error("Seedance: no task ID returned");
  return data.id;
}

/**
 * Polls the status of a Seedance generation task.
 * Returns { status: "succeed", videoUrl } on completion.
 */
export async function pollSeedanceGeneration(
  taskId: string
): Promise<{ status: string; videoUrl?: string }> {
  const apiKey = getApiKey();

  const res = await fetch(`${BYTEPLUS_BASE}/contents/generations/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seedance poll error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    status: "queued" | "running" | "succeeded" | "failed" | "expired";
    content?: Array<{
      type: string;
      video_url?: { url?: string };
      url?: string;
    }>;
    error?: { message?: string };
  };

  if (data.status === "failed" || data.status === "expired") {
    throw new Error(
      `Seedance task ${taskId} ${data.status}: ${data.error?.message ?? "unknown"}`
    );
  }

  if (data.status === "succeeded") {
    const videoContent = data.content?.find((c) => c.type === "video_url");
    const videoUrl = videoContent?.video_url?.url ?? videoContent?.url;
    return { status: "succeed", videoUrl };
  }

  return { status: "processing" };
}
