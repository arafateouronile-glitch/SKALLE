"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImage } from "@/lib/ai/banana";
import { imageTemplates } from "@/lib/constants/images";

interface ImageGenerationResult {
  imageUrl: string;
  prompt: string;
}

export async function generateAIImage(
  workspaceId: string,
  prompt: string,
  options?: { width?: number; height?: number }
): Promise<{ success: boolean; data?: ImageGenerationResult; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Check credits
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true },
    });

    if (!user || user.credits < 1) {
      return { success: false, error: "Crédits insuffisants" };
    }

    // Generate image
    const imageUrl = await generateImage(prompt, {
      width: options?.width || 1024,
      height: options?.height || 1024,
    });

    // Track API usage
    await prisma.aPIUsage.create({
      data: {
        service: "banana",
        operation: "image",
        credits: 1,
        workspaceId,
        metadata: { prompt, ...options },
      },
    });

    // Deduct credit
    await prisma.user.update({
      where: { id: session.user.id },
      data: { credits: { decrement: 1 } },
    });

    return {
      success: true,
      data: { imageUrl, prompt },
    };
  } catch (error) {
    console.error("Image generation error:", error);
    return { success: false, error: "Erreur lors de la génération" };
  }
}

// Re-export for backward compatibility
export { imageTemplates };

export async function enhancePrompt(
  basePrompt: string,
  style: string
): Promise<string> {
  const styleEnhancements: Record<string, string> = {
    minimal: ", minimalist design, clean lines, white space, modern aesthetic",
    corporate: ", professional corporate style, business imagery, subtle colors",
    creative: ", creative artistic style, bold colors, unique composition",
    tech: ", futuristic tech style, digital elements, neon accents, cyber aesthetic",
    nature: ", organic natural elements, earthy tones, sustainable feel",
  };

  return basePrompt + (styleEnhancements[style] || "");
}
