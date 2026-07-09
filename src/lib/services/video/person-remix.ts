import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { UGCFormat } from "./ugc-formats";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

fal.config({ credentials: process.env.FAL_KEY });

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status} ${url}`);
  const mime = resp.headers.get("content-type") ?? "image/jpeg";
  return { buffer: Buffer.from(await resp.arrayBuffer()), mime };
}

/**
 * Extracts a concise appearance description from a reference photo URL using
 * GPT-4o Vision. Returns a text paragraph usable in image generation prompts.
 */
export async function extractPersonDescription(photoUrl: string): Promise<string> {
  const { buffer, mime } = await fetchImageBuffer(photoUrl);
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          {
            type: "text",
            text: `Describe this person's appearance in 2-3 sentences for use in an AI image generation prompt.
Include: apparent gender, approximate age range, skin tone, hair color and style, distinctive facial features, and general build.
Be specific and neutral. Do NOT describe clothing or background. Output the description only, no preamble.`,
          },
        ],
      },
    ],
  });

  return response.choices[0].message.content?.trim() ?? "A person with a natural appearance";
}

/**
 * Remixes the person into a UGC scene using Flux Kontext Pro (fal.ai).
 *
 * Flux Kontext is specifically designed for identity-preserving image editing:
 * it takes a reference photo and regenerates the same person in a new scene
 * while keeping face, skin tone, hair, and distinctive features intact.
 *
 * Falls back to gpt-image-1 text-to-image if no reference buffer or FAL_KEY.
 */
export async function remixPersonIntoScene(
  person: { name: string; description: string },
  format: UGCFormat,
  referenceBuffer?: Buffer
): Promise<Buffer> {
  if (referenceBuffer && process.env.FAL_KEY) {
    const mime = "image/png";
    const dataUrl = `data:${mime};base64,${referenceBuffer.toString("base64")}`;

    const prompt = [
      `Same person, same face, same skin tone, same hair — placed in a new scene.`,
      `Scene: ${format.prompt}`,
      `Subject outfit: ${format.appearance}`,
      `Lighting: neutral white key light on the subject's face (6500K softbox), no yellow or warm tint on the person. Background may have ambient warmth.`,
      `Photorealistic UGC social media portrait, 9:16 vertical format. No text. No watermarks.`,
    ].join(" ");

    const result = await fal.subscribe("fal-ai/flux-pro/kontext", {
      input: {
        prompt,
        image_url: dataUrl,
        guidance_scale: 3.5,
        output_format: "png",
        aspect_ratio: "9:16",
      },
    }) as { data: { images: Array<{ url: string }> } };

    const generatedUrl = result.data.images[0]?.url;
    if (!generatedUrl) throw new Error("Flux Kontext returned no image");

    const { buffer } = await fetchImageBuffer(generatedUrl);
    return buffer;
  }

  // Fallback: gpt-image-1 text-to-image
  const textPrompt = [
    `Hyper-realistic portrait photograph of ${person.description}.`,
    `Scene: ${format.prompt}`,
    `Outfit and appearance: ${format.appearance}`,
    `The person's gender, face, skin tone, hair color and style must match the description exactly.`,
    `LIGHTING: neutral white 6500K softbox on subject face — true skin colors, no yellow tint.`,
    `9:16 portrait orientation, social media UGC, photorealistic. No text. No watermarks.`,
  ].join(" ");

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: textPrompt,
    size: "1024x1536",
    quality: "high",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data");
  return Buffer.from(b64, "base64");
}
