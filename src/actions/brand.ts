"use server";

import * as cheerio from "cheerio";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenAI, brandVoicePrompt, getStringParser } from "@/lib/ai/langchain";
import { withCredits } from "@/lib/credits";
import { z } from "zod";

const urlSchema = z.string().url();

interface BrandVoice {
  tone: "formal" | "casual" | "professional" | "friendly" | "technical";
  style: string;
  keywords: string[];
  values: string[];
  targetAudience: string;
  writingGuidelines: string[];
}

export async function analyzeBrandVoice(
  workspaceId: string,
  url: string
): Promise<{ success: boolean; data?: BrandVoice; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Validate URL
    const parsedUrl = urlSchema.safeParse(url);
    if (!parsedUrl.success) {
      return { success: false, error: "URL invalide" };
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    return await withCredits("brand_voice", workspaceId, async () => {
    // Fetch and parse the website
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ViralTrends/1.0; +https://viraltrends.io)",
      },
    });

    if (!response.ok) {
      throw new Error("Impossible d'accéder au site");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract main content
    // Remove scripts, styles, and navigation
    $("script, style, nav, header, footer, aside").remove();

    // Get text content
    const title = $("title").text().trim();
    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const h1 = $("h1")
      .map((_, el) => $(el).text().trim())
      .get()
      .join(" ");
    const h2 = $("h2")
      .map((_, el) => $(el).text().trim())
      .get()
      .join(" ");
    const paragraphs = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .slice(0, 20)
      .join(" ");

    const content = `
Titre: ${title}
Description: ${metaDescription}
Titres H1: ${h1}
Titres H2: ${h2}
Contenu: ${paragraphs}
    `.trim();

    if (content.length < 100) {
      throw new Error("Pas assez de contenu à analyser");
    }

    // Analyze with AI
    const chain = brandVoicePrompt.pipe(getOpenAI()).pipe(getStringParser());
    const result = await chain.invoke({ content: content.slice(0, 8000) });

    // Parse JSON response
    let brandVoice: BrandVoice;
    try {
      brandVoice = JSON.parse(result);
    } catch {
      throw new Error("Erreur lors de l'analyse IA");
    }

    // Update workspace with brand voice
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        domainUrl: url,
        brandVoice: JSON.parse(JSON.stringify(brandVoice)),
      },
    });

    return brandVoice;
    });
  } catch (error) {
    console.error("Brand voice analysis error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function getWorkspaceBrandVoice(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { brandVoice: true, domainUrl: true },
  });

  return workspace;
}
