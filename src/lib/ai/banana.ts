interface BananaResponse {
  id: string;
  message: string;
  created: number;
  apiVersion: string;
  modelOutputs: Array<{
    image: string;
  }>;
}

export async function generateImage(
  prompt: string,
  options: {
    width?: number;
    height?: number;
    steps?: number;
  } = {}
): Promise<string> {
  const { width = 1024, height = 1024, steps = 30 } = options;

  // Note: This is a placeholder for Banana.dev API
  // Replace with actual Banana.dev Nano Banana API endpoint
  const response = await fetch("https://api.banana.dev/start/v4/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: process.env.BANANA_API_KEY,
      modelKey: process.env.BANANA_MODEL_KEY || "sdxl",
      modelInputs: {
        prompt: prompt,
        negative_prompt:
          "blurry, low quality, distorted, watermark, text, logo",
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: 7.5,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Banana API error: ${response.statusText}`);
  }

  const data: BananaResponse = await response.json();

  if (!data.modelOutputs?.[0]?.image) {
    throw new Error("No image generated");
  }

  // Return base64 image or URL depending on API response format
  return `data:image/png;base64,${data.modelOutputs[0].image}`;
}

// Alternative: Use a fallback with Replicate or similar if Banana is unavailable
export async function generateImageWithFallback(
  prompt: string
): Promise<string | null> {
  try {
    return await generateImage(prompt);
  } catch (error) {
    console.error("Image generation failed:", error);
    // Return a placeholder or null
    return null;
  }
}
