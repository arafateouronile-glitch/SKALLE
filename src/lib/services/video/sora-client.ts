// OpenAI Sora — Video Generation API
// Endpoint: api.openai.com/v1/video/generations
// Auth: Bearer token (OPENAI_API_KEY)
// Sora supports 5s or 10s clips, image-to-video via Files API (file_id).
// No native audio — TTS + Kling lip-sync handles audio separately.
// Same hook+body mode as Veo (max 10s per clip) for long scripts.

const OPENAI_BASE = "https://api.openai.com/v1";

// 9:16 portrait dimensions supported by Sora
const WIDTH = 480;
const HEIGHT = 854;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.startsWith("sk-")) throw new Error("OPENAI_API_KEY not configured");
  return key;
}

/**
 * Submits an image-to-video generation task to Sora.
 * Downloads the avatar, uploads it via OpenAI Files API (Sora requires file IDs),
 * then submits the generation. Returns the async generation ID for polling.
 *
 * @param imageUrl  Signed URL of the avatar image (first frame)
 * @param prompt    Enriched motion/style prompt
 * @param duration  Target seconds — 5 or 10 (default 5)
 */
export async function submitSoraImage2Video(
  imageUrl: string,
  prompt: string,
  duration: 5 | 10 = 5
): Promise<string> {
  const apiKey = getApiKey();

  // Step 1 — download avatar and upload to OpenAI Files API
  // Sora image-to-video requires a file_id, not a raw URL
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Sora: failed to fetch avatar image ${imgRes.status}`);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const imgMime = imgRes.headers.get("content-type") ?? "image/jpeg";
  const imgExt = imgMime.includes("png") ? "png" : imgMime.includes("webp") ? "webp" : "jpg";

  const fileForm = new FormData();
  fileForm.append("file", new Blob([imgBuffer], { type: imgMime }), `avatar.${imgExt}`);
  fileForm.append("purpose", "vision");

  const fileRes = await fetch(`${OPENAI_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fileForm,
  });
  if (!fileRes.ok) {
    const err = await fileRes.text();
    throw new Error(`Sora: Files API upload failed ${fileRes.status}: ${err}`);
  }
  const fileData = (await fileRes.json()) as { id: string };
  const fileId = fileData.id;
  if (!fileId) throw new Error("Sora: no file ID returned from Files API");

  // Step 2 — submit generation with file ID as first frame
  const genRes = await fetch(`${OPENAI_BASE}/video/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sora-1.0",
      prompt,
      n_variants: 1,
      width: WIDTH,
      height: HEIGHT,
      duration,
      input_image: { file_id: fileId },
    }),
  });

  if (!genRes.ok) {
    const err = await genRes.text();
    throw new Error(`Sora submit error ${genRes.status}: ${err}`);
  }

  const data = (await genRes.json()) as { id?: string };
  if (!data?.id) throw new Error("Sora: no generation ID returned");
  return data.id;
}

/**
 * Polls the status of a Sora generation task.
 * Returns { status: "succeed", videoUrl } on completion.
 */
export async function pollSoraGeneration(
  generationId: string
): Promise<{ status: string; videoUrl?: string }> {
  const apiKey = getApiKey();

  const res = await fetch(`${OPENAI_BASE}/video/generations/${generationId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sora poll error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    status?: "queued" | "preprocessing" | "running" | "succeeded" | "failed";
    data?: Array<{ url?: string }>;
    generations?: Array<{ url?: string }>;
    result?: { videos?: Array<{ url?: string }> };
    video_url?: string;
    error?: { message?: string };
  };

  const s = data.status ?? "unknown";

  if (s === "failed") {
    throw new Error(
      `Sora generation ${generationId} failed: ${data.error?.message ?? "unknown"}`
    );
  }

  if (s === "succeeded") {
    // Try all possible URL locations in the response
    const videoUrl =
      data.data?.[0]?.url ??
      data.generations?.[0]?.url ??
      data.result?.videos?.[0]?.url ??
      data.video_url ??
      undefined;
    return { status: "succeed", videoUrl };
  }

  return { status: "processing" };
}
