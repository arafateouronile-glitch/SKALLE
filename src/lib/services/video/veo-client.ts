// Google Veo 2 — via Gemini API (generativelanguage.googleapis.com)
// Requires: GOOGLE_AI_API_KEY (same key used for Gemini models)

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not configured for Veo");
  return key;
}

async function veoFetch(path: string, options?: RequestInit) {
  const key = getApiKey();
  const url = `${GEMINI_BASE}${path}?key=${key}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Veo API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function submitVeoImage2Video(
  imageUrl: string,
  prompt: string,
  dialogue?: string,
  generateAudio = true
): Promise<string> {
  // Fetch image and encode as base64 for Veo
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error("Failed to fetch avatar image for Veo");
  const imageBuffer = await imageRes.arrayBuffer();
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");
  const mimeType = imageRes.headers.get("content-type") ?? "image/jpeg";

  // Inject spoken dialogue into prompt when provided (triggers Veo 3.1 native lip-sync)
  const fullPrompt = dialogue
    ? `${prompt}\n\nThe person speaks these exact words out loud, word for word: "${dialogue}"\nVoice, lip movements, and audio are perfectly synchronized with the spoken words. Natural, confident, conversational delivery.`
    : prompt;

  const data = await veoFetch("/models/veo-3.1-fast-generate-preview:predictLongRunning", {
    method: "POST",
    body: JSON.stringify({
      instances: [
        {
          prompt: fullPrompt,
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType,
          },
        },
      ],
      parameters: {
        aspectRatio: "9:16",
        sampleCount: 1,
        durationSeconds: 8,
        enhancePrompt: true,
        generateAudio: generateAudio,
      },
    }),
  });

  // Long-running operation name: "operations/..."
  const operationName: string = data?.name;
  if (!operationName) throw new Error("Veo: no operation name returned");
  return operationName;
}

export async function pollVeoGeneration(
  operationName: string
): Promise<{ status: string; videoUrl?: string }> {
  const data = await veoFetch(`/${operationName}`);

  if (!data?.done) {
    return { status: "processing" };
  }

  if (data.error) {
    throw new Error(`Veo generation failed: ${data.error.message ?? "unknown error"}`);
  }

  // Extract video URL from response
  const videos: Array<{ video?: { uri?: string } }> =
    data?.response?.predictions ?? data?.response?.videos ?? [];
  const videoUrl = videos[0]?.video?.uri ?? undefined;

  return { status: "succeed", videoUrl };
}
