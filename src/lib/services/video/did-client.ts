// D-ID Talks API — photo + audio → talking head video, any duration
// Doc: https://docs.d-id.com/reference/createtalk
// Auth: Basic base64(apiKey + ":")

const DID_BASE = "https://api.d-id.com";

function getAuthHeader(): string {
  const key = process.env.D_ID_API_KEY;
  if (!key) throw new Error("D_ID_API_KEY not configured");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

/**
 * Creates a D-ID talk (photo + audio → talking head video).
 * Returns the talk ID for polling.
 *
 * @param photoUrl  Public URL of the avatar photo
 * @param audioUrl  Public URL of the TTS audio (MP3)
 */
export async function submitDIDTalk(
  photoUrl: string,
  audioUrl: string
): Promise<string> {
  const res = await fetch(`${DID_BASE}/talks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      source_url: photoUrl,
      script: {
        type: "audio",
        audio_url: audioUrl,
      },
      config: {
        fluent: true,
        pad_audio: 0.0,
        stitch: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`D-ID submit error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data?.id) throw new Error("D-ID: no talk ID returned");
  return data.id;
}

/**
 * Polls the status of a D-ID talk.
 * Returns { status: "done", videoUrl } on completion.
 */
export async function pollDIDTalk(
  talkId: string
): Promise<{ status: string; videoUrl?: string }> {
  const res = await fetch(`${DID_BASE}/talks/${talkId}`, {
    headers: { Authorization: getAuthHeader() },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`D-ID poll error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    status: "created" | "started" | "done" | "error";
    result_url?: string;
    error?: { description?: string };
  };

  if (data.status === "error") {
    throw new Error(
      `D-ID talk ${talkId} failed: ${data.error?.description ?? "unknown"}`
    );
  }

  if (data.status === "done") {
    return { status: "done", videoUrl: data.result_url };
  }

  return { status: "processing" };
}
