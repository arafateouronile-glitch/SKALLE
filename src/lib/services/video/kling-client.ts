import { createHmac } from "crypto";

const KLING_BASE_URL = "https://api.klingai.com";

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Kling supports two auth modes:
// - New accounts: plain API Key used as Bearer token directly
// - Legacy accounts: JWT HS256 built from AK (KLING_API_KEY) + SK (KLING_API_SECRET)
function buildKlingAuthToken(): string {
  const apiKey = process.env.KLING_API_KEY;
  const apiSecret = process.env.KLING_API_SECRET;
  if (!apiKey) {
    throw new Error("KLING_API_KEY must be set");
  }
  // Legacy JWT mode — only used when KLING_API_SECRET is explicitly provided
  if (apiSecret) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64url(
      JSON.stringify({ iss: apiKey, exp: now + 1800, nbf: now - 5 })
    );
    const signature = base64url(
      createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest()
    );
    return `${header}.${payload}.${signature}`;
  }
  // New accounts: API Key is the Bearer token directly
  return apiKey;
}

async function klingFetch(path: string, options?: RequestInit) {
  const token = buildKlingAuthToken();
  const res = await fetch(`${KLING_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function submitImage2Video(
  avatarUrl: string,
  prompt: string,
  duration: "5" | "10" = "5"
): Promise<string> {
  const body = {
    model_name: "kling-v1-5",
    image: avatarUrl,
    prompt: prompt.slice(0, 2499),
    cfg_scale: 0.5,
    mode: "pro",
    duration,
    aspect_ratio: "9:16",
  };
  const data = await klingFetch("/v1/videos/image2video", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error("Kling image2video: no task_id returned");
  return taskId;
}

export async function pollImage2Video(
  taskId: string
): Promise<{ status: string; videoUrl?: string }> {
  const data = await klingFetch(`/v1/videos/image2video/${taskId}`);
  const task = data?.data;
  const status: string = task?.task_status ?? "unknown";
  const videoUrl: string | undefined =
    task?.task_result?.videos?.[0]?.url ?? undefined;
  return { status, videoUrl };
}

export async function submitLipSync(
  videoUrl: string,
  audioUrl: string
): Promise<string> {
  const body = {
    input: {
      video_url: videoUrl,
      mode: "audio2video",
      audio_type: "url",
      audio_url: audioUrl,
    },
  };
  const data = await klingFetch("/v1/videos/lip-sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error("Kling lip-sync: no task_id returned");
  return taskId;
}

export async function pollLipSync(
  taskId: string
): Promise<{ status: string; videoUrl?: string }> {
  const data = await klingFetch(`/v1/videos/lip-sync/${taskId}`);
  const task = data?.data;
  const status: string = task?.task_status ?? "unknown";
  const videoUrl: string | undefined =
    task?.task_result?.videos?.[0]?.url ?? undefined;
  return { status, videoUrl };
}
