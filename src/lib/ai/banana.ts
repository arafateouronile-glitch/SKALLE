import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type DalleSize = "1024x1024" | "1792x1024" | "1024x1792";

function mapSizeToDalle(width: number, height: number): DalleSize {
  const ratio = width / height;
  if (ratio > 1.2) return "1792x1024";
  if (ratio < 0.8) return "1024x1792";
  return "1024x1024";
}

export async function generateImage(
  prompt: string,
  options: { width?: number; height?: number } = {}
): Promise<string> {
  const { width = 1024, height = 1024 } = options;
  const size = mapSizeToDalle(width, height);

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size,
    quality: "standard",
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error("No image generated");
  return url;
}
