/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Video compositing using @ffmpeg/ffmpeg WASM.
 * No system ffmpeg binary required — WASM loads at runtime from CDN.
 *
 * Composite layout (9:16 portrait):
 *   - Full frame: UGC avatar lip-sync video
 *   - PiP top-right: screen recording, ~43% of frame width, with a white monitor bezel
 */

type FFmpegInstance = {
  load: () => Promise<void>;
  FS: (cmd: string, ...args: unknown[]) => Uint8Array | void;
  run: (...args: string[]) => Promise<void>;
};

let _ffmpeg: FFmpegInstance | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (_ffmpeg) return _ffmpeg;

  const { createFFmpeg } = require("@ffmpeg/ffmpeg") as {
    createFFmpeg: (opts: {
      corePath: string;
      mainName: string;
      log: boolean;
    }) => FFmpegInstance;
  };

  _ffmpeg = createFFmpeg({
    // Load WASM from CDN at runtime — not bundled, so no Vercel size issues
    corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
    mainName: "main",
    log: false,
  });

  await _ffmpeg.load();
  return _ffmpeg;
}

/**
 * Burns ASS subtitles into a video using the shared FFmpeg WASM instance.
 * Falls back gracefully: returns null if subtitle rendering fails (e.g. font issue in WASM).
 */
export async function burnSubtitles(
  videoBuffer: Buffer,
  assContent: string
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "sub_input.mp4", new Uint8Array(videoBuffer));
  ffmpeg.FS("writeFile", "subs.ass", Buffer.from(assContent, "utf8"));

  await ffmpeg.run(
    "-i", "sub_input.mp4",
    "-vf", "ass=subs.ass",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-y",
    "sub_output.mp4"
  );

  const data = ffmpeg.FS("readFile", "sub_output.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    ffmpeg.FS("unlink", "sub_input.mp4");
    ffmpeg.FS("unlink", "subs.ass");
    ffmpeg.FS("unlink", "sub_output.mp4");
  } catch {
    // Non-critical cleanup
  }

  return result;
}

/**
 * Exports a 1:1 square crop from a 9:16 portrait video.
 * Crops the top portion of the frame (face is typically in upper-center).
 */
export async function exportSquareVideo(videoBuffer: Buffer): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "sq_input.mp4", new Uint8Array(videoBuffer));

  // Crop iw×iw starting at y=ih*0.08 (8% from top keeps face centered in square)
  await ffmpeg.run(
    "-i", "sq_input.mp4",
    "-vf", "crop=iw:iw:0:ih*0.08,scale=1080:1080",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-y",
    "sq_output.mp4"
  );

  const data = ffmpeg.FS("readFile", "sq_output.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    ffmpeg.FS("unlink", "sq_input.mp4");
    ffmpeg.FS("unlink", "sq_output.mp4");
  } catch { /* Non-critical cleanup */ }

  return result;
}

/**
 * Exports a 16:9 landscape version from a 9:16 portrait video.
 * Uses blurred background fill so the portrait video sits centered without black bars.
 */
export async function exportLandscapeVideo(videoBuffer: Buffer): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "ls_input.mp4", new Uint8Array(videoBuffer));

  // Filter: scale+blur for background, scale portrait to fit height, overlay center
  await ffmpeg.run(
    "-i", "ls_input.mp4",
    "-filter_complex",
    [
      // Background: scale to 1920×1080 and apply heavy blur
      "[0:v]scale=1920:1080,boxblur=30:30[bg]",
      // Foreground: scale portrait to 1080px height (607px wide)
      "[0:v]scale=-1:1080[fg]",
      // Overlay foreground centered on blurred background
      "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]",
    ].join(";"),
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-movflags", "+faststart",
    "-y",
    "ls_output.mp4"
  );

  const data = ffmpeg.FS("readFile", "ls_output.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    ffmpeg.FS("unlink", "ls_input.mp4");
    ffmpeg.FS("unlink", "ls_output.mp4");
  } catch { /* Non-critical cleanup */ }

  return result;
}

/**
 * Extracts a single JPEG frame at `timestampSeconds` from a video buffer.
 */
export async function extractThumbnailAt(
  videoBuffer: Buffer,
  timestampSeconds: number
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "thumb_input.mp4", new Uint8Array(videoBuffer));

  await ffmpeg.run(
    "-ss", String(Math.max(0, timestampSeconds)),
    "-i", "thumb_input.mp4",
    "-vframes", "1",
    "-q:v", "2",
    "-y",
    "thumb_output.jpg"
  );

  const data = ffmpeg.FS("readFile", "thumb_output.jpg") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    ffmpeg.FS("unlink", "thumb_input.mp4");
    ffmpeg.FS("unlink", "thumb_output.jpg");
  } catch { /* Non-critical cleanup */ }

  return result;
}

/**
 * Loops `videoBuffer` seamlessly until it reaches `targetSeconds` duration.
 * Used to extend a short base clip (5–8s) to match full audio length (up to ~90s).
 * Output has no audio track (-an) — audio is added by Kling lip-sync afterward.
 */
export async function extendVideoToSeconds(
  videoBuffer: Buffer,
  targetSeconds: number
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "ext_input.mp4", new Uint8Array(videoBuffer));

  await ffmpeg.run(
    "-stream_loop", "-1",
    "-i", "ext_input.mp4",
    "-t", String(Math.ceil(targetSeconds)),
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-an",
    "-movflags", "+faststart",
    "-y",
    "ext_output.mp4"
  );

  const data = ffmpeg.FS("readFile", "ext_output.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    ffmpeg.FS("unlink", "ext_input.mp4");
    ffmpeg.FS("unlink", "ext_output.mp4");
  } catch {
    // Non-critical cleanup
  }

  return result;
}

/**
 * Splits an audio file into two parts at `splitAtSeconds`.
 * Used to separate hook audio (for Kling lip-sync) from body audio (for D-ID).
 */
export async function splitAudio(
  audioBuffer: Buffer,
  splitAtSeconds: number
): Promise<{ before: Buffer; after: Buffer }> {
  const ffmpeg = await getFFmpeg();

  ffmpeg.FS("writeFile", "sa_input.mp3", new Uint8Array(audioBuffer));

  await ffmpeg.run(
    "-i", "sa_input.mp3",
    "-t", String(splitAtSeconds),
    "-acodec", "copy",
    "-y",
    "sa_before.mp3"
  );

  await ffmpeg.run(
    "-i", "sa_input.mp3",
    "-ss", String(splitAtSeconds),
    "-acodec", "copy",
    "-y",
    "sa_after.mp3"
  );

  const beforeData = ffmpeg.FS("readFile", "sa_before.mp3") as Uint8Array;
  const afterData = ffmpeg.FS("readFile", "sa_after.mp3") as Uint8Array;
  const before = Buffer.from(beforeData.buffer);
  const after = Buffer.from(afterData.buffer);

  try {
    ffmpeg.FS("unlink", "sa_input.mp3");
    ffmpeg.FS("unlink", "sa_before.mp3");
    ffmpeg.FS("unlink", "sa_after.mp3");
  } catch { /* Non-critical cleanup */ }

  return { before, after };
}

/**
 * Concatenates video clips while preserving audio tracks.
 * Used to stitch the lip-synced hook (Kling) with the D-ID body.
 * Both inputs must have an audio track.
 */
export async function stitchVideos(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) return buffers[0];

  const ffmpeg = await getFFmpeg();

  const inputNames = buffers.map((_, i) => `sv_in_${i}.mp4`);
  buffers.forEach((buf, i) =>
    ffmpeg.FS("writeFile", inputNames[i], new Uint8Array(buf))
  );

  const interleavedParts = inputNames.map((_, i) => `[${i}:v][${i}:a]`).join("");
  const filter = `${interleavedParts}concat=n=${buffers.length}:v=1:a=1[v][a]`;

  await ffmpeg.run(
    ...inputNames.flatMap(n => ["-i", n]),
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "aac",
    "-movflags", "+faststart",
    "-y",
    "sv_out.mp4"
  );

  const data = ffmpeg.FS("readFile", "sv_out.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    inputNames.forEach(n => ffmpeg.FS("unlink", n));
    ffmpeg.FS("unlink", "sv_out.mp4");
  } catch { /* Non-critical cleanup */ }

  return result;
}

/**
 * Concatenates multiple video clips using FFmpeg concat filter.
 * All inputs must share the same resolution and frame rate (guaranteed when from the same model).
 * Output has no audio (-an) — Kling lip-sync adds the TTS audio afterward.
 */
export async function concatenateVideos(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) return buffers[0];

  const ffmpeg = await getFFmpeg();

  const inputNames = buffers.map((_, i) => `cat_in_${i}.mp4`);
  buffers.forEach((buf, i) =>
    ffmpeg.FS("writeFile", inputNames[i], new Uint8Array(buf))
  );

  const filterParts = inputNames.map((_, i) => `[${i}:v]`).join("");
  const filter = `${filterParts}concat=n=${buffers.length}:v=1:a=0[v]`;

  await ffmpeg.run(
    ...inputNames.flatMap(n => ["-i", n]),
    "-filter_complex", filter,
    "-map", "[v]",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-an",
    "-movflags", "+faststart",
    "-y",
    "cat_out.mp4"
  );

  const data = ffmpeg.FS("readFile", "cat_out.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  try {
    inputNames.forEach(n => ffmpeg.FS("unlink", n));
    ffmpeg.FS("unlink", "cat_out.mp4");
  } catch { /* Non-critical cleanup */ }

  return result;
}

/**
 * Composites `screenBuffer` (screen recording) as a PiP overlay onto `ugcBuffer`.
 *
 * The screen recording appears in the top-right of the frame, styled as a monitor screen:
 *   - 43% of the UGC video width
 *   - White border (4px) simulating a screen bezel
 *   - 24px margin from top-right edges
 *
 * Returns the composited MP4 as a Buffer.
 * Throws if FFmpeg WASM fails to load or process.
 */
export async function compositeScreenOnUGC(
  ugcBuffer: Buffer,
  screenBuffer: Buffer
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  // Write input files to WASM virtual filesystem
  ffmpeg.FS("writeFile", "ugc.mp4", new Uint8Array(ugcBuffer));
  ffmpeg.FS("writeFile", "screen.mp4", new Uint8Array(screenBuffer));

  // Filter complex:
  //  1. Scale screen recording to 43% of the UGC width, preserve aspect ratio
  //  2. Add a white border (4px) around it to simulate a monitor bezel
  //  3. Overlay in top-right corner with 24px margin
  //  4. Audio comes from the UGC video (the lip-synced voice)
  await ffmpeg.run(
    "-i", "ugc.mp4",
    "-i", "screen.mp4",
    "-filter_complex",
    [
      // Scale screen recording + add 4px white border
      "[1:v]scale=iw*0.43:-1,pad=iw+8:ih+8:4:4:color=white,setsar=1[pip]",
      // Overlay PiP on the UGC video, top-right corner, 24px margin
      "[0:v][pip]overlay=W-w-24:24:shortest=1[v]",
    ].join(";"),
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-movflags", "+faststart",
    "-y",
    "output.mp4"
  );

  const data = ffmpeg.FS("readFile", "output.mp4") as Uint8Array;
  const result = Buffer.from(data.buffer);

  // Cleanup WASM virtual filesystem
  try {
    ffmpeg.FS("unlink", "ugc.mp4");
    ffmpeg.FS("unlink", "screen.mp4");
    ffmpeg.FS("unlink", "output.mp4");
  } catch {
    // Non-critical cleanup errors ignored
  }

  return result;
}
