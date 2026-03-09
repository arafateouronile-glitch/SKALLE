"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOpenAI,
  twitterThreadPrompt,
  linkedinPostPrompt,
  tiktokScriptPrompt,
  instagramCaptionPrompt,
  newsletterExtractPrompt,
  getStringParser,
} from "@/lib/ai/langchain";

interface RepurposedContent {
  twitterThread: string;
  linkedinPost: string;
  tiktokScript: string;
  instagramCaption: string;
  newsletterExtract: string;
}

export async function repurposeContent(
  articleContent: string
): Promise<{ success: boolean; data?: RepurposedContent; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Generate all 5 content formats in parallel
    const [twitterThread, linkedinPost, tiktokScript, instagramCaption, newsletterExtract] =
      await Promise.all([
        twitterThreadPrompt
          .pipe(getOpenAI())
          .pipe(getStringParser())
          .invoke({ article: articleContent }),
        linkedinPostPrompt
          .pipe(getOpenAI())
          .pipe(getStringParser())
          .invoke({ article: articleContent }),
        tiktokScriptPrompt
          .pipe(getOpenAI())
          .pipe(getStringParser())
          .invoke({ article: articleContent }),
        instagramCaptionPrompt
          .pipe(getOpenAI())
          .pipe(getStringParser())
          .invoke({ article: articleContent }),
        newsletterExtractPrompt
          .pipe(getOpenAI())
          .pipe(getStringParser())
          .invoke({ article: articleContent }),
      ]);

    // Track API usage (5 credits for 5 formats)
    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "repurpose",
        credits: 5,
        workspaceId: workspace.id,
      },
    });

    return {
      success: true,
      data: {
        twitterThread,
        linkedinPost,
        tiktokScript,
        instagramCaption,
        newsletterExtract,
      },
    };
  } catch (error) {
    console.error("Repurpose error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function createPost(
  workspaceId: string,
  data: {
    type: "LINKEDIN" | "X" | "INSTAGRAM" | "TIKTOK";
    title?: string;
    content: string;
    scheduledAt?: Date;
  }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const post = await prisma.post.create({
      data: {
        type: data.type,
        title: data.title,
        content: data.content,
        scheduledAt: data.scheduledAt,
        status: data.scheduledAt ? "SCHEDULED" : "DRAFT",
        workspaceId,
      },
    });

    return { success: true, data: post };
  } catch (error) {
    console.error("Create post error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function updatePost(
  postId: string,
  data: {
    title?: string;
    content?: string;
    scheduledAt?: Date | null;
    status?: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    const post = await prisma.post.update({
      where: {
        id: postId,
        workspace: { userId: session.user.id },
      },
      data,
    });

    return { success: true, data: post };
  } catch (error) {
    console.error("Update post error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function getScheduledPosts() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
  });
  if (!workspace) return [];

  return prisma.post.findMany({
    where: {
      workspaceId: workspace.id,
      scheduledAt: { not: null },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function deletePost(postId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    await prisma.post.delete({
      where: {
        id: postId,
        workspace: { userId: session.user.id },
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Delete post error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}
