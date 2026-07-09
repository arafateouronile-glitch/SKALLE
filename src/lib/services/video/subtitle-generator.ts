export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Calls OpenAI Whisper with word-level timestamps.
 * Returns the array of words with their start/end times.
 */
export async function transcribeWithWordTimestamps(
  audioBuffer: Buffer
): Promise<WhisperWord[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "fr");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper transcription failed ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { words?: WhisperWord[] };
  return (data.words ?? []).map((w) => ({ ...w, word: w.word.trim() }));
}

// ─── ASS subtitle format ───────────────────────────────────────────────────

export type SubtitlePreset = "clean" | "bold" | "minimal";

interface SubtitleStyle {
  fontName: string;
  fontSize: number;
  primaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: number;
  outline: number;
  shadow: number;
  marginV: number;
  chunkSize: number;
}

const SUBTITLE_STYLES: Record<SubtitlePreset, SubtitleStyle> = {
  clean: {
    fontName: "Arial",
    fontSize: 56,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H00000000",
    bold: 1,
    outline: 4,
    shadow: 1,
    marginV: 90,
    chunkSize: 4,
  },
  bold: {
    // TikTok-style: large yellow text, heavy black outline
    fontName: "Arial",
    fontSize: 72,
    primaryColour: "&H0000FFFF",  // yellow (ASS BGR)
    outlineColour: "&H00000000",
    backColour: "&H00000000",
    bold: 1,
    outline: 6,
    shadow: 0,
    marginV: 70,
    chunkSize: 3,
  },
  minimal: {
    // Modern: small white text, thin outline, generous margin
    fontName: "Arial",
    fontSize: 44,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",  // semi-transparent black
    bold: 0,
    outline: 1,
    shadow: 2,
    marginV: 110,
    chunkSize: 5,
  },
};

function assTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function buildAssSubtitles(
  words: WhisperWord[],
  preset: SubtitlePreset = "clean"
): string {
  if (words.length === 0) return "";

  const style = SUBTITLE_STYLES[preset];

  const chunks: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += style.chunkSize) {
    const chunk = words.slice(i, i + style.chunkSize);
    chunks.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }

  for (let i = 0; i < chunks.length - 1; i++) {
    const gap = chunks[i + 1].start - chunks[i].end;
    if (gap > 0 && gap < 0.3) chunks[i].end = chunks[i + 1].start;
  }

  const s = style;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,${s.fontName},${s.fontSize},${s.primaryColour},&H000000FF,${s.outlineColour},${s.backColour},${s.bold},0,0,0,100,100,0,0,1,${s.outline},${s.shadow},2,30,30,${s.marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text`;

  const dialogues = chunks
    .map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text}`)
    .join("\n");

  return `${header}\n${dialogues}\n`;
}
